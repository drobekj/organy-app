import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { DbInteractionClient } from "../app/planning-lifecycle-client";
import type { CandidateQueryInput } from "../src/application/interaction-contracts";
import {
  hydrateReferenceCandidatesFromData,
  queryReferenceCandidatesFromData,
  type ReferenceCandidateData,
  type ReferenceCandidateSong,
} from "../src/application/reference-candidate-service";
import { CatalogLookupRequestTracker, getSongLookupScope } from "../src/planning-lifecycle/catalog-ui";
import { CandidateLine } from "../src/planning-lifecycle/candidate-line";
import { buildCandidateQueryInput } from "../src/planning-lifecycle/candidate-flow";

const song = (
  id: string,
  canonicalNumber: number,
  title: string,
  classId: string,
  aggregatePreferenceScore: number,
  repertoire: boolean,
): ReferenceCandidateSong => {
  const language = id.startsWith("polish:") ? "polish" : "czech";
  const displayNumber = canonicalNumber === 5210 ? "52/1" : String(canonicalNumber);
  return { id, language, canonicalNumber, displayNumber, title, classId, aggregatePreferenceScore, repertoire };
};

const baseSongs = [
  song("czech:1", 1, "Authoritative Alpha", "class-alpha", 3, true),
  song("polish:1", 1, "Autorytatywna Alfa", "class-alpha", 1, false),
  song("czech:2", 2, "Authoritative Beta", "class-beta", 2, false),
  song("czech:5210", 5210, "Slash Variant", "class-slash", 2, true),
];
const data = (recommendedReferenceSongId?: string): ReferenceCandidateData => ({ songs: baseSongs, melodyWindowMonths: 2, ...(recommendedReferenceSongId ? { recommendedReferenceSongId } : {}) });
const query = (changes: Partial<CandidateQueryInput> = {}): CandidateQueryInput => ({ serviceDate: "2026-08-09", serviceLanguage: "czech", organistPersonId: "demo-organist", preferenceThreshold: 1, candidateUsages: [], ...changes });

function pureCandidateCoverage() {
  const noAntiphon = queryReferenceCandidatesFromData(data(), query());
  assert.deepEqual(noAntiphon.map((candidate) => candidate.songId), ["czech:1", "czech:5210"]);
  assert.ok(noAntiphon.every((candidate) => !candidate.antiphonMatch && !candidate.seasonMatch && candidate.signal === "none"));
  assert.deepEqual(noAntiphon[0].equivalentNumbers, [{ songId: "polish:1", number: "1", repertoire: false }]);

  const recommended = queryReferenceCandidatesFromData(data("czech:1"), query({ referenceAntiphonId: "czech:800" }));
  assert.equal(recommended[0].songId, "czech:1");
  assert.equal(recommended[0].antiphonMatch, true);
  assert.equal(recommended[0].signal, "antiphon");
  assert.equal(recommended[0].aggregatePreferenceScore, 3);
  assert.equal(recommended[0].repertoire, true);

  const legacyCannotSignal = queryReferenceCandidatesFromData(data(), query({ antiphonKey: "synthetic-entry", liturgicalSeasonKey: "synthetic-advent" }));
  assert.ok(legacyCannotSignal.every((candidate) => candidate.signal === "none" && candidate.seasonMatch === false));

  const filteredRecommendation = queryReferenceCandidatesFromData(data("czech:2"), query());
  assert.equal(filteredRecommendation.some((candidate) => candidate.songId === "czech:2"), false, "recommendation bypassed repertoire hard filter");

  const blocked = queryReferenceCandidatesFromData(data("czech:1"), query({ candidateUsages: [{ songId: "polish:1", serviceDate: "2026-07-01", source: "completed" }] }));
  assert.equal(blocked.some((candidate) => candidate.songId === "czech:1"), false, "authoritative melody class survived non-repetition");
  const currentPlanExcluded = queryReferenceCandidatesFromData(data("czech:1"), query({ currentPlanId: "plan-a", candidateUsages: [{ songId: "czech:1", serviceDate: "2026-08-01", source: "working", planId: "plan-a" }] }));
  assert.equal(currentPlanExcluded.some((candidate) => candidate.songId === "czech:1"), true);

  assert.deepEqual(queryReferenceCandidatesFromData(data(), query({ serviceLanguage: "polish" })).map((candidate) => candidate.songId), ["polish:1"]);
  const mixed = queryReferenceCandidatesFromData(data("polish:1"), query({ serviceLanguage: "mixed" }));
  assert.equal(mixed[0].songId, "polish:1", "recommended surviving concrete song did not become class primary");
  assert.deepEqual(mixed[0].equivalentNumbers, [{ songId: "czech:1", number: "1", repertoire: true }]);

  assert.deepEqual(queryReferenceCandidatesFromData(data(), query({ queryText: "52/1" })).map((candidate) => candidate.songId), ["czech:5210"]);
  assert.deepEqual(queryReferenceCandidatesFromData(data(), query({ queryText: "5210" })).map((candidate) => candidate.songId), ["czech:5210"]);
  assert.deepEqual(queryReferenceCandidatesFromData(data(), query({ queryText: "Slash" })).map((candidate) => candidate.songId), ["czech:5210"]);

  const hydrated = hydrateReferenceCandidatesFromData(data("czech:1"), { songs: [{ songId: "czech:1", language: "czech", number: "OLD", title: "Historical title" }], organistPersonId: "demo-organist", referenceAntiphonId: "czech:800" });
  assert.equal(hydrated[0].title, "Historical title");
  assert.equal(hydrated[0].number, "OLD");
  assert.equal(hydrated[0].signal, "antiphon");
  const missing = hydrateReferenceCandidatesFromData(data(), { songs: [{ songId: "historical:czech:999", language: "czech", number: "999", title: "Historical only" }] });
  assert.equal(missing[0].title, "Historical only");
  assert.equal(missing[0].songId, "historical:czech:999");
}

