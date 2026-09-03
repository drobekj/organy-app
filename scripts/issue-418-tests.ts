import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  guidePracticalContext,
  guideRoleContextShared,
  guideSections,
} from "../app/guide-content";

const workspace = readFileSync("app/guide-workspace.tsx", "utf8");
const simulator = readFileSync("app/demo-role-simulator.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");

const finalGuide = guideSections.find((section) => section.id === "guide.guide");
assert.ok(finalGuide, "Final Guide section must exist.");
assert.deepEqual(finalGuide.bullets, [], "Final Guide section must not own a Shared block.");

assert.match(guidePracticalContext.en, /EN\/CZ/);
assert.match(guidePracticalContext.en, /panel i buttons/i);
assert.match(guidePracticalContext.cz, /EN\/CZ/);
assert.match(guidePracticalContext.cz, /tlačítka i/i);
assert.match(guideRoleContextShared.en, /Role-specific Guide blocks/);

assert.match(workspace, /guidePracticalContext/);
assert.match(workspace, /section\.bullets\.length > 0/);
assert.match(workspace, /className="guide-shared"/);
assert.match(workspace, /guideRoleContextShared/);

assert.match(simulator, /embedded = false/);
assert.match(simulator, /demo-role-simulator-embedded/);
assert.match(planning, /demoRole=\{isDemoExperience \? demoPresentationRole : undefined\}/);

console.log("Issue 418 final Guide Shared redistribution evolved acceptance passed.");
