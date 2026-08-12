import { NextResponse } from "next/server";
import { Pool } from "pg";
import { resolveAuthenticatedActor } from "../../../../src/application/authenticated-actor";
import { LocalActorError } from "../../../../src/application/local-actor";
import { provisionStaffAccount } from "../../../../src/auth/provisioning";

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: { code: "internalError", message: "DATABASE_URL is required." } }, { status: 500 });
  const body = await request.json().catch(() => undefined) as { actorUserId?: unknown; username?: unknown; password?: unknown } | undefined;
  if (!body || typeof body.actorUserId !== "string" || typeof body.username !== "string" || typeof body.password !== "string") return NextResponse.json({ error: { code: "invalidInput", message: "actorUserId, username and password are required." } }, { status: 400 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await resolveAuthenticatedActor(request.headers, pool, "admin");
    return NextResponse.json({ success: true, value: await provisionStaffAccount(pool, { actorUserId: body.actorUserId, username: body.username, password: body.password }) });
  } catch (error) {
    if (error instanceof LocalActorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 403 });
    return NextResponse.json({ error: { code: "internalError", message: error instanceof Error ? error.message : "Account provisioning failed." } }, { status: 500 });
  } finally { await pool.end(); }
}
