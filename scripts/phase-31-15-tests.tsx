import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { InMemoryCatalogRepository } from "../src/application/catalog";
import type { CandidateQueryInput } from "../src/application/interaction-contracts";
import {
  queryReferenceCandidatesFromData,
  type ReferenceCandidateData,
  type ReferenceCandidateSong,
} from "../src/application/reference-candidate-service";
import type { ReferenceMelodyClassProvider } from "../src/application/reference-melody-class-provider";
import {
  InMemoryCompletedServiceRecordRepository,
  InMemoryPlanningSetRepository,
  PlanningLifecycleService,
} from "../src/application/planning-lifecycle";
import {
  findMelodyCollisions,
  melodyCollisionRowIssues,
  melodyCollisionSummary,
  type PlanningSet,
  type ServiceContext,
} from "../src/planning-lifecycle";
import { CandidateLine, getCandidateLineViewModel } from "../src/planning-lifecycle/candidate-line";
import { buildCanonicalCandidateUsages, getCandidatePopupRows } from "../src/planning-lifecycle/candidate-flow";
import { referenceCandidateQueryInput } from "../app/api/interaction/route";

const makeSong = (
  id: string,
  canonicalNumber: number,
  title: string,
  classId: string,
  repertoire = true,
): ReferenceCandidateSong => ({
  id,
  language: id.startsWith("polish:") ? "polish" : "czech",
  canonicalNumber,
  displayNumber: String(canonicalNumber),
  title,
  classId,
  aggregatePreferenceScore: 3,
  repertoire,
});

const songs = [
  makeSong("czech:1", 1, "Czech one", "class-a"),
  makeSong("czech:2", 2, "Czech two", "class-a"),
  makeSong("polish:1", 1, "Polish one", "class-a"),
  makeSong("czech:3", 3, "Czech three", "class-b"),
];
const data: ReferenceCandidateData = { songs, melodyWindowMonths: 2, recommendedReferenceSongId: "czech:1" };
const query = (changes: Partial<CandidateQueryInput> = {}): CandidateQueryInput => ({
  serviceDate: "2026-08-09",
  serviceLanguage: "mixed",
  organistPersonId: "organist-a",
  preferenceThreshold: 0,
  candidateUsages: [],
  ...changes,
});

function occupancyCoverage() {
  const hard = queryReferenceCandidatesFromData(data, query({
    candidateUsages: [{ songId: "polish:1", serviceDate: "2026-07-01", source: "completed" }],
  }));
  assert.equal(hard.some((candidate) => candidate.melodyClassId === "class-a"), false, "completed usage stopped being a hard class-wide exclusion");

  const future = queryReferenceCandidatesFromData(data, query({
    candidateUsages: [
      { songId: "czech:3", serviceDate: "2026-09-01", source: "working", planId: "future-working" },
      { songId: "czech:1", serviceDate: "2026-09-01", source: "final", planId: "future-final" },
    ],
  }));
  assert.deepEqual(future, [], "working/final usages inside the symmetric window did not hard-block their classes");

  const occupied = queryReferenceCandidatesFromData(data, query({
    candidateUsages: [
      { songId: "polish:1", serviceDate: "1900-01-01", source: "current", rowId: 9, rowLabel: "Row 3" },
      { songId: "czech:2", serviceDate: "2100-01-01", source: "current", rowId: 4, rowLabel: "Row 2" },
    ],
  }));
  assert.deepEqual(occupied.map((candidate) => candidate.songId), ["czech:1", "czech:2", "czech:3", "polish:1"], "occupancy changed natural candidate ordering or hard-filter universe");
  for (const candidate of occupied.filter((item) => item.melodyClassId === "class-a")) {
    assert.deepEqual(candidate.availability, {
      kind: "occupiedByCurrentRows",
      rows: [{ rowId: 4, label: "Row 2" }, { rowId: 9, label: "Row 3" }],
    });
  }
  assert.deepEqual(occupied.find((candidate) => candidate.songId === "czech:3")?.availability, { kind: "available" });
  assert.equal(occupied.find((candidate) => candidate.songId === "czech:1")?.signal, "antiphon", "occupancy erased the exact-song antiphon signal");

  const languageInvalidOccupant = queryReferenceCandidatesFromData(data, query({
    serviceLanguage: "czech",
    candidateUsages: [{ songId: "polish:1", serviceDate: "2026-08-09", source: "current", rowId: 2, rowLabel: "Row 2" }],
  }));
  assert.ok(languageInvalidOccupant.filter((candidate) => candidate.melodyClassId === "class-a").every((candidate) => candidate.availability.kind === "occupiedByCurrentRows"), "retained opposite-language selection stopped occupying its authoritative class");
}

