import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guideAccountContext, guideSections } from "../app/guide-content";

const workspace = readFileSync("app/guide-workspace.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const simulator = readFileSync("app/demo-role-simulator.tsx", "utf8");
const controls = readFileSync("app/protected-account-controls.tsx", "utf8");
const globals = readFileSync("app/globals.css", "utf8");

assert.equal(guideAccountContext.title.en, "User & Role");
assert.equal(guideAccountContext.title.cz, "User & Role");
assert.match(guideAccountContext.summary.en, /top-right corner/i);
assert.match(guideAccountContext.summary.cz, /vpravo nahoře/i);
const accountEnglish = guideAccountContext.bullets.map((item) => item.en).join(" ");
const accountCzech = guideAccountContext.bullets.map((item) => item.cz).join(" ");
for (const phrase of ["Sign Role", "Guide Hints", "Phone Setting", "Change Password", "Sign Out", "Role Admin", "Manage Accounts", "Audit History", "Verify DB"]) {
  assert.ok(accountEnglish.includes(phrase), `Production Guide context must explain ${phrase}.`);
}
assert.match(accountCzech, /Role Admin/);
assert.match(accountCzech, /Manage Accounts/);
assert.match(accountCzech, /Audit History/);
assert.match(accountCzech, /Verify DB/);

const guideSection = guideSections.find((section) => section.id === "guide.guide");
assert.ok(guideSection);
assert.equal(guideSection.experience, undefined, "Guide section must no longer duplicate Production/Demo context copy.");

const headerEnd = workspace.indexOf("</header>");
const contextStart = workspace.indexOf('experience === "demo" ? (', headerEnd);
const sectionsStart = workspace.indexOf('<div className="guide-sections">', contextStart);
assert.ok(headerEnd >= 0 && contextStart > headerEnd && sectionsStart > contextStart, "Context panel must sit directly between Practical Guide header and About/Guide sections.");
assert.match(workspace, /experience === "demo" \? \(\s*demoRolePanel\s*\) : \(/);
assert.match(workspace, /className="demo-role-simulator guide-account-context"/);
assert.match(workspace, /guideAccountContext\.title/);
assert.match(workspace, /guideAccountContext\.bullets/);

assert.match(planning, /\{workspace !== "guide" && <DemoRoleSimulator role=\{demoPresentationRole\} onChange=\{changeDemoPresentationRole\} \/>\}/);
assert.match(planning, /demoRolePanel=\{isDemoExperience \? <DemoRoleSimulator role=\{demoPresentationRole\} onChange=\{changeDemoPresentationRole\} \/> : undefined\}/);
assert.equal((planning.match(/<DemoRoleSimulator role=\{demoPresentationRole\} onChange=\{changeDemoPresentationRole\} \/>/g) ?? []).length, 2);
assert.match(simulator, /Preview role/);
assert.match(simulator, /Presentation only · no sign-in or permissions are granted\./);
assert.match(simulator, /onClick=\{\(\) => onChange\(candidate\)\}/);

for (const phrase of ["User <strong>{displayName}</strong>", "Role <strong>Admin</strong>", "Manage Accounts", "Audit History", "Verify DB"]) {
  assert.ok(controls.includes(phrase), `Production control contract must retain ${phrase}.`);
}

assert.match(globals, /\.demo-role-simulator \{/);
assert.match(globals, /\.guide-account-context \{/);
assert.match(globals, /\.guide-context-list \{/);

console.log("Issue 416 Guide context-panel alignment acceptance passed.");
