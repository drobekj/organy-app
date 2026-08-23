from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:80]!r}")
    p.write_text(text.replace(old, new), encoding="utf-8")


# Planning domain: Anonymous is a valid Working/Completed person snapshot, but Final requires concrete eligible people.
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''export type FinalizeWorkingSetInput = {\n  role: PlanningRole;\n  workingSetId: PlanningSetId;\n  replaceFinalSetId?: PlanningSetId;\n};''',
    '''export type FinalizeWorkingSetInput = {\n  role: PlanningRole;\n  workingSetId: PlanningSetId;\n  replaceFinalSetId?: PlanningSetId;\n};\n\nexport type ReopenFinalSetInput = {\n  role: PlanningRole;\n  finalSetId: PlanningSetId;\n};''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''    if (workingSet.status !== "working") {\n      return failure({ code: "invalidStatus", message: "Only working planning sets can be finalized." });\n    }\n\n    if (input.replaceFinalSetId) {''',
    '''    if (workingSet.status !== "working") {\n      return failure({ code: "invalidStatus", message: "Only working planning sets can be finalized." });\n    }\n\n    const finalPeopleIssues = await this.validateFinalPeople(workingSet.serviceContext);\n    if (finalPeopleIssues.length > 0) {\n      return failure({ code: "invalidInput", message: "Final service requires a concrete active priest and organist.", issues: finalPeopleIssues });\n    }\n\n    if (input.replaceFinalSetId) {''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''  async deletePlanningSet(input: DeletePlanningSetInput): Promise<PlanningServiceResult<{ deletedSetId: PlanningSetId }>> {''',
    '''  async reopenFinalSet(input: ReopenFinalSetInput): Promise<PlanningServiceResult<PersistedPlanningSet>> {\n    if (input.role !== "admin") {\n      return failure({ code: "permissionDenied", message: "Only admin can reopen a final planning set." });\n    }\n    const finalSet = await this.planningSets.findById(input.finalSetId);\n    if (!finalSet) return failure({ code: "notFound", message: "Final planning set was not found." });\n    if (finalSet.status !== "final") return failure({ code: "invalidStatus", message: "Only final planning sets can be reopened." });\n    return success(await this.planningSets.saveWorkingSet(\n      { status: "working", language: finalSet.language, rows: finalSet.rows },\n      finalSet.serviceContext,\n      finalSet.id,\n    ));\n  }\n\n  async deletePlanningSet(input: DeletePlanningSetInput): Promise<PlanningServiceResult<{ deletedSetId: PlanningSetId }>> {''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''      if (!ref.id) { issues.push({ path: role, message: `${role} must be selected from the person catalog.` }); continue; }''',
    '''      if (!ref.id) {\n        if (ref.displayName === "Anonymous") continue;\n        issues.push({ path: role, message: `${role} must be selected from the person catalog or explicitly set to Anonymous.` });\n        continue;\n      }''',
)
replace_once(
    "src/application/planning-lifecycle/service.ts",
    '''  private async findDuplicateService(serviceContext: ServiceContext, currentSetId?: PlanningSetId, currentCompletedRecordId?: string): Promise<PersistedPlanningSet | CompletedServiceRecord | undefined> {''',
    '''  private async validateFinalPeople(serviceContext: ServiceContext): Promise<{ path: string; message: string }[]> {\n    const issues: { path: string; message: string }[] = [];\n    for (const [role, ref] of [["priest", serviceContext.priest], ["organist", serviceContext.organist]] as const) {\n      if (!ref.id) { issues.push({ path: role, message: `${role} must be a concrete active person before finalization.` }); continue; }\n      const person = await this.catalog.findPersonById(ref.id);\n      if (!isEligiblePerson(person, role)) issues.push({ path: role, message: `${role} is not active for the selected role.` });\n    }\n    return issues;\n  }\n\n  private async findDuplicateService(serviceContext: ServiceContext, currentSetId?: PlanningSetId, currentCompletedRecordId?: string): Promise<PersistedPlanningSet | CompletedServiceRecord | undefined> {''',
)
replace_once(
    "src/application/planning-lifecycle/index.ts",
    '''  type ReorderRowsInput,\n  type SaveWorkingSetInput,''',
    '''  type ReopenFinalSetInput,\n  type ReorderRowsInput,\n  type SaveWorkingSetInput,''',
)

# DB candidate engine: Anonymous organist means no repertoire hard filter, not zero candidates.
replace_once(
    "src/application/reference-candidate-service.ts",
    '''  if (!input.organistPersonId) return [];\n  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));''',
    '''  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));''',
)
replace_once(
    "src/application/reference-candidate-service.ts",
    '''    if (!allMembers.some((member) => member.repertoire)) continue;''',
    '''    if (input.organistPersonId && !allMembers.some((member) => member.repertoire)) continue;''',
)

# Memory candidate engine mirrors DB behavior.
replace_once(
    "src/application/interaction-service.ts",
    '''  if (!input.organistPersonId) return [];\n  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));''',
    '''  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));''',
)
replace_once(
    "src/application/interaction-service.ts",
    '''    if (!allClassSongIds.some((songId) => repertoire.has(songId))) continue;''',
    '''    if (input.organistPersonId && !allClassSongIds.some((songId) => repertoire.has(songId))) continue;''',
)

# API transport for explicit Final -> Working reopen.
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '''  | "finalizeWorkingSet"\n  | "completeFinalSet"''',
    '''  | "finalizeWorkingSet"\n  | "reopenFinalSet"\n  | "completeFinalSet"''',
)
replace_once(
    "app/api/planning-lifecycle/route.ts",
    '''  return ["listPlanningSets", "listCompletedRecords", "loadPlanningSet", "loadCompletedRecord", "saveWorkingSet", "finalizeWorkingSet", "completeFinalSet", "deletePlanningSet", "updateCompletedRecord", "deleteCompletedRecord"].includes(action);''',
    '''  return ["listPlanningSets", "listCompletedRecords", "loadPlanningSet", "loadCompletedRecord", "saveWorkingSet", "finalizeWorkingSet", "reopenFinalSet", "completeFinalSet", "deletePlanningSet", "updateCompletedRecord", "deleteCompletedRecord"].includes(action);''',
)

# Draft defaults: if history cannot resolve to an active eligible person, represent that explicitly as Anonymous.
replace_once(
    "src/planning-lifecycle/ui-session.ts",
    '''    priest: newest?.serviceContext.priest ?? { displayName: "" },\n    organist: newest?.serviceContext.organist ?? { displayName: "" },''',
    '''    priest: newest?.serviceContext.priest ?? { displayName: "Anonymous" },\n    organist: newest?.serviceContext.organist ?? { displayName: "Anonymous" },''',
)

# Client transport + Anonymous UX/workflow + Final reopen.
client = "app/planning-lifecycle-client.tsx"
replace_once(
    client,
    '''  async finalizeWorkingSet(input: Parameters<PlanningLifecycleService["finalizeWorkingSet"]>[0]) {\n    return callPlanningLifecycleApi("finalizeWorkingSet", input, actorContextFrom(input));\n  }\n\n  async completeFinalSet''',
    '''  async finalizeWorkingSet(input: Parameters<PlanningLifecycleService["finalizeWorkingSet"]>[0]) {\n    return callPlanningLifecycleApi("finalizeWorkingSet", input, actorContextFrom(input));\n  }\n\n  async reopenFinalSet(input: Parameters<PlanningLifecycleService["reopenFinalSet"]>[0]) {\n    return callPlanningLifecycleApi("reopenFinalSet", input, actorContextFrom(input));\n  }\n\n  async completeFinalSet''',
)
replace_once(
    client,
    '''  const hasServiceContext = Boolean(serviceDate && isValidServiceTime(serviceTime) && priest.trim() && organist.trim() && priestId && organistId);''',
    '''  const hasServiceContext = Boolean(serviceDate && isValidServiceTime(serviceTime) && priest.trim() && organist.trim());\n  const hasConcreteFinalPeople = Boolean(priestId && organistId);''',
)
replace_once(
    client,
    '''    ...(!priestId ? ["Priest must be selected from lookup."] : []),\n    ...(!organistId ? ["Organist must be selected from lookup."] : []),''',
    '''    ...(!priest.trim() ? ["Priest is required."] : []),\n    ...(!organist.trim() ? ["Organist is required."] : []),''',
)
replace_once(
    client,
    '''    if (!serviceDate || !organistId) {\n      setSelectedCandidateAvailability({\n        key: candidateAvailabilityKey,\n        byRow: Object.fromEntries(selectedCandidateRows.map((selected) => [selected.rowId, "unavailable"])) as Record<number, SelectedCandidateAvailability>,\n      });\n      return;\n    }''',
    '''    if (!serviceDate) {\n      setSelectedCandidateAvailability({\n        key: candidateAvailabilityKey,\n        byRow: Object.fromEntries(selectedCandidateRows.map((selected) => [selected.rowId, "unavailable"])) as Record<number, SelectedCandidateAvailability>,\n      });\n      return;\n    }''',
)
replace_once(
    client,
    '''    const priest = priestResult.success && priestResult.value.active && priestResult.value.priest ? { id: priestResult.value.id, displayName: priestResult.value.displayName } : { displayName: "" };\n    const organist = organistResult.success && organistResult.value.active && organistResult.value.organist ? { id: organistResult.value.id, displayName: organistResult.value.displayName } : { displayName: "" };''',
    '''    const priest = priestResult.success && priestResult.value.active && priestResult.value.priest ? { id: priestResult.value.id, displayName: priestResult.value.displayName } : { displayName: "Anonymous" };\n    const organist = organistResult.success && organistResult.value.active && organistResult.value.organist ? { id: organistResult.value.id, displayName: organistResult.value.displayName } : { displayName: "Anonymous" };''',
)
replace_once(
    client,
    '''  function selectPerson(role: PersonRole, person: CatalogPerson) {\n    lookupTracker.invalidate(getPersonLookupScope(role));\n    guardedEditorUpdate(() => {\n      if (role === "priest") { setPriest(person.displayName); setPriestId(person.id); }\n      else { lookupTracker.invalidatePrefix("song:"); setOrganist(person.displayName); setOrganistId(person.id); }\n    });\n  }''',
    '''  function selectPerson(role: PersonRole, person: CatalogPerson) {\n    lookupTracker.invalidate(getPersonLookupScope(role));\n    guardedEditorUpdate(() => {\n      if (role === "priest") { setPriest(person.displayName); setPriestId(person.id); }\n      else { lookupTracker.invalidatePrefix("song:"); setOrganist(person.displayName); setOrganistId(person.id); }\n    });\n  }\n\n  function selectAnonymous(role: PersonRole) {\n    lookupTracker.invalidate(getPersonLookupScope(role));\n    guardedEditorUpdate(() => {\n      if (role === "priest") { setPriest("Anonymous"); setPriestId(undefined); }\n      else { lookupTracker.invalidatePrefix("song:"); setOrganist("Anonymous"); setOrganistId(undefined); }\n    });\n  }''',
)
replace_once(
    client,
    '''    if (!organistId) {\n      lookupTracker.invalidate(scope);\n      setCandidateResults((current) => ({ ...current, [rowId]: [] }));\n      setCandidateLoading((current) => ({ ...current, [rowId]: false }));\n      setCandidateErrors((current) => ({ ...current, [rowId]: undefined }));\n      setServiceError(null);\n      return;\n    }\n    const languageAtRequest = serviceLanguage;''',
    '''    const languageAtRequest = serviceLanguage;''',
)
replace_once(
    client,
    '''    if (!organistId) {\n      setDetailEligibilityLoading(false);\n      return;\n    }\n    setDetailEligibilityLoading(true);''',
    '''    setDetailEligibilityLoading(true);''',
)
replace_once(
    client,
    '''    setCandidateLoading({ [rowId]: Boolean(organistId) });''',
    '''    setCandidateLoading({ [rowId]: true });''',
)
replace_once(
    client,
    '''          ...(!priestId ? [{ path: "priest", message: "Priest must be selected from lookup." }] : []),\n          ...(!organistId ? [{ path: "organist", message: "Organist must be selected from lookup." }] : []),''',
    '''          ...(!priest.trim() ? [{ path: "priest", message: "Priest is required." }] : []),\n          ...(!organist.trim() ? [{ path: "organist", message: "Organist is required." }] : []),''',
)
replace_once(
    client,
    '''  async function finalizeWorkingSet() {\n    if (isCompletedRecordOpen || !persistedSet || persistedSet.status !== "working") {\n      return;\n    }''',
    '''  async function finalizeWorkingSet() {\n    if (isCompletedRecordOpen || !persistedSet || persistedSet.status !== "working") {\n      return;\n    }\n    if (!hasConcreteFinalPeople) {\n      setServiceError({ code: "invalidInput", message: "Choose a concrete active priest and organist before finalization." });\n      setSaveState("errors");\n      return;\n    }''',
)
replace_once(
    client,
    '''  async function completeFinalSet() {''',
    '''  async function reopenFinalSet() {\n    if (isCompletedRecordOpen || !persistedSet || persistedSet.status !== "final" || selectedRole !== "admin") return;\n    const result = await planningLifecycleService.reopenFinalSet({\n      role: selectedRole,\n      ...({ localActorUserId: activeActor.userId } as Record<string, string>),\n      finalSetId: persistedSet.id,\n    });\n    if (!result.success) { setServiceError(result.error); setSaveState("errors"); return; }\n    setServiceError(null);\n    setSaveState("saved");\n    await openPersistedSet(result.value);\n    await refreshDbSets();\n    setWorkspace("planning");\n  }\n\n  async function completeFinalSet() {''',
)
replace_once(
    client,
    '''              <select disabled={isEditorLocked} value={priestId ?? ""} onChange={(event) => { const person = priestResults.find((p) => p.id === event.target.value); if (person) selectPerson("priest", person); }}>\n                <option value="">Select active priest</option>''',
    '''              <select disabled={isEditorLocked} value={priestId ?? ""} onChange={(event) => { if (!event.target.value) selectAnonymous("priest"); else { const person = priestResults.find((p) => p.id === event.target.value); if (person) selectPerson("priest", person); } }}>\n                <option value="">Anonymous</option>''',
)
replace_once(
    client,
    '''              <span className="field-help">{priestId ? "Selected catalog priest." : priest ? "Historical or incomplete priest selection — choose an active catalog priest before saving." : "No priest selected."}</span>''',
    '''              <span className="field-help">{priestId ? "Selected priest." : "Anonymous is allowed while the plan is Working."}</span>''',
)
replace_once(
    client,
    '''              <select disabled={isEditorLocked} value={organistId ?? ""} onChange={(event) => { const person = organistResults.find((p) => p.id === event.target.value); if (person) selectPerson("organist", person); }}>\n                <option value="">Select active organist</option>''',
    '''              <select disabled={isEditorLocked} value={organistId ?? ""} onChange={(event) => { if (!event.target.value) selectAnonymous("organist"); else { const person = organistResults.find((p) => p.id === event.target.value); if (person) selectPerson("organist", person); } }}>\n                <option value="">Anonymous</option>''',
)
replace_once(
    client,
    '''              <span className="field-help">{organistId ? "Selected catalog organist." : organist ? "Historical or incomplete organist selection — choose an active catalog organist before saving." : "No organist selected."}</span>''',
    '''              <span className="field-help">{organistId ? "Selected organist; repertoire filter is active." : "Anonymous: repertoire filter is not applied while choosing candidates."}</span>''',
)
replace_once(
    client,
    '''                                              prerequisiteMessage={!organistId ? "Select an active organist in Service context to see candidates." : undefined}''',
    '''                                              prerequisiteMessage={undefined}''',
)
replace_once(
    client,
    '''                    <button type="button" onClick={finalizeWorkingSet} disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock || hasMelodyCollisions || hasAntiphonLanguageMismatch}>''',
    '''                    <button type="button" onClick={finalizeWorkingSet} disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || !hasConcreteFinalPeople || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock || hasMelodyCollisions || hasAntiphonLanguageMismatch}>''',
)
replace_once(
    client,
    '''                {!isCompletedRecordOpen && (\n                  <>\n                    <button type="button" onClick={completeFinalSet}''',
    '''                {!isCompletedRecordOpen && (\n                  <>\n                    {isFinalSetOpen && selectedRole === "admin" && <button type="button" onClick={reopenFinalSet}>Reopen for editing</button>}\n                    <button type="button" onClick={completeFinalSet}''',
)

print("Issue 210 source patch applied")
