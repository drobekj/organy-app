import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { AUDIT_RETENTION_SUCCESS_ACTION } from "../src/application/audit-retention-maintenance";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const pool = new Pool({ connectionString: databaseUrl });
  const beforeAudit = await auditCount(pool);
  const beforeSuccess = await actionCount(pool, AUDIT_RETENTION_SUCCESS_ACTION);

  const originalSecret = process.env.CRON_SECRET;
  let createdRunRef: string | undefined;
  try {
    delete process.env.CRON_SECRET;
    const { GET } = await import("../app/api/maintenance/audit-retention/route");

    const unconfigured = await GET(new Request("http://localhost/api/maintenance/audit-retention"));
    assert.equal(unconfigured.status, 503);
    assert.equal(await auditCount(pool), beforeAudit, "missing CRON_SECRET cannot mutate audit history");

    process.env.CRON_SECRET = "issue-314-test-secret";
    const unauthorized = await GET(new Request("http://localhost/api/maintenance/audit-retention", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    assert.equal(unauthorized.status, 401);
    assert.equal(await auditCount(pool), beforeAudit, "wrong CRON_SECRET cannot mutate audit history");

    const authorized = await GET(new Request("http://localhost/api/maintenance/audit-retention", {
      headers: { authorization: "Bearer issue-314-test-secret" },
    }));
    assert.equal(authorized.status, 200);
    const body = await authorized.json() as {
      ok?: boolean;
      mode?: string;
      report?: { runRef?: string; deletedPlanningAuditEvents?: number; deletedResolvedFailureEvents?: number };
    };
    assert.equal(body.ok, true);
    assert.equal(body.mode, "apply");
    assert.ok(body.report?.runRef);
    createdRunRef = body.report!.runRef;
    assert.equal(await actionCount(pool, AUDIT_RETENTION_SUCCESS_ACTION), beforeSuccess + 1, "every successful scheduled maintenance run creates one durable success audit event");

    const success = await pool.query(
      "select actor_kind, object_kind, after_state from audit_events where action = $1 and object_ref = $2",
      [AUDIT_RETENTION_SUCCESS_ACTION, createdRunRef],
    );
    assert.equal(success.rows.length, 1);
    assert.equal(success.rows[0].actor_kind, "system");
    assert.equal(success.rows[0].object_kind, "auditRetentionMaintenance");
    const successAfterState = success.rows[0].after_state as { status?: string; mode?: string } | undefined;
    assert.equal(successAfterState?.status, "success");
    assert.equal(successAfterState?.mode, "apply");

    const vercel = JSON.parse(await readFile("vercel.json", "utf8")) as { crons?: Array<{ path: string; schedule: string }> };
    assert.deepEqual(vercel.crons, [
      { path: "/api/maintenance/audit-retention", schedule: "0 3 1 * *" },
      { path: "/api/maintenance/congregation-registration", schedule: "15 2 * * *" },
    ]);

    const route = await readFile("app/api/maintenance/audit-retention/route.ts", "utf8");
    assert.match(route, /CRON_SECRET/);
    assert.match(route, /applyAuditRetentionMaintenance/);
    assert.doesNotMatch(route, /delete\s+from\s+audit_events/i, "cron route delegates deletion only to the isolated maintenance operator");

    console.log("Issue 314 secured monthly apply cron acceptance passed.");
  } finally {
    if (createdRunRef) await pool.query("delete from audit_events where object_ref = $1", [createdRunRef]).catch(() => undefined);
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    await pool.end();
  }
}

async function auditCount(pool: Pool): Promise<number> {
  const result = await pool.query("select count(*)::int as count from audit_events");
  return Number(result.rows[0]?.count ?? 0);
}

async function actionCount(pool: Pool, action: string): Promise<number> {
  const result = await pool.query("select count(*)::int as count from audit_events where action = $1", [action]);
  return Number(result.rows[0]?.count ?? 0);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
