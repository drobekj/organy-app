import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/verify-phase-31-12.ts";
let text = readFileSync(path, "utf8");

const inlineBlock = `  assert.equal(Number((await pool.query("select count(*)::int n from catalog_songs where song_id=\\'czech:1\\'")).rows[0].n), 0, "focused Reference song unexpectedly existed in the legacy catalog");
  const savedReferenceCandidate = await invokePlanning("saveWorkingSet", {
    serviceContext: {
      serviceDate: "2026-08-09",
      serviceTime: "13:12",
      language: "czech",
      priest: { id: "demo-priest", displayName: "Demo Priest" },
      organist: { id: "demo-organist", displayName: "Demo Organist" },
      antiphonKey: "legacy-test",
    },
    set: {
      status: "working",
      language: "czech",
      rows: [{ song: { songId: highlighted[0].songId, language: highlighted[0].language, number: highlighted[0].number, title: highlighted[0].title } }],
    },
  });
  assert.equal(savedReferenceCandidate.status, 200);
  assert.equal(savedReferenceCandidate.body.success, true, JSON.stringify(savedReferenceCandidate.body));
  assert.deepEqual(savedReferenceCandidate.body.value.rows[0].song, { songId: "czech:1", language: "czech", number: "1", title: "Phase 31.12 Authoritative Candidate" });
  const loadedReferenceCandidate = await invokePlanning("loadPlanningSet", { setId: String(savedReferenceCandidate.body.value.id) });
  assert.equal(loadedReferenceCandidate.body.success, true);
  assert.deepEqual(loadedReferenceCandidate.body.value.rows[0].song, savedReferenceCandidate.body.value.rows[0].song, "Reference song snapshot did not persist through Working save/reload");

`;

if (text.includes(inlineBlock)) text = text.replace(inlineBlock, "");
else if (!text.includes("async function verifyReferenceCandidateLifecycle")) throw new Error("Inline lifecycle block was not found.");

const marker = "async function verifyStrictRoute() {\n";
const lifecycleFunction = `async function verifyReferenceCandidateLifecycle(pool: Pool) {
  assert.equal(Number((await pool.query("select count(*)::int n from catalog_songs where song_id='czech:1'")).rows[0].n), 0, "focused Reference song unexpectedly existed in the legacy catalog");
  const selected = (await query(baseQuery({ referenceAntiphonId: "czech:800", queryText: "1" })))[0];
  const savedReferenceCandidate = await invokePlanning("saveWorkingSet", {
    serviceContext: {
      serviceDate: "2026-08-09",
      serviceTime: "13:12",
      language: "czech",
      priest: { id: "demo-priest", displayName: "Demo Priest" },
      organist: { id: "demo-organist", displayName: "Demo Organist" },
      antiphonKey: "legacy-test",
    },
    set: {
      status: "working",
      language: "czech",
      rows: [{ song: { songId: selected.songId, language: selected.language, number: selected.number, title: selected.title } }],
    },
  });
  assert.equal(savedReferenceCandidate.status, 200);
  assert.equal(savedReferenceCandidate.body.success, true, JSON.stringify(savedReferenceCandidate.body));
  assert.deepEqual(savedReferenceCandidate.body.value.rows[0].song, { songId: "czech:1", language: "czech", number: "1", title: "Phase 31.12 Authoritative Candidate" });
  const loadedReferenceCandidate = await invokePlanning("loadPlanningSet", { setId: String(savedReferenceCandidate.body.value.id) });
  assert.equal(loadedReferenceCandidate.body.success, true);
  assert.deepEqual(loadedReferenceCandidate.body.value.rows[0].song, savedReferenceCandidate.body.value.rows[0].song, "Reference song snapshot did not persist through Working save/reload");
}

`;
if (!text.includes("async function verifyReferenceCandidateLifecycle")) {
  if (!text.includes(marker)) throw new Error("Strict route marker was not found.");
  text = text.replace(marker, lifecycleFunction + marker);
}

const mainMarker = '        assert.equal(await focusedSnapshot(pool), beforeReads, "read-only candidate operations mutated authoritative or legacy state");\n';
const mainReplacement = mainMarker + "        await verifyReferenceCandidateLifecycle(pool);\n";
if (!text.includes(mainReplacement)) {
  if (!text.includes(mainMarker)) throw new Error("Focused snapshot assertion was not found.");
  text = text.replace(mainMarker, mainReplacement);
}

writeFileSync(path, text, "utf8");
console.log("Moved Phase 31.12 lifecycle mutation after the read-only fingerprint assertion.");
