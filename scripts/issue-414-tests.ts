import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guide = readFileSync("app/guide-content.ts", "utf8");
const workspace = readFileSync("app/guide-workspace.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const controlHints = readFileSync("app/guide-control-hints.ts", "utf8");
const whatsapp = readFileSync("app/post-finalize-whatsapp-handoff.tsx", "utf8");
const css = readFileSync("app/workspace-shell.css", "utf8");

assert.match(guide, /export type GuideRole = "admin" \| "priest" \| "organist";/);
assert.match(guide, /export type GuideExperience = "standard" \| "demo";/);
assert.match(guide, /synthetic in-memory data only/);
assert.match(guide, /Preview role changes presentation only/);
assert.match(guide, /Reset Demo restores the original synthetic fixture/);

assert.match(guide, /Owns the persistent Melody Protection setting[\s\S]*?0 to 12 months[\s\S]*?default is 2 months/);
assert.match(guide, /Priest may increase it for the plan but cannot choose a lower value[\s\S]*?Anonymous Organist has a 0-month minimum/);
assert.match(guide, /unrestricted temporary 0–12 month session override[\s\S]*?does not overwrite the Organist's stored setting/);
assert.match(guide, /"planning\.melody-protection"[\s\S]*?session-only[\s\S]*?Anonymous Organist has a 0-month minimum[\s\S]*?default is 2 months/);

assert.match(guide, /Demo Catalog is read-only and uses synthetic data/);
assert.match(guide, /preference, repertoire and Melody Edge mutations are not persisted/);
assert.match(guide, /id: "guide\.development"[\s\S]*?standardOnly: true/);
assert.match(guide, /export const guideAccountContext = \{[\s\S]*?User & Role[\s\S]*?Sign Role[\s\S]*?Phone Setting[\s\S]*?Role Admin[\s\S]*?Manage Accounts[\s\S]*?Audit History[\s\S]*?Verify DB/);
assert.match(guide, /"planning\.whatsapp"[\s\S]*?prepared message[\s\S]*?protected account/);

assert.match(workspace, /experience: GuideExperience/);
assert.match(workspace, /experience === "demo"[\s\S]*?filter\(\(section\) => !section\.standardOnly\)/);
assert.match(workspace, /\["admin", "priest", "organist"\]/);
assert.match(workspace, /guideEnvironmentCopy\[experience\]/);
assert.match(workspace, /section\.experience\?\.\[experience\]/);
assert.match(workspace, /experience === "demo" \? \([\s\S]*?demoRolePanel[\s\S]*?: \([\s\S]*?guide-account-context/);

assert.match(planning, /<GuideWorkspace[\s\S]*?activeRole=\{presentationRole\}[\s\S]*?experience=\{isDemoExperience \? "demo" : "standard"\}[\s\S]*?demoRolePanel=/);
assert.match(controlHints, /role === "admin" \|\| role === "priest" \|\| role === "organist"/);
assert.match(controlHints, /Demo Catalog is read-only/);
assert.equal((whatsapp.match(/data-guide-hint="planning\.whatsapp"/g) ?? []).length, 3);
assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(14rem, 1fr\)\)/);
assert.match(css, /\.guide-shared,\s*\.guide-experience/);

console.log("Issue 414 shared Guide refresh acceptance passed.");
