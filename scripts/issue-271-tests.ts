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
assert(client.includes('selectedRole === "admin" && (\n            <NonRepetitionPeriodPanel'), "Melody Protection must be admin-only in Planning");
assert(client.includes('onSaved={() => {'), "Planning must react to successful Melody Protection saves");
assert(client.includes('setCandidateRefreshGeneration((generation) => generation + 1)'), "Melody Protection save must refresh candidates");
assert(client.includes("candidateRefreshGeneration,\n    serviceDate"), "selected candidate availability must share the Melody Protection refresh generation");
assert(!client.includes('setSelectedCatalogTab("people")'), "Catalog People tab must be removed");
assert(!client.includes('setSelectedCatalogTab("knowledge")'), "Catalog Knowledge tab must be removed");
assert(!client.includes('selectedCatalogTab === "people"'), "Catalog People panel must be removed");
assert(!client.includes('selectedCatalogTab === "knowledge"'), "Catalog Knowledge panel must be removed");
assert(client.includes('useState<"songs" | "reference">("songs")'), "Step 1 must leave Songs and Reference tabs intact");

assert(panel.includes('Array.from({ length: 13 }'), "Melody Protection selector must expose 0-12 months");
assert(panel.includes('onChange={(event) => void save(Number(event.target.value))}'), "Melody Protection must autosave on selection");
assert(!panel.includes("Save period"), "Melody Protection must not retain a Save button");

assert(accounts.includes("<h1>Manage Accounts</h1>"), "Account administration should use the Manage Accounts product name");
assert(accounts.includes("<PersonAdminPanel people={allPeople} />"), "Manage Accounts must host Person administration");
for (const required of ['action: "savePerson"', "Display name", "Priest", "Organist", "Active", "<PersonDeleteButton"]) {
  assert(personAdmin.includes(required), `Person administration is missing ${required}`);
}
assert(css.includes(".melody-protection-panel"), "Melody Protection compact layout is missing");
assert(css.includes("justify-self: end"), "Melody Protection must align to the right");

console.log("Issue 271 relocation acceptance passed.");
