from pathlib import Path
import re

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one anchor, found {count}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


# 1. Drizzle Service Context snapshot columns/checks.
replace_once(
    'src/db/schema/index.ts',
    '    referenceAntiphonSourceUrl: text("reference_antiphon_source_url"),\n    antiphonKey: text("antiphon_key"),',
    '    referenceAntiphonSourceUrl: text("reference_antiphon_source_url"),\n    referenceTopicId: text("reference_topic_id"),\n    referenceTopicTitle: text("reference_topic_title"),\n    antiphonKey: text("antiphon_key"),',
)
replace_once(
    'src/db/schema/index.ts',
    '''    referenceAntiphonSourceUrlValid: check(\n      "service_contexts_reference_antiphon_source_url_valid",\n      sql`${table.referenceAntiphonSourceUrl} is null or ${table.referenceAntiphonSourceUrl} ~ '^https://'`,\n    ),\n  }),''',
    '''    referenceAntiphonSourceUrlValid: check(\n      "service_contexts_reference_antiphon_source_url_valid",\n      sql`${table.referenceAntiphonSourceUrl} is null or ${table.referenceAntiphonSourceUrl} ~ '^https://'`,\n    ),\n    referenceTopicSnapshotComplete: check(\n      "service_contexts_reference_topic_snapshot_complete",\n      sql`(${table.referenceTopicId} is null and ${table.referenceTopicTitle} is null) or (${table.referenceTopicId} is not null and ${table.referenceTopicTitle} is not null)`,\n    ),\n    referenceTopicIdentity: check(\n      "service_contexts_reference_topic_identity",\n      sql`${table.referenceTopicId} is null or ${table.referenceTopicId} ~ '^(czech|polish):.+$'`,\n    ),\n    referenceTopicTitleNonEmpty: check(\n      "service_contexts_reference_topic_title_non_empty",\n      sql`${table.referenceTopicId} is null or btrim(${table.referenceTopicTitle}) <> ''`,\n    ),\n  }),''',
)

# 2. Drizzle adapters persist/rehydrate the Topic snapshot and pass the authoritative provider.
replace_once(
    'src/application/planning-lifecycle/drizzle-repository-adapters.ts',
    '  referenceAntiphonSourceUrl: string | null;\n  antiphonKey: string | null;',
    '  referenceAntiphonSourceUrl: string | null;\n  referenceTopicId: string | null;\n  referenceTopicTitle: string | null;\n  antiphonKey: string | null;',
)
replace_once(
    'src/application/planning-lifecycle/drizzle-repository-adapters.ts',
    'Partial<Pick<PlanningLifecycleServiceDependencies, "now" | "referenceAntiphons" | "referenceSongs" | "referenceMelodyClasses">>',
    'Partial<Pick<PlanningLifecycleServiceDependencies, "now" | "referenceAntiphons" | "referenceTopics" | "referenceSongs" | "referenceMelodyClasses">>',
)
replace_once(
    'src/application/planning-lifecycle/drizzle-repository-adapters.ts',
    '    referenceAntiphons: dependencies.referenceAntiphons,\n    referenceSongs: dependencies.referenceSongs,',
    '    referenceAntiphons: dependencies.referenceAntiphons,\n    referenceTopics: dependencies.referenceTopics,\n    referenceSongs: dependencies.referenceSongs,',
)
replace_once(
    'src/application/planning-lifecycle/drizzle-repository-adapters.ts',
    '''      : {}),\n    ...(context.antiphonKey ? { antiphonKey: context.antiphonKey } : {}),''',
    '''      : {}),\n    ...(context.referenceTopicId && context.referenceTopicTitle\n      ? { referenceTopic: { id: context.referenceTopicId, title: context.referenceTopicTitle } }\n      : {}),\n    ...(context.antiphonKey ? { antiphonKey: context.antiphonKey } : {}),''',
)
replace_once(
    'src/application/planning-lifecycle/drizzle-repository-adapters.ts',
    '    referenceAntiphonSourceUrl: context.referenceAntiphon?.sourceUrl ?? null,\n    antiphonKey: context.antiphonKey?.trim() || null,',
    '    referenceAntiphonSourceUrl: context.referenceAntiphon?.sourceUrl ?? null,\n    referenceTopicId: context.referenceTopic?.id ?? null,\n    referenceTopicTitle: context.referenceTopic?.title ?? null,\n    antiphonKey: context.antiphonKey?.trim() || null,',
)

