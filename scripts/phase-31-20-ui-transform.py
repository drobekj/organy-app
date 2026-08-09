from pathlib import Path

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


def require_replace(text: str, old: str, new: str, label: str, count: int | None = None) -> str:
    actual = text.count(old)
    expected = count if count is not None else 1
    if actual != expected:
        raise RuntimeError(f'{label}: expected {expected} anchors, found {actual}: {old[:120]!r}')
    return text.replace(old, new, expected)


path = 'app/planning-lifecycle-client.tsx'
text = read(path)

# Imports and types.
text = require_replace(
    text,
    'import type { ConcreteSongLanguage, PlanningRole, PlanningRow, ServiceAntiphonReference, ServiceLanguage } from "../src/planning-lifecycle";',
    'import type { ConcreteSongLanguage, PlanningRole, PlanningRow, ServiceAntiphonReference, ServiceLanguage, ServiceTopicReference } from "../src/planning-lifecycle";',
    path,
)
text = require_replace(
    text,
    'import { canPerformPlanningAction, findMelodyCollisions, isValidServiceTime, melodyCollisionSummary, normalizeServiceTime, serviceAntiphonMatchesLanguage, validatePlanningRow } from "../src/planning-lifecycle";',
    'import { canPerformPlanningAction, findMelodyCollisions, isValidServiceTime, melodyCollisionSummary, normalizeServiceTime, serviceAntiphonMatchesLanguage, serviceTopicMatchesLanguage, validatePlanningRow } from "../src/planning-lifecycle";',
    path,
)
text = require_replace(
    text,
    'import { MemoryReferenceAntiphonProvider } from "../src/application/reference-antiphon";\n',
    'import { MemoryReferenceAntiphonProvider } from "../src/application/reference-antiphon";\nimport { MemoryReferenceThematicSectionProvider } from "../src/application/reference-thematic-section";\n',
    path,
)
text = require_replace(
    text,
    'import { ServiceContextReferenceAntiphonField } from "./service-context-reference-antiphon-field";\n',
    'import { ServiceContextReferenceAntiphonField } from "./service-context-reference-antiphon-field";\nimport { ServiceContextReferenceTopicField } from "./service-context-reference-topic-field";\n',
    path,
)

# Candidate transport contracts.
text = text.replace(
    'referenceAntiphonId?: string; antiphonKey?: string; liturgicalSeasonKey?: string',
    'referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string',
)

# Memory Topic soft-signal overlay. Keep concrete candidate ordering untouched.
old_memory = '  async queryCandidates(input: { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string; queryText?: string; preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages> }) { const result = await this.service.queryCandidates(buildCandidateQueryInput(input)); return result.success ? result.value : []; }\n  async hydrateCandidates(input: CandidateHydrationClientInput) { const result = await this.service.hydrateCandidates(input); return result.success ? result.value : []; }'
new_memory = '''  async queryCandidates(input: { serviceDate: string; serviceLanguage: ServiceLanguage; organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string; queryText?: string; preferenceThreshold?: number; currentPlanId?: string; candidateUsages: ReturnType<typeof buildCanonicalCandidateUsages> }) {\n    const result = await this.service.queryCandidates(buildCandidateQueryInput(input));\n    return result.success ? applyMemoryTopicSignal(result.value, input.referenceTopicId) : [];\n  }\n  async hydrateCandidates(input: CandidateHydrationClientInput) {\n    const result = await this.service.hydrateCandidates(input);\n    return result.success ? applyMemoryTopicSignal(result.value, input.referenceTopicId) : [];\n  }'''
text = require_replace(text, old_memory, new_memory, path)
helper_anchor = '\nclass DbCatalogClient {'
helper = '''\nconst memoryTopicProvider = new MemoryReferenceThematicSectionProvider();\nasync function applyMemoryTopicSignal(candidates: CandidateQueryResult[], referenceTopicId?: string): Promise<CandidateQueryResult[]> {\n  if (!referenceTopicId) return candidates;\n  const topic = await memoryTopicProvider.getSectionById(referenceTopicId);\n  if (!topic) return candidates.map((candidate) => ({ ...candidate, seasonMatch: false, signal: candidate.antiphonMatch ? "antiphon" : "none" }));\n  return candidates.map((candidate) => {\n    const base = candidateBaseNumber(candidate.number);\n    const seasonMatch = candidate.language === topic.language && base !== undefined && topic.ranges.some((range) => base >= range.from && base <= range.to);\n    return { ...candidate, seasonMatch, signal: candidate.antiphonMatch ? "antiphon" : seasonMatch ? "season" : "none" };\n  });\n}\nfunction candidateBaseNumber(value: string): number | undefined {\n  const match = value.match(/^([1-9]\\d*)(?:\\/\\d+)?$/);\n  return match ? Number(match[1]) : undefined;\n}\n'''
text = require_replace(text, helper_anchor, helper + helper_anchor, path)

