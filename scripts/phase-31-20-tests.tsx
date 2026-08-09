import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { mixedServiceCandidateStyle } from "../app/service-context-reference-antiphon-field";
import { ServiceContextReferenceTopicFieldView, moveTopicActiveIndex } from "../app/service-context-reference-topic-field";
import { InMemoryCatalogRepository } from "../src/application/catalog";
import { InMemoryCompletedServiceRecordRepository, InMemoryPlanningSetRepository, PlanningLifecycleService } from "../src/application/planning-lifecycle";
import { queryReferenceCandidatesFromData, hydrateReferenceCandidatesFromData, type ReferenceCandidateData, type ReferenceCandidateSong } from "../src/application/reference-candidate-service";
import { MemoryReferenceThematicSectionProvider } from "../src/application/reference-thematic-section";
import type { ReferenceThematicSection } from "../src/application/reference-thematic-section-contract";
import { ServiceContextReferenceTopicUiState } from "../src/application/service-context-reference-topic-ui-state";
import { serviceTopicMatchesLanguage } from "../src/planning-lifecycle";

const queryBase = {
  serviceDate: "2026-08-09",
  serviceLanguage: "mixed" as const,
  organistPersonId: "organist-1",
  candidateUsages: [],
};

function song(id: string, language: "czech" | "polish", canonicalNumber: number, classId: string): ReferenceCandidateSong {
  return {
    id,
    language,
    canonicalNumber,
    displayNumber: String(canonicalNumber),
    title: id,
    classId,
    aggregatePreferenceScore: 0,
    repertoire: true,
  };
}

async function authoritativeTopicCoverage() {
  const provider = new MemoryReferenceThematicSectionProvider();
  const [czech, polish] = await Promise.all([provider.listSections("czech"), provider.listSections("polish")]);
  assert.equal(czech.length, 35);
  assert.equal(polish.length, 36);
  assert.deepEqual([czech[0].title, czech.at(-1)?.title], ["Advent", "Smrt, vzkříšení a život věčný"]);
  assert.deepEqual([polish[0].title, polish.at(-1)?.title], ["Adwent", "Śmierć, zmartwychwstanie i życie wieczne"]);
  assert.equal((await provider.getSectionById("polish:faith-love-hope:neighbor-love"))?.title, "Miłość bliźniego");
  assert.equal(await provider.getSectionById("czech:faith-love-hope:neighbor-love"), undefined);
  assert.equal((await provider.resolveSection("czech", 1))?.id, "czech:church-year:advent");
  assert.equal((await provider.resolveSection("polish", 822))?.id, "polish:faith-love-hope:neighbor-love");
}

function candidateSoftSignalCoverage() {
  const songs = [
    song("czech:1", "czech", 1, "shared-czech"),
    song("czech:30", "czech", 30, "shared-czech"),
    song("polish:1", "polish", 1, "polish-one"),
  ];
  const baseData: ReferenceCandidateData = { songs, melodyWindowMonths: 2 };
  const topicData: ReferenceCandidateData = {
    ...baseData,
    referenceTopic: { language: "czech", ranges: [{ from: 1, to: 1 }] },
  };
  const before = queryReferenceCandidatesFromData(baseData, queryBase);
  const after = queryReferenceCandidatesFromData(topicData, queryBase);
  assert.deepEqual(after.map((candidate) => candidate.songId), before.map((candidate) => candidate.songId), "Topic must not reorder or hard-filter candidates");
  assert.equal(after.find((candidate) => candidate.songId === "czech:1")?.seasonMatch, true);
  assert.equal(after.find((candidate) => candidate.songId === "czech:1")?.signal, "season");
  assert.equal(after.find((candidate) => candidate.songId === "czech:30")?.seasonMatch, false, "Topic signal must not transfer to a melody sibling");
  assert.equal(after.find((candidate) => candidate.songId === "polish:1")?.seasonMatch, false, "Topic signal must not cross languages");
  assert.equal(after.length, 3, "Non-members remain candidates");

  const antiphonAndTopic = queryReferenceCandidatesFromData({ ...topicData, recommendedReferenceSongId: "czech:1" }, queryBase);
  const both = antiphonAndTopic.find((candidate) => candidate.songId === "czech:1");
  assert.equal(both?.antiphonMatch, true);
  assert.equal(both?.seasonMatch, true);
  assert.equal(both?.signal, "antiphon", "Antiphon keeps signal-label precedence");

  const hydrated = hydrateReferenceCandidatesFromData(topicData, {
    songs: [
      { songId: "czech:1", language: "czech", number: "1", title: "Historical one" },
      { songId: "czech:30", language: "czech", number: "30", title: "Historical sibling" },
    ],
    organistPersonId: "organist-1",
    referenceTopicId: "czech:church-year:advent",
  });
  assert.equal(hydrated[0].seasonMatch, true);
  assert.equal(hydrated[1].seasonMatch, false);
}

