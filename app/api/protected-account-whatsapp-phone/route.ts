import { NextRequest, NextResponse } from "next/server";
import { authPool } from "../../../src/auth/server";
import { PostgresProtectedWhatsAppPhoneService, ProtectedWhatsAppPhoneError } from "../../../src/application/protected-account-whatsapp-phone";

export async function GET(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return problem("WhatsApp phone setting is available only in DB runtime.", 400);
  try { return NextResponse.json(await new PostgresProtectedWhatsAppPhoneService(authPool).getSelf(request.headers)); }
  catch (error) { return handle(error); }
}

export async function PUT(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return problem("WhatsApp phone setting is available only in DB runtime.", 400);
  const body = await request.json().catch(() => undefined) as Record<string, unknown> | undefined;
  if (!body) return problem("JSON body is required.", 400);
  try { return NextResponse.json(await new PostgresProtectedWhatsAppPhoneService(authPool).setSelf(request.headers, body.phone)); }
  catch (error) { return handle(error); }
}

export async function DELETE(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return problem("WhatsApp phone setting is available only in DB runtime.", 400);
  try { return NextResponse.json(await new PostgresProtectedWhatsAppPhoneService(authPool).removeSelf(request.headers)); }
  catch (error) { return handle(error); }
}

function handle(error: unknown) {
  if (error instanceof ProtectedWhatsAppPhoneError) {
    const status = error.code === "invalidInput" ? 400 : error.code === "unauthenticated" ? 401 : error.code === "permissionDenied" ? 403 : 404;
    return problem(error.message, status);
  }
  return problem(error instanceof Error ? error.message : "WhatsApp phone setting failed.", 500);
}

function problem(message: string, status: number) { return NextResponse.json({ error: { message } }, { status }); }
