import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const runtimeClients = readFileSync("app/planning-runtime-clients.ts", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const candidateList = readFileSync("src/planning-lifecycle/candidate-list.tsx", "utf8");

// DB candidate calls use the injected transport so structured failures remain observable to the Planning client.
// Authoritative highlighting is passed separately and never inferred from the legacy synthetic antiphon key.
// The production Reference candidate boundary is checked separately for absence of every legacy table identifier.
for (const required of [
  "<CandidateCombobox",
  "openSelectedSongDetail(row.id",
  "row-icon-palette",
  "placeholder=\"Text note\"",
  "planning-action-validation-list",
  "Every row must include either a complete song reference or a non-empty textual note.",
  "Every candidate must be available.",
  "getPlanningCandidateRowLookupState",
  "candidateAvailabilityKey",
  "hasCandidateAvailabilityBlock",
  "onBackFromDetail={backToCandidateList}",
  "onClose={() => closeSelectedSongDetail(row.id)}",
  "Historical inactive priest",
  "Historical inactive organist",
  "<CatalogWorkspace",
  "<NonRepetitionPeriodPanel",
  "memoryPlanningSets={repositories.planningSets}",
  "const selectedRole = activeActor.role",
  "interactionClient.queryCandidates",
  "interactionClient.queryCatalogCandidates",
]) {
  assert(client.includes(required), `Planning UI is missing ${required}`);
}

assert(runtimeClients.includes(`this.transport("queryCandidates"`), "DB candidate transport boundary is missing from runtime clients");

assert(!client.includes("Set demo 2-month window"), "Planning UI must not retain the legacy fixed demo melody-window control");

assert.equal(
  (client.match(/<RecordListSummary summary=\{formatPlanningSetSummary\(set\)\} \/>/g) ?? []).length,
  2,
  "Working and Final Plans must render the rows summary on the second line",
);
assert.equal(
  (client.match(/<RecordListSummary summary=\{formatCompletedRecordSummary\(record\)\} \/>/g) ?? []).length,
  1,
  "Completed Services must render the rows summary on the second line",
);
assert.match(client, /const rowsMarker = " · rows:"/, "record-list summary split must start exactly before rows:");
assert.match(css, /\.record-summary-rows\s*\{[\s\S]*?display:\s*block;/, "rows summary must render as its own line");

for (const required of ["position: sticky", ".candidate-popup", ".candidate-detail-button", "@media (max-width: 899px)", ".candidate-option-current", ".row-icon-palette", ".compact-row-fields", ".candidate-selection-unavailable"]) {
  assert(css.includes(required), `Planning UI CSS is missing ${required}`);
}

console.log("Planning UI static workflow coverage passed.");

for (const required of ["role=\"listbox\"", "role=\"combobox\"", "aria-activedescendant", "Loading candidates", "No candidate matches", "Retry", "candidate-selection-unavailable", "selectionUnavailable"]) {
  assert(candidateList.includes(required), `Candidate list UI is missing ${required}`);
}
