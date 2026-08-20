import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const PHASE_31_43_ARCHIVE_SHA256 = "acd33d29aa07a6439b42fc3ebb973045c22781b2e1ec187139b71abeb3ee3be1";
export const PHASE_31_43_TARGET_PERSON_ID = "person-jaroslav-drobek";
export const PHASE_31_43_ARCHIVE_MEMBERS = [
  "A-melody-equivalence.json",
  "B-jaroslav-repertoire-pivots.json",
  "C-validation-report.json",
  "HANDOFF.md",
] as const;

export type ContractLanguage = "czech" | "polish";
export type ContractIdentity = { language: ContractLanguage; number: number; displayNumber: string };
export type ContractEdge = { a: ContractIdentity; b: ContractIdentity; legacyRowId: number; sourceTable: string };
export type ContractMelodyClass = {
  classId: string;
  members: ContractIdentity[];
  provenanceEdges: ContractEdge[];
};
export type ContractPivot = {
  language: ContractLanguage;
  number: number;
  displayNumber: string;
  legacyStatus: "hraná" | "pripravená";
};
export type DefinitiveContract = {
  melodyClasses: ContractMelodyClass[];
  pivots: ContractPivot[];
  classByIdentity: Map<string, ContractMelodyClass>;
  effectivePlayableIdentities: Set<string>;
};
export type ReferenceSongIdentity = { id: string; language: ContractLanguage; canonicalNumber: number };
export type ResolvedContract = {
  songIdByIdentity: Map<string, string>;
  expectedClassBySongId: Map<string, string>;
  pivotSongIds: Set<string>;
  effectivePlayableSongIds: Set<string>;
};