# 3. Planning Lifecycle: server-authoritative Topic normalization + historical snapshot preservation.
service_path = 'src/application/planning-lifecycle/service.ts'
service = read(service_path)
service = service.replace(
    '  serviceAntiphonMatchesLanguage,\n  validatePlanningSet,',
    '  serviceAntiphonMatchesLanguage,\n  serviceTopicLanguageFromId,\n  serviceTopicMatchesLanguage,\n  validatePlanningSet,',
    1,
)
service = service.replace(
    '  type ServiceAntiphonReference,\n  type ServiceContext,',
    '  type ServiceAntiphonReference,\n  type ServiceContext,\n  type ServiceTopicReference,',
    1,
)
service = service.replace(
    'import type { ReferenceCatalogRecord } from "../reference-catalog-contract";\n',
    'import type { ReferenceCatalogRecord } from "../reference-catalog-contract";\nimport type { ReferenceThematicSection, ReferenceThematicSectionProvider } from "../reference-thematic-section-contract";\n',
    1,
)
service = service.replace(
    '  referenceAntiphons?: Pick<ReferenceAntiphonProvider, "getById">;\n  referenceSongs?:',
    '  referenceAntiphons?: Pick<ReferenceAntiphonProvider, "getById">;\n  referenceTopics?: Pick<ReferenceThematicSectionProvider, "getSectionById">;\n  referenceSongs?:',
    1,
)
service = service.replace(
    '  private readonly referenceAntiphons?: Pick<ReferenceAntiphonProvider, "getById">;\n  private readonly referenceSongs?:',
    '  private readonly referenceAntiphons?: Pick<ReferenceAntiphonProvider, "getById">;\n  private readonly referenceTopics?: Pick<ReferenceThematicSectionProvider, "getSectionById">;\n  private readonly referenceSongs?:',
    1,
)
service = service.replace(
    '    this.referenceAntiphons = dependencies.referenceAntiphons;\n    this.referenceSongs = dependencies.referenceSongs;',
    '    this.referenceAntiphons = dependencies.referenceAntiphons;\n    this.referenceTopics = dependencies.referenceTopics;\n    this.referenceSongs = dependencies.referenceSongs;',
    1,
)
flow_old = '''    const antiphonContext = await this.validateAndNormalizeReferenceAntiphon(rawServiceContext, existingSet);\n    if (!antiphonContext.success) return antiphonContext;\n    const serviceContext = antiphonContext.value;\n    const normalized = await this.validateAndNormalizeCatalogReferences(serviceContext, input.set, existingSet, input.allowLanguageDeviations === true);'''
flow_new = '''    const antiphonContext = await this.validateAndNormalizeReferenceAntiphon(rawServiceContext, existingSet);\n    if (!antiphonContext.success) return antiphonContext;\n    const topicContext = await this.validateAndNormalizeReferenceTopic(antiphonContext.value, existingSet);\n    if (!topicContext.success) return topicContext;\n    const serviceContext = topicContext.value;\n    const normalized = await this.validateAndNormalizeCatalogReferences(serviceContext, input.set, existingSet, input.allowLanguageDeviations === true);'''
if service.count(flow_old) != 1:
    raise RuntimeError(f'{service_path}: save Topic normalization anchor count={service.count(flow_old)}')
service = service.replace(flow_old, flow_new, 1)
completed_old = '''    const antiphonContext = await this.validateAndNormalizeReferenceAntiphon(rawServiceContext, existing);\n    if (!antiphonContext.success) return antiphonContext;\n    const serviceContext = antiphonContext.value;\n    const normalized = await this.validateAndNormalizeCatalogReferences(serviceContext, input.set, existing, input.allowLanguageDeviations === true);'''
completed_new = '''    const antiphonContext = await this.validateAndNormalizeReferenceAntiphon(rawServiceContext, existing);\n    if (!antiphonContext.success) return antiphonContext;\n    const topicContext = await this.validateAndNormalizeReferenceTopic(antiphonContext.value, existing);\n    if (!topicContext.success) return topicContext;\n    const serviceContext = topicContext.value;\n    const normalized = await this.validateAndNormalizeCatalogReferences(serviceContext, input.set, existing, input.allowLanguageDeviations === true);'''
if service.count(completed_old) != 1:
    raise RuntimeError(f'{service_path}: completed Topic normalization anchor count={service.count(completed_old)}')
