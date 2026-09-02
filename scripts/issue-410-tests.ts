import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DemoWriteDeniedError } from "../src/application/demo-safety";
import { DemoPlanningLifecycleClient } from "../src/demo/d2-planning-client";
import { DemoCatalogKnowledgeClient } from "../src/demo/d3-catalog-client";
import {
  DEFAULT_DEMO_PRESENTATION_ROLE,
  DEMO_PRESENTATION_ROLES,
  demoOrganistMelodyProtectionMinimum,
  demoPresentationCanMutatePlanningEditor,
  demoPresentationCanPerformPlanningAction,
  demoRoleInitialMelodyProtectionMonths,
} from "../src/demo/d4-presentation-role";

async function main() {
  assert.deepEqual(DEMO_PRESENTATION_ROLES, ["admin", "priest", "organist"]);
  assert.equal(DEFAULT_DEMO_PRESENTATION_ROLE, "priest");

  assert.equal(demoPresentationCanPerformPlanningAction("admin", "createWorkingSet"), true);
  assert.equal(demoPresentationCanPerformPlanningAction("priest", "createWorkingSet"), true);
  assert.equal(demoPresentationCanPerformPlanningAction("organist", "createWorkingSet"), true);

  assert.equal(demoPresentationCanPerformPlanningAction("admin", "saveFinalSet"), true);
  assert.equal(demoPresentationCanPerformPlanningAction("priest", "saveFinalSet"), true);
  assert.equal(demoPresentationCanPerformPlanningAction("organist", "saveFinalSet"), false);

  assert.equal(demoPresentationCanPerformPlanningAction("admin", "convertFinalSetToCompletedServiceRecord"), true);
  assert.equal(demoPresentationCanPerformPlanningAction("priest", "convertFinalSetToCompletedServiceRecord"), true);
  assert.equal(demoPresentationCanPerformPlanningAction("organist", "convertFinalSetToCompletedServiceRecord"), false);

  assert.equal(demoPresentationCanPerformPlanningAction("admin", "editCompletedServiceRecord"), true);
  assert.equal(demoPresentationCanPerformPlanningAction("priest", "editCompletedServiceRecord"), false);
  assert.equal(demoPresentationCanPerformPlanningAction("organist", "editCompletedServiceRecord"), false);

  assert.equal(demoPresentationCanMutatePlanningEditor({ role: "admin", isFinalSetOpen: false, isCompletedRecordOpen: true }), true);
  assert.equal(demoPresentationCanMutatePlanningEditor({ role: "priest", isFinalSetOpen: false, isCompletedRecordOpen: true }), false);
  assert.equal(demoPresentationCanMutatePlanningEditor({ role: "organist", isFinalSetOpen: false, isCompletedRecordOpen: true }), false);
  assert.equal(demoPresentationCanMutatePlanningEditor({ role: "admin", isFinalSetOpen: true, isCompletedRecordOpen: false }), false);

  assert.equal(demoOrganistMelodyProtectionMinimum(undefined), 0);
  assert.equal(demoOrganistMelodyProtectionMinimum("demo-organist"), 2);
  assert.equal(demoOrganistMelodyProtectionMinimum("demo-organist-petr"), 3);
  assert.equal(demoOrganistMelodyProtectionMinimum("demo-both"), 1);
  assert.equal(demoRoleInitialMelodyProtectionMonths("organist", "demo-organist-petr"), 2);
  assert.equal(demoRoleInitialMelodyProtectionMonths("priest", "demo-organist-petr"), 3);
  assert.equal(demoRoleInitialMelodyProtectionMonths("admin", "demo-organist-petr"), 3);

  const roleModule = readFileSync("src/demo/d4-presentation-role.ts", "utf8");
  const simulator = readFileSync("app/demo-role-simulator.tsx", "utf8");
  const demoMelody = readFileSync("app/demo-melody-protection-panel.tsx", "utf8");
  const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
  const page = readFileSync("app/page.tsx", "utf8");
  const model = readFileSync("src/planning-lifecycle/model.ts", "utf8");

  assert.doesNotMatch(roleModule, /PlanningRole|ActorIdentity|active-role|auth|cookie|session/i);
  assert.match(roleModule, /export type DemoPresentationRole/);

  assert.match(simulator, /Preview role/);
  assert.match(simulator, /Presentation only · no sign-in or permissions are granted\./);
  assert.match(simulator, /aria-pressed=\{candidate === role\}/);
  assert.doesNotMatch(simulator, /fetch\s*\(|\/api\/|document\.cookie|localStorage|sessionStorage|serializeActiveRoleCookie|ActorIdentity/);

  assert.match(demoMelody, /role === "priest" && months < minimumMonths/);
  assert.match(demoMelody, /Simulated own Organist setting/);
  assert.match(demoMelody, /role === "admin"/);
  assert.match(demoMelody, /Changes affect this Demo session only/);
  assert.doesNotMatch(demoMelody, /fetch\s*\(|\/api\/|ActorIdentity|callMelodyProtectionApi|setOwnMelodyProtection|document\.cookie|localStorage|sessionStorage/);

  assert.match(planning, /const \[demoPresentationRole, setDemoPresentationRole\] = useState<DemoPresentationRole>\(DEFAULT_DEMO_PRESENTATION_ROLE\)/);
  assert.match(planning, /<DemoRoleSimulator role=\{demoPresentationRole\} onChange=\{setDemoPresentationRole\} \/>/);
  assert.match(planning, /const presentationRole = isDemoExperience \? demoPresentationRole : selectedRole/);

  assert.match(
    planning,
    /const storedUser = isDemoExperience[\s\S]*?memoryUsers\.find\(\(user\) => user\.id === "demo-priest-user"\)[\s\S]*?: \(availableUsers\.find/,
  );
  assert.match(planning, /const effectiveRole = isDemoExperience\s*\? "priest"\s*:/);
  assert.match(planning, /const activeActor: ActorIdentity = \{ userId: storedUser\.id, displayName: storedUser\.displayName, role: effectiveRole/);
  assert.doesNotMatch(planning, /role:\s*demoPresentationRole|serializeActiveRoleCookie\(demoPresentationRole\)|setSelectedAssignedRole\(demoPresentationRole\)/);

  assert.match(planning, /isDemoExperience\s*\? demoPresentationCanMutatePlanningEditor/);
  assert.match(planning, /demoPresentationCanPerformPlanningAction\(demoPresentationRole, "saveFinalSet"\)/);
  assert.match(planning, /demoPresentationCanPerformPlanningAction\(demoPresentationRole, "convertFinalSetToCompletedServiceRecord"\)/);

  assert.match(planning, /<DemoMelodyProtectionPanel/);
  assert.match(planning, /role=\{demoPresentationRole\}/);
  assert.match(planning, /setAdminMelodyProtectionOverrides/);
  assert.match(planning, /setMelodyProtectionMonths\(months\)/);

  assert.match(planning, /if \(isDemoExperience\) \{\s*setWorkspace\(\(current\) => current === "development" \? "planning" : current\)/);
  assert.match(planning, />Catalog<\/button>/);
  assert.match(planning, /\{!isDemoExperience && <button[^>]*>Development<\/button>\}/);
  assert.match(planning, /readOnlyDemo=\{isDemoExperience\}/);

  assert.match(planning, /\{presentationRole === "admin" && <button[^>]*>Edit Final Plan<\/button>\}/);
  assert.match(planning, /\{isCompletedRecordOpen && presentationRole === "admin" && \(/);

  for (const label of [
    "Save working plan",
    "Finalize plan",
    "Delete saved plan",
    "Store Service",
    "Delete Saved Plan",
    "Save completed changes",
    "Delete completed record",
  ]) {
    const labelIndex = planning.indexOf(label);
    assert.ok(labelIndex >= 0, label + " must remain in the shared UI.");
    const buttonStart = planning.lastIndexOf("<button", labelIndex);
    const buttonSource = planning.slice(buttonStart, labelIndex);
    assert.match(buttonSource, /disabled=\{isDemoExperience/, label + " must remain fail-closed in Demo regardless of preview role.");
  }

  assert.match(page, /if \(experience === "demo"\) \{\s*assertDemoRuntimeConfig\(\);\s*return <DemoD1Shell \/>;/);
  assert.ok(page.indexOf('if (experience === "demo")') < page.indexOf("resolveProtectedUser"), "Demo must branch before protected authentication.");

  const planningRole = model.match(/export type PlanningRole = ([^;]+);/)?.[1] ?? "";
  assert.doesNotMatch(planningRole, /demo/i);

  const planningClient = new DemoPlanningLifecycleClient();
  const catalogClient = new DemoCatalogKnowledgeClient();
  for (const role of DEMO_PRESENTATION_ROLES) {
    await assert.rejects(
      planningClient.saveWorkingSet({} as never),
      (error: unknown) => error instanceof DemoWriteDeniedError && error.code === "demoReadOnly",
      role + " preview must not unlock Planning persistence.",
    );
    await assert.rejects(
      catalogClient.saveOwnPreference("demo-cz-101", 1),
      (error: unknown) => error instanceof DemoWriteDeniedError && error.code === "demoReadOnly",
      role + " preview must not unlock Catalog persistence.",
    );
  }

  console.log("Issue 410 Stage D4 presentation-only Demo role simulation acceptance passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
