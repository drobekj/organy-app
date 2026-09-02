import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DemoWriteDeniedError } from "../src/application/demo-safety";
import { DemoPlanningLifecycleClient } from "../src/demo/d2-planning-client";
import {
  DEMO_D2_ACTIVE_PLANS,
  DEMO_D2_COMPLETED_RECORDS,
  DEMO_D2_SONGS,
  createDemoD2InteractionRepository,
} from "../src/demo/d2-planning-fixture";
import { getDraftPeopleDefaults } from "../src/planning-lifecycle/ui-session";

async function main() {
  assert.equal(DEMO_D2_ACTIVE_PLANS.filter((plan) => plan.status === "working").length, 1);
  assert.equal(DEMO_D2_ACTIVE_PLANS.filter((plan) => plan.status === "final").length, 1);
  assert.ok(DEMO_D2_COMPLETED_RECORDS.length >= 2);
  assert.ok(DEMO_D2_SONGS.filter((song) => song.language === "czech").length >= 5);
  assert.ok(DEMO_D2_SONGS.filter((song) => song.language === "polish").length >= 3);

  const defaults = getDraftPeopleDefaults(DEMO_D2_COMPLETED_RECORDS);
  assert.deepEqual(defaults.priest, { id: "demo-priest", displayName: "Demo Priest" });
  assert.deepEqual(defaults.organist, { id: "demo-organist", displayName: "Demo Organist" });

  const interactionRepo = createDemoD2InteractionRepository();
  const demoOrganistRepertoire = new Set(interactionRepo.listRepertoire("demo-organist"));
  for (const song of DEMO_D2_SONGS) {
    assert.ok(demoOrganistRepertoire.has(song.songId), `${song.songId} must be available in the D2 demo organist repertoire.`);
  }

  const client = new DemoPlanningLifecycleClient();
  const plans = await client.listPlanningSets();
  const completed = await client.listCompletedRecords();
  assert.equal(plans.success, true);
  assert.equal(completed.success, true);
  if (!plans.success || !completed.success) throw new Error("D2 read model did not return fixture data.");
  assert.equal(plans.value.length, DEMO_D2_ACTIVE_PLANS.length);
  assert.equal(completed.value.length, DEMO_D2_COMPLETED_RECORDS.length);

  const loadedWorking = await client.loadPlanningSet("demo-working-1");
  const loadedFinal = await client.loadPlanningSet("demo-final-1");
  const loadedCompleted = await client.loadCompletedRecord("demo-completed-1");
  assert.equal(loadedWorking.success && loadedWorking.value.status, "working");
  assert.equal(loadedFinal.success && loadedFinal.value.status, "final");
  assert.equal(loadedCompleted.success && loadedCompleted.value.id, "demo-completed-1");

  const before = JSON.stringify({
    plans: (await client.listPlanningSets()),
    completed: (await client.listCompletedRecords()),
  });

  const deniedMutations: Array<[string, () => Promise<unknown>]> = [
    ["planning.saveWorkingSet", () => client.saveWorkingSet({} as never)],
    ["planning.finalizeWorkingSet", () => client.finalizeWorkingSet({} as never)],
    ["planning.reopenFinalSet", () => client.reopenFinalSet({} as never)],
    ["planning.completeFinalSet", () => client.completeFinalSet({} as never)],
    ["planning.deletePlanningSet", () => client.deletePlanningSet({} as never)],
    ["planning.updateCompletedRecord", () => client.updateCompletedRecord({} as never)],
    ["planning.deleteCompletedRecord", () => client.deleteCompletedRecord({} as never)],
  ];

  for (const [operation, invoke] of deniedMutations) {
    await assert.rejects(
      invoke(),
      (error: unknown) => {
        assert.ok(error instanceof DemoWriteDeniedError);
        assert.equal(error.operation, operation);
        assert.equal(error.code, "demoReadOnly");
        return true;
      },
      `${operation} must fail closed in Demo.`,
    );
  }

  const after = JSON.stringify({
    plans: (await client.listPlanningSets()),
    completed: (await client.listCompletedRecords()),
  });
  assert.equal(after, before, "Denied Demo mutations must not alter the read snapshot.");

  const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
  const shell = readFileSync("app/demo-d1-shell.tsx", "utf8");
  const demoClient = readFileSync("src/demo/d2-planning-client.ts", "utf8");
  const model = readFileSync("src/planning-lifecycle/model.ts", "utf8");

  assert.match(shell, /PlanningLifecycleClient runtimeMode="memory" experience="demo"/);
  assert.match(planning, /experience\?: ExperienceMode/);
  assert.match(planning, /experience = "standard"/);
  assert.match(planning, /isDemoExperience\s*\?\s*new DemoPlanningLifecycleClient\(\)/);
  assert.match(planning, /Changes are temporary and are never saved\./);

  assert.ok(planning.includes('<button type="button" className={!demoAdminView && workspace === "catalog" ? "active-workspace" : undefined} onClick={() => navigateWorkspace("catalog")}>Catalog</button>'), "Later Demo stages may decorate Catalog navigation while preserving D2 Planning.");
  assert.ok(planning.includes('{!isDemoExperience && <button type="button" className={workspace === "development" ? "active-workspace" : undefined} onClick={() => navigateWorkspace("development")}>Development</button>}'), "Development navigation must remain hidden in Demo.");
  assert.match(planning, /workspace === "catalog"/);
  assert.match(planning, /!isDemoExperience && workspace === "development"/);

  const formActionsStart = planning.indexOf('<div className="form-actions">');
  assert.ok(formActionsStart > 0, "Planning lifecycle action area must remain present.");
  for (const label of [
    "Save working plan",
    "Finalize plan",
    "Delete saved plan",
    "Store Service",
    "Delete Saved Plan",
    "Save completed changes",
    "Delete completed record",
  ]) {
    const labelIndex = planning.indexOf(label, formActionsStart);
    assert.ok(labelIndex > formActionsStart, `${label} must remain visible in the shared Planning UI.`);
    const buttonStart = planning.lastIndexOf("<button", labelIndex);
    const buttonSource = planning.slice(buttonStart, labelIndex);
    assert.match(buttonSource, /disabled=\{isDemoExperience/, `${label} must be disabled by the Demo boundary.`);
  }

  assert.match(planning, /Edit Final Plan/);
  const editFinalIndex = planning.indexOf("Edit Final Plan", formActionsStart);
  assert.match(planning.slice(planning.lastIndexOf("<button", editFinalIndex), editFinalIndex), /disabled=\{isDemoExperience\}/);

  assert.doesNotMatch(demoClient, /fetch\s*\(|\/api\/|DATABASE_URL|authPool|DbPlanningLifecycleClient/);
  assert.match(demoClient, /runPersistentMutation\("demo"/);

  const planningRole = model.match(/export type PlanningRole = ([^;]+);/)?.[1] ?? "";
  assert.doesNotMatch(planningRole, /demo/i);

  console.log("Issue 406 Stage D2 interactive read-only Planning Demo acceptance passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
