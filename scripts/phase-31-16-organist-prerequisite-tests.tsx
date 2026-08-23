import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { CatalogSong } from "../src/application/catalog";
import type { CandidateQueryInput } from "../src/application/interaction-contracts";
import { queryCandidatesFromData } from "../src/application/interaction-service";
import { queryReferenceCandidatesFromData, type ReferenceCandidateData } from "../src/application/reference-candidate-service";

const baseInput: CandidateQueryInput = {
  serviceDate: "2026-08-09",
  serviceLanguage: "czech",
  preferenceThreshold: 0,
  candidateUsages: [],
};

function authoritativeCoverage() {
  const data = (repertoire: boolean): ReferenceCandidateData => ({
    songs: [{
      id: "czech:1",
      language: "czech",
      canonicalNumber: 1,
      displayNumber: "1",
      title: "Authoritative candidate",
      classId: "class-one",
      aggregatePreferenceScore: 0,
      repertoire,
    }],
    melodyWindowMonths: 2,
  });

  assert.equal(
    queryReferenceCandidatesFromData(data(false), baseInput).length,
    1,
    "Anonymous organist must bypass only the authoritative repertoire hard filter",
  );
  assert.deepEqual(
    queryReferenceCandidatesFromData(data(false), { ...baseInput, organistPersonId: "empty-organist" }),
    [],
    "a concrete organist with an empty authoritative repertoire must yield zero candidates",
  );
  assert.equal(
    queryReferenceCandidatesFromData(data(true), { ...baseInput, organistPersonId: "demo-organist" }).length,
    1,
    "a concrete organist with repertoire membership must retain the candidate",
  );
}

function memoryCoverage() {
  const songs: CatalogSong[] = [{ songId: "demo-cz-101", language: "czech", number: "101", title: "Demo", active: true }];
  const knowledge = { antiphons: [], seasons: [], melodyClasses: [], melodyWindow: { months: 2 } };

  assert.equal(
    queryCandidatesFromData(songs, [], new Set(), knowledge, baseInput).length,
    1,
    "Anonymous organist must bypass only the in-memory repertoire hard filter",
  );
  assert.deepEqual(
    queryCandidatesFromData(songs, [], new Set(), knowledge, { ...baseInput, organistPersonId: "empty-organist" }),
    [],
    "a concrete organist with an empty in-memory repertoire must yield zero candidates",
  );
  assert.equal(
    queryCandidatesFromData(songs, [], new Set(["demo-cz-101"]), knowledge, { ...baseInput, organistPersonId: "demo-organist" }).length,
    1,
  );
}

async function staticCoverage() {
  const [client, authoritative, memory, contracts] = await Promise.all([
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("src/application/reference-candidate-service.ts", "utf8"),
    readFile("src/application/interaction-service.ts", "utf8"),
    readFile("src/application/interaction-contracts.ts", "utf8"),
  ]);
  assert.equal(
    client.includes("Select an active organist in Service context to see candidates."),
    false,
    "candidate UI must not require a concrete organist before lookup",
  );
  assert.equal(
    client.includes("Anonymous: repertoire filter is not applied while choosing candidates."),
    true,
    "Working UI must explain the Anonymous-organist repertoire exception",
  );
  assert.equal(authoritative.includes("if (!input.organistPersonId) return [];"), false);
  assert.equal(memory.includes("if (!input.organistPersonId) return [];"), false);
  assert.equal(contracts.includes("if (!input.organistPersonId) return [];"), false);
}

async function main() {
  authoritativeCoverage();
  memoryCoverage();
  await staticCoverage();
  console.log("Phase 31.16 Anonymous organist and concrete-organist repertoire filter: PASS");
}

void main().catch((error: unknown) => {
  console.error("Phase 31.16 Anonymous organist and concrete-organist repertoire filter: FAIL");
  console.error(error);
  process.exitCode = 1;
});