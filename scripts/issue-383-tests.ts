import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guideLayer = readFileSync("app/guide-hint-layer.tsx", "utf8");
const guideControls = readFileSync("app/guide-control-hints.ts", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const plansHistory = readFileSync("app/plan-history-record-lists.tsx", "utf8");
const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
const melodyEdges = readFileSync("app/reference-melody-edge-editor.tsx", "utf8");
const about = readFileSync("app/information-workspaces.tsx", "utf8");
const css = readFileSync("app/workspace-shell.css", "utf8");

assert.match(css, /\.guide-scope-info \{[\s\S]*?top: -1\.3rem;/, "Panel i must be raised to straddle the top contour.");
assert.match(css, /\.guide-hint-popover \{[\s\S]*?max-height:[\s\S]*?overflow: auto;/, "Panel summaries must remain usable on small screens.");

assert.match(guideLayer, /\[data-guide-hint\]/);
assert.match(guideLayer, /guidePanelHintKeys/);
assert.match(guideLayer, /active\.keys\.map/);
assert.match(guideLayer, /pointerType !== "mouse" && event\.pointerType !== "pen"/);
assert.match(guideLayer, /suppressedControlRef\.current = control/, "Control activation must not be swallowed by hints.");

for (const scope of [
  "about.links",
  "planning.service-context",
  "planning.rows",
  "plans.records",
  "history.records",
  "catalog.context",
  "catalog.candidates",
  "catalog.melody-edges",
]) {
  assert.ok(guideControls.includes(`"${scope}"`), `Missing panel summary group ${scope}`);
}
assert.doesNotMatch(guideControls, /development\.runtime.*panelGuideHintGroups/s, "Development must not receive a panel hint group.");

for (const key of [
  "planning.service.date",
  "planning.service.time",
  "planning.service.language",
  "planning.service.priest",
  "planning.service.organist",
  "planning.service.antiphon",
  "planning.service.topic",
  "planning.service.note",
  "planning.rows.song",
  "planning.rows.detail",
  "planning.rows.note",
  "planning.rows.add",
  "planning.rows.move",
  "planning.rows.clear",
  "planning.rows.remove",
]) assert.ok(planning.includes(`data-guide-hint="${key}"`), `Planning control missing ${key}`);

const rowsListEnd = planning.indexOf("</div>", planning.indexOf('<div className="rows-list">'));
const addRow = planning.indexOf('data-guide-hint="planning.rows.add"');
assert.ok(rowsListEnd >= 0 && addRow > rowsListEnd, "Add row must remain below the rows list.");

assert.match(plansHistory, /data-guide-hint-scope="plans\.records"/);
assert.match(plansHistory, /data-guide-hint="plans\.start"/);
assert.match(plansHistory, /data-guide-hint="plans\.open-working"/);
assert.match(plansHistory, /data-guide-hint="plans\.open-final"/);
assert.match(plansHistory, /data-guide-hint-scope="history\.records"/);
assert.match(plansHistory, /data-guide-hint="history\.open"/);

assert.match(catalog, /data-guide-hint-scope="catalog\.context"/);
assert.match(catalog, /data-guide-hint-scope="catalog\.candidates"/);
assert.match(catalog, /data-guide-hint="catalog\.candidates\.availability"/);
assert.match(catalog, /data-guide-hint="catalog\.candidates\.view"/);
assert.match(catalog, /data-guide-hint="catalog\.candidates\.detail"/);
assert.match(catalog, /data-guide-hint="catalog\.candidates\.repertoire"/);

assert.match(melodyEdges, /data-guide-hint-scope="catalog\.melody-edges"/);
assert.match(melodyEdges, /data-guide-hint="catalog\.melody\.language"/);
assert.match(melodyEdges, /guideHint="catalog\.melody\.song"/);
assert.match(melodyEdges, /data-guide-hint="catalog\.melody\.add"/);
assert.match(melodyEdges, /data-guide-hint="catalog\.melody\.remove"/);

assert.match(about, /data-guide-hint-scope="about\.links"/);
assert.match(about, /data-guide-hint="about\.github"/);
assert.match(about, /data-guide-hint="about\.portfolio"/);

const developmentStart = planning.indexOf('workspace === "development"');
const developmentEnd = planning.indexOf("</section>", developmentStart);
assert.ok(developmentStart >= 0 && developmentEnd > developmentStart);
assert.doesNotMatch(planning.slice(developmentStart, developmentEnd), /data-guide-hint/, "Development must remain without contextual hints.");

console.log("Issue 383 contextual Guide expansion acceptance passed.");
