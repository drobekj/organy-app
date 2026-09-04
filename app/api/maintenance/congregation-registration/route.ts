import { NextResponse } from "next/server";
import { getAppDbPool } from "../../../../src/db/app-pool";
import { runCongregationRegistrationMaintenance } from "../../../../src/application/congregation-registration-maintenance";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return NextResponse.json({ ok: false, error: "Maintenance is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (process.env.ORGANY_RUNTIME !== "db" || !process.env.DATABASE_URL) return NextResponse.json({ ok: false, error: "DB runtime is not configured." }, { status: 503 });
  try {
    const report = await runCongregationRegistrationMaintenance(getAppDbPool());
    console.log("Congregation registration maintenance: PASS", report);
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error("Congregation registration maintenance: FAIL", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Congregation registration maintenance failed." }, { status: 500 });
  }
}
