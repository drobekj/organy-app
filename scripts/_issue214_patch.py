from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text)

def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'pattern not found in {path}: {old[:120]!r}')
    if text.count(old) != 1:
        raise RuntimeError(f'pattern count {text.count(old)} in {path}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))

def insert_before(path, marker, addition):
    text = read(path)
    if marker not in text:
        raise RuntimeError(f'marker not found in {path}: {marker[:120]!r}')
    write(path, text.replace(marker, addition + marker, 1))

# 1. Candidate contract: explicit historical-truth mode.
replace_once(
    'src/application/interaction-contracts.ts',
    'export type CandidateQueryInput = { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string; queryText?: string; preferenceThreshold?: number; currentPlanId?: string; candidateUsages?: CandidateUsage[] };',
    'export type CandidateQueryInput = { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string; queryText?: string; preferenceThreshold?: number; currentPlanId?: string; candidateUsages?: CandidateUsage[]; historicalTruth?: boolean };',
)
replace_once(
    'src/application/interaction-contracts.ts',
    '  queryCandidates(songs: CatalogSong[], input: CandidateQueryInput): CandidateQueryResult[] {\n    const organistPersonId = input.organistPersonId;',
    '  queryCandidates(songs: CatalogSong[], input: CandidateQueryInput): CandidateQueryResult[] {\n    if (input.historicalTruth) return queryHistoricalTruthCatalogCandidates(songs, input.queryText);\n    const organistPersonId = input.organistPersonId;',
)
insert_before(
    'src/application/interaction-contracts.ts',
    '\nfunction getRecentMelodyClassIds(',
    '''\nfunction queryHistoricalTruthCatalogCandidates(songs: CatalogSong[], queryText?: string): CandidateQueryResult[] {
  const query = queryText?.trim().toLocaleLowerCase() ?? "";
  const zeroCandidates: CandidateQueryResult[] = (["czech", "polish"] as const).map((language) => ({
    songId: `historical-zero:${language}`,
    language,
    number: "0",
    title: "Historical zero value",
    equivalentNumbers: [],
    aggregatePreferenceScore: 0,
    antiphonMatch: false,
    seasonMatch: false,
    signal: "none",
    preferenceShade: "none",
    repertoire: false,
    availability: { kind: "available" },
    suppressedByMelodyWindow: false,
    orderKey: `historical:0:${language}`,
  }));
  const concrete = songs
    .filter((song) => !query || song.number.toLocaleLowerCase().includes(query) || song.title.toLocaleLowerCase().includes(query))
    .map((song): CandidateQueryResult => ({
      songId: song.songId,
      language: song.language,
      number: song.number,
      title: song.title,
      equivalentNumbers: [],
      aggregatePreferenceScore: 0,
      antiphonMatch: false,
      seasonMatch: false,
      signal: "none",
      preferenceShade: "none",
      repertoire: false,
      availability: { kind: "available" },
      suppressedByMelodyWindow: false,
      ...(song.sheetMusicUrl ? { sheetMusicUrl: song.sheetMusicUrl } : {}),
      orderKey: `historical:1:${song.language}:${song.number}:${song.songId}`,
    }));
  return [...zeroCandidates.filter((candidate) => !query || candidate.number.includes(query) || candidate.title.toLocaleLowerCase().includes(query)), ...concrete]
    .sort((left, right) => left.orderKey.localeCompare(right.orderKey, undefined, { numeric: true }));
}
''',
)

# 2. Candidate-flow browser input preserves the new mode.
replace_once(
    'src/planning-lifecycle/candidate-flow.ts',
    '  preferenceThreshold?: number;\n};',
    '  preferenceThreshold?: number;\n  historicalTruth?: boolean;\n};',
)
replace_once(
    'src/planning-lifecycle/candidate-flow.ts',
    '    candidateUsages: input.candidateUsages ?? [],\n  };',
    '    candidateUsages: input.candidateUsages ?? [],\n    ...(input.historicalTruth ? { historicalTruth: true } : {}),\n  };',
)

# 3. Authoritative candidate service: one neutral selectable row per concrete song + explicit zero; no filters/signals/grouping.
replace_once(
    'src/application/reference-candidate-service.ts',
    ') : ReferenceCandidateQueryResult[] {\n  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));',
    ') : ReferenceCandidateQueryResult[] {\n  if (input.historicalTruth) return queryHistoricalTruthReferenceCandidates(data.songs, input.queryText);\n  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));',
)
insert_before(
    'src/application/reference-candidate-service.ts',
    '\nexport function hydrateReferenceCandidatesFromData(',
    '''\nfunction queryHistoricalTruthReferenceCandidates(songs: ReferenceCandidateSong[], queryText?: string): ReferenceCandidateQueryResult[] {
  const query = queryText?.trim() ?? "";
  const zeroCandidates: ReferenceCandidateQueryResult[] = (["czech", "polish"] as const).map((language) => ({
    songId: `historical-zero:${language}`,
    language,
    number: "0",
    title: "Historical zero value",
    equivalentNumbers: [],
    melodyClassId: `historical-zero:${language}`,
    melodyMembers: [],
    aggregatePreferenceScore: 0,
    antiphonMatch: false,
    seasonMatch: false,
    signal: "none",
    preferenceShade: "none",
    repertoire: false,
    availability: { kind: "available" },
    suppressedByMelodyWindow: false,
    orderKey: `historical:0:${language}`,
  }));
  const concrete = songs
    .filter((song) => !query || matchesReferenceCandidateSearch(song, query))
    .map((song): ReferenceCandidateQueryResult => ({
      songId: song.id,
      language: song.language,
      number: song.displayNumber,
      title: song.title,
      equivalentNumbers: [],
      melodyClassId: `historical:${song.id}`,
      melodyMembers: [],
      aggregatePreferenceScore: 0,
      antiphonMatch: false,
      seasonMatch: false,
      signal: "none",
      preferenceShade: "none",
      repertoire: false,
      availability: { kind: "available" },
      suppressedByMelodyWindow: false,
      orderKey: `historical:1:${concreteOrderKey(song)}`,
    }));
  const q = query.toLocaleLowerCase();
  return [...zeroCandidates.filter((candidate) => !q || candidate.number.includes(q) || candidate.title.toLocaleLowerCase().includes(q)), ...concrete]
    .sort((left, right) => left.orderKey.localeCompare(right.orderKey, undefined, { numeric: true }));
}
''',
)

# 4. Strict DB route accepts boolean historicalTruth.
replace_once(
    'app/api/interaction/route.ts',
    'const allowed = new Set(["serviceDate", "serviceLanguage", "organistPersonId", "referenceAntiphonId", "referenceTopicId", "antiphonKey", "liturgicalSeasonKey", "queryText", "preferenceThreshold", "currentPlanId", "candidateUsages"]);',
    'const allowed = new Set(["serviceDate", "serviceLanguage", "organistPersonId", "referenceAntiphonId", "referenceTopicId", "antiphonKey", "liturgicalSeasonKey", "queryText", "preferenceThreshold", "currentPlanId", "candidateUsages", "historicalTruth"]);',
)
replace_once(
    'app/api/interaction/route.ts',
    '  if (input.preferenceThreshold !== undefined && (typeof input.preferenceThreshold !== "number" || !Number.isFinite(input.preferenceThreshold))) throw new LocalActorError("invalidInput", "preferenceThreshold must be a finite number.");\n  const candidateUsages = parseCandidateUsages(input.candidateUsages);',
    '  if (input.preferenceThreshold !== undefined && (typeof input.preferenceThreshold !== "number" || !Number.isFinite(input.preferenceThreshold))) throw new LocalActorError("invalidInput", "preferenceThreshold must be a finite number.");\n  if (input.historicalTruth !== undefined && typeof input.historicalTruth !== "boolean") throw new LocalActorError("invalidInput", "historicalTruth must be boolean.");\n  const candidateUsages = parseCandidateUsages(input.candidateUsages);',
)
replace_once(
    'app/api/interaction/route.ts',
    '    candidateUsages,\n  };',
    '    candidateUsages,\n    ...(input.historicalTruth === true ? { historicalTruth: true } : {}),\n  };',
)

# 5. Lifecycle ports expose derived revision state and atomic Completed invalidation IDs.
replace_once(
    'src/application/planning-lifecycle/ports.ts',
    'export type PersistedPlanningSet = PlanningSet & {\n  id: PlanningSetId;\n  serviceContext: ServiceContext;\n  completedAt?: Date;\n};',
    'export type PlanningSetRevisionState = { reason: string; conflictingCompletedRecordIds: string[] };\n\nexport type PersistedPlanningSet = PlanningSet & {\n  id: PlanningSetId;\n  serviceContext: ServiceContext;\n  completedAt?: Date;\n  needsRevision?: PlanningSetRevisionState;\n};',
)
replace_once(
    'src/application/planning-lifecycle/ports.ts',
    '  saveFinalSet(set: PlanningSet & { status: "final" }, serviceContext: ServiceContext, existingId?: PlanningSetId): Promise<PersistedPlanningSet>;\n  deleteById(id: PlanningSetId): Promise<void>;',
    '  saveFinalSet(set: PlanningSet & { status: "final" }, serviceContext: ServiceContext, existingId?: PlanningSetId): Promise<PersistedPlanningSet>;\n  demoteFinalToWorking(id: PlanningSetId): Promise<void>;\n  deleteById(id: PlanningSetId): Promise<void>;',
)
replace_once(
    'src/application/planning-lifecycle/ports.ts',
    '  update(id: CompletedServiceRecordId, serviceContext: ServiceContext, set: PlanningSet & { status: "final" }): Promise<CompletedServiceRecord>;',
    '  update(id: CompletedServiceRecordId, serviceContext: ServiceContext, set: PlanningSet & { status: "final" }, invalidatedPlanIds?: PlanningSetId[]): Promise<CompletedServiceRecord>;',
)
replace_once(
    'src/application/planning-lifecycle/index.ts',
    '  PersistedPlanningSet,\n  PlanningSetId,',
    '  PersistedPlanningSet,\n  PlanningSetRevisionState,\n  PlanningSetId,',
)

# 6. In-memory repositories support demotion and the same atomic-shaped update API.
replace_once(
    'src/application/planning-lifecycle/in-memory-repositories.ts',
    '  async deleteById(id: PlanningSetId): Promise<void> {',
    '  async demoteFinalToWorking(id: PlanningSetId): Promise<void> {\n    const current = this.sets.get(id);\n    if (current?.status === "final") this.sets.set(id, { ...current, status: "working" });\n  }\n\n  async deleteById(id: PlanningSetId): Promise<void> {',
)
replace_once(
    'src/application/planning-lifecycle/in-memory-repositories.ts',
    'export class InMemoryCompletedServiceRecordRepository implements CompletedServiceRecordRepository {\n  private readonly records = new Map<string, CompletedServiceRecord>();\n  private nextId = 1;',
    'export class InMemoryCompletedServiceRecordRepository implements CompletedServiceRecordRepository {\n  private readonly records = new Map<string, CompletedServiceRecord>();\n  private nextId = 1;\n\n  constructor(private readonly planningSets?: Pick<PlanningSetRepository, "demoteFinalToWorking">) {}',
)
replace_once(
    'src/application/planning-lifecycle/in-memory-repositories.ts',
    '  async update(id: string, serviceContext: ServiceContext, set: PlanningSet & { status: "final" }): Promise<CompletedServiceRecord> {',
    '  async update(id: string, serviceContext: ServiceContext, set: PlanningSet & { status: "final" }, invalidatedPlanIds: PlanningSetId[] = []): Promise<CompletedServiceRecord> {',
)
replace_once(
    'src/application/planning-lifecycle/in-memory-repositories.ts',
    '    this.records.set(id, updated);\n    return cloneCompletedServiceRecord(updated);',
    '    this.records.set(id, updated);\n    for (const planId of invalidatedPlanIds) await this.planningSets?.demoteFinalToWorking(planId);\n    return cloneCompletedServiceRecord(updated);',
)

# 7. PostgreSQL adapters: configured non-repeat window + atomic Final demotion during Completed correction.
replace_once(
    'src/application/planning-lifecycle/drizzle-repository-adapters.ts',
    '  serviceSetRows,\n  serviceSets,',
    '  serviceSetRows,\n  serviceSets,\n  melodyNonRepetitionConfig,',
)
replace_once(
    'src/application/planning-lifecycle/drizzle-repository-adapters.ts',
    '  async deleteById(id: PlanningSetId): Promise<void> {',
    '  async demoteFinalToWorking(id: PlanningSetId): Promise<void> {\n    const numericId = parsePlanningSetId(id);\n    if (numericId === undefined) return;\n    await updateTable(this.dependencies.db, serviceSets)\n      .set({ status: "working", updatedAt: new Date() })\n      .where(eq(serviceSets.id, numericId));\n  }\n\n  async deleteById(id: PlanningSetId): Promise<void> {',
)
replace_once(
    'src/application/planning-lifecycle/drizzle-repository-adapters.ts',
    '  async update(id: string, serviceContext: ServiceContext, set: PlanningSet & { status: "final" }): Promise<CompletedServiceRecord> {',
    '  async update(id: string, serviceContext: ServiceContext, set: PlanningSet & { status: "final" }, invalidatedPlanIds: PlanningSetId[] = []): Promise<CompletedServiceRecord> {',
)
replace_once(
    'src/application/planning-lifecycle/drizzle-repository-adapters.ts',
    '      await replaceCompletedRows(tx, numericId, set.rows, now);\n      const [updated] =',
    '      await replaceCompletedRows(tx, numericId, set.rows, now);\n      for (const planId of invalidatedPlanIds) {\n        const planNumericId = parsePlanningSetId(planId);\n        if (planNumericId !== undefined) await updateTable(tx, serviceSets).set({ status: "working", updatedAt: now }).where(eq(serviceSets.id, planNumericId));\n      }\n      const [updated] =',
)
replace_once(
    'src/application/planning-lifecycle/drizzle-repository-adapters.ts',
    '    referenceMelodyClasses: dependencies.referenceMelodyClasses,\n    now: dependencies.now,',
    '    referenceMelodyClasses: dependencies.referenceMelodyClasses,\n    melodyNonRepetitionMonths: async () => {\n      const rows = await dependencies.db.select({ months: melodyNonRepetitionConfig.months }).from(melodyNonRepetitionConfig).limit(1);\n      return Number(rows[0]?.months ?? 2);\n    },\n    now: dependencies.now,',
)

# 8. Planning service: relaxed historical rows, retroactive invalidation, derived Needs revision, and server enforcement.
replace_once(
    'src/application/planning-lifecycle/service.ts',
    '  referenceMelodyClasses?: ReferenceMelodyClassProvider;\n  now?: () => Date;',
    '  referenceMelodyClasses?: ReferenceMelodyClassProvider;\n  melodyNonRepetitionMonths?: () => number | Promise<number>;\n  now?: () => Date;',
)
replace_once(
    'src/application/planning-lifecycle/service.ts',
    '  allowLanguageDeviations?: boolean;\n};\n\nexport type DeleteCompletedRecordInput',
    '  allowLanguageDeviations?: boolean;\n  acceptPlanInvalidation?: boolean;\n};\n\nexport type DeleteCompletedRecordInput',
)
replace_once(
    'src/application/planning-lifecycle/service.ts',
    '  private readonly referenceMelodyClasses?: ReferenceMelodyClassProvider;\n  private readonly enforceCatalogSelections: boolean;',
    '  private readonly referenceMelodyClasses?: ReferenceMelodyClassProvider;\n  private readonly melodyNonRepetitionMonths: () => Promise<number>;\n  private readonly enforceCatalogSelections: boolean;',
)
replace_once(
    'src/application/planning-lifecycle/service.ts',
    '    this.referenceMelodyClasses = dependencies.referenceMelodyClasses;\n    this.enforceCatalogSelections = dependencies.enforceCatalogSelections ?? true;',
    '    this.referenceMelodyClasses = dependencies.referenceMelodyClasses;\n    this.melodyNonRepetitionMonths = async () => Number(await dependencies.melodyNonRepetitionMonths?.() ?? 2);\n    this.enforceCatalogSelections = dependencies.enforceCatalogSelections ?? true;',
)
replace_once(
    'src/application/planning-lifecycle/service.ts',
    '  async listPlanningSets(): Promise<PlanningServiceResult<PersistedPlanningSet[]>> {\n    await this.reconcilePastFinalSets();\n    return success(await this.planningSets.list());\n  }',
    '  async listPlanningSets(): Promise<PlanningServiceResult<PersistedPlanningSet[]>> {\n    await this.reconcilePastFinalSets();\n    return success(await this.annotateRevisionStates(await this.planningSets.list()));\n  }',
)
replace_once(
    'src/application/planning-lifecycle/service.ts',
    '  async loadPlanningSet(setId: PlanningSetId): Promise<PlanningServiceResult<PersistedPlanningSet>> {\n    const set = await this.planningSets.findById(setId);\n    return set ? success(set) : failure({ code: "notFound", message: "Planning set was not found." });\n  }',
    '  async loadPlanningSet(setId: PlanningSetId): Promise<PlanningServiceResult<PersistedPlanningSet>> {\n    const set = await this.planningSets.findById(setId);\n    if (!set) return failure({ code: "notFound", message: "Planning set was not found." });\n    return success((await this.annotateRevisionStates([set]))[0]);\n  }',
)
replace_once(
    'src/application/planning-lifecycle/service.ts',
    '    const duplicate = await this.findDuplicateService(serviceContext, input.existingSetId);\n    if (duplicate) {\n      return failure({ code: "invalidInput", message: `A service already exists for ${serviceContext.serviceDate} at ${serviceContext.serviceTime}.` });\n    }\n\n    return success(await this.planningSets.saveWorkingSet',
    '    const duplicate = await this.findDuplicateService(serviceContext, input.existingSetId);\n    if (duplicate) {\n      return failure({ code: "invalidInput", message: `A service already exists for ${serviceContext.serviceDate} at ${serviceContext.serviceTime}.` });\n    }\n\n    const historyConflicts = await this.findHistoryConflictsForPlan({ ...(normalized.set as PlanningSet & { status: "working" }), id: input.existingSetId ?? "candidate", serviceContext: normalized.serviceContext });\n    if (historyConflicts.length > 0) return failure({ code: "invalidInput", message: "Working planning set conflicts with authoritative Completed history.", issues: historyConflicts.map((conflict) => ({ path: "historyNonRepeat", message: conflict.reason })) });\n\n    return success(await this.planningSets.saveWorkingSet',
)
replace_once(
    'src/application/planning-lifecycle/service.ts',
    '    const persistedFinalSet = await this.planningSets.saveFinalSet(',
    '    const historyConflicts = await this.findHistoryConflictsForPlan({ ...workingSet, status: "final", rows: finalSet.rows });\n    if (historyConflicts.length > 0) return failure({ code: "invalidInput", message: "Final planning set conflicts with authoritative Completed history.", issues: historyConflicts.map((conflict) => ({ path: "historyNonRepeat", message: conflict.reason })) });\n\n    const persistedFinalSet = await this.planningSets.saveFinalSet(',
)
# Replace the whole Completed update method using stable method boundaries.
service = read('src/application/planning-lifecycle/service.ts')
start = service.index('  async updateCompletedRecord(input: UpdateCompletedRecordInput): Promise<PlanningServiceResult<CompletedServiceRecord>> {')
end = service.index('\n  async deleteCompletedRecord(', start)
new_method = '''  async updateCompletedRecord(input: UpdateCompletedRecordInput): Promise<PlanningServiceResult<CompletedServiceRecord>> {
    if (!canPerformPlanningAction(input.role, "editCompletedServiceRecord")) {
      return failure({ code: "permissionDenied", message: "Only admin can edit completed service records." });
    }
    const existing = await this.completedServiceRecords.findById(input.recordId);
    if (!existing) return failure({ code: "notFound", message: "Completed record was not found." });

    const rawServiceContext: ServiceContext = normalizeServiceContext(input.serviceContext);
    const serviceContextIssues = validateSaveWorkingSetServiceContext(rawServiceContext, input.set);
    if (serviceContextIssues.length > 0) return failure({ code: "invalidInput", message: "Service context is required before saving completed changes.", issues: serviceContextIssues });

    const antiphonContext = await this.validateAndNormalizeReferenceAntiphon(rawServiceContext, existing);
    if (!antiphonContext.success) return antiphonContext;
    const topicContext = await this.validateAndNormalizeReferenceTopic(antiphonContext.value, existing);
    if (!topicContext.success) return topicContext;
    const normalized = await this.validateAndNormalizeCatalogReferences(topicContext.value, input.set, existing, true, true);
    if (normalized.issues.length > 0) return failure({ code: "invalidInput", message: "Historical song references are invalid.", issues: normalized.issues });

    const historicalValidation = validateHistoricalCompletedSet(normalized.set);
    if (historicalValidation.length > 0) return failure({ code: "invalidInput", message: "Completed historical rows are malformed.", issues: historicalValidation });

    const duplicate = await this.findDuplicateService(normalized.serviceContext, undefined, input.recordId);
    if (duplicate) return failure({ code: "invalidInput", message: `A service already exists for ${normalized.serviceContext.serviceDate} at ${normalized.serviceContext.serviceTime}.` });

    const proposed: CompletedServiceRecord = {
      ...existing,
      serviceContext: normalized.serviceContext,
      set: { status: "final", language: normalized.serviceContext.language, rows: normalized.set.rows },
    };
    const [currentImpact, proposedImpact] = await Promise.all([
      this.findPlansImpactedByCompleted(existing),
      this.findPlansImpactedByCompleted(proposed),
    ]);
    const currentIds = new Set(currentImpact.map((impact) => impact.planId));
    const newlyImpacted = proposedImpact.filter((impact) => !currentIds.has(impact.planId));
    if (newlyImpacted.length > 0 && input.acceptPlanInvalidation !== true) {
      return failure({
        code: "invalidInput",
        message: "Completed correction would invalidate active plans. Confirmation is required.",
        issues: newlyImpacted.map((impact) => ({
          path: `retroactivePlan.${impact.planId}`,
          message: `${impact.reason} ${impact.planStatus === "final" ? "This Final plan will move to Working." : "This Working plan will require revision."}`,
        })),
      });
    }

    try {
      return success(await this.completedServiceRecords.update(input.recordId, normalized.serviceContext, proposed.set, newlyImpacted.map((impact) => impact.planId)));
    } catch {
      return failure({ code: "notFound", message: "Completed record was not found." });
    }
  }
'''
write('src/application/planning-lifecycle/service.ts', service[:start] + new_method + service[end:])

# Extend catalog normalization for literal historical zero and add helpers before validateFinalPeople.
replace_once(
    'src/application/planning-lifecycle/service.ts',
    '  private async validateAndNormalizeCatalogReferences<TSet extends PlanningSet>(serviceContext: ServiceContext, set: TSet, existing?: PersistedPlanningSet | CompletedServiceRecord, allowLanguageDeviations = false): Promise<{ serviceContext: ServiceContext; set: TSet; issues: { path: string; message: string }[] }> {',
    '  private async validateAndNormalizeCatalogReferences<TSet extends PlanningSet>(serviceContext: ServiceContext, set: TSet, existing?: PersistedPlanningSet | CompletedServiceRecord, allowLanguageDeviations = false, allowHistoricalTruthRows = false): Promise<{ serviceContext: ServiceContext; set: TSet; issues: { path: string; message: string }[] }> {',
)
replace_once(
    'src/application/planning-lifecycle/service.ts',
    '    for (const [index, row] of normalizedRows.entries()) {\n      if (!row.song) continue;\n      if (!row.song.songId) { issues.push({ path: `rows.${index}.song`, message: "Song must be selected from the song catalog." }); continue; }',
    '    for (const [index, row] of normalizedRows.entries()) {\n      if (!row.song) continue;\n      if (allowHistoricalTruthRows && row.song.number.trim() === "0") {\n        if (row.song.language !== "czech" && row.song.language !== "polish") issues.push({ path: `rows.${index}.song.language`, message: "Historical zero must retain Czech or Polish language." });\n        else row.song = { language: row.song.language, number: "0" };\n        continue;\n      }\n      if (!row.song.songId) { issues.push({ path: `rows.${index}.song`, message: "Positive historical song number must be selected from the catalog." }); continue; }',
)
insert_before(
    'src/application/planning-lifecycle/service.ts',
    '  private async validateFinalPeople(',
    '''  private async annotateRevisionStates(sets: PersistedPlanningSet[]): Promise<PersistedPlanningSet[]> {
    if (!this.referenceMelodyClasses || sets.length === 0) return sets;
    return Promise.all(sets.map(async (set) => {
      const conflicts = await this.findHistoryConflictsForPlan(set);
      if (conflicts.length === 0) return { ...set, needsRevision: undefined };
      return {
        ...set,
        needsRevision: {
          reason: `Needs revision: ${conflicts.map((conflict) => conflict.reason).join(" ")}`,
          conflictingCompletedRecordIds: [...new Set(conflicts.map((conflict) => conflict.completedRecordId))],
        },
      };
    }));
  }

  private async findPlansImpactedByCompleted(record: CompletedServiceRecord): Promise<HistoryConflict[]> {
    const plans = await this.planningSets.list();
    const impacts: HistoryConflict[] = [];
    for (const plan of plans) impacts.push(...await this.findHistoryConflictsForPlan(plan, [record]));
    return impacts;
  }

  private async findHistoryConflictsForPlan(plan: PersistedPlanningSet, completedOverride?: CompletedServiceRecord[]): Promise<HistoryConflict[]> {
    if (!this.referenceMelodyClasses) return [];
    const completed = completedOverride ?? await this.completedServiceRecords.list();
    if (completed.length === 0) return [];
    const months = Math.max(0, Math.floor(await this.melodyNonRepetitionMonths()));
    const planSongIds = plan.rows.flatMap((row) => row.song?.songId ? [row.song.songId] : []);
    const completedSongIds = completed.flatMap((record) => record.set.rows.flatMap((row) => row.song?.songId ? [row.song.songId] : []));
    const allIds = [...new Set([...planSongIds, ...completedSongIds])];
    const memberships = await this.referenceMelodyClasses.getClassMemberships(allIds);
    const classBySong = new Map(memberships.map((membership) => [membership.songId, membership.melodyClassId]));
    const classOf = (songId: string) => classBySong.get(songId) ?? `reference-singleton:${songId}`;
    const conflicts: HistoryConflict[] = [];
    for (const record of completed) {
      if (!isWithinCalendarMonths(plan.serviceContext.serviceDate, record.serviceContext.serviceDate, months)) continue;
      let found: HistoryConflict | undefined;
      for (const planRow of plan.rows) {
        if (!planRow.song?.songId) continue;
        for (const historicalRow of record.set.rows) {
          if (!historicalRow.song?.songId || classOf(planRow.song.songId) !== classOf(historicalRow.song.songId)) continue;
          found = {
            planId: plan.id,
            planStatus: plan.status,
            completedRecordId: record.id,
            reason: `${plan.serviceContext.serviceDate} ${plan.serviceContext.serviceTime}: song ${planRow.song.number} conflicts with Completed ${record.serviceContext.serviceDate} ${record.serviceContext.serviceTime}, song ${historicalRow.song.number}, within the ${months}-month melody non-repetition period.`,
          };
          break;
        }
        if (found) break;
      }
      if (found) conflicts.push(found);
    }
    return conflicts;
  }

''',
)
# Add top-level helper types/functions near normalizeServiceContext.
insert_before(
    'src/application/planning-lifecycle/service.ts',
    '\nfunction normalizeServiceContext(',
    '''\ntype HistoryConflict = { planId: PlanningSetId; planStatus: "working" | "final"; completedRecordId: string; reason: string };

function validateHistoricalCompletedSet(set: PlanningSet): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (set.status !== "final") issues.push({ path: "status", message: "Completed snapshot status must be final." });
  if (set.language !== "czech" && set.language !== "polish" && set.language !== "mixed") issues.push({ path: "language", message: "Completed snapshot language is invalid." });
  if (!Array.isArray(set.rows)) return [...issues, { path: "rows", message: "Completed rows must be an array." }];
  set.rows.forEach((row, index) => {
    if (!row || typeof row !== "object") { issues.push({ path: `rows.${index}`, message: "Historical row is malformed." }); return; }
    if (!row.song) return;
    if ((row.song.language !== "czech" && row.song.language !== "polish") || typeof row.song.number !== "string" || !row.song.number.trim()) issues.push({ path: `rows.${index}.song`, message: "Historical song reference is malformed." });
    if (row.song.songId !== undefined && (typeof row.song.songId !== "string" || !row.song.songId.trim())) issues.push({ path: `rows.${index}.song.songId`, message: "Historical catalog song ID is malformed." });
  });
  return issues;
}

function isWithinCalendarMonths(leftDate: string, rightDate: string, months: number): boolean {
  const left = Date.parse(`${leftDate}T00:00:00Z`);
  const right = Date.parse(`${rightDate}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return right >= addMonthsUtc(left, -months) && right <= addMonthsUtc(left, months);
}
function addMonthsUtc(value: number, months: number): number {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate());
}
''',
)

# 9. Lifecycle route must use service for derived revision state on load.
replace_once(
    'app/api/planning-lifecycle/route.ts',
    '    if (body.action === "loadPlanningSet") {\n      const setId = isObjectWithSetId(body.input) ? body.input.setId : undefined;\n      if (!setId) return invalidInput("setId is required.");\n      const set = await planningSets.findById(setId);\n      return NextResponse.json(set ? { success: true, value: set } : { success: false, error: { code: "notFound", message: "Planning set was not found." } });\n    }',
    '    if (body.action === "loadPlanningSet") {\n      const setId = isObjectWithSetId(body.input) ? body.input.setId : undefined;\n      if (!setId) return invalidInput("setId is required.");\n      return NextResponse.json(await readService.loadPlanningSet(setId));\n    }',
)

# 10. Planning client: historical candidate mode, no row planning validation, retro-confirmation, red Plans state.
client_path = 'app/planning-lifecycle-client.tsx'
client = read(client_path)
client = client.replace('preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages> }): Promise<CandidateQueryResult[]>;', 'preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages>; historicalTruth?: boolean }): Promise<CandidateQueryResult[]>;')
client = client.replace('preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages> }) { return unwrapCandidateResponse', 'preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages>; historicalTruth?: boolean }) { return unwrapCandidateResponse')
client = client.replace('preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages> }) {\n    const result = await this.service.queryCandidates', 'preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages>; historicalTruth?: boolean }) {\n    const result = await this.service.queryCandidates')
client = client.replace('completedServiceRecords: new InMemoryCompletedServiceRecordRepository(),', 'completedServiceRecords: new InMemoryCompletedServiceRecordRepository(planningSets),') if 'const planningSets =' in client else client
# Rebuild repository useMemo explicitly.
old_repo = '''  const repositories = useMemo<PlanningRepositories>(
    () => ({
      planningSets: new InMemoryPlanningSetRepository(),
      completedServiceRecords: new InMemoryCompletedServiceRecordRepository(),
    }),
    [],
  );'''
new_repo = '''  const repositories = useMemo<PlanningRepositories>(() => {
    const planningSets = new InMemoryPlanningSetRepository();
    return { planningSets, completedServiceRecords: new InMemoryCompletedServiceRecordRepository(planningSets) };
  }, []);'''
if old_repo not in client: raise RuntimeError('client repository pattern missing')
client = client.replace(old_repo, new_repo, 1)
# Completed row validation is deliberately bypassed.
client = client.replace('const hasValidationErrors = validationResults.some((result) => !result.valid);', 'const hasValidationErrors = !completedRecord && validationResults.some((result) => !result.valid);', 1)
client = client.replace('const hasEmptyRowValidation = validationResults.some((result) => result.issues.some((issue) => issue.path === "row"));', 'const hasEmptyRowValidation = !isCompletedRecordOpen && validationResults.some((result) => result.issues.some((issue) => issue.path === "row"));', 1)
client = client.replace('    ...validationResults.flatMap((result, index) => result.issues\n      .filter((issue) => issue.path !== "row")', '    ...(!isCompletedRecordOpen ? validationResults : []).flatMap((result, index) => result.issues\n      .filter((issue) => issue.path !== "row")', 1)
# Historical candidate query payload: no organist/repertoire, usage, language filter effects or signal inputs.
old_query = 'const candidates = await interactionClient.queryCandidates({ serviceDate, serviceLanguage: languageAtRequest, organistPersonId: organistId, referenceAntiphonId: referenceAntiphon?.id, referenceTopicId: referenceTopic?.id, antiphonKey: candidateAntiphonKey, liturgicalSeasonKey: candidateSeasonKey, queryText: value, preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD, candidateUsages: getCanonicalCandidateUsages(rowId), currentPlanId: persistedSet?.id });'
new_query = 'const candidates = await interactionClient.queryCandidates(isCompletedRecordOpen ? { serviceDate, serviceLanguage: languageAtRequest, queryText: value, candidateUsages: [], historicalTruth: true } : { serviceDate, serviceLanguage: languageAtRequest, organistPersonId: organistId, referenceAntiphonId: referenceAntiphon?.id, referenceTopicId: referenceTopic?.id, antiphonKey: candidateAntiphonKey, liturgicalSeasonKey: candidateSeasonKey, queryText: value, preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD, candidateUsages: getCanonicalCandidateUsages(rowId), currentPlanId: persistedSet?.id });'
if old_query not in client: raise RuntimeError('client query pattern missing')
client = client.replace(old_query, new_query, 1)
old_detail = '''      const candidates = await interactionClient.queryCandidates({
        serviceDate,
        serviceLanguage,
        organistPersonId: organistId,
        referenceAntiphonId: referenceAntiphon?.id,
        referenceTopicId: referenceTopic?.id,
        antiphonKey: candidateAntiphonKey,
        liturgicalSeasonKey: candidateSeasonKey,
        queryText: "",
        preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD,
        candidateUsages: getCanonicalCandidateUsages(rowId),
        currentPlanId: persistedSet?.id,
      });'''
new_detail = '''      const candidates = await interactionClient.queryCandidates(isCompletedRecordOpen ? {
        serviceDate,
        serviceLanguage,
        queryText: "",
        candidateUsages: [],
        historicalTruth: true,
      } : {
        serviceDate,
        serviceLanguage,
        organistPersonId: organistId,
        referenceAntiphonId: referenceAntiphon?.id,
        referenceTopicId: referenceTopic?.id,
        antiphonKey: candidateAntiphonKey,
        liturgicalSeasonKey: candidateSeasonKey,
        queryText: "",
        preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD,
        candidateUsages: getCanonicalCandidateUsages(rowId),
        currentPlanId: persistedSet?.id,
      });'''
if old_detail not in client: raise RuntimeError('client detail query pattern missing')
client = client.replace(old_detail, new_detail, 1)
# Organist helper is truthful in Completed.
client = client.replace('{organistId ? "Selected organist; repertoire filter is active." : "Anonymous: repertoire filter is not applied while choosing candidates."}', '{isCompletedRecordOpen ? "Historical truth mode: no Planning filters are applied." : organistId ? "Selected organist; repertoire filter is active." : "Anonymous: repertoire filter is not applied while choosing candidates."}', 1)
# Plans list: derived warning and red contour.
old_working = '{activeRecordGroups.working.length === 0 ? <p className="field-help">No working plans saved yet.</p> : <ul className="saved-set-list">{activeRecordGroups.working.map((set) => <li key={set.id} className={recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === "active" && lastSavedRecord.id === set.id)}><button type="button" onClick={() => loadDbSet(set.id)}>{formatPlanningSetSummary(set)}</button></li>)}</ul>}'
new_working = '{activeRecordGroups.working.length === 0 ? <p className="field-help">No working plans saved yet.</p> : <ul className="saved-set-list">{activeRecordGroups.working.map((set) => <li key={set.id} className={`${recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === "active" && lastSavedRecord.id === set.id)}${set.needsRevision ? " needs-revision-record" : ""}`}><button type="button" onClick={() => loadDbSet(set.id)}>{formatPlanningSetSummary(set)}</button>{set.needsRevision && <p className="needs-revision-message" role="alert">{set.needsRevision.reason}</p>}</li>)}</ul>}'
if old_working not in client: raise RuntimeError('working list pattern missing')
client = client.replace(old_working, new_working, 1)
old_final = '{activeRecordGroups.final.length === 0 ? <p className="field-help">No final plans saved yet.</p> : <ul className="saved-set-list">{activeRecordGroups.final.map((set) => <li key={set.id} className={recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === "active" && lastSavedRecord.id === set.id)}><button type="button" onClick={() => loadDbSet(set.id)}>{formatPlanningSetSummary(set)}</button></li>)}</ul>}'
new_final = '{activeRecordGroups.final.length === 0 ? <p className="field-help">No final plans saved yet.</p> : <ul className="saved-set-list">{activeRecordGroups.final.map((set) => <li key={set.id} className={`${recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === "active" && lastSavedRecord.id === set.id)}${set.needsRevision ? " needs-revision-record" : ""}`}><button type="button" onClick={() => loadDbSet(set.id)}>{formatPlanningSetSummary(set)}</button>{set.needsRevision && <p className="needs-revision-message" role="alert">{set.needsRevision.reason}</p>}</li>)}</ul>}'
if old_final not in client: raise RuntimeError('final list pattern missing')
client = client.replace(old_final, new_final, 1)
# Replace saveCompletedChanges entirely.
start = client.index('  async function saveCompletedChanges() {')
end = client.index('\n  async function deleteCompletedRecord()', start)
new_save_completed = '''  async function saveCompletedChanges() {
    if (!completedRecord || selectedRole !== "admin") return;
    if (hasAntiphonLanguageMismatch) { setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." }); setSaveState("errors"); return; }
    if (hasTopicLanguageMismatch) { setServiceError({ code: "invalidInput", message: "Selected topic must match the service language." }); setSaveState("errors"); return; }
    if (hasInvalidLookupState) { setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving." }); setSaveState("errors"); return; }

    const baseInput = {
      role: selectedRole,
      ...({ localActorUserId: activeActor.userId } as Record<string, string>),
      recordId: completedRecord.id,
      serviceContext: {
        serviceDate,
        serviceTime: normalizeServiceTime(serviceTime),
        language: serviceLanguage,
        priest: { ...(priestId ? { id: priestId } : {}), displayName: priest },
        organist: { ...(organistId ? { id: organistId } : {}), displayName: organist },
        ...(serviceNote.trim() ? { note: serviceNote.trim() } : {}),
        ...(referenceAntiphon ? { referenceAntiphon: { ...referenceAntiphon } } : {}),
        ...(referenceTopic ? { referenceTopic: { ...referenceTopic } } : {}),
        ...(candidateAntiphonKey.trim() ? { antiphonKey: candidateAntiphonKey.trim() } : {}),
        ...(candidateSeasonKey.trim() ? { liturgicalSeasonKey: candidateSeasonKey.trim() } : {}),
      },
      set: { status: "final" as const, language: serviceLanguage, rows: planningRows },
    };
    let result = await planningLifecycleService.updateCompletedRecord(baseInput);
    if (!result.success) {
      const retroIssues = result.error.issues?.filter((issue: { path: string }) => issue.path.startsWith("retroactivePlan.")) ?? [];
      if (retroIssues.length > 0) {
        const accepted = window.confirm(`This historical correction invalidates active plans:\n\n${retroIssues.map((issue: { message: string }) => `• ${issue.message}`).join("\n")}\n\nSave the correction and mark those plans for revision?`);
        if (accepted) result = await planningLifecycleService.updateCompletedRecord({ ...baseInput, acceptPlanInvalidation: true });
      }
    }
    if (!result.success) { setServiceError(result.error); setSaveState("errors"); return; }

    setLastSavedRecord({ kind: "completed", id: result.value.id });
    setServiceError(null);
    setSaveState("completed");
    const refreshed = await refreshDbSets();
    startNewDraftAfterSuccess(refreshed.draftPeopleDefaults);
    setWorkspace(getWorkspaceAfterCompletedUpdate());
  }
'''
client = client[:start] + new_save_completed + client[end:]
# Completed save button does not use planning-row validation.
client = client.replace('disabled={!hasServiceContext || hasValidationErrors || hasInvalidLookupState || hasAntiphonLanguageMismatch}>\n                      Save completed changes', 'disabled={!hasServiceContext || hasInvalidLookupState || hasAntiphonLanguageMismatch}>\n                      Save completed changes', 1)
write(client_path, client)

# CSS for system-derived invalid plan state.
with (ROOT / 'app/globals.css').open('a') as f:
    f.write('''\n\n.needs-revision-record {\n  border: 2px solid var(--danger);\n  border-radius: 0.85rem;\n  padding: 0.35rem;\n}\n.needs-revision-record > button {\n  outline: none;\n}\n.needs-revision-message {\n  color: var(--danger);\n  font-size: 0.875rem;\n  font-weight: 700;\n  margin: 0.35rem 0.5rem 0.25rem;\n}\n''')

# 11. Safe Account and Person deletion backend.
insert_before(
    'src/application/protected-account-admin.ts',
    '  private async requireAdmin(headers: Headers) {',
    '''  async deleteAccount(headers: Headers, input: { appUserId?: unknown }) {
    const currentAdmin = await this.requireAdmin(headers);
    const appUserId = requireText(input.appUserId, "Application user is required.");
    if (currentAdmin.id === appUserId) throw new ProtectedAccountAdminError("permissionDenied", "Sign in as another admin before deleting your own protected Account.");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await serializeAdminMutation(client);
      const target = await requireLinkedTarget(client, appUserId);
      if (target.active && target.roles.includes("admin")) await assertAnotherActiveAdmin(client, appUserId);
      await client.query("delete from auth_sessions where user_id = $1", [target.authUserId]);
      await client.query("delete from auth_users where id = $1", [target.authUserId]);
      await client.query("commit");
      return { appUserId, deletedAuthUserId: target.authUserId, currentAdminLostAccess: false as const };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw normalizeAdminError(error);
    } finally { client.release(); }
  }

  async deletePerson(headers: Headers, input: { personId?: unknown }) {
    await this.requireAdmin(headers);
    const personId = requireText(input.personId, "Person is required.");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await serializeAdminMutation(client);
      const person = await client.query("select id, display_name from catalog_persons where id = $1 for update", [personId]);
      if (!person.rows[0]) throw new ProtectedAccountAdminError("notFound", "Person was not found.");
      const serviceUse = await client.query("select 1 from service_contexts where priest_id = $1 or organist_id = $1 limit 1", [personId]);
      if (serviceUse.rows[0]) throw new ProtectedAccountAdminError("conflict", "Person is referenced by service history or an active plan. Deactivate the Person instead of deleting it.");
      const protectedUse = await client.query(`select 1 from app_users u join protected_account_actor_links l on l.app_user_id = u.id where u.person_id = $1 limit 1`, [personId]);
      if (protectedUse.rows[0]) throw new ProtectedAccountAdminError("conflict", "Delete the protected Account before deleting this Person.");
      await client.query("delete from app_users where person_id = $1", [personId]);
      await client.query("delete from catalog_persons where id = $1", [personId]);
      await client.query("commit");
      return { personId, displayName: String(person.rows[0].display_name), currentAdminLostAccess: false as const };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw normalizeAdminError(error);
    } finally { client.release(); }
  }

''',
)
# Protected route parses personId and actions.
replace_once(
    'app/api/protected-accounts/route.ts',
    '        appUserId: form.get("appUserId"),\n        username:',
    '        appUserId: form.get("appUserId"),\n        personId: form.get("personId"),\n        username:',
)
replace_once(
    'app/api/protected-accounts/route.ts',
    '  if (action === "resetPassword") {\n    const payload = await service.resetPassword(headers, { appUserId: input.appUserId, password: input.password });\n    return { payload, message: "Protected Account password reset. Existing sessions were revoked.", currentAdminLostAccess: false };\n  }\n  throw new ProtectedAccountAdminError',
    '  if (action === "resetPassword") {\n    const payload = await service.resetPassword(headers, { appUserId: input.appUserId, password: input.password });\n    return { payload, message: "Protected Account password reset. Existing sessions were revoked.", currentAdminLostAccess: false };\n  }\n  if (action === "deleteAccount") {\n    const payload = await service.deleteAccount(headers, { appUserId: input.appUserId });\n    return { payload, message: "Protected Account deleted. Person and service history were preserved.", currentAdminLostAccess: false };\n  }\n  if (action === "deletePerson") {\n    const payload = await service.deletePerson(headers, { personId: input.personId });\n    return { payload, message: "Person permanently deleted.", currentAdminLostAccess: false };\n  }\n  throw new ProtectedAccountAdminError',
)
# Tiny confirm component.
write('app/admin/accounts/confirm-submit-button.tsx', '''"use client";\n\nimport type { ReactNode } from "react";\n\nexport function ConfirmSubmitButton({ message, children }: { message: string; children: ReactNode }) {\n  return <button type="submit" onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}>{children}</button>;\n}\n''')
# Account editor deletion form.
replace_once(
    'app/admin/accounts/protected-account-editor.tsx',
    'import { PasswordVisibilityField } from "../../password-visibility-field";',
    'import { PasswordVisibilityField } from "../../password-visibility-field";\nimport { ConfirmSubmitButton } from "./confirm-submit-button";',
)
replace_once(
    'app/admin/accounts/protected-account-editor.tsx',
    '    {canResetPassword ? <form action="/api/protected-accounts" method="post" className="planning-form">',
    '    {canResetPassword && <form action="/api/protected-accounts" method="post">\n      <input type="hidden" name="action" value="deleteAccount" />\n      <input type="hidden" name="appUserId" value={account.appUserId} />\n      <ConfirmSubmitButton message={`Delete protected Account ${account.username}? The Person and service history will be preserved.`}>Delete Account</ConfirmSubmitButton>\n    </form>}\n    {canResetPassword ? <form action="/api/protected-accounts" method="post" className="planning-form">',
)
# Account page all-Person safe deletion list.
replace_once(
    'app/admin/accounts/page.tsx',
    'import { ProtectedStaffOnboardingForm } from "./protected-staff-onboarding-form";',
    'import { ProtectedStaffOnboardingForm } from "./protected-staff-onboarding-form";\nimport { ConfirmSubmitButton } from "./confirm-submit-button";',
)
replace_once(
    'app/admin/accounts/page.tsx',
    '  const staffPeople = peopleResult.rows.map((row) => ({ id: String(row.id), displayName: String(row.display_name), priest: Boolean(row.priest), organist: Boolean(row.organist) }));\n  const params = await searchParams;',
    '  const staffPeople = peopleResult.rows.map((row) => ({ id: String(row.id), displayName: String(row.display_name), priest: Boolean(row.priest), organist: Boolean(row.organist) }));\n  const allPeopleResult = await authPool.query(`select id, display_name, active, priest, organist from catalog_persons order by lower(display_name)`);\n  const allPeople = allPeopleResult.rows.map((row) => ({ id: String(row.id), displayName: String(row.display_name), active: Boolean(row.active), priest: Boolean(row.priest), organist: Boolean(row.organist) }));\n  const params = await searchParams;',
)
replace_once(
    'app/admin/accounts/page.tsx',
    '    <section aria-label="Existing protected Accounts"><h2>Existing protected Accounts</h2><div style={{ display: "grid", gap: "1rem" }}>{snapshot.accounts.map((account) => <ProtectedAccountEditor key={account.authUserId} account={account} currentAppUserId={currentUser.id} />)}</div></section>\n  </section></main>;',
    '    <section aria-label="Existing protected Accounts"><h2>Existing protected Accounts</h2><div style={{ display: "grid", gap: "1rem" }}>{snapshot.accounts.map((account) => <ProtectedAccountEditor key={account.authUserId} account={account} currentAppUserId={currentUser.id} />)}</div></section>\n    <section className="detail-panel" aria-label="Person deletion"><h2>Persons</h2><p className="field-help">Permanent deletion is allowed only for a Person with no protected Account and no Working, Final, or Completed service reference. Otherwise deactivate the Person in Catalog.</p><div style={{ display: "grid", gap: "0.6rem" }}>{allPeople.map((person) => <div className="rows-header" key={person.id}><span>{person.displayName} · {person.active ? "active" : "inactive"} · {[person.priest ? "priest" : "", person.organist ? "organist" : ""].filter(Boolean).join(", ") || "no staff role"}</span><form action="/api/protected-accounts" method="post"><input type="hidden" name="action" value="deletePerson" /><input type="hidden" name="personId" value={person.id} /><ConfirmSubmitButton message={`Permanently delete Person ${person.displayName}? This succeeds only when no account or service history references it.`}>Delete Person permanently</ConfirmSubmitButton></form></div>)}</div></section>\n  </section></main>;',
)

# 12. Focused acceptance test and main test hook.
write('scripts/issue-214-tests.ts', r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { InMemoryCatalogRepository } from "../src/application/catalog";
import { InMemoryInteractionRepository } from "../src/application/interaction-contracts";
import { queryReferenceCandidatesFromData, type ReferenceCandidateData } from "../src/application/reference-candidate-service";
import { InMemoryCompletedServiceRecordRepository, InMemoryPlanningSetRepository, PlanningLifecycleService } from "../src/application/planning-lifecycle";

const referenceData: ReferenceCandidateData = {
  melodyWindowMonths: 2,
  songs: [
    { id: "czech:1", language: "czech", canonicalNumber: 1, displayNumber: "1", title: "One", classId: "class-a", aggregatePreferenceScore: 0, repertoire: false },
    { id: "polish:1", language: "polish", canonicalNumber: 1, displayNumber: "1", title: "Jeden", classId: "class-a", aggregatePreferenceScore: 9, repertoire: false },
    { id: "czech:2", language: "czech", canonicalNumber: 2, displayNumber: "2", title: "Two", classId: "class-b", aggregatePreferenceScore: 0, repertoire: false },
  ],
};
const historical = queryReferenceCandidatesFromData(referenceData, {
  serviceDate: "2026-08-30",
  serviceLanguage: "czech",
  organistPersonId: "nobody",
  referenceAntiphonId: "czech:800",
  preferenceThreshold: 100,
  candidateUsages: [{ songId: "czech:1", serviceDate: "2026-08-30", source: "final", planId: "future" }],
  historicalTruth: true,
});
assert(historical.some((candidate) => candidate.songId === "czech:1"));
assert(historical.some((candidate) => candidate.songId === "polish:1"), "Historical truth must not language-filter.");
assert(historical.some((candidate) => candidate.songId === "czech:2"), "Historical truth must not repertoire/preference/non-repeat-filter.");
assert(historical.some((candidate) => candidate.number === "0" && candidate.language === "czech"));
assert(historical.every((candidate) => candidate.availability.kind === "available" && candidate.signal === "none" && candidate.preferenceShade === "none" && !candidate.repertoire));
assert.equal(historical.filter((candidate) => candidate.number === "1").length, 2, "Melody-equivalent concrete numbers remain independently selectable.");

const memoryCandidates = new InMemoryInteractionRepository().queryCandidates(await new InMemoryCatalogRepository().listSongs(), {
  serviceDate: "2026-08-30", serviceLanguage: "polish", organistPersonId: "missing", preferenceThreshold: 999, historicalTruth: true,
});
assert(memoryCandidates.some((candidate) => candidate.language === "czech"));
assert(memoryCandidates.some((candidate) => candidate.number === "0"));

const plans = new InMemoryPlanningSetRepository();
const completed = new InMemoryCompletedServiceRecordRepository(plans);
await plans.saveFinalSet({ status: "final", language: "czech", rows: [{ song: { songId: "czech:1", language: "czech", number: "1", title: "One" } }] }, {
  serviceDate: "2026-09-01", serviceTime: "10:00", language: "czech", priest: { displayName: "Anonymous" }, organist: { displayName: "Anonymous" },
});
const historicalRecord = await completed.createFromFinalSet({ sourceFinalSetId: "legacy", set: { status: "final", language: "czech", rows: [{ song: { songId: "czech:2", language: "czech", number: "2", title: "Two" } }] }, serviceContext: {
  serviceDate: "2026-08-01", serviceTime: "10:00", language: "czech", priest: { displayName: "Anonymous" }, organist: { displayName: "Anonymous" },
}, completedAt: new Date("2026-08-01T12:00:00Z") });
const service = new PlanningLifecycleService({
  planningSets: plans,
  completedServiceRecords: completed,
  catalog: new InMemoryCatalogRepository(),
  referenceSongs: { getById: async (id) => id === "czech:1" ? { id, language: "czech", canonicalNumber: 1, displayNumber: "1", sourceId: "1", title: "One" } : id === "czech:2" ? { id, language: "czech", canonicalNumber: 2, displayNumber: "2", sourceId: "2", title: "Two" } : undefined },
  referenceMelodyClasses: { getClassMemberships: async (ids) => ids.filter((id) => id === "czech:1").map((songId) => ({ songId, melodyClassId: "class-a" })).concat(ids.filter((id) => id === "czech:2").map((songId) => ({ songId, melodyClassId: "class-b" }))) },
  melodyNonRepetitionMonths: async () => 2,
});
const updateInput = {
  role: "admin" as const,
  recordId: historicalRecord.id,
  serviceContext: historicalRecord.serviceContext,
  set: { status: "final" as const, language: "czech" as const, rows: [
    { song: { songId: "czech:1", language: "czech" as const, number: "1", title: "One" } },
    { song: { songId: "czech:1", language: "czech" as const, number: "1", title: "One" } },
    { song: { songId: "czech:1", language: "czech" as const, number: "1", title: "One" } },
    { song: { songId: "czech:1", language: "czech" as const, number: "1", title: "One" } },
    { song: { songId: "historical-zero:czech", language: "czech" as const, number: "0", title: "Historical zero value" } },
    {},
  ] },
};
const requiresConfirmation = await service.updateCompletedRecord(updateInput);
assert(!requiresConfirmation.success && requiresConfirmation.error.issues?.some((issue) => issue.path.startsWith("retroactivePlan.")));
const accepted = await service.updateCompletedRecord({ ...updateInput, acceptPlanInvalidation: true });
assert(accepted.success);
if (accepted.success) {
  assert.equal(accepted.value.set.rows.length, 6);
  assert.equal(accepted.value.set.rows[4].song?.number, "0");
  assert.equal(accepted.value.set.rows[4].song?.songId, undefined);
  assert.equal(accepted.value.set.rows[5].song, undefined);
}
const annotated = await service.listPlanningSets();
assert(annotated.success && annotated.value[0].status === "working" && annotated.value[0].needsRevision, "Accepted history correction must demote Final and derive Needs revision.");

const clientSource = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
assert(clientSource.includes("historicalTruth: true"));
assert(clientSource.includes("Historical truth mode: no Planning filters are applied."));
assert(clientSource.includes("retroactivePlan."));
assert(clientSource.includes("needs-revision-record"));
const accountSource = readFileSync("src/application/protected-account-admin.ts", "utf8");
assert(accountSource.includes("async deleteAccount"));
assert(accountSource.includes("async deletePerson"));
assert(accountSource.includes("service_contexts where priest_id = $1 or organist_id = $1"));
assert(accountSource.includes("Sign in as another admin before deleting your own protected Account."));

console.log("Issue 214 historical truth, retroactive invalidation, and safe identity deletion: PASS");
''')
# Add focused test to normal fast suite.
package = read('package.json')
package = package.replace('tsx scripts/product-refinement-210-tests.ts",', 'tsx scripts/product-refinement-210-tests.ts && tsx scripts/issue-214-tests.ts",', 1)
package = package.replace('"test:product-refinement-210": "tsx scripts/product-refinement-210-tests.ts"', '"test:product-refinement-210": "tsx scripts/product-refinement-210-tests.ts",\n    "test:issue-214": "tsx scripts/issue-214-tests.ts"', 1)
write('package.json', package)

print('Issue 214 source patch applied.')
