import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateMelodyWindowMonths } from "../src/application/non-repetition-period";

const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const panel = readFileSync("app/non-repetition-period-panel.tsx", "utf8");
const accounts = readFileSync("app/admin/accounts/page.tsx", "utf8");
const personAdmin = readFileSync("app/admin/accounts/person-admin-panel.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

assert.equal(validateMelodyWindowMonths(0), true);
assert.equal(validateMelodyWindowMonths(12), true);
assert.equal(validateMelodyWindowMonths(13), false);
assert.equal(validateMelodyWindowMonths(-1), false);
assert.equal(validateMelodyWindowMonths(1.5), false);

assert.equal((client.match(/<NonRepetitionPeriodPanel/g) ?? []).length, 1, "Melody Protection must render once");
assert(client.includes('workspace === "planning"'), "Planning workspace must remain present");
assert.match(client, /className="planning-melody-protection-slot"[\s\S]*?selectedRole === "priest" \|\| selectedRole === "organist"[\s\S]*?<NonRepetitionPeriodPanel/, "Melody Protection must remain in the reserved Planning slot for Priest and Organist");
assert(client.includes('onSaved={() => {'), "Planning must react to successful Melody Protection saves");
assert(client.includes('setCandidateRefreshGeneration((generation) => generation + 1)'), "Melody Protection save must refresh candidates");
assert(client.includes("candidateRefreshGeneration,\n    serviceDate"), "selected candidate availability must share the Melody Protection refresh generation");
assert(!client.includes('setSelectedCatalogTab("people")'), "Catalog People tab must be removed");
assert(!client.includes('setSelectedCatalogTab("knowledge")'), "Catalog Knowledge tab must be removed");
assert(!client.includes('selectedCatalogTab === "people"'), "Catalog People panel must be removed");
assert(!client.includes('selectedCatalogTab === "knowledge"'), "Catalog Knowledge panel must be removed");
assert(client.includes("<CatalogWorkspace"), "Later Catalog redesign must preserve the Step 1 relocation while replacing legacy tabs");

assert(panel.includes('Array.from({ length: 13 }'), "Melody Protection selector must expose 0-12 months");
assert(panel.includes('onChange={(event) => void change(Number(event.target.value))}'), "Melody Protection must react immediately to selection");
assert(!panel.includes("Save period"), "Melody Protection must not retain a Save button");

assert(accounts.includes("<h1>Manage Accounts</h1>"), "Account administration should use the Manage Accounts product name");
assert(accounts.includes("<PersonAdminPanel people={allPeople} />"), "Manage Accounts must host Person administration");
for (const required of ['action: "savePerson"', "Display name", "Priest", "Organist", "Active", "<PersonDeleteButton"]) {
  assert(personAdmin.includes(required), `Person administration is missing ${required}`);
}
assert(css.includes(".melody-protection-panel"), "Melody Protection compact layout is missing");
assert.match(css, /\.planning-melody-protection-slot \{[\s\S]*?justify-self: stretch;[\s\S]*?width: 100%;/, "Melody Protection reserved slot must fill the right-aligned protection track");
assert.match(css, /\.melody-protection-panel \{[\s\S]*?border-radius: 1rem;/, "Melody Protection must keep the rounded contour");

console.log("Issue 271 relocation acceptance passed.");