async function lifecycleCoverage() {
  const planningSets = new InMemoryPlanningSetRepository();
  const completed = new InMemoryCompletedServiceRecordRepository();
  const sourceProvider = new MemoryReferenceThematicSectionProvider();
  let current = await sourceProvider.getSectionById("czech:church-year:advent");
  assert.ok(current);
  const mutableProvider = {
    async getSectionById(id: string): Promise<ReferenceThematicSection | undefined> {
      return id === current?.id && current ? { ...current, ranges: current.ranges.map((range) => ({ ...range })), sourcePage: { ...current.sourcePage } } : undefined;
    },
  };
  const service = new PlanningLifecycleService({
    planningSets,
    completedServiceRecords: completed,
    catalog: new InMemoryCatalogRepository(),
    referenceTopics: mutableProvider,
    enforceCatalogSelections: false,
  });
  const context = {
    serviceDate: "2026-08-09",
    serviceTime: "10:00",
    language: "czech" as const,
    priest: { displayName: "P" },
    organist: { displayName: "O" },
    referenceTopic: { id: "czech:church-year:advent", title: "Spoofed title" },
  };
  const set = { status: "working" as const, language: "czech" as const, rows: [{ note: "Only note" }] };
  const first = await service.saveWorkingSet({ role: "admin", serviceContext: context, set });
  assert.equal(first.success, true);
  if (!first.success) return;
  assert.deepEqual(first.value.serviceContext.referenceTopic, { id: "czech:church-year:advent", title: "Advent" }, "New selection must be server-authoritative");

  current = { ...current!, title: "Changed catalog title" };
  const unchanged = await service.saveWorkingSet({
    role: "admin",
    existingSetId: first.value.id,
    serviceContext: { ...first.value.serviceContext, referenceTopic: { ...first.value.serviceContext.referenceTopic! } },
    set,
  });
  assert.equal(unchanged.success, true);
  if (unchanged.success) assert.equal(unchanged.value.serviceContext.referenceTopic?.title, "Advent", "Unchanged historical snapshot must survive catalog changes");

  const mismatch = await service.saveWorkingSet({
    role: "admin",
    existingSetId: first.value.id,
    serviceContext: { ...first.value.serviceContext, language: "polish", referenceTopic: { id: "czech:church-year:advent", title: "Advent" } },
    set: { ...set, language: "polish" },
  });
  assert.equal(mismatch.success, false);
  if (!mismatch.success) assert.equal(mismatch.error.message, "Selected topic must match the service language.");

  const cleared = await service.saveWorkingSet({
    role: "admin",
    existingSetId: first.value.id,
    serviceContext: { ...first.value.serviceContext, referenceTopic: undefined },
    set,
  });
  assert.equal(cleared.success, true);
  if (cleared.success) assert.equal(cleared.value.serviceContext.referenceTopic, undefined);
}

