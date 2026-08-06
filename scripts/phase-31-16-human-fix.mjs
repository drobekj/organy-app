import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const source = await readFile(path, "utf8");
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${path}: replacement anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${path}: replacement anchor is not unique`);
  await writeFile(path, source.slice(0, first) + after + source.slice(first + before.length), "utf8");
}

await replaceOnce(
  "app/planning-lifecycle-client.tsx",
  `  async function queryCandidateResults(rowId: number, value: string) {\n    const scope = getSongLookupScope(rowId);\n    const languageAtRequest = serviceLanguage;`,
  `  async function queryCandidateResults(rowId: number, value: string) {\n    const scope = getSongLookupScope(rowId);\n    if (!organistId) {\n      lookupTracker.invalidate(scope);\n      setCandidateResults((current) => ({ ...current, [rowId]: [] }));\n      setCandidateLoading((current) => ({ ...current, [rowId]: false }));\n      setCandidateErrors((current) => ({ ...current, [rowId]: undefined }));\n      setServiceError(null);\n      return;\n    }\n    const languageAtRequest = serviceLanguage;`,
);

await replaceOnce(
  "app/planning-lifecycle-client.tsx",
  `    setCandidateResults({});\n    setCandidateLoading({ [rowId]: true });\n    setCandidateErrors({});\n    void queryCandidateResults(rowId, "");`,
  `    setCandidateResults({});\n    setCandidateLoading({ [rowId]: Boolean(organistId) });\n    setCandidateErrors({});\n    void queryCandidateResults(rowId, "");`,
);

await replaceOnce(
  "app/planning-lifecycle-client.tsx",
  `                        error={candidateErrors[row.id]}\n                        serviceLanguage={serviceLanguage}`,
  `                        error={candidateErrors[row.id]}\n                        prerequisiteMessage={!organistId ? "Select an active organist in Service context to see candidates." : undefined}\n                        serviceLanguage={serviceLanguage}`,
);

await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `  error?: string;\n  serviceLanguage: ServiceLanguage;`,
  `  error?: string;\n  prerequisiteMessage?: string;\n  serviceLanguage: ServiceLanguage;`,
);

await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `  const [activeIndex, setActiveIndex] = useState(-1);\n  const currentSongId = props.selectedSong?.songId;`,
  `  const [activeIndex, setActiveIndex] = useState(-1);\n  const blockedByPrerequisite = Boolean(props.prerequisiteMessage);\n  const currentSongId = props.selectedSong?.songId;`,
);

await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `  const activeDescendant = props.open && activeIndex >= 0 ? optionId(listboxId, props.candidates[activeIndex]?.songId) : undefined;`,
  `  const activeDescendant = props.open && !blockedByPrerequisite && activeIndex >= 0 ? optionId(listboxId, props.candidates[activeIndex]?.songId) : undefined;`,
);

await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `    if (props.loading || props.error || props.candidates.length === 0) {`,
  `    if (blockedByPrerequisite || props.loading || props.error || props.candidates.length === 0) {`,
);

await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `  }, [props.open, props.loading, props.error, candidateIds, props.value, currentSongId, currentCandidateIndex]);`,
  `  }, [props.open, props.loading, props.error, props.prerequisiteMessage, candidateIds, props.value, currentSongId, currentCandidateIndex]);`,
);

await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `          aria-label={\`Song candidates for \${props.rowLabel}\`}\n          aria-busy={props.loading}\n        >\n          {props.loading && <p className="candidate-list-state" role="status">Loading candidates…</p>}`,
  `          aria-label={\`Song candidates for \${props.rowLabel}\`}\n          aria-busy={!blockedByPrerequisite && props.loading}\n        >\n          {blockedByPrerequisite && (\n            <div className="candidate-list-state candidate-list-prerequisite" role="status">\n              <p>{props.prerequisiteMessage}</p>\n              <button type="button" className="candidate-list-cancel" onClick={props.onCancel}>Cancel</button>\n            </div>\n          )}\n          {!blockedByPrerequisite && props.loading && <p className="candidate-list-state" role="status">Loading candidates…</p>}`,
);

