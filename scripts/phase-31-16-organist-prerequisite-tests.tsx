import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogSong } from "../src/application/catalog";
import type { CandidateQueryInput } from "../src/application/interaction-contracts";
import { queryCandidatesFromData } from "../src/application/interaction-service";
import { queryReferenceCandidatesFromData, type ReferenceCandidateData } from "../src/application/reference-candidate-service";
import { CandidateCombobox } from "../src/planning-lifecycle/candidate-list";

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

  assert.deepEqual(
    queryReferenceCandidatesFromData(data(true), baseInput),
    [],
    "missing Service Context organist must never bypass the authoritative repertoire hard filter",
  );
  assert.deepEqual(
    queryReferenceCandidatesFromData(data(false), { ...baseInput, organistPersonId: "empty-organist" }),
    [],
    "an empty authoritative repertoire must yield zero candidates",
  );
  assert.equal(
    queryReferenceCandidatesFromData(data(true), { ...baseInput, organistPersonId: "demo-organist" }).length,
    1,
    "a selected organist with repertoire membership must retain the candidate",
  );
}

function memoryCoverage() {
  const songs: CatalogSong[] = [{ songId: "demo-cz-101", language: "czech", number: "101", title: "Demo", active: true }];
  const knowledge = { antiphons: [], seasons: [], melodyClasses: [], melodyWindow: { months: 2 } };

  assert.deepEqual(
    queryCandidatesFromData(songs, [], new Set(["demo-cz-101"]), knowledge, baseInput),
    [],
    "missing Service Context organist must never bypass the in-memory repertoire hard filter",
  );
  assert.deepEqual(
    queryCandidatesFromData(songs, [], new Set(), knowledge, { ...baseInput, organistPersonId: "empty-organist" }),
    [],
    "an empty in-memory repertoire must yield zero candidates",
  );
  assert.equal(
    queryCandidatesFromData(songs, [], new Set(["demo-cz-101"]), knowledge, { ...baseInput, organistPersonId: "demo-organist" }).length,
    1,
  );
}

function renderCoverage() {
  const html = renderToStaticMarkup(
    <CandidateCombobox
      rowId={1}
      rowLabel="Row 1"
      open={true}
      value=""
      candidates={[]}
      loading={false}
      prerequisiteMessage="Select an active organist in Service context to see candidates."
      serviceLanguage="czech"
      onOpen={() => undefined}
      onQueryChange={() => undefined}
      onSelect={() => undefined}
      onCancel={() => undefined}
      onRetry={() => undefined}
    />,
  );
  assert.match(html, /Select an active organist in Service context to see candidates/);
  assert.match(html, />Cancel</);
  assert.doesNotMatch(html, /Loading candidates|Candidate lookup failed|Retry|No songs satisfy/);
  assert.match(html, /aria-busy="false"/);
}

async function staticCoverage() {
  const [client, component, authoritative, memory, contracts] = await Promise.all([
    readFile("app/planning-lifecycle-client.tsx", "utf8"),
    readFile("src/planning-lifecycle/candidate-list.tsx", "utf8"),
    readFile("src/application/reference-candidate-service.ts", "utf8"),
    readFile("src/application/interaction-service.ts", "utf8"),
    readFile("src/application/interaction-contracts.ts", "utf8"),
  ]);
  assert.equal(client.includes("if (!organistId) {"), true);
  assert.equal(client.includes("if (!organistId) {"), true);
  assert.equal(component.includes("blockedByPrerequisite"), true);
  assert.equal(authoritative.includes("if (!input.organistPersonId) return [];"), true);
  assert.equal(memory.includes("if (!input.organistPersonId) return [];"), true);
  assert.equal(contracts.includes("if (!input.organistPersonId) return [];"), true);
}

async function main() {
  authoritativeCoverage();
  memoryCoverage();
  renderCoverage();
  await staticCoverage();
  console.log("Phase 31.16 organist prerequisite and repertoire hard filter: PASS");
}

void main().catch((error: unknown) => {
  console.error("Phase 31.16 organist prerequisite and repertoire hard filter: FAIL");
  console.error(error);
  process.exitCode = 1;
});