service = service.replace(completed_old, completed_new, 1)
method_anchor = '''  private async validateAndNormalizeCatalogReferences<TSet extends PlanningSet>(serviceContext: ServiceContext, set: TSet, existing?: PersistedPlanningSet | CompletedServiceRecord, allowLanguageDeviations = false): Promise<{ serviceContext: ServiceContext; set: TSet; issues: { path: string; message: string }[] }> {'''
method = '''  private async validateAndNormalizeReferenceTopic(\n    serviceContext: ServiceContext,\n    existing?: PersistedPlanningSet | CompletedServiceRecord,\n  ): Promise<PlanningServiceResult<ServiceContext>> {\n    const candidate = (serviceContext as ServiceContext & { referenceTopic?: unknown }).referenceTopic;\n    if (candidate === undefined) return success({ ...serviceContext, referenceTopic: undefined });\n    if (!isServiceTopicReference(candidate)) {\n      return failure({ code: "invalidInput", message: "Authoritative Topic selection is malformed.", issues: [{ path: "serviceContext.referenceTopic", message: "Select a Topic from the authoritative catalog." }] });\n    }\n    if (!serviceTopicMatchesLanguage(candidate, serviceContext.language)) {\n      return failure({ code: "invalidInput", message: "Selected topic must match the service language.", issues: [{ path: "serviceContext.referenceTopic", message: "Selected topic must match the service language." }] });\n    }\n    const previous = existing?.serviceContext.referenceTopic;\n    if (previous && sameServiceTopicReference(previous, candidate)) return success({ ...serviceContext, referenceTopic: { ...previous } });\n    if (!isAcceptedReferenceTopicId(candidate.id)) {\n      return failure({ code: "invalidInput", message: "Authoritative Topic identity is invalid.", issues: [{ path: "serviceContext.referenceTopic.id", message: "Topic id must be a Czech or Polish authoritative thematic-section id." }] });\n    }\n    if (!this.referenceTopics) return failure({ code: "invalidInput", message: "Authoritative Topic selection is unavailable in this runtime." });\n    const authoritative = await this.referenceTopics.getSectionById(candidate.id);\n    const expectedLanguage = serviceTopicLanguageFromId(candidate.id);\n    if (!authoritative || !expectedLanguage || authoritative.language !== expectedLanguage) return failure({ code: "notFound", message: "Authoritative Topic was not found." });\n    return success({ ...serviceContext, referenceTopic: serviceTopicSnapshot(authoritative) });\n  }\n\n'''
if service.count(method_anchor) != 1:
    raise RuntimeError(f'{service_path}: catalog method anchor count={service.count(method_anchor)}')
service = service.replace(method_anchor, method + method_anchor, 1)
normalize_anchor = '''    ...(isServiceAntiphonReference(context.referenceAntiphon)\n      ? { referenceAntiphon: { ...context.referenceAntiphon } }\n      : context.referenceAntiphon === undefined\n        ? { referenceAntiphon: undefined }\n        : { referenceAntiphon: context.referenceAntiphon as never }),\n    ...(context.antiphonKey?.trim() ? { antiphonKey: context.antiphonKey.trim() } : { antiphonKey: undefined }),'''
normalize_new = '''    ...(isServiceAntiphonReference(context.referenceAntiphon)\n      ? { referenceAntiphon: { ...context.referenceAntiphon } }\n      : context.referenceAntiphon === undefined\n        ? { referenceAntiphon: undefined }\n        : { referenceAntiphon: context.referenceAntiphon as never }),\n    ...(isServiceTopicReference(context.referenceTopic)\n      ? { referenceTopic: { ...context.referenceTopic } }\n      : context.referenceTopic === undefined\n        ? { referenceTopic: undefined }\n        : { referenceTopic: context.referenceTopic as never }),\n    ...(context.antiphonKey?.trim() ? { antiphonKey: context.antiphonKey.trim() } : { antiphonKey: undefined }),'''
if service.count(normalize_anchor) != 1:
    raise RuntimeError(f'{service_path}: normalize anchor count={service.count(normalize_anchor)}')
