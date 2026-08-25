from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "scripts/issue-222-audit-tests.ts"
path.write_text(r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { appendAuditEvent, listAuditEvents } from "../src/application/audit-history";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue 222 audit acceptance.");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query("delete from audit_events where action like 'acceptance.issue222.%'");
    await appendAuditEvent(pool, {
      actor: { kind: "human", userId: "acceptance-admin", displayName: "Acceptance Admin", role: "admin" },
      action: "acceptance.issue222.human",
      objectKind: "test",
      objectRef: "human",
      beforeState: { value: 1 },
      afterState: { value: 2 },
    });
    let events = (await listAuditEvents(pool, 100)).filter((event) => event.action.startsWith("acceptance.issue222."));
    assert.equal(events.length, 1);
    assert.equal(events[0].actorKind, "human");
    assert.equal(events[0].actorDisplayName, "Acceptance Admin");

    const client = await pool.connect();
    try {
      await client.query("begin");
      await appendAuditEvent(client, {
        actor: { kind: "system" },
        action: "acceptance.issue222.rollback",
        objectKind: "test",
        objectRef: "rollback",
        afterState: { rowsChanged: 4 },
      });
      await client.query("rollback");
    } finally { client.release(); }

    events = (await listAuditEvents(pool, 100)).filter((event) => event.action.startsWith("acceptance.issue222."));
    assert.equal(events.some((event) => event.action === "acceptance.issue222.rollback"), false, "rolled-back audit event must not survive");

    await appendAuditEvent(pool, {
      actor: { kind: "system" },
      action: "acceptance.issue222.logical",
      objectKind: "test",
      objectRef: "multi-row",
      afterState: { rowsChanged: 4 },
    });
    events = (await listAuditEvents(pool, 100)).filter((event) => event.action === "acceptance.issue222.logical");
    assert.equal(events.length, 1, "one logical action must be one event");

    const planningRoute = await readFile("app/api/planning-lifecycle/route.ts", "utf8");
    assert.match(planningRoute, /planning\.final\.autoComplete/);
    assert.match(planningRoute, /systemAuditActor\(\)/);
    assert.match(planningRoute, /db\.transaction/);
    const auditPage = await readFile("app/admin/audit-history/page.tsx", "utf8");
    assert.match(auditPage, /roles\.includes\("admin"\)/);
    assert.doesNotMatch(auditPage, /delete from audit_events|update audit_events/i);
    const interactionRoute = await readFile("app/api/interaction/route.ts", "utf8");
    assert.match(interactionRoute, /auditedInteractionMutation/);
    const policy = await readFile("docs/audit-change-history-policy.md", "utf8");
    assert.match(policy, /append-only/i);
    console.log("Issue #222 audit history acceptance passed.");
  } finally {
    await pool.query("delete from audit_events where action like 'acceptance.issue222.%'").catch(() => undefined);
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
''', encoding="utf-8")
print("Issue #222 acceptance harness corrected.")
