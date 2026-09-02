import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { presentAuditEvent } from "../src/application/audit-history-view";
import { DemoWriteDeniedError } from "../src/application/demo-safety";
import { DemoPlanningLifecycleClient } from "../src/demo/d2-planning-client";
import { DemoCatalogKnowledgeClient } from "../src/demo/d3-catalog-client";
import { DEMO_D5_ACCOUNTS, DEMO_D5_AUDIT_EVENTS } from "../src/demo/d5-admin-fixture";

async function main() {
  assert.equal(DEMO_D5_ACCOUNTS.length, 4);
  assert.ok(DEMO_D5_ACCOUNTS.every((account) => account.id.startsWith("demo-account-")));
  assert.ok(DEMO_D5_ACCOUNTS.every((account) => account.username.startsWith("demo.")));
  assert.ok(DEMO_D5_ACCOUNTS.some((account) => account.roles.includes("admin")));
  assert.ok(DEMO_D5_ACCOUNTS.some((account) => account.roles.includes("priest")));
  assert.ok(DEMO_D5_ACCOUNTS.some((account) => account.roles.includes("organist")));

  assert.equal(DEMO_D5_AUDIT_EVENTS.length, 4);
  assert.ok(DEMO_D5_AUDIT_EVENTS.every((event) => event.objectRef.startsWith("demo-")));
  assert.ok(DEMO_D5_AUDIT_EVENTS.some((event) => event.actorKind === "system"));
  assert.ok(DEMO_D5_AUDIT_EVENTS.some((event) => event.action === "planning.working.save"));
  assert.ok(DEMO_D5_AUDIT_EVENTS.some((event) => event.action === "planning.final.complete"));
  assert.ok(DEMO_D5_AUDIT_EVENTS.some((event) => event.action === "account.role.update"));

  const planningPresentation = presentAuditEvent(DEMO_D5_AUDIT_EVENTS.find((event) => event.action === "planning.working.save")!);
  assert.equal(planningPresentation.action, "planning.working.save");
  assert.equal(planningPresentation.before.kind, "service");
  assert.equal(planningPresentation.after.kind, "service");

  const genericPresentation = presentAuditEvent(DEMO_D5_AUDIT_EVENTS.find((event) => event.action === "account.role.update")!);
  assert.equal(genericPresentation.before.kind, "generic");
  assert.equal(genericPresentation.after.kind, "generic");

  const fixture = readFileSync("src/demo/d5-admin-fixture.ts", "utf8");
  const adminUi = readFileSync("app/demo-admin-workspaces.tsx", "utf8");
  const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
  const workspaceModel = readFileSync("src/planning-lifecycle/workspace.ts", "utf8");
  const roleModel = readFileSync("src/planning-lifecycle/model.ts", "utf8");
  const productionAccounts = readFileSync("app/admin/accounts/page.tsx", "utf8");
  const productionAudit = readFileSync("app/admin/audit-history/page.tsx", "utf8");

  assert.doesNotMatch(fixture, /DATABASE_URL|authPool|Postgres|fetch\s*\(|\/api\/|better-auth|password/i);
  assert.doesNotMatch(adminUi, /fetch\s*\(|\/api\/|authPool|DATABASE_URL|document\.cookie|localStorage|sessionStorage/);
  assert.match(adminUi, /window\.location\.reload\(\)/);
  assert.match(adminUi, /Reset Demo/);
  assert.match(adminUi, /Synthetic read-only Accounts/);
  assert.match(adminUi, /No Production accounts, credentials or authentication records are loaded\./);
  assert.match(adminUi, /Synthetic Audit History/);
  assert.match(adminUi, /No Production audit events are queried\./);
  assert.match(adminUi, /<button type="button" disabled>Edit roles<\/button>/);
  assert.match(adminUi, /<button type="button" disabled>Deactivate<\/button>/);
  assert.match(adminUi, /<button type="button" disabled>Reset password<\/button>/);

  assert.match(planning, /const \[demoAdminView, setDemoAdminView\] = useState<DemoAdminView \| null>\(null\)/);
  assert.match(planning, /<DemoResetButton \/>/);
  assert.match(planning, /<DemoRoleSimulator role=\{demoPresentationRole\} onChange=\{changeDemoPresentationRole\} \/>/);
  assert.match(planning, /if \(!isDemoExperience \|\| demoPresentationRole !== "admin"\) return/);
  assert.match(planning, /if \(role !== "admin" && demoAdminView\) \{\s*setDemoAdminView\(null\);\s*setWorkspace\("planning"\)/);
  assert.match(planning, /isDemoExperience && demoPresentationRole === "admin"/);
  assert.match(planning, />Accounts<\/button>/);
  assert.match(planning, />Audit<\/button>/);
  assert.match(planning, /demoAdminView === "accounts" && <DemoAccountsWorkspace \/>/);
  assert.match(planning, /demoAdminView === "audit" && <DemoAuditWorkspace \/>/);
  assert.match(planning, /setDemoAdminView\(null\);\s*setWorkspace\(nextWorkspace\)/);

  assert.doesNotMatch(workspaceModel, /demoAccounts|demoAudit|DemoAdminView|accounts.*audit/i);
  const planningRole = roleModel.match(/export type PlanningRole = ([^;]+);/)?.[1] ?? "";
  assert.doesNotMatch(planningRole, /demo/i);

  assert.match(productionAccounts, /if \(process\.env\.ORGANY_RUNTIME !== "db"\) redirect\("\/"\)/);
  assert.match(productionAccounts, /resolveProtectedUser/);
  assert.match(productionAudit, /if \(process\.env\.ORGANY_RUNTIME !== "db"\) redirect\("\/"\)/);
  assert.match(productionAudit, /resolveProtectedUser/);

  const planningClient = new DemoPlanningLifecycleClient();
  const catalogClient = new DemoCatalogKnowledgeClient();
  await assert.rejects(
    planningClient.saveWorkingSet({} as never),
    (error: unknown) => error instanceof DemoWriteDeniedError && error.code === "demoReadOnly",
  );
  await assert.rejects(
    catalogClient.saveOwnPreference("demo-cz-101", 1),
    (error: unknown) => error instanceof DemoWriteDeniedError && error.code === "demoReadOnly",
  );

  console.log("Issue 412 Stage D5 synthetic Audit, read-only Accounts and Reset Demo acceptance passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