service = service.replace(normalize_anchor, normalize_new, 1)
helper_anchor = '''function isAcceptedReferenceAntiphonId(id: string): boolean {\n  return /^(czech|polish):[1-9]\\d*$/.test(id);\n}\n'''
helpers = '''function isAcceptedReferenceAntiphonId(id: string): boolean {\n  return /^(czech|polish):[1-9]\\d*$/.test(id);\n}\n\nfunction isServiceTopicReference(value: unknown): value is ServiceTopicReference {\n  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;\n  const record = value as Record<string, unknown>;\n  const keys = Object.keys(record).sort();\n  if (keys.length !== 2 || keys[0] !== "id" || keys[1] !== "title") return false;\n  return typeof record.id === "string" && record.id.trim() === record.id && record.id.length > 0 && typeof record.title === "string" && record.title.trim().length > 0;\n}\n\nfunction isAcceptedReferenceTopicId(id: string): boolean {\n  return /^(czech|polish):[a-z0-9][a-z0-9:-]*$/.test(id);\n}\n\nfunction sameServiceTopicReference(left: ServiceTopicReference, right: ServiceTopicReference): boolean {\n  return left.id === right.id && left.title === right.title;\n}\n\nfunction serviceTopicSnapshot(section: ReferenceThematicSection): ServiceTopicReference {\n  return { id: section.id, title: section.title };\n}\n'''
if service.count(helper_anchor) != 1:
    raise RuntimeError(f'{service_path}: helper anchor count={service.count(helper_anchor)}')
service = service.replace(helper_anchor, helpers, 1)
write(service_path, service)

# 4. DB Planning route supplies the Topic provider.
replace_once(
    'app/api/planning-lifecycle/route.ts',
    'import { PostgresReferenceCatalogProvider } from "../../../src/application/postgres-reference-catalog";\n',
    'import { PostgresReferenceCatalogProvider } from "../../../src/application/postgres-reference-catalog";\nimport { PostgresReferenceThematicSectionProvider } from "../../../src/application/postgres-reference-thematic-section";\n',
)
replace_once(
    'app/api/planning-lifecycle/route.ts',
    '      referenceAntiphons: new PostgresReferenceAntiphonProvider(pool),\n      referenceSongs:',
    '      referenceAntiphons: new PostgresReferenceAntiphonProvider(pool),\n      referenceTopics: new PostgresReferenceThematicSectionProvider(pool),\n      referenceSongs:',
)

# 5. Candidate transport contracts carry the authoritative Topic id alongside legacy season key.
replace_once(
    'src/application/interaction-contracts.ts',
    'referenceAntiphonId?: string; antiphonKey?: string; liturgicalSeasonKey?: string;',
    'referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string;',
)
# The same exact fragment occurs twice (query + hydration), so the first replace leaves one more occurrence.
text = read('src/application/interaction-contracts.ts')
if 'referenceAntiphonId?: string; antiphonKey?: string; liturgicalSeasonKey?: string;' in text:
    text = text.replace('referenceAntiphonId?: string; antiphonKey?: string; liturgicalSeasonKey?: string;', 'referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string;', 1)
write('src/application/interaction-contracts.ts', text)

replace_once(
    'src/planning-lifecycle/candidate-flow.ts',
    '  referenceAntiphonId?: string;\n  antiphonKey?: string;',
    '  referenceAntiphonId?: string;\n  referenceTopicId?: string;\n  antiphonKey?: string;',
)
replace_once(
    'src/planning-lifecycle/candidate-flow.ts',
    '    ...(input.referenceAntiphonId?.trim() ? { referenceAntiphonId: input.referenceAntiphonId.trim() } : {}),\n    ...(input.antiphonKey?.trim()',
    '    ...(input.referenceAntiphonId?.trim() ? { referenceAntiphonId: input.referenceAntiphonId.trim() } : {}),\n    ...(input.referenceTopicId?.trim() ? { referenceTopicId: input.referenceTopicId.trim() } : {}),\n    ...(input.antiphonKey?.trim()',
)

