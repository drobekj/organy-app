import { NextRequest, NextResponse } from "next/server";
import { authPool } from "../../../src/auth/server";
import { PostgresProtectedAccountAdminService, ProtectedAccountAdminError } from "../../../src/application/protected-account-admin";

export async function GET(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return problem("Protected Account administration is available only in DB runtime.", 400);
  try { return NextResponse.json(await new PostgresProtectedAccountAdminService(authPool).list(request.headers)); }
  catch (error) { return handleError(error); }
}

export async function POST(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return problem("Protected Account administration is available only in DB runtime.", 400);
  const service = new PostgresProtectedAccountAdminService(authPool);
  const isForm = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded") || request.headers.get("content-type")?.includes("multipart/form-data");
  try {
    if (isForm) {
      const form = await request.formData();
      const action = String(form.get("action") ?? "");
      const result = await perform(service, request.headers, action, {
        appUserId: form.get("appUserId"),
        personId: form.get("personId"),
        username: form.get("username"),
        password: form.get("password"),
        roles: form.getAll("roles").map(String),
        active: form.get("active") === "true",
      });
      const target = new URL(result.currentAdminLostAccess ? "/sign-in" : "/admin/accounts", request.url);
      if (!result.currentAdminLostAccess) target.searchParams.set("message", result.message);
      return NextResponse.redirect(target, 303);
    }

    const body = await request.json().catch(() => undefined) as Record<string, unknown> | undefined;
    if (!body) return problem("JSON body is required.", 400);
    const action = String(body.action ?? "");
    const result = await perform(service, request.headers, action, body);
    return NextResponse.json(result.payload);
  } catch (error) {
    if (isForm) {
      const target = new URL("/admin/accounts", request.url);
      target.searchParams.set("error", errorMessage(error));
      return NextResponse.redirect(target, 303);
    }
    return handleError(error);
  }
}

async function perform(service: PostgresProtectedAccountAdminService, headers: Headers, action: string, input: Record<string, unknown>) {
  if (action === "provision") {
    const payload = await service.provision(headers, { appUserId: input.appUserId, username: input.username, password: input.password, roles: input.roles });
    return { payload, message: "Protected Account created.", currentAdminLostAccess: false };
  }
  if (action === "updateRoles") {
    const payload = await service.updateRoles(headers, { appUserId: input.appUserId, roles: input.roles });
    return { payload, message: "Protected roles updated.", currentAdminLostAccess: payload.currentAdminLostAccess };
  }
  if (action === "setActive") {
    const payload = await service.setActive(headers, { appUserId: input.appUserId, active: input.active });
    return { payload, message: payload.account.active ? "Protected Account reactivated." : "Protected Account deactivated.", currentAdminLostAccess: payload.currentAdminLostAccess };
  }
  if (action === "removeWhatsappPhone") {
    const payload = await service.removeWhatsappPhone(headers, { appUserId: input.appUserId });
    return { payload, message: payload.removed ? "WhatsApp phone forgotten." : "WhatsApp phone was already empty.", currentAdminLostAccess: false };
  }
  if (action === "resetPassword") {
    const payload = await service.resetPassword(headers, { appUserId: input.appUserId, password: input.password });
    return { payload, message: "Protected Account password reset. Existing sessions were revoked.", currentAdminLostAccess: false };
  }
  if (action === "deleteAccount") {
    const payload = await service.deleteAccount(headers, { appUserId: input.appUserId });
    return { payload, message: "Protected Account deleted. Person and service history were preserved.", currentAdminLostAccess: false };
  }
  if (action === "deletePerson") {
    const payload = await service.deletePerson(headers, { personId: input.personId });
    return { payload, message: "Person permanently deleted.", currentAdminLostAccess: false };
  }
  throw new ProtectedAccountAdminError("invalidInput", "Unsupported protected Account administration action.");
}

function handleError(error: unknown) {
  if (error instanceof ProtectedAccountAdminError) {
    const status = error.code === "invalidInput" ? 400 : error.code === "unauthenticated" ? 401 : error.code === "permissionDenied" ? 403 : error.code === "notFound" ? 404 : 409;
    return problem(error.message, status);
  }
  return problem(errorMessage(error), 500);
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Protected Account administration failed."; }
function problem(message: string, status: number) { return NextResponse.json({ error: { message } }, { status }); }
