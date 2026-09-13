import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canEditSelectedOrganistMelodyProtection } from "../app/non-repetition-period-panel";
import type { ActorIdentity } from "../src/application/interaction-contracts";

async function main() {
  const organistA: ActorIdentity = {
    userId: "user-a",
    displayName: "Organist A",
    role: "organist",
    personId: "person-a",
  };
  const priest: ActorIdentity = {
    userId: "user-priest",
    displayName: "Priest",
    role: "priest",
    personId: "priest-person",
  };
  const admin: ActorIdentity = {
    userId: "user-admin",
    displayName: "Admin",
    role: "admin",
  };

  assert.equal(canEditSelectedOrganistMelodyProtection(organistA, "person-a"), true, "Organist must be able to edit their own selected Melody Protection.");
  assert.equal(canEditSelectedOrganistMelodyProtection(organistA, "person-b"), false, "Organist must not edit another selected organist's Melody Protection.");
  assert.equal(canEditSelectedOrganistMelodyProtection(organistA, undefined), false, "Organist must not edit Melody Protection when no concrete organist is selected.");
  assert.equal(canEditSelectedOrganistMelodyProtection(priest, "person-b"), true, "Priest behavior remains governed by its existing minimum/effective rules.");
  assert.equal(canEditSelectedOrganistMelodyProtection(admin, "person-b"), true, "Admin behavior remains governed by its existing override rules.");

  const [panel, client, service] = await Promise.all([
    readFile("app/non-repetition-period-panel.tsx", "utf8"),
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("src/application/postgres-non-repetition-period.ts", "utf8"),
  ]);

  assert.match(
    panel,
    /callMelodyProtectionApi\([\s\S]*?"getOrganistMelodyProtection",\s*selectedOrganistPersonId \? \{ organistPersonId: selectedOrganistPersonId \} : \{\},\s*actor,/,
    "All Planning roles, including organist, must read Melody Protection for the Service Context organist.",
  );
  assert.doesNotMatch(
    panel,
    /actor\.role === "organist"\s*\?\s*callMelodyProtectionApi\("getOwnMelodyProtection"/,
    "Organist display must no longer switch reads to the signed-in user's own value.",
  );
  assert.match(panel, /const value = actor\.role === "organist"\s*\? minimumMonths/, "Organist display must render the selected organist value.");
  assert.match(panel, /disabled=\{disabled \|\| feedback\.kind === "loading" \|\| !canEditSelectedOrganist\}/, "Different selected organist must make the control read-only.");
  assert.match(panel, /if \(!canEditSelectedOrganist\) return;[\s\S]*setOwnMelodyProtection/, "Mutation path must fail closed before setOwnMelodyProtection when another organist is selected.");
  assert.match(panel, /if \(effectiveMonths === minimumMonths\) return;[\s\S]*onEffectiveChange\(minimumMonths\)/, "Organist Planning effective value must converge to the selected organist value.");
  assert.match(panel, /onMinimumLoaded\?\.\(months\);[\s\S]*onSaved\?\.\(months\);/, "Resolved selected-organist value must refresh dependent Planning candidate/conflict state.");

  assert.match(
    client,
    /const candidateMelodyProtectionMonths = selectedRole === "admin"\s*\? adminCandidateMelodyProtectionMonths\s*:\s*melodyProtectionMonths;/,
    "Non-admin candidate filtering must consume the effective Melody Protection state synchronized by the panel.",
  );
  assert.match(
    client,
    /organistPersonId: organistId,\s*melodyProtectionMonths: candidateMelodyProtectionMonths,/,
    "Candidate queries must pair the selected Service Context organist with the synchronized Melody Protection value.",
  );
  assert.match(
    client,
    /previewPlanningSetConflict\(\{[\s\S]*?setId: persistedSet\.id,\s*serviceDate,\s*melodyProtectionMonths,\s*rows: planningRows,/,
    "Planning conflict preview must consume the same synchronized effective Melody Protection state.",
  );
  assert.match(
    client,
    /else if \(!isEditorLocked\) \{\s*setMelodyProtectionMonths\(months\);/,
    "Organist panel synchronization must feed the shared Planning effective value without introducing an ownership restriction on the plan.",
  );

  assert.match(service, /async setOwnOrganistMinimum\(actor: ActorIdentity, months: unknown\)/);
  assert.match(service, /if \(actor\.role !== "organist" \|\| !actor\.personId\) return failure\("permissionDenied"/);
  assert.match(service, /where id = \$1[\s\S]*\[actor\.personId, months\]/, "Backend mutation must remain bound to the authenticated organist personId.");

  console.log("Issue 458 selected-organist Melody Protection acceptance: PASS");
}

void main().catch((error: unknown) => {
  console.error("Issue 458 selected-organist Melody Protection acceptance: FAIL");
  console.error(error);
  process.exitCode = 1;
});