# 6. Interaction API validates/forwards authoritative Topic ids for query and hydration.
interaction_path = 'app/api/interaction/route.ts'
interaction = read(interaction_path)
interaction = interaction.replace(
    'const REFERENCE_ANTIPHON_ID = /^(?:czech|polish):[1-9]\\d*$/;\n',
    'const REFERENCE_ANTIPHON_ID = /^(?:czech|polish):[1-9]\\d*$/;\nconst REFERENCE_TOPIC_ID = /^(?:czech|polish):[a-z0-9][a-z0-9:-]*$/;\n',
    1,
)
interaction = interaction.replace(
    '"referenceAntiphonId", "antiphonKey", "liturgicalSeasonKey"',
    '"referenceAntiphonId", "referenceTopicId", "antiphonKey", "liturgicalSeasonKey"',
)
query_validation = '  if (input.referenceAntiphonId !== undefined && (typeof input.referenceAntiphonId !== "string" || !REFERENCE_ANTIPHON_ID.test(input.referenceAntiphonId))) throw new LocalActorError("invalidInput", "referenceAntiphonId must be an authoritative Czech or Polish antiphon id.");\n'
if interaction.count(query_validation) < 1:
    raise RuntimeError(f'{interaction_path}: antiphon validation anchor missing')
interaction = interaction.replace(query_validation, query_validation + '  if (input.referenceTopicId !== undefined && (typeof input.referenceTopicId !== "string" || !REFERENCE_TOPIC_ID.test(input.referenceTopicId))) throw new LocalActorError("invalidInput", "referenceTopicId must be an authoritative Czech or Polish Topic id.");\n')
interaction = interaction.replace(
    '    ...(input.referenceAntiphonId !== undefined ? { referenceAntiphonId: input.referenceAntiphonId as string } : {}),\n    ...(input.antiphonKey !== undefined',
    '    ...(input.referenceAntiphonId !== undefined ? { referenceAntiphonId: input.referenceAntiphonId as string } : {}),\n    ...(input.referenceTopicId !== undefined ? { referenceTopicId: input.referenceTopicId as string } : {}),\n    ...(input.antiphonKey !== undefined',
)
write(interaction_path, interaction)

# 7. Canonical DB candidate service resolves Topic ranges and sets soft concrete-song seasonMatch only.
candidate_path = 'src/application/reference-candidate-service.ts'
candidate = read(candidate_path)
candidate = candidate.replace(
    '  recommendedReferenceSongId?: string;\n};',
    '  recommendedReferenceSongId?: string;\n  referenceTopic?: { language: "czech" | "polish"; ranges: { from: number; to: number }[] };\n};',
    1,
)
candidate = candidate.replace(
    'type CandidateRow = {',
    'type TopicRangeRow = { language: "czech" | "polish"; from_number: number; to_number: number };\n\ntype CandidateRow = {',
    1,
)
candidate = candidate.replace(
    '    const data = await this.loadData(input.organistPersonId, input.referenceAntiphonId);',
    '    const data = await this.loadData(input.organistPersonId, input.referenceAntiphonId, input.referenceTopicId);',
)
candidate = candidate.replace(
    '  private async loadData(organistPersonId?: string, referenceAntiphonId?: string): Promise<ReferenceCandidateData> {',
    '  private async loadData(organistPersonId?: string, referenceAntiphonId?: string, referenceTopicId?: string): Promise<ReferenceCandidateData> {',
    1,
)
recommendation_anchor = '''    const recommendationPromise = referenceAntiphonId\n      ? this.pool.query(\n          `select r.reference_song_id\n           from reference_antiphons a\n           left join reference_antiphon_recommendations r on r.antiphon_id = a.id\n           where a.id = $1`,\n          [referenceAntiphonId],\n        ).then((result) => result.rows as { reference_song_id: string | null }[])\n      : Promise.resolve([] as { reference_song_id: string | null }[]);\n    const [songRows, melodyWindowRows, recommendationRows] = await Promise.all([songRowsPromise, windowPromise, recommendationPromise]);'''
recommendation_new = '''    const recommendationPromise = referenceAntiphonId\n      ? this.pool.query(\n          `select r.reference_song_id\n           from reference_antiphons a\n           left join reference_antiphon_recommendations r on r.antiphon_id = a.id\n           where a.id = $1`,\n          [referenceAntiphonId],\n        ).then((result) => result.rows as { reference_song_id: string | null }[])\n      : Promise.resolve([] as { reference_song_id: string | null }[]);\n    const topicPromise = referenceTopicId\n      ? this.pool.query(\n          `select s.language, r.from_number, r.to_number\n           from reference_thematic_sections s\n           join reference_thematic_ranges r on r.section_id = s.id\n           where s.id = $1\n           order by r.range_order`,\n          [referenceTopicId],\n        ).then((result) => result.rows as TopicRangeRow[])\n      : Promise.resolve([] as TopicRangeRow[]);\n    const [songRows, melodyWindowRows, recommendationRows, topicRows] = await Promise.all([songRowsPromise, windowPromise, recommendationPromise, topicPromise]);'''
if candidate.count(recommendation_anchor) != 1:
    raise RuntimeError(f'{candidate_path}: recommendation anchor count={candidate.count(recommendation_anchor)}')
