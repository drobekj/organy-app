import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import {
  DEFAULT_MELODY_REPRESENTATIVE_ORGANIST_ID,
  ReferenceCandidateService,
  queryReferenceCandidatesFromData,
  resolveMelodyRepresentativeSongId,
  type ReferenceCandidateData,
  type ReferenceCandidateSong,
} from "../src/application/reference-candidate-service";
import { candidatesForView } from "../src/planning-lifecycle/candidate-view";

const makeSong = (
  id: string,
  canonicalNumber: number,
  title: string,
  classId: string,
  options: { repertoire?: boolean; fallbackRepertoire?: boolean } = {},
): ReferenceCandidateSong => ({
  id,
  language: id.startsWith("polish:") ? "polish" : "czech",
  canonicalNumber,
  displayNumber: String(canonicalNumber),
  title,
  classId,
  aggregatePreferenceScore: 0,
  repertoire: options.repertoire ?? false,
  fallbackRepertoire: options.fallbackRepertoire ?? false,
});

function pureRepresentativeCoverage() {
  const songs = [
    makeSong("czech:11", 11, "Eleven", "class-a", { repertoire: true }),
    makeSong("czech:296", 296, "Two ninety six", "class-a", { fallbackRepertoire: true }),
    makeSong("czech:12", 12, "Twelve", "class-b"),
    makeSong("czech:40", 40, "Forty", "class-b"),
    makeSong("polish:5", 5, "Polish five", "class-c"),
    makeSong("polish:20", 20, "Polish twenty", "class-c"),
  ];
  const data: ReferenceCandidateData = { songs, melodyWindowMonths: 2 };
  const base = {
    serviceDate: "2026-08-25",
    serviceLanguage: "mixed" as const,
    preferenceThreshold: 0,
    candidateUsages: [],
  };

  const selected = queryReferenceCandidatesFromData(data, { ...base, organistPersonId: "person-selected" });
  assert.deepEqual(
    candidatesForView(selected, "songs").map((row) => row.songId),
    ["czech:11", "czech:296"],
    "Issue 240 must preserve the selected-organist Songs baseline",
  );
  assert.deepEqual(
    candidatesForView(selected, "melodies").map((row) => row.songId),
    ["czech:11", "czech:12", "polish:5"],
    "selected-organist Melodies must use repertoire pivots and the Mixed-service language fallback",
  );

  const anonymous = queryReferenceCandidatesFromData(data, base);
  assert.strictEqual(candidatesForView(anonymous, "songs"), anonymous, "Songs must preserve the current candidate array unchanged");
  assert.deepEqual(
    candidatesForView(anonymous, "melodies").map((row) => row.songId),
    ["czech:12", "czech:296", "polish:5"],
    "anonymous Melodies must prefer Jaroslav repertoire, then lowest Czech, then lowest Polish",
  );

  const nonRepresentativeSearch = queryReferenceCandidatesFromData(data, { ...base, queryText: "Forty" });
  assert.deepEqual(nonRepresentativeSearch.map((row) => row.songId), ["czech:40"]);
  assert.equal(nonRepresentativeSearch[0]?.melodyRepresentative, false);
  assert.deepEqual(candidatesForView(nonRepresentativeSearch, "melodies"), [], "search must not promote a sibling into the melody representative");

  const representativeSearch = queryReferenceCandidatesFromData(data, { ...base, queryText: "296" });
  assert.equal(representativeSearch[0]?.melodyRepresentative, true);
  assert.deepEqual(candidatesForView(representativeSearch, "melodies").map((row) => row.songId), ["czech:296"]);

  const historical = queryReferenceCandidatesFromData(data, { ...base, historicalTruth: true });
  assert.ok(historical.some((row) => row.songId === "historical-zero:czech"), "Completed editing must keep historical zero in Songs");
  assert.deepEqual(
    candidatesForView(historical, "melodies").map((row) => row.songId),
    ["czech:12", "czech:296", "polish:5"],
    "Completed Melodies must exclude zero and use fallback representatives",
  );
  assert.equal(historical.find((row) => row.songId === "czech:11")?.melodyClassId, "class-a", "Completed candidates must retain real melody classes");

  const occupied = queryReferenceCandidatesFromData(data, {
    ...base,
    candidateUsages: [{ songId: "czech:40", serviceDate: "2026-08-25", source: "current", rowId: 2, rowLabel: "Row 2" }],
  });
  const occupiedRepresentative = candidatesForView(occupied, "melodies").find((row) => row.songId === "czech:12");
  assert.equal(occupiedRepresentative?.availability.kind, "occupiedByCurrentRows", "Melodies must not weaken current-service occupancy");

  const deterministicFallback = [
    makeSong("czech:30", 30, "Thirty", "class-d", { fallbackRepertoire: true }),
    makeSong("czech:20", 20, "Twenty", "class-d", { fallbackRepertoire: true }),
  ];
  assert.equal(resolveMelodyRepresentativeSongId(deterministicFallback, "fallback"), "czech:20", "multiple future repertoire representatives must resolve deterministically");
}

