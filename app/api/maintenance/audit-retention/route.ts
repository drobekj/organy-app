import { auditRetentionDryRun } from "../../../../src/application/audit-retention-maintenance";
import { authPool } from "../../../../src/auth/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.error("Audit retention cron refused: CRON_SECRET is not configured.");
    return Response.json({ ok: false, error: "Maintenance authentication is not configured." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const report = await auditRetentionDryRun(authPool);
    console.log("Audit retention scheduled dry-run: PASS", report);
    return Response.json({ ok: true, mode: "dry-run", report });
  } catch (error) {
    console.error("Audit retention scheduled dry-run: FAIL", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ ok: false, mode: "dry-run", error: "Audit retention dry-run failed." }, { status: 500 });
  }
}
