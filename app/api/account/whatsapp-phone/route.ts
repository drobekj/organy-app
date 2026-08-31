import { NextRequest, NextResponse } from "next/server";
import { ACTIVE_ROLE_COOKIE_NAME, resolveOwnedActiveRole } from "../../../../src/application/active-role";
import { PostgresProtectedWhatsAppPhoneService, ProtectedWhatsAppPhoneError } from "../../../../src/application/protected-whatsapp-phone";
import { ProtectedActorError, resolveProtectedUser } from "../../../../src/application/protected-actor";
import { authPool } from "../../../../src/auth/server";

export async function GET(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return problem("WhatsApp phone settings are available only in DB runtime.", 400);
  try {
    const user = await resolveProtectedUser(request.headers, authPool);
    return NextResponse.json(await new PostgresProtectedWhatsAppPhoneService(authPool).get(user));
  } catch (error) { return handleError(error); }
}

export async function PUT(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return problem("WhatsApp phone settings are available only in DB runtime.", 400);
  try {
    const user = await resolveProtectedUser(request.headers, authPool);
    const body = await request.json().catch(() => undefined) as Record<string, unknown> | undefined;
    if (!body) return problem("JSON body is required.", 400);
    const activeRole = resolveOwnedActiveRole(user.roles, request.cookies.get(ACTIVE_ROLE_COOKIE_NAME)?.value);
    return NextResponse.json(await new PostgresProtectedWhatsAppPhoneService(authPool).save(user, activeRole, body.phone));
  } catch (error) { return handleError(error); }
}

export async function DELETE(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return problem("WhatsApp phone settings are available only in DB runtime.", 400);
  try {
    const user = await resolveProtectedUser(request.headers, authPool);
    const activeRole = resolveOwnedActiveRole(user.roles, request.cookies.get(ACTIVE_ROLE_COOKIE_NAME)?.value);
    return NextResponse.json(await new PostgresProtectedWhatsAppPhoneService(authPool).forget(user, activeRole));
  } catch (error) { return handleError(error); }
}

function handleError(error: unknown) {
  if (error instanceof ProtectedWhatsAppPhoneError) {
    const status = error.code === "invalidInput" ? 400 : error.code === "permissionDenied" ? 403 : 404;
    return problem(error.message, status);
  }
  if (error instanceof ProtectedActorError) {
    return problem(error.message, error.code === "unauthenticated" ? 401 : error.code === "permissionDenied" ? 403 : 400);
  }
  return problem(error instanceof Error ? error.message : "WhatsApp phone settings failed.", 500);
}

function problem(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}