# Planning Lifecycle memory runtime gets authoritative Topics.
text = require_replace(
    text,
    '            referenceAntiphons: new MemoryReferenceAntiphonProvider(),\n          }),',
    '            referenceAntiphons: new MemoryReferenceAntiphonProvider(),\n            referenceTopics: new MemoryReferenceThematicSectionProvider(),\n          }),',
    path,
)

# State and language validity.
text = require_replace(
    text,
    '  const [referenceAntiphon, setReferenceAntiphon] = useState<ServiceAntiphonReference | undefined>();\n  const [serviceContextGeneration',
    '  const [referenceAntiphon, setReferenceAntiphon] = useState<ServiceAntiphonReference | undefined>();\n  const [referenceTopic, setReferenceTopic] = useState<ServiceTopicReference | undefined>();\n  const [serviceContextGeneration',
    path,
)
text = require_replace(
    text,
    '  const hasAntiphonLanguageMismatch = Boolean(referenceAntiphon && !serviceAntiphonMatchesLanguage(referenceAntiphon, serviceLanguage));\n  const isFinalSetOpen',
    '  const hasAntiphonLanguageMismatch = Boolean(referenceAntiphon && !serviceAntiphonMatchesLanguage(referenceAntiphon, serviceLanguage));\n  const hasTopicLanguageMismatch = Boolean(referenceTopic && !serviceTopicMatchesLanguage(referenceTopic, serviceLanguage));\n  const isFinalSetOpen',
    path,
)

# Candidate refresh identities and inputs.
text = text.replace(
    'referenceAntiphon?.id, serviceLanguage, serviceDate',
    'referenceAntiphon?.id, referenceTopic?.id, serviceLanguage, serviceDate',
)
text = text.replace(
    '    referenceAntiphonId: referenceAntiphon?.id ?? "",\n    candidateAntiphonKey,',
    '    referenceAntiphonId: referenceAntiphon?.id ?? "",\n    referenceTopicId: referenceTopic?.id ?? "",\n    candidateAntiphonKey,',
)
text = text.replace(
    'referenceAntiphon?.id ?? "", value].join("|")',
    'referenceAntiphon?.id ?? "", referenceTopic?.id ?? "", value].join("|")',
)
text = text.replace(
    '          referenceAntiphonId: referenceAntiphon?.id,\n          antiphonKey:',
    '          referenceAntiphonId: referenceAntiphon?.id,\n          referenceTopicId: referenceTopic?.id,\n          antiphonKey:',
)
text = text.replace(
    'organistPersonId: organistId, referenceAntiphonId: referenceAntiphon?.id, antiphonKey:',
    'organistPersonId: organistId, referenceAntiphonId: referenceAntiphon?.id, referenceTopicId: referenceTopic?.id, antiphonKey:',
)

# Hydration context type and payload.
text = text.replace(
    'context: { organistPersonId?: string; referenceAntiphonId?: string; antiphonKey?: string; liturgicalSeasonKey?: string }',
    'context: { organistPersonId?: string; referenceAntiphonId?: string; referenceTopicId?: string; antiphonKey?: string; liturgicalSeasonKey?: string }',
)
text = text.replace(
    'referenceAntiphonId: context.referenceAntiphonId, antiphonKey:',
    'referenceAntiphonId: context.referenceAntiphonId, referenceTopicId: context.referenceTopicId, antiphonKey:',
)
text = text.replace(
    'referenceAntiphonId: set.serviceContext.referenceAntiphon?.id, antiphonKey:',
    'referenceAntiphonId: set.serviceContext.referenceAntiphon?.id, referenceTopicId: set.serviceContext.referenceTopic?.id, antiphonKey:',
)
text = text.replace(
    'referenceAntiphonId: record.serviceContext.referenceAntiphon?.id, antiphonKey:',
    'referenceAntiphonId: record.serviceContext.referenceAntiphon?.id, referenceTopicId: record.serviceContext.referenceTopic?.id, antiphonKey:',
)

# Open persisted snapshots and reset on new workspace.
text = text.replace(
    '    setReferenceAntiphon(set.serviceContext.referenceAntiphon ? { ...set.serviceContext.referenceAntiphon } : undefined);\n    setServiceContextGeneration',
    '    setReferenceAntiphon(set.serviceContext.referenceAntiphon ? { ...set.serviceContext.referenceAntiphon } : undefined);\n    setReferenceTopic(set.serviceContext.referenceTopic ? { ...set.serviceContext.referenceTopic } : undefined);\n    setServiceContextGeneration',
)
text = text.replace(
    '    setReferenceAntiphon(record.serviceContext.referenceAntiphon ? { ...record.serviceContext.referenceAntiphon } : undefined);\n    setServiceContextGeneration',
    '    setReferenceAntiphon(record.serviceContext.referenceAntiphon ? { ...record.serviceContext.referenceAntiphon } : undefined);\n    setReferenceTopic(record.serviceContext.referenceTopic ? { ...record.serviceContext.referenceTopic } : undefined);\n    setServiceContextGeneration',
)
text = text.replace(
    '    setReferenceAntiphon(undefined);\n    setServiceContextGeneration',
    '    setReferenceAntiphon(undefined);\n    setReferenceTopic(undefined);\n    setServiceContextGeneration',
)