function canonicalUsageCoverage() {
  const usages = buildCanonicalCandidateUsages({
    currentPlanId: "plan-a",
    serviceDate: "2026-08-09",
    completedRecords: [{ id: "completed", serviceDate: "2026-07-01", rows: [{ songId: "czech:3" }] }],
    plans: [
      { id: "plan-a", status: "working", serviceDate: "2026-08-09", rows: [{ songId: "czech:1" }] },
      { id: "plan-b", status: "final", serviceDate: "2026-08-08", rows: [{ songId: "czech:3" }] },
    ],
    currentRows: [
      { rowId: 10, rowLabel: "Row 1", songId: "czech:1" },
      { rowId: 20, rowLabel: "Row 2", songId: "polish:1" },
    ],
    activeRowId: 10,
  });
  assert.equal(usages.some((usage) => usage.songId === "czech:1" && usage.source === "current"), false, "active row occupied its own previous class");
  assert.deepEqual(usages.find((usage) => usage.source === "current"), { songId: "polish:1", serviceDate: "2026-08-09", source: "current", rowId: 20, rowLabel: "Row 2" });
  assert.equal(usages.some((usage) => usage.planId === "plan-a"), false, "currently edited persisted plan was counted twice");
}

function collisionCoverage() {
  const collisions = findMelodyCollisions([
    { rowId: 10, rowLabel: "Row 1", songId: "czech:1", melodyClassId: "class-a" },
    { rowId: 20, rowLabel: "Row 2", songId: "czech:2", melodyClassId: "class-a" },
    { rowId: 30, rowLabel: "Row 3", songId: "polish:1", melodyClassId: "class-a" },
    { rowId: 40, rowLabel: "Row 4", songId: "czech:3", melodyClassId: "class-b" },
    { rowId: 50, rowLabel: "Row 5", songId: "historical:czech:999" },
  ]);
  assert.equal(collisions.length, 1);
  assert.deepEqual(collisions[0].rows.map((row) => row.songId), ["czech:1", "czech:2", "polish:1"]);
  const issues = melodyCollisionRowIssues(collisions);
  assert.deepEqual(issues.map((issue) => issue.rowId), [10, 20, 30]);
  assert.match(issues[0].message, /Row 2 and Row 3/);
  assert.equal(melodyCollisionSummary(collisions), "Cannot finalize: the same melody is used in Row 1, Row 2, and Row 3.");

  const sameSong = findMelodyCollisions([
    { rowId: 1, rowLabel: "Row 1", songId: "czech:1", melodyClassId: "class-a" },
    { rowId: 2, rowLabel: "Row 2", songId: "czech:1", melodyClassId: "class-a" },
  ]);
  assert.equal(sameSong.length, 1, "same concrete song did not create a collision");
}

async function lifecycleCoverage() {
  const planningSets = new InMemoryPlanningSetRepository();
  const memberships = new Map([["czech:1", "class-a"], ["czech:2", "class-a"], ["polish:1", "class-a"], ["czech:3", "class-b"]]);
  const provider: ReferenceMelodyClassProvider = {
    async getClassMemberships(songIds) {
      return songIds.flatMap((songId) => memberships.has(songId) ? [{ songId, melodyClassId: memberships.get(songId)! }] : []);
    },
  };
  const service = new PlanningLifecycleService({
    planningSets,
    completedServiceRecords: new InMemoryCompletedServiceRecordRepository(),
    catalog: new InMemoryCatalogRepository(),
    enforceCatalogSelections: false,
    referenceMelodyClasses: provider,
  });
  const context: ServiceContext = {
    serviceDate: "2026-08-09",
    serviceTime: "10:00",
    language: "mixed",
    priest: { id: "priest-1", displayName: "Priest" },
    organist: { id: "organist-1", displayName: "Organist" },
  };
  const colliding: PlanningSet & { status: "working" } = {
    status: "working",
    language: "mixed",
    rows: [
      { song: { songId: "czech:1", language: "czech", number: "1", title: "Czech one" } },
      { song: { songId: "polish:1", language: "polish", number: "1", title: "Polish one" } },
    ],
  };
  const saved = await service.saveWorkingSet({ role: "admin", serviceContext: context, set: colliding });
  assert.equal(saved.success, true, "melody collision incorrectly blocked Working save");
  if (!saved.success) return;
  const reloaded = await service.loadPlanningSet(saved.value.id);
  assert.equal(reloaded.success, true);
  assert.deepEqual(reloaded.success ? reloaded.value.rows : [], colliding.rows, "Working save/reload altered colliding selections");

  const rejected = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.value.id });
  assert.equal(rejected.success, false, "direct server finalization accepted authoritative melody collision");
  if (!rejected.success) {
    assert.equal(rejected.error.code, "invalidInput");
    assert.deepEqual(rejected.error.issues?.map((issue) => issue.path), ["rows.0.song", "rows.1.song"]);
    assert.match(rejected.error.message, /Row 1 and Row 2/);
  }

  const corrected = await service.saveWorkingSet({
    role: "admin",
    existingSetId: saved.value.id,
    serviceContext: context,
    set: { ...colliding, rows: [colliding.rows[0], { song: { songId: "czech:3", language: "czech", number: "3", title: "Czech three" } }] },
  });
  assert.equal(corrected.success, true);
  const finalized = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.value.id });
  assert.equal(finalized.success, true, "removing collision did not restore finalization");
}