candidate = candidate.replace(recommendation_anchor, recommendation_new, 1)
return_anchor = '''    return {\n      songs,\n      melodyWindowMonths: Number(melodyWindowRows[0]?.months ?? 2),\n      ...(recommendationRow?.reference_song_id ? { recommendedReferenceSongId: String(recommendationRow.reference_song_id) } : {}),\n    };'''
return_new = '''    const topicLanguage = topicRows[0]?.language;\n    return {\n      songs,\n      melodyWindowMonths: Number(melodyWindowRows[0]?.months ?? 2),\n      ...(recommendationRow?.reference_song_id ? { recommendedReferenceSongId: String(recommendationRow.reference_song_id) } : {}),\n      ...(topicLanguage ? { referenceTopic: { language: topicLanguage, ranges: topicRows.map((row) => ({ from: Number(row.from_number), to: Number(row.to_number) })) } } : {}),\n    };'''
if candidate.count(return_anchor) != 1:
    raise RuntimeError(f'{candidate_path}: loadData return anchor count={candidate.count(return_anchor)}')
candidate = candidate.replace(return_anchor, return_new, 1)
candidate = candidate.replace(
    '    candidates.push(toCandidate(song, allMembers, antiphonMatch, false, availability));',
    '    const seasonMatch = referenceTopicMatchesSong(data.referenceTopic, song);\n    candidates.push(toCandidate(song, allMembers, antiphonMatch, seasonMatch, availability));',
    1,
)
candidate = candidate.replace(
    '    const allMembers = membersByClass.get(stored.classId) ?? [stored];\n    return {\n      ...toCandidate(stored, allMembers, antiphonMatch, false),',
    '    const allMembers = membersByClass.get(stored.classId) ?? [stored];\n    const seasonMatch = referenceTopicMatchesSong(data.referenceTopic, stored);\n    return {\n      ...toCandidate(stored, allMembers, antiphonMatch, seasonMatch),',
    1,
)
helper_anchor = 'function groupSongsByClass(songs: ReferenceCandidateSong[]): Map<string, ReferenceCandidateSong[]> {'
helper = '''function referenceTopicMatchesSong(topic: ReferenceCandidateData["referenceTopic"], song: ReferenceCandidateSong): boolean {\n  if (!topic || topic.language !== song.language) return false;\n  const baseNumber = referenceNumberParts(song.canonicalNumber).base;\n  return topic.ranges.some((range) => baseNumber >= range.from && baseNumber <= range.to);\n}\n\n'''
if candidate.count(helper_anchor) != 1:
    raise RuntimeError(f'{candidate_path}: helper anchor count={candidate.count(helper_anchor)}')
candidate = candidate.replace(helper_anchor, helper + helper_anchor, 1)
write(candidate_path, candidate)

print('Phase 31.20 backend transform applied.')
