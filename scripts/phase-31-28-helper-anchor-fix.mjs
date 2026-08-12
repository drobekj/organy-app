import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/phase-31-28-implement.mjs";
let source = readFileSync(path, "utf8");
const exact = (before, after) => {
  if (!source.includes(before)) throw new Error("Expected helper fragment not found: " + before.slice(0, 120));
  source = source.replace(before, after);
};

// Keep every exact replacement strict, but replace all occurrences of that exact fragment when it legitimately repeats.
exact("writeFileSync(path, source.replace(before, after));", "writeFileSync(path, source.split(before).join(after));");

// Current development workspace uses release-guidance markup, not the older field-label block assumed by the first helper draft.
const startNeedle = 'replace("app/planning-lifecycle-client.tsx", `<div><span className="field-label">Deterministic test user';
const endNeedle = '\n\nreplace("app/api/catalog/route.ts"';
const start = source.indexOf(startNeedle);
const end = source.indexOf(endNeedle, start);
if (start < 0 || end < 0) throw new Error("Stale Planning Lifecycle UI helper block not found exactly once.");
const actual = '<div><span className="guidance-label">Deterministic test user</span><strong>{activeUser.label} ({activeUser.id})</strong><label>Change user<select value={selectedUserId} onChange={(event) => { const user = demoUsers.find((candidate) => candidate.id === event.target.value); if (user) { setSelectedUserId(user.id); setSelectedAssignedRole(user.roles[0]); } }}>{demoUsers.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}</select></label><label>Assigned role<select value={effectiveRole} onChange={(event) => setSelectedAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><p>Development switches stable user IDs and stored assigned roles until authentication exists.</p></div>';
const replacement = '{runtimeMode === "memory" ? <div><span className="guidance-label">Deterministic test user</span><strong>{activeUser.label} ({activeUser.id})</strong><label>Change user<select value={selectedUserId} onChange={(event) => { const user = demoUsers.find((candidate) => candidate.id === event.target.value); if (user) { setSelectedUserId(user.id); setSelectedAssignedRole(user.roles[0]); } }}>{demoUsers.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}</select></label><label>Assigned role<select value={effectiveRole} onChange={(event) => setSelectedAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><p>Development switches stable user IDs and stored assigned roles for deterministic memory tests.</p></div> : <div><span className="guidance-label">Authenticated staff</span><strong>{activeUser.label} ({activeUser.id})</strong><label>Active role<select value={effectiveRole} onChange={(event) => setSelectedAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><p>DB runtime uses the authenticated staff account; Change user is available only in memory development/test runtime.</p></div>}';
const call = 'replace("app/planning-lifecycle-client.tsx", ' + JSON.stringify(actual) + ', ' + JSON.stringify(replacement) + ');';
source = source.slice(0, start) + call + source.slice(end);

// The repository's intentionally narrow pg typing exposes rows, not rowCount.
exact("if (linked.rowCount) throw new Error(\"Target application user already has a protected account.\");", "if (linked.rows.length > 0) throw new Error(\"Target application user already has a protected account.\");");
exact("if (!person.rowCount) throw new Error(\"person-id does not exist in catalog_persons.\");", "if (person.rows.length === 0) throw new Error(\"person-id does not exist in catalog_persons.\");");

writeFileSync(path, source);
