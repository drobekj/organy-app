import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  guideAccountContext,
  guideEnvironmentCopy,
  guidePracticalContext,
  guidePreviewRoleContext,
  guideRoleContextShared,
} from "../app/guide-content";

const workspace = readFileSync("app/guide-workspace.tsx", "utf8");
const shellCss = readFileSync("app/workspace-shell.css", "utf8");

assert.match(guidePracticalContext.en, /Switch EN\/CZ/);
assert.match(guidePracticalContext.en, /panel i buttons/);
assert.doesNotMatch(guidePracticalContext.en, /synthetic|protected signed-in|persistent application data/i);

assert.match(guideEnvironmentCopy.demo.en, /synthetic in-memory data only/);
assert.match(guideEnvironmentCopy.demo.en, /Preview role changes presentation only/);
assert.match(guideEnvironmentCopy.demo.en, /Reset Demo restores/);
assert.match(guideEnvironmentCopy.standard.en, /protected signed-in session/);
assert.match(guideEnvironmentCopy.standard.en, /persistent application data/);

assert.match(guideRoleContextShared.en, /Role-specific Guide blocks follow the role represented by this panel/);
assert.doesNotMatch(guidePreviewRoleContext.summary.en, /no sign-in|permissions are granted/i);
assert.doesNotMatch(guideAccountContext.bullets.map((item) => item.en).join(" "), /role-specific Guide blocks follow/i);

const headerStart = workspace.indexOf('<header className="guide-header">');
const headerEnd = workspace.indexOf("</header>", headerStart);
const header = workspace.slice(headerStart, headerEnd);
const headerShared = header.indexOf("guideUi.shared");
const headerDivider = header.indexOf("guide-meta-divider");
const headerEnvironment = header.indexOf("guideUi.environment");
assert.ok(headerShared >= 0 && headerDivider > headerShared && headerEnvironment > headerDivider, "Practical Guide must read Shared → divider → This environment.");

const demoPanelStart = workspace.indexOf('className="demo-role-simulator guide-role-context-panel"');
const productionPanelStart = workspace.indexOf('className="demo-role-simulator guide-role-context-panel guide-account-context"');
assert.ok(demoPanelStart >= 0 && productionPanelStart > demoPanelStart);

for (const [name, start, end] of [
  ["Demo", demoPanelStart, productionPanelStart],
  ["Production", productionPanelStart, workspace.indexOf('<div className="guide-sections">', productionPanelStart)],
] as const) {
  const panel = workspace.slice(start, end);
  const shared = panel.indexOf("guideUi.shared");
  const divider = panel.indexOf("guide-meta-divider");
  const environment = panel.indexOf(name === "Demo" ? "guideUi.demo" : "guideUi.standard");
  assert.ok(shared >= 0 && divider > shared && environment > divider, `${name} role-context panel must read Shared → divider → environment.`);
}

assert.match(workspace, /<DemoRoleSimulator role=\{demoRole\} onChange=\{onDemoRoleChange\} embedded \/>/);
assert.match(shellCss, /\.guide-meta-block \{/);
assert.match(shellCss, /\.guide-meta-divider \{/);
assert.match(shellCss, /\.guide-role-context-panel \.guide-meta-block/);

console.log("Issue 420 unified Guide meta-panel hierarchy acceptance passed.");