# Persist Topic snapshot wherever Service Context is constructed.
text = text.replace(
    '        ...(referenceAntiphon ? { referenceAntiphon: { ...referenceAntiphon } } : {}),\n        ...(candidateAntiphonKey.trim()',
    '        ...(referenceAntiphon ? { referenceAntiphon: { ...referenceAntiphon } } : {}),\n        ...(referenceTopic ? { referenceTopic: { ...referenceTopic } } : {}),\n        ...(candidateAntiphonKey.trim()',
)

# Central UI validation + action guards.
text = text.replace(
    '    ...(hasAntiphonLanguageMismatch ? ["Selected antiphon must match the service language."] : []),\n    ...(hasEmptyRowValidation',
    '    ...(hasAntiphonLanguageMismatch ? ["Selected antiphon must match the service language."] : []),\n    ...(hasTopicLanguageMismatch ? ["Selected topic must match the service language."] : []),\n    ...(hasEmptyRowValidation',
)
text = text.replace(
    '    if (hasAntiphonLanguageMismatch) { setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." }); setSaveState("errors"); return; }\n    if (hasCandidateAvailabilityBlock)',
    '    if (hasAntiphonLanguageMismatch) { setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." }); setSaveState("errors"); return; }\n    if (hasTopicLanguageMismatch) { setServiceError({ code: "invalidInput", message: "Selected topic must match the service language." }); setSaveState("errors"); return; }\n    if (hasCandidateAvailabilityBlock)',
)
text = text.replace(
    '    if (hasAntiphonLanguageMismatch) {\n      setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." });\n      setSaveState("errors");\n      return;\n    }\n    if (hasMelodyCollisions)',
    '    if (hasAntiphonLanguageMismatch) {\n      setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." });\n      setSaveState("errors");\n      return;\n    }\n    if (hasTopicLanguageMismatch) {\n      setServiceError({ code: "invalidInput", message: "Selected topic must match the service language." });\n      setSaveState("errors");\n      return;\n    }\n    if (hasMelodyCollisions)',
)

# Replace legacy visible season-key field with Topic immediately right of Antiphon.
old_ui = '''            <ServiceContextReferenceAntiphonField\n              runtime={runtimeMode}\n              editable={!isEditorLocked}\n              contextKey={serviceContextRecordKey}\n              serviceLanguage={serviceLanguage}\n              selected={referenceAntiphon}\n              invalid={hasAntiphonLanguageMismatch}\n              onChange={(value) => { lookupTracker.invalidatePrefix("song:"); guardedEditorUpdate(() => setReferenceAntiphon(value ? { ...value } : undefined)); }}\n            />\n            <label>\n              Candidate season key\n              <input type="text" disabled={isEditorLocked} value={candidateSeasonKey} onChange={(event) => guardedEditorUpdate(() => setCandidateSeasonKey(event.target.value))} placeholder="Optional synthetic/demo season key" />\n            </label>'''
new_ui = '''            <div className="service-antiphon-topic-row">\n              <ServiceContextReferenceAntiphonField\n                runtime={runtimeMode}\n                editable={!isEditorLocked}\n                contextKey={serviceContextRecordKey}\n                serviceLanguage={serviceLanguage}\n                selected={referenceAntiphon}\n                invalid={hasAntiphonLanguageMismatch}\n                onChange={(value) => { lookupTracker.invalidatePrefix("song:"); guardedEditorUpdate(() => setReferenceAntiphon(value ? { ...value } : undefined)); }}\n              />\n              <ServiceContextReferenceTopicField\n                runtime={runtimeMode}\n                editable={!isEditorLocked}\n                contextKey={serviceContextRecordKey}\n                serviceLanguage={serviceLanguage}\n                selected={referenceTopic}\n                invalid={hasTopicLanguageMismatch}\n                onChange={(value) => { lookupTracker.invalidatePrefix("song:"); guardedEditorUpdate(() => setReferenceTopic(value ? { ...value } : undefined)); }}\n              />\n            </div>'''
text = require_replace(text, old_ui, new_ui, path)

# Guard against accidental visible legacy Topic substitute.
if 'Candidate season key' in text or 'Optional synthetic/demo season key' in text:
    raise RuntimeError(f'{path}: legacy Candidate season key UI remains')
if 'referenceTopicId: referenceTopic?.id' not in text:
    raise RuntimeError(f'{path}: Topic id not forwarded to candidates')
write(path, text)

# Responsive two-column Service Context layout, matching Antiphon visual protocol.
css_path = 'app/globals.css'
css = read(css_path)
css += '''\n\n/* Phase 31.20: Antiphon + Topic are peer Service Context lookups. */\n.service-antiphon-topic-row {\n  display: grid;\n  gap: 0.75rem;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n}\n\n.service-antiphon-topic-row > * {\n  min-width: 0;\n}\n\n@media (max-width: 720px) {\n  .service-antiphon-topic-row {\n    grid-template-columns: minmax(0, 1fr);\n  }\n}\n'''
write(css_path, css)

print('Phase 31.20 UI transform applied.')
