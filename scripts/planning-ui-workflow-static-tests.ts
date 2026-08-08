import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
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
  "Back to Planning row",
  "Historical inactive priest",
  "Historical inactive organist",
  "Catalog sections",
  "Set demo 2-month window",
  "interactionClient.saveOwnPreference",
  "interactionClient.setRepertoire",
  "interactionClient.setMelodyWindow",
  "const selectedRole = activeActor.role",
  "interactionClient.queryCandidates",
  `this.transport("queryCandidates"`,
]) {
  assert(client.includes(required), `Planning UI is missing ${required}`);
}

for (const required of ["position: sticky", ".candidate-popup", ".candidate-detail-button", "@media (max-width: 899px)", ".candidate-option-current", ".row-icon-palette", ".compact-row-fields"]) {
  assert(css.includes(required), `Planning UI CSS is missing ${required}`);
}

console.log("Planning UI static workflow coverage passed.");

for (const required of ["role=\"listbox\"", "role=\"combobox\"", "aria-activedescendant", "Loading candidates", "No candidate matches", "Retry"]) {
  assert(candidateList.includes(required), `Candidate list UI is missing ${required}`);
}
