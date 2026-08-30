import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const pool = new Pool({ connectionString: databaseUrl });
  const before = await auditCount(pool);

  const originalSecret = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    const { GET } = await import("../app/api/maintenance/audit-retention/route");
    const unconfigured = await GET(new Request("http://localhost/api/maintenance/audit-retention"));
    assert.equal(unconfigured.status, 503);

    process.env.CRON_SECRET = "issue-314-test-secret";
    const unauthorized = await GET(new Request("http://localhost/api/maintenance/audit-retention", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    assert.equal(unauthorized.status, 401);

    const authorized = await GET(new Request("http://localhost/api/maintenance/audit-retention", {
      headers: { authorization: "Bearer issue-314-test-secret" },
    }));
    assert.equal(authorized.status, 200);
    const body = await authorized.json() as { ok?: boolean; mode?: string };
    assert.equal(body.ok, true);
    assert.equal(body.mode, "dry-run");

    assert.equal(await auditCount(pool), before, "scheduled dry-run must not mutate audit history");

    const vercel = JSON.parse(await readFile("vercel.json", "utf8")) as { crons?: Array<{ path: string; schedule: string }> };
    assert.deepEqual(vercel.crons, [{ path: "/api/maintenance/audit-retention", schedule: "0 3 1 * *" }]);

    const route = await readFile("app/api/maintenance/audit-retention/route.ts", "utf8");
    assert.match(route, /CRON_SECRET/);
    assert.match(route, /auditRetentionDryRun/);
    assert.doesNotMatch(route, /delete\s+from\s+audit_events/i, "dry-run cron route must contain no deletion path");

    console.log("Issue 314 secured monthly dry-run cron acceptance passed.");
  } finally {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    await pool.end();
  }
}

async function auditCount(pool: Pool): Promise<number> {
  const result = await pool.query("select count(*)::int as count from audit_events");
  return Number(result.rows[0]?.count ?? 0);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
