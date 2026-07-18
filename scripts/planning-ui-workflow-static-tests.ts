import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

for (const required of [
  "role=\"listbox\"",
  "Cancel lookup",
  "openCatalogSongDetail(candidate.songId, row.id)",
  "Back to Planning row",
  "selected-song-summary",
  "Historical inactive priest",
  "Historical inactive organist",
  "Catalog sections",
  "Set demo 21-day window",
  "interactionClient.saveOwnPreference",
  "interactionClient.setRepertoire",
  "interactionClient.setMelodyWindow",
  "const selectedRole = activeActor.role",
  "interactionClient.queryCandidates",
  `callInteractionApi("queryCandidates"`,
]) {
  assert(client.includes(required), `Planning UI is missing ${required}`);
}

for (const required of ["position: sticky", ".candidate-popup", ".candidate-detail-button", "@media (max-width: 899px)"]) {
  assert(css.includes(required), `Planning UI CSS is missing ${required}`);
}

console.log("Planning UI static workflow coverage passed.");
