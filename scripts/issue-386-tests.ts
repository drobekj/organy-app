import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layer = readFileSync("app/guide-hint-layer.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const antiphon = readFileSync("app/service-context-reference-antiphon-field.tsx", "utf8");
const topic = readFileSync("app/service-context-reference-topic-field.tsx", "utf8");
const candidate = readFileSync("src/planning-lifecycle/candidate-list.tsx", "utf8");
const protection = readFileSync("app/non-repetition-period-panel.tsx", "utf8");
const css = readFileSync("app/workspace-shell.css", "utf8");

assert.match(layer, /activeWorkspace: string/);
assert.match(layer, /setActive\(\(current\) => current\?\.mode === "control" \? null : current\)/, "Turning hints off must preserve an open panel summary.");
assert.match(layer, /if \(!active \|\| content\.length === 0 \|\| \(!enabled && active\.mode === "control"\)\) return null;/, "Guide Hints OFF must suppress only control hints.");
assert.match(layer, /function onClick\(event: MouseEvent\)[\s\S]*?guidePanelHintKeys/, "Panel i click must remain handled independently.");
assert.match(layer, /\}, \[activeWorkspace\]\);/, "Workspace changes must close any open Guide hint.");

assert.match(planning, /<GuideHintLayer activeRole=\{selectedRole\} activeWorkspace=\{workspace\} \/>/);
for (const key of ["planning.service.antiphon", "planning.service.topic", "planning.rows.song"]) {
  assert.ok(planning.includes(`guideHint="${key}"`), `Planning must pass ${key} directly to the lookup component.`);
}
assert.doesNotMatch(planning, /guide-hint-contents" data-guide-hint="planning\.service\.(antiphon|topic)"/);
assert.doesNotMatch(planning, /guide-hint-contents" data-guide-hint="planning\.rows\.song"/);

assert.match(antiphon, /guideHint\?: string/);
assert.match(antiphon, /data-guide-hint=\{guideHint\}/);
assert.match(topic, /guideHint\?: string/);
assert.match(topic, /data-guide-hint=\{guideHint\}/);
assert.match(candidate, /guideHint\?: string/);
assert.match(candidate, /data-guide-hint=\{props\.guideHint\}/);

assert.match(protection, /GuidePanelHelpButton scope="planning\.melody-protection"/);
assert.match(css, /\.melody-protection-panel \{\s*overflow: visible;/, "Melody Protection must not clip its panel i.");
assert.match(css, /\.db-workspace > \.guide-scope-info,[\s\S]*?\.information-workspace > \.guide-scope-info \{\s*top: -0\.775rem;/, "About, Plans and History i controls must be centered on their plain top border.");
assert.match(css, /\.guide-scope-info \{[\s\S]*?top: -1\.3rem;/, "Fieldset panel i geometry must remain unchanged where already accepted.");

console.log("Issue 386 Guide hint behavior and geometry acceptance passed.");
