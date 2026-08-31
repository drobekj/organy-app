import { NextRequest, NextResponse } from "next/server";
import { authPool } from "../../../../src/auth/server";
import { PostgresProtectedWhatsAppPhoneService, ProtectedWhatsAppPhoneError } from "../../../../src/application/protected-account-whatsapp-phone";

export async function POST(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return redirectProblem(request, "WhatsApp phone setting is available only in DB runtime.");
  try {
    const form = await request.formData();
    await new PostgresProtectedWhatsAppPhoneService(authPool).removeAsAdmin(request.headers, form.get("appUserId"));
    const target = new URL("/admin/accounts", request.url);
    target.searchParams.set("message", "WhatsApp phone removed. Automatic WhatsApp use is revoked until the account owner saves a phone again.");
    return NextResponse.redirect(target, 303);
  } catch (error) {
    return redirectProblem(request, error instanceof ProtectedWhatsAppPhoneError || error instanceof Error ? error.message : "WhatsApp phone removal failed.");
  }
}

function redirectProblem(request: NextRequest, message: string) {
  const target = new URL("/admin/accounts", request.url);
  target.searchParams.set("error", message);
  return NextResponse.redirect(target, 303);
}