function parserAndUiCoverage() {
  const parsed = referenceCandidateQueryInput(query({
    candidateUsages: [{ songId: "czech:1", serviceDate: "2026-08-09", source: "current", rowId: 2, rowLabel: "  Row 2  " }],
  }));
  assert.equal(parsed.candidateUsages?.[0].rowLabel, "Row 2");
  assert.throws(() => referenceCandidateQueryInput(query({ candidateUsages: [{ songId: "czech:1", serviceDate: "2026-08-09", source: "current", rowId: 2 }] })), /requires rowId and rowLabel/);
  assert.throws(() => referenceCandidateQueryInput(query({ candidateUsages: [{ songId: "czech:1", serviceDate: "2026-08-09", source: "completed", rowId: 2, rowLabel: "Row 2" }] })), /cannot include row context/);

  const candidate = queryReferenceCandidatesFromData(data, query({
    serviceLanguage: "czech",
    queryText: "1",
    candidateUsages: [{ songId: "polish:1", serviceDate: "2026-08-09", source: "current", rowId: 2, rowLabel: "Row 2" }],
  }))[0];
  assert.equal(getCandidatePopupRows([candidate])[0].actions.length, 0);
  const view = getCandidateLineViewModel(candidate);
  assert.equal(view.availabilityReason, "Same melody is already used in Row 2.");
  let selected = false;
  const html = renderToStaticMarkup(<CandidateLine candidate={candidate} variant="popup" onSelect={() => { selected = true; }} />);
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /Same melody is already used in Row 2/);
  assert.equal(selected, false, "server render invoked a disabled selection handler");
}

async function staticScopeCoverage() {
  const [schema, journal, candidateService, lifecycleService, client, line, route] = await Promise.all([
    readFile("src/db/schema/index.ts", "utf8"),
    readFile("drizzle/meta/_journal.json", "utf8"),
    readFile("src/application/reference-candidate-service.ts", "utf8"),
    readFile("src/application/planning-lifecycle/service.ts", "utf8"),
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("src/planning-lifecycle/candidate-line.tsx", "utf8"),
    readFile("app/api/interaction/route.ts", "utf8"),
  ]);
  assert.doesNotMatch(schema, /phase_31_15|melody_collision|candidate_occupancy/i);
  assert.doesNotMatch(journal, /31_15/);
  assert.match(candidateService, /getHardBlockedClassIds/);
  assert.match(candidateService, /getCurrentOccupancyByClass/);
  assert.match(lifecycleService, /getAuthoritativeMelodyCollisions/);
  assert.match(client, /hasMelodyCollisions/);
  assert.match(client, /setCandidateResults\(\{\}\)/);
  assert.match(line, /disabled=\{Boolean\(viewModel\.availabilityReason\)\}/);
  assert.match(route, /current usage requires rowId and rowLabel/);
}

async function main() {
  occupancyCoverage();
  canonicalUsageCoverage();
  collisionCoverage();
  await lifecycleCoverage();
  parserAndUiCoverage();
  await staticScopeCoverage();
  console.log("Phase 31.15 current-service melody occupancy and collision validation: PASS");
}

void main().catch((error: unknown) => {
  console.error("Phase 31.15 current-service melody occupancy and collision validation: FAIL");
  console.error(error);
  process.exitCode = 1;
});