function uiCoverage() {
  assert.equal(serviceTopicMatchesLanguage({ id: "czech:church-year:advent" }, "czech"), true);
  assert.equal(serviceTopicMatchesLanguage({ id: "czech:church-year:advent" }, "polish"), false);
  assert.equal(serviceTopicMatchesLanguage({ id: "polish:church-year:advent" }, "mixed"), true);
  assert.equal(moveTopicActiveIndex(0, 36, "ArrowUp"), 0);
  assert.equal(moveTopicActiveIndex(35, 36, "ArrowDown"), 35);
  assert.equal(moveTopicActiveIndex(17, 36, "Home"), 0);
  assert.equal(moveTopicActiveIndex(17, 36, "End"), 35);
  assert.deepEqual(mixedServiceCandidateStyle("mixed", "polish"), { background: "linear-gradient(90deg, #ffffff 0%, #eef0f3 100%)" });
  assert.deepEqual(mixedServiceCandidateStyle("mixed", "czech"), { background: "linear-gradient(90deg, #eef0f3 0%, #ffffff 100%)" });
  assert.equal(mixedServiceCandidateStyle("czech", "czech"), undefined, "Single-language lookup keeps the existing neutral background");

  const record: ReferenceThematicSection = {
    id: "polish:church-year:advent",
    themeKey: "church-year.advent",
    language: "polish",
    title: "Adwent",
    parentId: "polish:church-year",
    order: 1,
    ranges: [{ from: 1, to: 35 }],
    sourcePage: { scanPage: 1, printedPage: 25 },
  };
  const machine = new ServiceContextReferenceTopicUiState({ runtimeMode: "memory", contextKey: "new", editable: true, serviceLanguage: "mixed" });
  machine.complete(machine.begin(), [record]);
  const html = renderToStaticMarkup(<ServiceContextReferenceTopicFieldView
    editable selected={{ id: record.id, title: record.title }} open dirty={false} query="" snapshot={machine.snapshot()} activeIndex={0} serviceLanguage="mixed"
    onOpen={() => undefined} onQueryChange={() => undefined} onKeyDown={() => undefined} onSelect={() => undefined} onActiveIndexChange={() => undefined} onClear={() => undefined}
  />);
  assert.match(html, /Adwent/);
  assert.match(html, /linear-gradient\(90deg, #ffffff 0%, #eef0f3 100%\)/, "Mixed Topic row exposes the Polish left-to-right language cue");
  assert.doesNotMatch(html, /href=|Source|source/i, "Topic UI must never expose a source URL");
}

async function staticCoverage() {
  const [planning, component, antiphonComponent, candidate, css] = await Promise.all([
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("app/service-context-reference-topic-field.tsx", "utf8"),
    readFile("app/service-context-reference-antiphon-field.tsx", "utf8"),
    readFile("src/application/reference-candidate-service.ts", "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);
  assert.doesNotMatch(planning, />Candidate season key</);
  assert.match(planning, /ServiceContextReferenceAntiphonField[\s\S]*ServiceContextReferenceTopicField/);
  assert.match(planning, /referenceTopicId: referenceTopic\?\.id/);
  assert.match(planning, /Selected topic must match the service language\./);
  assert.match(component, /\["polish", "czech"\]/);
  assert.doesNotMatch(component, /sourceUrl|href=|Source/);
  assert.match(component, /mixedServiceCandidateStyle\(props\.serviceLanguage, record\.language\)/);
  assert.match(antiphonComponent, /service-antiphon-topic-row \{ grid-column: 1 \/ -1; \}/, "Antiphon + Topic row spans the complete two-column Service Context grid");
  assert.match(antiphonComponent, /mixedServiceCandidateStyle\(props\.serviceLanguage, record\.language\)/);
  assert.match(candidate, /referenceTopicMatchesSong/);
  assert.match(candidate, /candidates\.sort\(compareConcreteResults\)/);
  assert.match(candidate, /orderKey: concreteOrderKey\(song\)/);
  assert.match(css, /service-antiphon-topic-row[\s\S]*grid-template-columns/);
}

async function main() {
  await authoritativeTopicCoverage();
  candidateSoftSignalCoverage();
  await lifecycleCoverage();
  uiCoverage();
  await staticCoverage();
  console.log("Phase 31.20 Service Context Topic static/behavioral: PASS");
}

void main().catch((error) => {
  console.error("Phase 31.20 Service Context Topic static/behavioral: FAIL");
  console.error(error);
  process.exitCode = 1;
});
