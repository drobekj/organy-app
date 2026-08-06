import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/verify-phase-31-12.ts";
let source = await readFile(path, "utf8");
const replacements = [
  [
    "  await pool.query(\"delete from reference_organist_repertoire where organist_person_id='demo-organist' and reference_song_id in ('czech:1','polish:1')\");\n  await pool.query(\"insert into reference_organist_repertoire(organist_person_id,reference_song_id) values('demo-organist','czech:1')\");",
    "  await pool.query(\"delete from reference_organist_repertoire where organist_person_id='demo-organist' and reference_song_id in ('czech:1','polish:1','czech:5210')\");\n  await pool.query(\"insert into reference_organist_repertoire(organist_person_id,reference_song_id) values('demo-organist','czech:1'),('demo-organist','czech:5210')\");",
  ],
  [
    "  const canonicalVariant = await query(baseQuery({ organistPersonId: undefined, preferenceThreshold: 0, queryText: \"5210\" }));",
    "  const canonicalVariant = await query(baseQuery({ preferenceThreshold: 0, queryText: \"5210\" }));",
  ],
  [
    "  const displayVariant = await query(baseQuery({ organistPersonId: undefined, preferenceThreshold: 0, queryText: \"52/1\" }));",
    "  const displayVariant = await query(baseQuery({ preferenceThreshold: 0, queryText: \"52/1\" }));",
  ],
];
for (const [before, after] of replacements) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one fixture anchor, found ${count}`);
  source = source.replace(before, after);
}
await writeFile(path, source, "utf8");
console.log("Phase 31.12 repertoire fixture correction: APPLIED");
