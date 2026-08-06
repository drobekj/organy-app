import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/verify-phase-31-10a.ts";
let source = await readFile(path, "utf8");
const replacements = [
  [
    "    insert into organist_repertoire(organist_person_id,song_id) values('organist-person','legacy-song');\n    insert into melody_equivalence_classes(id,label,synthetic) values('legacy-melody','Legacy melody',false);",
    "    insert into organist_repertoire(organist_person_id,song_id) values('organist-person','legacy-song');\n    insert into reference_organist_repertoire(organist_person_id,reference_song_id) values('organist-person','czech:1');\n    insert into melody_equivalence_classes(id,label,synthetic) values('legacy-melody','Legacy melody',false);",
  ],
  [
    "  const candidateInput = { serviceDate: \"2026-07-31\", serviceLanguage: \"czech\", antiphonKey: \"legacy-key\" };",
    "  const candidateInput = { serviceDate: \"2026-07-31\", serviceLanguage: \"czech\", organistPersonId: \"organist-person\", antiphonKey: \"legacy-key\" };",
  ],
];
for (const [before, after] of replacements) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one fixture anchor, found ${count}`);
  source = source.replace(before, after);
}
await writeFile(path, source, "utf8");
console.log("Phase 31.10a repertoire fixture correction: APPLIED");