await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `          {!props.loading && props.error && (`,
  `          {!blockedByPrerequisite && !props.loading && props.error && (`,
);
await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `          {!props.loading && !props.error && unavailableCurrent && props.selectedSong && (`,
  `          {!blockedByPrerequisite && !props.loading && !props.error && unavailableCurrent && props.selectedSong && (`,
);
await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `          {!props.loading && !props.error && props.candidates.length === 0 && (`,
  `          {!blockedByPrerequisite && !props.loading && !props.error && props.candidates.length === 0 && (`,
);
await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `          {!props.loading && !props.error && allOccupied && (`,
  `          {!blockedByPrerequisite && !props.loading && !props.error && allOccupied && (`,
);
await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `          {!props.loading && !props.error && props.candidates.map((candidate, index) => {`,
  `          {!blockedByPrerequisite && !props.loading && !props.error && props.candidates.map((candidate, index) => {`,
);
await replaceOnce(
  "src/planning-lifecycle/candidate-list.tsx",
  `          {!props.loading && !props.error && <button type="button" className="candidate-list-cancel" onClick={props.onCancel}>Cancel</button>}`,
  `          {!blockedByPrerequisite && !props.loading && !props.error && <button type="button" className="candidate-list-cancel" onClick={props.onCancel}>Cancel</button>}`,
);

await replaceOnce(
  "src/application/reference-candidate-service.ts",
  `): ReferenceCandidateQueryResult[] {\n  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));`,
  `): ReferenceCandidateQueryResult[] {\n  if (!input.organistPersonId) return [];\n  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));`,
);
await replaceOnce(
  "src/application/reference-candidate-service.ts",
  `    if (input.organistPersonId && !allMembers.some((member) => member.repertoire)) continue;`,
  `    if (!allMembers.some((member) => member.repertoire)) continue;`,
);

await replaceOnce(
  "src/application/interaction-service.ts",
  `export function queryCandidatesFromData(songs: CatalogSong[], preferences: SongPreference[], repertoire: Set<string>, knowledge: { antiphons: KnowledgeMapping[]; seasons: KnowledgeMapping[]; melodyClasses: MelodyClass[]; melodyWindow?: MelodyNonRepetitionConfig }, input: CandidateQueryInput): CandidateQueryResult[] {\n  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));`,
  `export function queryCandidatesFromData(songs: CatalogSong[], preferences: SongPreference[], repertoire: Set<string>, knowledge: { antiphons: KnowledgeMapping[]; seasons: KnowledgeMapping[]; melodyClasses: MelodyClass[]; melodyWindow?: MelodyNonRepetitionConfig }, input: CandidateQueryInput): CandidateQueryResult[] {\n  if (!input.organistPersonId) return [];\n  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));`,
);
await replaceOnce(
  "src/application/interaction-service.ts",
  `    const hasRepertoire = !input.organistPersonId || allClassSongIds.some((songId) => repertoire.has(songId));`,
  `    const hasRepertoire = allClassSongIds.some((songId) => repertoire.has(songId));`,
);

await replaceOnce(
  "src/application/interaction-contracts.ts",
  `  queryCandidates(songs: CatalogSong[], input: CandidateQueryInput): CandidateQueryResult[] {\n    const languageSet = new Set(languagesForService(input.serviceLanguage));`,
  `  queryCandidates(songs: CatalogSong[], input: CandidateQueryInput): CandidateQueryResult[] {\n    if (!input.organistPersonId) return [];\n    const languageSet = new Set(languagesForService(input.serviceLanguage));`,
);
await replaceOnce(
  "src/application/interaction-contracts.ts",
  `      if (input.organistPersonId && !allClassSongIds.some((songId) => this.repertoire.has(this.repertoireKey(input.organistPersonId!, songId)))) continue;`,
  `      if (!allClassSongIds.some((songId) => this.repertoire.has(this.repertoireKey(input.organistPersonId!, songId)))) continue;`,
);

await replaceOnce(
  "package.json",
  `    "test:phase-31-16": "tsx scripts/phase-31-16-tests.tsx",`,
  `    "test:phase-31-16": "tsx scripts/phase-31-16-tests.tsx && tsx scripts/phase-31-16-organist-prerequisite-tests.tsx",`,
);

