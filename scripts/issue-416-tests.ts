import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  guideAccountContext,
  guidePreviewRoleContext,
  guideRoleContextShared,
  guideSections,
} from "../app/guide-content";

const workspace = readFileSync("app/guide-workspace.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const simulator = readFileSync("app/demo-role-simulator.tsx", "utf8");
const controls = readFileSync("app/protected-account-controls.tsx", "utf8");
const globals = readFileSync("app/globals.css", "utf8");

assert.equal(guidePreviewRoleContext.title.en, "Preview role");
assert.equal(guideAccountContext.title.en, "User & Role");
assert.match(guideRoleContextShared.en, /Role-specific Guide blocks follow the role represented by this panel/);

const accountEnglish = guideAccountContext.bullets.map((item) => item.en).join(" ");
for (const phrase of ["Sign Role", "Guide Hints", "Phone Setting", "Change Password", "Sign Out", "Role Admin", "Manage Accounts", "Audit History", "Verify DB"]) {
  assert.ok(accountEnglish.includes(phrase), `Production Guide context must explain ${phrase}.`);
}

const guideSection = guideSections.find((section) => section.id === "guide.guide");
assert.ok(guideSection);
assert.equal(guideSection.experience, undefined, "Guide section must not duplicate Production/Demo context copy.");

const headerEnd = workspace.indexOf("</header>");
const contextStart = workspace.indexOf('experience === "demo" && demoRole && onDemoRoleChange ? (', headerEnd);
const sectionsStart = workspace.indexOf('<div className="guide-sections">', contextStart);
assert.ok(headerEnd >= 0 && contextStart > headerEnd && sectionsStart > contextStart, "Role context panel must sit between Practical Guide and About.");

assert.match(workspace, /className="demo-role-simulator guide-role-context-panel"/);
assert.match(workspace, /className="demo-role-simulator guide-role-context-panel guide-account-context"/);
assert.match(workspace, /guidePreviewRoleContext\.title/);
assert.match(workspace, /guideAccountContext\.title/);
assert.match(workspace, /guideRoleContextShared/);

assert.match(planning, /\{workspace !== "guide" && <DemoRoleSimulator role=\{demoPresentationRole\} onChange=\{changeDemoPresentationRole\} \/>\}/);
assert.match(planning, /demoRole=\{isDemoExperience \? demoPresentationRole : undefined\}/);
assert.match(planning, /onDemoRoleChange=\{isDemoExperience \? changeDemoPresentationRole : undefined\}/);

assert.match(simulator, /embedded = false/);
assert.match(simulator, /demo-role-simulator-embedded/);
assert.match(simulator, /Presentation only · no sign-in or permissions are granted\./);
assert.match(simulator, /onClick=\{\(\) => onChange\(candidate\)\}/);

for (const phrase of ["User <strong>{displayName}</strong>", "Role <strong>Admin</strong>", "Manage Accounts", "Audit History", "Verify DB"]) {
  assert.ok(controls.includes(phrase), `Production control contract must retain ${phrase}.`);
}

assert.match(globals, /\.demo-role-simulator \{/);
assert.match(globals, /\.demo-role-simulator-embedded \{/);
assert.match(globals, /\.guide-role-context-panel/);

console.log("Issue 416 Guide context-panel alignment evolved acceptance passed.");
