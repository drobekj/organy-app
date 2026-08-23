import { NextRequest, NextResponse } from "next/server";
import { authPool } from "../../../src/auth/server";
import { ProtectedAccountAdminError } from "../../../src/application/protected-account-admin";
import { PostgresProtectedStaffOnboardingService } from "../../../src/application/protected-staff-onboarding";

export async function POST(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return problem("Protected staff onboarding is available only in DB runtime.", 400);
  try {
    const form = await request.formData();
    await new PostgresProtectedStaffOnboardingService(authPool).create(request.headers, {
      personId: form.get("personId"),
      displayName: form.get("displayName"),
      username: form.get("username"),
      password: form.get("password"),
      roles: form.getAll("roles").map(String),
    });
    const target = new URL("/admin/accounts", request.url);
    target.searchParams.set("message", "Staff account created.");
    return NextResponse.redirect(target, 303);
  } catch (error) {
    const target = new URL("/admin/accounts", request.url);
    target.searchParams.set("error", errorMessage(error));
    return NextResponse.redirect(target, 303);
  }
}

function errorMessage(error: unknown) {
  return error instanceof ProtectedAccountAdminError || error instanceof Error ? error.message : "Protected staff onboarding failed.";
}
function problem(message: string, status: number) { return NextResponse.json({ error: { message } }, { status }); }