await writeFile(
  "scripts/phase-31-16-organist-prerequisite-tests.tsx",
  `import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nimport { renderToStaticMarkup } from "react-dom/server";\nimport type { CatalogSong } from "../src/application/catalog";\nimport type { CandidateQueryInput } from "../src/application/interaction-contracts";\nimport { queryCandidatesFromData } from "../src/application/interaction-service";\nimport { queryReferenceCandidatesFromData, type ReferenceCandidateData } from "../src/application/reference-candidate-service";\nimport { CandidateCombobox } from "../src/planning-lifecycle/candidate-list";\n\nconst baseInput: CandidateQueryInput = {\n  serviceDate: "2026-08-09",\n  serviceLanguage: "czech",\n  preferenceThreshold: 0,\n  candidateUsages: [],\n};\n\nfunction authoritativeCoverage() {\n  const data = (repertoire: boolean): ReferenceCandidateData => ({\n    songs: [{\n      id: "czech:1",\n      language: "czech",\n      canonicalNumber: 1,\n      displayNumber: "1",\n      title: "Authoritative candidate",\n      classId: "class-one",\n      aggregatePreferenceScore: 0,\n      repertoire,\n    }],\n    melodyWindowMonths: 2,\n  });\n\n  assert.deepEqual(\n    queryReferenceCandidatesFromData(data(true), baseInput),\n    [],\n    "missing Service Context organist must never bypass the authoritative repertoire hard filter",\n  );\n  assert.deepEqual(\n    queryReferenceCandidatesFromData(data(false), { ...baseInput, organistPersonId: "empty-organist" }),\n    [],\n    "an empty authoritative repertoire must yield zero candidates",\n  );\n  assert.equal(\n    queryReferenceCandidatesFromData(data(true), { ...baseInput, organistPersonId: "demo-organist" }).length,\n    1,\n    "a selected organist with repertoire membership must retain the candidate",\n  );\n}\n\nfunction memoryCoverage() {\n  const songs: CatalogSong[] = [{ songId: "demo-cz-101", language: "czech", number: "101", title: "Demo", active: true }];\n  const knowledge = { antiphons: [], seasons: [], melodyClasses: [], melodyWindow: { months: 2 } };\n\n  assert.deepEqual(\n    queryCandidatesFromData(songs, [], new Set(["demo-cz-101"]), knowledge, baseInput),\n    [],\n    "missing Service Context organist must never bypass the in-memory repertoire hard filter",\n  );\n  assert.deepEqual(\n    queryCandidatesFromData(songs, [], new Set(), knowledge, { ...baseInput, organistPersonId: "empty-organist" }),\n    [],\n    "an empty in-memory repertoire must yield zero candidates",\n  );\n  assert.equal(\n    queryCandidatesFromData(songs, [], new Set(["demo-cz-101"]), knowledge, { ...baseInput, organistPersonId: "demo-organist" }).length,\n    1,\n  );\n}\n\nfunction renderCoverage() {\n  const html = renderToStaticMarkup(\n    <CandidateCombobox\n      rowId={1}\n      rowLabel="Row 1"\n      open={true}\n      value=""\n      candidates={[]}\n      loading={false}\n      prerequisiteMessage="Select an active organist in Service context to see candidates."\n      serviceLanguage="czech"\n      onOpen={() => undefined}\n      onQueryChange={() => undefined}\n      onSelect={() => undefined}\n      onCancel={() => undefined}\n      onRetry={() => undefined}\n    />,\n  );\n  assert.match(html, /Select an active organist in Service context to see candidates/);\n  assert.match(html, />Cancel</);\n  assert.doesNotMatch(html, /Loading candidates|Candidate lookup failed|Retry|No songs satisfy/);\n  assert.match(html, /aria-busy="false"/);\n}\n\nasync function staticCoverage() {\n  const [client, component, authoritative, memory, contracts] = await Promise.all([\n    readFile("app/planning-lifecycle-client.tsx", "utf8"),\n    readFile("src/planning-lifecycle/candidate-list.tsx", "utf8"),\n    readFile("src/application/reference-candidate-service.ts", "utf8"),\n    readFile("src/application/interaction-service.ts", "utf8"),\n    readFile("src/application/interaction-contracts.ts", "utf8"),\n  ]);\n  assert.match(client, /if \(!organistId\) \{/);\n  assert.match(client, /prerequisiteMessage=\{!organistId/);\n  assert.match(component, /blockedByPrerequisite/);\n  assert.match(authoritative, /if \(!input\.organistPersonId\) return \[\];/);\n  assert.match(memory, /if \(!input\.organistPersonId\) return \[\];/);\n  assert.match(contracts, /if \(!input\.organistPersonId\) return \[\];/);\n}\n\nasync function main() {\n  authoritativeCoverage();\n  memoryCoverage();\n  renderCoverage();\n  await staticCoverage();\n  console.log("Phase 31.16 organist prerequisite and repertoire hard filter: PASS");\n}\n\nvoid main().catch((error: unknown) => {\n  console.error("Phase 31.16 organist prerequisite and repertoire hard filter: FAIL");\n  console.error(error);\n  process.exitCode = 1;\n});\n`,
  "utf8",
);

console.log("Phase 31.16 HUMAN correction transforms: APPLIED");
