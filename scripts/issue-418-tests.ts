import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guideAccountContext, guidePracticalContext, guideSections } from "../app/guide-content";

const workspace = readFileSync("app/guide-workspace.tsx", "utf8");
const simulator = readFileSync("app/demo-role-simulator.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");

const finalGuide = guideSections.find((section) => section.id === "guide.guide");
assert.ok(finalGuide, "Final Guide section must exist.");
assert.deepEqual(finalGuide.bullets, [], "Final Guide section must not own a Shared block anymore.");

assert.match(guidePracticalContext.en, /EN\/CZ/);
assert.match(guidePracticalContext.en, /panel i buttons/i);
assert.match(guidePracticalContext.cz, /EN\/CZ/);
assert.match(guidePracticalContext.cz, /tlačítka i/i);

const accountEnglish = guideAccountContext.bullets.map((item) => item.en).join(" ");
assert.match(accountEnglish, /Guide Hints/);
assert.match(accountEnglish, /hover\/focus help/i);
assert.match(accountEnglish, /role-specific Guide blocks follow that active role/i);

assert.match(workspace, /guidePracticalContext/);
assert.match(workspace, /section\.bullets\.length > 0/);
assert.match(workspace, /className="guide-shared"/);

assert.match(simulator, /guideContext = false/);
assert.match(simulator, /Role-specific Guide blocks follow this preview role\./);
assert.match(planning, /guideContext \/>/);

console.log("Issue 418 final Guide Shared redistribution acceptance passed.");