function staleLookupCoverage() {
  const tracker = new CatalogLookupRequestTracker();
  const scope = getSongLookupScope(1);
  const oldAntiphon = tracker.begin(scope, "db|new|czech|demo-organist|czech:800|1");
  tracker.invalidatePrefix("song:");
  assert.equal(tracker.isCurrent(oldAntiphon, oldAntiphon.query), false, "response survived antiphon/context invalidation");
  const older = tracker.begin(scope, "db|new|czech|demo-organist||1");
  const newer = tracker.begin(scope, "db|new|czech|demo-organist||12");
  assert.equal(tracker.isCurrent(older, older.query), false);
  assert.equal(tracker.isCurrent(newer, newer.query), true);
}

async function clientCoverage() {
  const calls: Array<{ action: string; input: unknown }> = [];
  const client = new DbInteractionClient(async (action, input) => {
    calls.push({ action, input });
    return { success: true, value: queryReferenceCandidatesFromData(data("czech:1"), query({ referenceAntiphonId: "czech:800" })) };
  });
  const result = await client.queryCandidates({ serviceDate: "2026-08-09", serviceLanguage: "czech", organistPersonId: "demo-organist", referenceAntiphonId: "czech:800", candidateUsages: [] });
  assert.equal(result[0].signal, "antiphon");
  assert.equal(calls[0].action, "queryCandidates");
  assert.equal((calls[0].input as CandidateQueryInput).referenceAntiphonId, "czech:800");
  await assert.rejects(() => new DbInteractionClient(async () => ({ success: false, error: { code: "invalidInput", message: "structured candidate failure" } })).queryCandidates({ serviceDate: "2026-08-09", serviceLanguage: "czech", candidateUsages: [] }), /structured candidate failure/);

  const built = buildCandidateQueryInput({ serviceDate: "2026-08-09", serviceLanguage: "czech", referenceAntiphonId: "czech:800", antiphonKey: "legacy", candidateUsages: [] });
  assert.equal(built.referenceAntiphonId, "czech:800");
  assert.equal(built.antiphonKey, "legacy");
}

function renderCoverage() {
  const candidate = queryReferenceCandidatesFromData(data("czech:1"), query({ referenceAntiphonId: "czech:800" }))[0];
  const html = renderToStaticMarkup(<CandidateLine candidate={candidate} variant="popup" onSelect={() => undefined} />);
  const visibleText = html.replace(/<[^>]+>/g, "");
  assert.match(visibleText, /1 · czech · in repertoire/);
  assert.match(visibleText, /equivalent 1 · polish · not in repertoire/);
  assert.match(visibleText, /Authoritative Alpha · czech · antiphon/);
  assert.match(html, /negative candidate; primary 1 czech; in organist repertoire; equivalent 1 polish; not in organist repertoire/);
}

async function staticBoundaryCoverage() {
  const [route, client, service, contracts, flow, schema, migrationJournal] = await Promise.all([
    readFile("app/api/interaction/route.ts", "utf8"),
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("src/application/reference-candidate-service.ts", "utf8"),
    readFile("src/application/interaction-contracts.ts", "utf8"),
    readFile("src/planning-lifecycle/candidate-flow.ts", "utf8"),
    readFile("src/db/schema/index.ts", "utf8"),
    readFile("drizzle/meta/_journal.json", "utf8"),
  ]);
  assert.match(route, /ReferenceCandidateService/);
  assert.match(route, /referenceCandidates\.queryCandidates/);
  assert.match(route, /referenceCandidates\.hydrateCandidates/);
  assert.match(service, /from reference_catalog_songs/);
  assert.match(service, /reference_song_preferences/);
  assert.match(service, /reference_organist_repertoire/);
  assert.match(service, /reference_song_melody_memberships/);
  assert.match(service, /reference_antiphon_recommendations/);
  assert.doesNotMatch(service, /\bcatalog_songs\b/);
  assert.doesNotMatch(service, /\bsong_preferences\b/);
  assert.doesNotMatch(service, /\borganist_repertoire\b/);
  assert.doesNotMatch(service, /antiphon_mappings|liturgical_season_mappings/);
  assert.match(client, /referenceAntiphonId: referenceAntiphon\?\.id/);
  assert.equal((client.match(/data-candidate-line|<CandidateLine/g) ?? []).length > 0, true);
  assert.match(contracts, /referenceAntiphonId\?: string/);
  assert.match(flow, /referenceAntiphonId/);
  assert.match(schema, /referenceAntiphonRecommendations/);
  assert.doesNotMatch(migrationJournal, /phase_31_12/);
}

async function main() {
  pureCandidateCoverage();
  staleLookupCoverage();
  await clientCoverage();
  renderCoverage();
  await staticBoundaryCoverage();
  console.log("Phase 31.12 behavioral and render integration tests: PASS");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