function fail(message: string): never { throw new Error(message); }
function record(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${context} must be an object.`);
  return value as Record<string, unknown>;
}
function array(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) fail(`${context} must be an array.`);
  return value;
}
function integer(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) fail(`${context} must be an integer.`);
  return value;
}
function text(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${context} must be a non-empty string.`);
  return value;
}
function bool(value: unknown, context: string): boolean {
  if (typeof value !== "boolean") fail(`${context} must be boolean.`);
  return value;
}
function expect(actual: unknown, expected: unknown, context: string): void {
  if (actual !== expected) fail(`${context} expected ${String(expected)}, got ${String(actual)}.`);
}
function keyOf(identity: Pick<ContractIdentity, "language" | "number">): string { return `${identity.language}:${identity.number}`; }
function compareIdentity(a: ContractIdentity, b: ContractIdentity): number {
  const lang = (a.language === "czech" ? 0 : 1) - (b.language === "czech" ? 0 : 1);
  return lang || a.number - b.number;
}
function parseIdentity(value: unknown, context: string): ContractIdentity {
  const row = record(value, context);
  const language = row.language;
  if (language !== "czech" && language !== "polish") fail(`${context}.language must be czech or polish.`);
  const number = integer(row.number, `${context}.number`);
  if (number <= 0) fail(`${context}.number must be positive.`);
  const displayNumber = text(row.display_number, `${context}.display_number`);
  return { language, number, displayNumber };
}
function getPath(root: Record<string, unknown>, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split(".")) current = record(current, path)[segment];
  return current;
}
function expectPath(root: Record<string, unknown>, path: string, expected: unknown): void {
  expect(getPath(root, path), expected, path);
}
function sizeDistribution(values: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[String(value)] = (out[String(value)] ?? 0) + 1;
  return out;
}
function expectJson(actual: unknown, expected: unknown, context: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${context} does not match the definitive contract.`);
}

export function validateArchiveMemberNames(names: string[]): void {
  const actual = [...names].sort();
  const expected = [...PHASE_31_43_ARCHIVE_MEMBERS].sort();
  expectJson(actual, expected, "Archive member list");
}

function extractArchive(archivePath: string, destination: string): void {
  const result = process.platform === "win32"
    ? spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $env:ORGANY_ARCHIVE -DestinationPath $env:ORGANY_DEST -Force"],
        { env: { ...process.env, ORGANY_ARCHIVE: archivePath, ORGANY_DEST: destination }, encoding: "utf8" },
      )
    : spawnSync("unzip", ["-q", archivePath, "-d", destination], { encoding: "utf8" });
  if (result.status !== 0) fail(`Definitive archive could not be extracted: ${(result.stderr || result.stdout || "extractor failed").trim()}`);
}

export async function readDefinitiveArchive(archiveInputPath: string): Promise<{ contract: DefinitiveContract; handoffText: string }> {
  const archivePath = resolve(archiveInputPath);
  const bytes = await readFile(archivePath);
  const sha = createHash("sha256").update(bytes).digest("hex");
  expect(sha, PHASE_31_43_ARCHIVE_SHA256, "Definitive archive SHA-256");
  const root = await mkdtemp(join(tmpdir(), "organy-phase-31-43-contract-"));
  try {
    extractArchive(archivePath, root);
    const entries = await readdir(root, { withFileTypes: true });
    if (entries.some((entry) => !entry.isFile())) fail("Definitive archive must contain files only at its root.");
    validateArchiveMemberNames(entries.map((entry) => entry.name));
    const [aText, bText, cText, handoffText] = await Promise.all([
      readFile(join(root, "A-melody-equivalence.json"), "utf8"),
      readFile(join(root, "B-jaroslav-repertoire-pivots.json"), "utf8"),
      readFile(join(root, "C-validation-report.json"), "utf8"),
      readFile(join(root, "HANDOFF.md"), "utf8"),
    ]);
    let a: unknown; let b: unknown; let c: unknown;
    try { a = JSON.parse(aText); b = JSON.parse(bText); c = JSON.parse(cText); }
    catch { fail("Definitive archive JSON member is malformed."); }
    return { contract: validateContractDocuments(a, b, c, handoffText), handoffText };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function validateContractDocuments(aValue: unknown, bValue: unknown, cValue: unknown, handoffText: string): DefinitiveContract {
  const a = record(aValue, "A");
  const b = record(bValue, "B");
  const c = record(cValue, "C");

  expect(a.schema_version, 1.2, "A.schema_version");
  expect(a.dataset, "church-organy-authoritative-melody-equivalence", "A.dataset");
  expect(a.contract_status, "APPROVED_SOURCE_DATA_READY_FOR_IMPLEMENTATION", "A.contract_status");
  expectPath(a, "reference_catalog.czech_records", 808);
  expectPath(a, "reference_catalog.polish_records", 990);
  expectPath(a, "reference_catalog.total_records", 1798);
  expectPath(a, "reference_catalog.czech_catalog_blob_sha", "41620e19a40c229b756d0f29f8e64c708d3a585d");
  expectPath(a, "reference_catalog.polish_catalog_blob_sha", "a23a6fbdfccffe86cdf6ca4fc862a5fa3db31a02");

  const rawClasses = array(a.classes, "A.classes");
  expect(rawClasses.length, 103, "A.classes length");
  const melodyClasses: ContractMelodyClass[] = [];
  const classIds = new Set<string>();
  const memberOwner = new Map<string, string>();
  const globalEdges = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const crossCzech = new Set<number>();
  const crossPolish = new Set<number>();
  let czechMembers = 0; let polishMembers = 0; let bilingual = 0; let czechOnly = 0; let polishOnly = 0; let maxClassSize = 0; let orientedPolishCleanup = false;

  rawClasses.forEach((rawClass, classIndex) => {
    const row = record(rawClass, `A.classes[${classIndex}]`);
    const classId = text(row.class_id, `A.classes[${classIndex}].class_id`);
    if (classIds.has(classId)) fail(`Duplicate melody class id ${classId}.`);
    classIds.add(classId);
    const rawMembers = array(row.members, `${classId}.members`);
    const memberCount = integer(row.member_count, `${classId}.member_count`);
    expect(rawMembers.length, memberCount, `${classId}.member_count`);
    if (memberCount < 2) fail(`${classId} must be non-singleton.`);
    const members = rawMembers.map((member, index) => parseIdentity(member, `${classId}.members[${index}]`));
    const localMemberKeys = new Set<string>();
    for (const member of members) {
      const key = keyOf(member);
      if (localMemberKeys.has(key)) fail(`${classId} contains duplicate member ${key}.`);
      localMemberKeys.add(key);
      if (memberOwner.has(key)) fail(`Reference identity ${key} occurs in multiple melody classes.`);
      memberOwner.set(key, classId);
      if (member.language === "czech") czechMembers += 1; else polishMembers += 1;
    }
    const czech = members.filter((member) => member.language === "czech").length;
    const polish = members.length - czech;
    const languages = record(row.languages, `${classId}.languages`);
    expect(languages.czech, czech, `${classId}.languages.czech`);
    expect(languages.polish, polish, `${classId}.languages.polish`);
    if (czech && polish) bilingual += 1; else if (czech) czechOnly += 1; else polishOnly += 1;
    maxClassSize = Math.max(maxClassSize, members.length);

    const rawEdges = array(row.provenance_edges, `${classId}.provenance_edges`);
    expect(rawEdges.length, members.length - 1, `${classId} forest edge count`);
    const provenanceEdges: ContractEdge[] = rawEdges.map((rawEdge, edgeIndex) => {
      const edge = record(rawEdge, `${classId}.provenance_edges[${edgeIndex}]`);
      const a = parseIdentity(edge.a, `${classId}.edge[${edgeIndex}].a`);
      const b = parseIdentity(edge.b, `${classId}.edge[${edgeIndex}].b`);
      const aKey = keyOf(a); const bKey = keyOf(b);
      if (aKey === bKey) fail(`${classId} contains self edge ${aKey}.`);
      if (!localMemberKeys.has(aKey) || !localMemberKeys.has(bKey)) fail(`${classId} edge endpoint is not a class member.`);
      const undirected = [aKey, bKey].sort().join("<->");
      if (globalEdges.has(undirected)) fail(`Duplicate undirected melody edge ${undirected}.`);
      globalEdges.add(undirected);
      const sourceTable = text(edge.source_table, `${classId}.edge[${edgeIndex}].source_table`);
      if (!["dbo.CeskePisne", "dbo.PolskePisne", "dbo.CeskePolskePisne"].includes(sourceTable)) fail(`Unsupported source table ${sourceTable}.`);
      sourceCounts.set(sourceTable, (sourceCounts.get(sourceTable) ?? 0) + 1);
      if (sourceTable === "dbo.CeskePisne" && (a.language !== "czech" || b.language !== "czech")) fail("CeskePisne edge must be Czech↔Czech.");
      if (sourceTable === "dbo.PolskePisne" && (a.language !== "polish" || b.language !== "polish")) fail("PolskePisne edge must be Polish↔Polish.");
      if (sourceTable === "dbo.CeskePolskePisne") {
        if (a.language === b.language) fail("CeskePolskePisne edge must be cross-language.");
        const cz = a.language === "czech" ? a.number : b.number;
        const pl = a.language === "polish" ? a.number : b.number;
        if (crossCzech.has(cz) || crossPolish.has(pl)) fail("CeskePolskePisne is not a bijection.");
        crossCzech.add(cz); crossPolish.add(pl);
      }
      const legacyRowId = integer(edge.legacy_row_id, `${classId}.edge[${edgeIndex}].legacy_row_id`);
      if (sourceTable === "dbo.PolskePisne" && a.language === "polish" && a.number === 144 && b.language === "polish" && b.number === 142 && legacyRowId === 1006) orientedPolishCleanup = true;
      return { a, b, legacyRowId, sourceTable };
    });
    melodyClasses.push({ classId, members, provenanceEdges });
  });

  expect(memberOwner.size, 348, "Distinct non-singleton members");
  expect(globalEdges.size, 245, "Melody edge count");
  expect(globalEdges.size, memberOwner.size - melodyClasses.length, "Forest invariant");
  expect(sourceCounts.get("dbo.CeskePisne") ?? 0, 180, "CeskePisne edges");
  expect(sourceCounts.get("dbo.PolskePisne") ?? 0, 6, "PolskePisne edges");
  expect(sourceCounts.get("dbo.CeskePolskePisne") ?? 0, 59, "CeskePolskePisne edges");
  expect(crossCzech.size, 59, "Distinct Czech cross-language IDs");
  expect(crossPolish.size, 59, "Distinct Polish cross-language IDs");
  expect(orientedPolishCleanup, true, "PolskePisne orientation (144,142)");
  expect(czechMembers, 283, "Non-singleton Czech members");
  expect(polishMembers, 65, "Non-singleton Polish members");
  expect(bilingual, 59, "Bilingual melody classes");
  expect(czechOnly, 44, "Czech-only melody classes");
  expect(polishOnly, 0, "Polish-only melody classes");
  expect(maxClassSize, 14, "Maximum melody class size");
  expectJson(sizeDistribution(melodyClasses.map((item) => item.members.length)), {"2":63,"3":11,"4":12,"5":4,"6":2,"7":1,"8":2,"9":2,"10":3,"12":2,"14":1}, "Melody class size distribution");

  expectPath(a, "statistics.source_edges.CeskePisne", 180);
  expectPath(a, "statistics.source_edges.PolskePisne", 6);
  expectPath(a, "statistics.source_edges.CeskePolskePisne", 59);
  expectPath(a, "statistics.source_edges.total", 245);
  expectPath(a, "statistics.distinct_members", 348);
  expectPath(a, "statistics.non_singleton_classes", 103);
  expectPath(a, "statistics.reference_singletons_after_import.total", 1450);
  expectPath(a, "statistics.total_melody_classes_after_import", 1553);

  expect(b.schema_version, 1.2, "B.schema_version");
  expect(b.dataset, "church-organy-jaroslav-repertoire-pivots", "B.dataset");
  expect(b.contract_status, "APPROVED_SOURCE_DATA_READY_FOR_IMPLEMENTATION", "B.contract_status");
  expect(b.person_id, PHASE_31_43_TARGET_PERSON_ID, "B.person_id");
  expect(b.legacy_varhanik_id, 1, "B.legacy_varhanik_id");
  const rawPivots = array(b.pivots, "B.pivots");
  expect(rawPivots.length, 233, "B.pivots length");
  const pivots: ContractPivot[] = [];
  const pivotKeys = new Set<string>();
  const coveredNonSingletonClasses = new Set<string>();
  let played = 0; let prepared = 0; let nonSingletonPivots = 0;
  for (let index = 0; index < rawPivots.length; index += 1) {
    const row = record(rawPivots[index], `B.pivots[${index}]`);
    const identity = parseIdentity(row, `B.pivots[${index}]`);
    const legacyStatus = row.legacy_status;
    if (legacyStatus !== "hraná" && legacyStatus !== "pripravená") fail(`B.pivots[${index}].legacy_status is unsupported.`);
    const key = keyOf(identity);
    if (pivotKeys.has(key)) fail(`Duplicate repertoire pivot ${key}.`);
    pivotKeys.add(key);
    if (legacyStatus === "hraná") played += 1; else prepared += 1;
    const owner = memberOwner.get(key);
    if (owner) {
      if (coveredNonSingletonClasses.has(owner)) fail(`Multiple pivots occur in non-singleton melody class ${owner}.`);
      coveredNonSingletonClasses.add(owner);
      nonSingletonPivots += 1;
      if (typeof row.melody_class_id === "string") expect(row.melody_class_id, owner, `${key}.melody_class_id`);
      if (typeof row.melody_class_member_count === "number") expect(row.melody_class_member_count, melodyClasses.find((item) => item.classId === owner)!.members.length, `${key}.melody_class_member_count`);
    }
    pivots.push({ language: identity.language, number: identity.number, displayNumber: identity.displayNumber, legacyStatus });
  }
  expect(played, 129, "Pivot hraná count");
  expect(prepared, 104, "Pivot pripravená count");
  expect(nonSingletonPivots, 84, "Pivots in non-singleton classes");
  expect(rawPivots.length - nonSingletonPivots, 149, "Singleton pivots");

  const classByIdentity = new Map<string, ContractMelodyClass>();
  for (const melodyClass of melodyClasses) for (const member of melodyClass.members) classByIdentity.set(keyOf(member), melodyClass);
  const effectivePlayableIdentities = new Set<string>();
  for (const pivot of pivots) {
    const pivotKey = keyOf(pivot);
    const melodyClass = classByIdentity.get(pivotKey);
    if (melodyClass) for (const member of melodyClass.members) effectivePlayableIdentities.add(keyOf(member));
    else effectivePlayableIdentities.add(pivotKey);
  }
  expect(effectivePlayableIdentities.size, 442, "Effective playable songs");
  expect([...effectivePlayableIdentities].filter((key) => key.startsWith("czech:")).length, 378, "Effective playable Czech songs");
  expect([...effectivePlayableIdentities].filter((key) => key.startsWith("polish:")).length, 64, "Effective playable Polish songs");
  expectPath(b, "statistics.legacy_repertoire_rows", 343);
  expectPath(b, "statistics.pivot_memberships", 233);
  expectPath(b, "statistics.effective_playable_songs_after_equivalence.total", 442);
  expectPath(b, "statistics.pivots_in_non_singleton_classes", 84);
  expectPath(b, "statistics.singleton_pivots", 149);

  expect(c.schema_version, 1.2, "C.schema_version");
  expect(c.dataset, "church-organy-legacy-knowledge-validation-report", "C.dataset");
  expect(bool(c.validation_passed, "C.validation_passed"), true, "C.validation_passed");
  expect(c.contract_gate, "PASS", "C.contract_gate");
  expectPath(c, "checks.source_row_counts.CeskePisne", 180);
  expectPath(c, "checks.source_row_counts.PolskePisne", 6);
  expectPath(c, "checks.source_row_counts.CeskePolskePisne", 59);
  expectPath(c, "checks.source_row_counts.VarhaniciPisne", 343);
  expectPath(c, "checks.ceske_polske_pisne_bijection.rows", 59);
  expectPath(c, "checks.ceske_polske_pisne_bijection.distinct_czech_ids", 59);
  expectPath(c, "checks.ceske_polske_pisne_bijection.distinct_polish_ids", 59);
  expectPath(c, "checks.graph_edges", 245);
  expectPath(c, "checks.graph_members", 348);
  expectPath(c, "checks.non_singleton_classes", 103);
  expectPath(c, "checks.graph_is_forest", true);
  expectPath(c, "checks.repertoire_pivots", 233);
  expectPath(c, "checks.effective_playable_songs", 442);
  expectPath(c, "checks.duplicate_undirected_edges", 0);
  expectPath(c, "checks.self_links", 0);
  expectPath(c, "checks.null_edge_endpoints", 0);
  expect(array(getPath(c, "checks.unresolved_reference_identities"), "C unresolved identities").length, 0, "C unresolved identities length");
  expectPath(c, "melody_class_statistics.singletons_remaining_after_import.total", 1450);
  expectPath(c, "melody_class_statistics.total_classes_after_import", 1553);
  expectPath(c, "repertoire_statistics.pivot_memberships", 233);
  expectPath(c, "repertoire_statistics.effective_playable_songs_after_equivalence.total", 442);
  expectPath(c, "manual_polish_edge_orientation_cleanup.new_edge.PolskeId", 144);
  expectPath(c, "manual_polish_edge_orientation_cleanup.new_edge.OdkazPolskeId", 142);

  if (!handoffText.includes("Status: **PASS**")) fail("Embedded HANDOFF.md is not PASS.");
  for (const token of ["CeskePisne`, **180**", "PolskePisne`, **6**", "CeskePolskePisne`, **59**", "VarhaniciPisne`, **343**", "233", "442", "245 = 348 - 103"]) {
    if (!handoffText.includes(token)) fail(`Embedded HANDOFF.md is missing expected contract evidence: ${token}`);
  }

  return { melodyClasses, pivots, classByIdentity, effectivePlayableIdentities };
}

export function resolveContractIdentities(contract: DefinitiveContract, referenceSongs: ReferenceSongIdentity[]): ResolvedContract {
  expect(referenceSongs.length, 1798, "Reference song count");
  expect(referenceSongs.filter((song) => song.language === "czech").length, 808, "Reference Czech song count");
  expect(referenceSongs.filter((song) => song.language === "polish").length, 990, "Reference Polish song count");
  const songIdByIdentity = new Map<string, string>();
  for (const song of referenceSongs) {
    const key = `${song.language}:${song.canonicalNumber}`;
    if (songIdByIdentity.has(key)) fail(`Duplicate Reference identity ${key}.`);
    const expectedId = key;
    expect(song.id, expectedId, `Stable Reference id for ${key}`);
    songIdByIdentity.set(key, song.id);
  }
  const required = new Set<string>();
  for (const melodyClass of contract.melodyClasses) for (const member of melodyClass.members) required.add(keyOf(member));
  for (const pivot of contract.pivots) required.add(keyOf(pivot));
  for (const key of required) if (!songIdByIdentity.has(key)) fail(`Definitive contract identity ${key} does not resolve in Reference catalog.`);

  const expectedClassBySongId = new Map(referenceSongs.map((song) => [song.id, `reference-melody:${song.id}`]));
  for (const melodyClass of contract.melodyClasses) {
    const anchor = [...melodyClass.members].sort(compareIdentity)[0];
    const anchorSongId = songIdByIdentity.get(keyOf(anchor))!;
    const classId = `reference-melody:${anchorSongId}`;
    for (const member of melodyClass.members) expectedClassBySongId.set(songIdByIdentity.get(keyOf(member))!, classId);
  }
  const pivotSongIds = new Set(contract.pivots.map((pivot) => songIdByIdentity.get(keyOf(pivot))!));
  const effectivePlayableSongIds = new Set([...contract.effectivePlayableIdentities].map((key) => songIdByIdentity.get(key)!));
  expect(pivotSongIds.size, 233, "Resolved repertoire pivots");
  expect(effectivePlayableSongIds.size, 442, "Resolved effective playable songs");
  return { songIdByIdentity, expectedClassBySongId, pivotSongIds, effectivePlayableSongIds };
}
