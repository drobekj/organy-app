import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/verify-phase-31-8.ts";
let source = await readFile(path, "utf8");
const replacements = [
  [
    "  direct=new Pool({connectionString:url}); const legacyBefore=JSON.stringify({classes:(await direct.query('select * from melody_equivalence_classes order by id')).rows,memberships:(await direct.query('select * from song_melody_equivalence order by song_id,class_id')).rows}); await direct.end();\nconst candidateInput={serviceDate:'2026-07-29',serviceLanguage:'czech',candidateUsages:[]};",
    "  direct=new Pool({connectionString:url}); const legacyBefore=JSON.stringify({classes:(await direct.query('select * from melody_equivalence_classes order by id')).rows,memberships:(await direct.query('select * from song_melody_equivalence order by song_id,class_id')).rows}); await direct.query(\"insert into reference_organist_repertoire(organist_person_id,reference_song_id) values ('demo-organist','czech:20'),('demo-organist','czech:21') on conflict do nothing\"); await direct.end();\nconst candidateInput={serviceDate:'2026-07-29',serviceLanguage:'czech',organistPersonId:'demo-organist',candidateUsages:[]};",
  ],
  [
    "assert.deepEqual(mergedCandidate20.equivalentNumbers,[{songId:'czech:21',number:'21',repertoire:false}]);",
    "assert.deepEqual(mergedCandidate20.equivalentNumbers,[{songId:'czech:21',number:'21',repertoire:true}]);",
  ],
  [
    "assert.deepEqual(mergedCandidate21.equivalentNumbers,[{songId:'czech:20',number:'20',repertoire:false}]);",
    "assert.deepEqual(mergedCandidate21.equivalentNumbers,[{songId:'czech:20',number:'20',repertoire:true}]);",
  ],
];
for (const [before, after] of replacements) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one fixture anchor, found ${count}`);
  source = source.replace(before, after);
}
await writeFile(path, source, "utf8");
console.log("Phase 31.8 repertoire fixture correction: APPLIED");