async function databaseBoundaryCoverage() {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required for Issue 237 DB acceptance");
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    await pool.query(
      `insert into catalog_persons (id, display_name, organist)
       values ($1, 'Jaroslav fallback', true), ('person-selected-237', 'Selected organist', true)
       on conflict (id) do nothing`,
      [DEFAULT_MELODY_REPRESENTATIVE_ORGANIST_ID],
    );
    await pool.query(
      `insert into reference_catalog_songs (id, language, canonical_number, source_id, title)
       values
         ('czech:11', 'czech', 11, 'issue237-cz11', 'Eleven'),
         ('czech:296', 'czech', 296, 'issue237-cz296', 'Two ninety six'),
         ('czech:12', 'czech', 12, 'issue237-cz12', 'Twelve'),
         ('czech:40', 'czech', 40, 'issue237-cz40', 'Forty'),
         ('polish:5', 'polish', 5, 'issue237-pl5', 'Polish five'),
         ('polish:20', 'polish', 20, 'issue237-pl20', 'Polish twenty')
       on conflict (id) do nothing`,
    );
    await pool.query(
      `insert into reference_melody_classes (id)
       values ('issue237-class-a'), ('issue237-class-b'), ('issue237-class-c')
       on conflict (id) do nothing`,
    );
    await pool.query(
      `insert into reference_song_melody_memberships (reference_song_id, class_id)
       values
         ('czech:11', 'issue237-class-a'),
         ('czech:296', 'issue237-class-a'),
         ('czech:12', 'issue237-class-b'),
         ('czech:40', 'issue237-class-b'),
         ('polish:5', 'issue237-class-c'),
         ('polish:20', 'issue237-class-c')
       on conflict (reference_song_id) do update set class_id = excluded.class_id`,
    );
    await pool.query(
      `insert into reference_organist_repertoire (organist_person_id, reference_song_id)
       values
         ('person-selected-237', 'czech:11'),
         ($1, 'czech:296')
       on conflict do nothing`,
      [DEFAULT_MELODY_REPRESENTATIVE_ORGANIST_ID],
    );

    const service = new ReferenceCandidateService(pool);
    const base = {
      serviceDate: "2026-08-25",
      serviceLanguage: "mixed" as const,
      preferenceThreshold: 0,
      candidateUsages: [],
    };

    const selected = await service.queryCandidates({ ...base, organistPersonId: "person-selected-237" });
    assert.deepEqual(candidatesForView(selected, "songs").map((row) => row.songId), ["czech:11", "czech:296"]);
    assert.deepEqual(candidatesForView(selected, "melodies").map((row) => row.songId), ["czech:11", "czech:12", "polish:5"]);

    const anonymous = await service.queryCandidates(base);
    assert.deepEqual(
      candidatesForView(anonymous, "melodies").map((row) => row.songId),
      ["czech:12", "czech:296", "polish:5"],
      "DB-backed anonymous representative policy differs from confirmed contract",
    );

    const completed = await service.queryCandidates({ ...base, historicalTruth: true });
    assert.deepEqual(candidatesForView(completed, "melodies").map((row) => row.songId), ["czech:12", "czech:296", "polish:5"]);
    assert.equal(candidatesForView(completed, "melodies").some((row) => row.songId.startsWith("historical-zero:")), false);
  } finally {
    await pool.end();
  }
}

async function staticUiCoverage() {
  const [candidateList, candidateView, service] = await Promise.all([
    readFile("src/planning-lifecycle/candidate-list.tsx", "utf8"),
    readFile("src/planning-lifecycle/candidate-view.ts", "utf8"),
    readFile("src/application/reference-candidate-service.ts", "utf8"),
  ]);
  assert.match(candidateList, /useState<CandidateViewMode>\("songs"\)/, "Songs is not the default view");
  assert.match(candidateList, /candidate-view-toggle/);
  assert.match(candidateList, />Songs<\/button>/);
  assert.match(candidateList, />Melodies<\/button>/);
  assert.match(candidateList, /aria-pressed=\{candidateView === "songs"\}/);
  assert.match(candidateList, /aria-pressed=\{candidateView === "melodies"\}/);
  assert.match(candidateList, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "view header is not split 50\/50");
  assert.match(candidateList, /const candidate = visibleCandidates\[activeIndex\]/, "keyboard Enter bypasses the active filtered view");
  assert.match(candidateList, /setCandidateView\("songs"\)/, "closing the popup no longer resets the next opening to Songs");
  assert.match(candidateView, /historical-zero:/, "historical zero is not explicitly excluded from Melodies");
  assert.match(service, /DEFAULT_MELODY_REPRESENTATIVE_ORGANIST_ID = "person-jaroslav-drobek"/);
  assert.match(service, /fallbackRepertoire/);
}

async function main() {
  pureRepresentativeCoverage();
  await databaseBoundaryCoverage();
  await staticUiCoverage();
  console.log("Issue 237 Songs / Melodies acceptance passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
