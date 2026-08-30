import {
  AuditRetentionMaintenanceConflictError,
  applyAuditRetentionMaintenance,
} from "../../../../src/maintenance/audit-retention-operator";
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
    const report = await applyAuditRetentionMaintenance(authPool);
    console.log("Audit retention scheduled maintenance: PASS", report);
    return Response.json({ ok: true, mode: "apply", report });
  } catch (error) {
    const conflict = error instanceof AuditRetentionMaintenanceConflictError;
    console.error(
      conflict ? "Audit retention scheduled maintenance: CONFLICT" : "Audit retention scheduled maintenance: FAIL",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json(
      { ok: false, mode: "apply", error: conflict ? "Maintenance run already active." : "Audit retention maintenance failed." },
      { status: conflict ? 409 : 500 },
    );
  }
}
