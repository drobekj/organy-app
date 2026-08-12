import { NextResponse } from "next/server";
import { Pool } from "pg";
import { getAuthenticatedStaffUser } from "../../../src/application/authenticated-actor";
import { LocalActorError } from "../../../src/application/local-actor";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: { code: "internalError", message: "DATABASE_URL is required." } }, { status: 500 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { return NextResponse.json({ success: true, value: await getAuthenticatedStaffUser(request.headers, pool) }); }
  catch (error) {
    if (error instanceof LocalActorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "invalidInput" ? 400 : 401 });
    return NextResponse.json({ error: { code: "internalError", message: error instanceof Error ? error.message : "Staff session failed." } }, { status: 500 });
  } finally { await pool.end(); }
}
