import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DemoWriteDeniedError } from "../src/application/demo-safety";
import { DemoCatalogKnowledgeClient, DEMO_D3_CATALOG_KNOWLEDGE } from "../src/demo/d3-catalog-client";

async function main() {
  const client = new DemoCatalogKnowledgeClient();

  const available = await client.queryCandidates({
    serviceLanguage: "czech",
    organistPersonId: "demo-organist",
    availabilityMode: "available",
  });
  const unavailable = await client.queryCandidates({
    serviceLanguage: "czech",
    organistPersonId: "demo-organist",
    availabilityMode: "unavailable",
  });
  const anonymousUnavailable = await client.queryCandidates({
    serviceLanguage: "czech",
    availabilityMode: "unavailable",
  });
  const mixed = await client.queryCandidates({
    serviceLanguage: "mixed",
    organistPersonId: "demo-organist",
    availabilityMode: "available",
  });

  assert.ok(available.length >= 3, "D3 Demo must expose several available Catalog candidates.");
  assert.ok(unavailable.length >= 1, "D3 Demo must expose at least one unavailable Catalog candidate for a selected Organist.");
  assert.equal(anonymousUnavailable.length, 0, "Anonymous Catalog context has no repertoire-based unavailable partition.");
  assert.ok(mixed.some((candidate) => (candidate.melodyMembers?.length ?? 0) >= 2), "Mixed Catalog must expose an authoritative synthetic cross-language melody class.");
  assert.ok(mixed.every((candidate) => Boolean(candidate.melodyClassId && candidate.melodyMembers?.length)), "Every D3 candidate must carry authoritative synthetic melody-class detail.");

  const availableIds = new Set(available.map((candidate) => candidate.melodyClassId));
  assert.ok(unavailable.every((candidate) => !availableIds.has(candidate.melodyClassId)), "Available and unavailable Demo melody classes must be disjoint.");

  const antiphonFiltered = await client.queryCandidates({
    serviceLanguage: "mixed",
    organistPersonId: "demo-organist",
    referenceAntiphonId: "czech:1",
    availabilityMode: "available",
  });
  assert.equal(antiphonFiltered.filter((candidate) => candidate.antiphonMatch).length, 1, "Selecting an Antiphon must produce one deterministic synthetic signal.");

  const melodyRead = await client.getMelodyClass("demo-cz-101");
  assert.equal(melodyRead.success, true);
  if (!melodyRead.success) throw new Error("Synthetic melody read failed.");
  assert.ok(melodyRead.value.members.length >= 2);
  assert.equal(melodyRead.value.classId, "demo-melody-a");

  const before = JSON.stringify(DEMO_D3_CATALOG_KNOWLEDGE);
  const deniedMutations: Array<[string, () => Promise<unknown>]> = [
    ["catalog.preference.save", () => client.saveOwnPreference("demo-cz-101", 1)],
    ["catalog.repertoire.set", () => client.setRepertoireMembership("demo-cz-101", "demo-organist", true)],
    ["knowledge.melody.edge.add", () => client.addMelodyEdge("demo-cz-101", "demo-pl-101")],
    ["knowledge.melody.edge.remove", () => client.removeMelodyEdge("demo-cz-101", "demo-pl-101")],
  ];

  for (const [operation, invoke] of deniedMutations) {
    await assert.rejects(
      invoke(),
      (error: unknown) => {
        assert.ok(error instanceof DemoWriteDeniedError);
        assert.equal(error.code, "demoReadOnly");
        assert.equal(error.operation, operation);
        return true;
      },
      operation + " must fail closed in Demo.",
    );
  }
  assert.equal(JSON.stringify(DEMO_D3_CATALOG_KNOWLEDGE), before, "Denied Catalog/knowledge mutations must not alter the synthetic fixture.");

  const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
  const catalog = readFileSync("app/catalog-workspace.tsx", "utf8");
  const demoClient = readFileSync("src/demo/d3-catalog-client.ts", "utf8");
  const model = readFileSync("src/planning-lifecycle/model.ts", "utf8");

  assert.ok(planning.includes('>Catalog</button>'), "Catalog navigation must be visible in D3 Demo.");
  assert.ok(planning.includes('{!isDemoExperience && <button type="button" className={workspace === "development"'), "Development must remain hidden in Demo.");
  assert.match(planning, /readOnlyDemo=\{isDemoExperience\}/);
  assert.match(planning, /new DemoCatalogKnowledgeClient\(\)/);
  assert.match(planning, /demoCatalogClient \? demoCatalogClient\.queryCandidates/);
  assert.doesNotMatch(demoClient, /fetch\s*\(|\/api\/|DATABASE_URL|authPool|Db[A-Z]/);
  assert.match(demoClient, /runPersistentMutation\("demo"/);

  assert.match(catalog, /readOnlyDemo\?: boolean/);
  assert.match(catalog, /readOnlyDemo = false/);
  assert.match(catalog, /!readOnlyDemo && runtime === "db" \? new DbReferenceAntiphonRecommendationClient/);
  assert.match(catalog, /const canManageRepertoire = !readOnlyDemo && runtime === "db"/);
  assert.match(catalog, /readOnlyDemo\s*\|\|\s*runtime !== "db"/);
  assert.match(catalog, /if \(readOnlyDemo \|\| runtime !== "db" \|\| !candidate \|\| !preference\) return/);
  assert.match(catalog, /canEditRecommendation=\{!readOnlyDemo && runtime === "db" && actor\.role === "admin"\}/);
  assert.match(catalog, /\{!readOnlyDemo && runtime === "db" && actor\.role === "admin" && <ReferenceMelodyEdgeEditor/);
  assert.match(catalog, /Read-only Catalog Demo/);
  assert.match(catalog, /Catalog and knowledge changes are disabled\./);

  const planningRole = model.match(/export type PlanningRole = ([^;]+);/)?.[1] ?? "";
  assert.doesNotMatch(planningRole, /demo/i);

  console.log("Issue 408 Stage D3 read-only Catalog and knowledge Demo acceptance passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
