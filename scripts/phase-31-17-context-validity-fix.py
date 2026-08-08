from pathlib import Path

ROOT = Path('.')


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one anchor, found {count}: {old[:120]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1) Confirmed lookup text remains a valid selected row even while the candidate list is open.
replace_once(
    'src/planning-lifecycle/candidate-flow.ts',
    'import type { CandidateQueryInput, CandidateQueryResult, CandidateUsage } from "../application/interaction-contracts";',
    'import type { CandidateQueryInput, CandidateQueryResult, CandidateUsage, RowLookupState } from "../application/interaction-contracts";',
)
replace_once(
    'src/planning-lifecycle/candidate-flow.ts',
    '''export function formatPlanningSongField(song: { number: string; title?: string }): string {
  return `${song.number}${song.title ? ` · ${song.title}` : ""}`;
}''',
    '''export function getPlanningCandidateRowLookupState(row: PlanningCandidateEditableRow): RowLookupState {
  const confirmedLabel = row.selectedSong ? formatPlanningSongField(row.selectedSong) : "";
  const hasUnconfirmedLookupText = Boolean(row.lookupOpen && row.songSearch.trim() && row.songSearch !== confirmedLabel);
  if (hasUnconfirmedLookupText) {
    const previous: Exclude<RowLookupState, { kind: "lookup" }> = row.selectedSong?.songId
      ? { kind: "selected", songId: row.selectedSong.songId }
      : row.note.trim()
        ? { kind: "noteOnly", note: row.note }
        : { kind: "empty" };
    return { kind: "lookup", text: row.songSearch, previous };
  }
  if (row.selectedSong?.songId) return { kind: "selected", songId: row.selectedSong.songId };
  if (row.note.trim()) return { kind: "noteOnly", note: row.note };
  return { kind: "empty" };
}

export function formatPlanningSongField(song: { number: string; title?: string }): string {
  return `${song.number}${song.title ? ` · ${song.title}` : ""}`;
}''',
)

# 2) Candidate input can visually identify a confirmed selection that is no longer available.
replace_once(
    'src/planning-lifecycle/candidate-list.tsx',
    '''  serviceLanguage: ServiceLanguage;
  disabled?: boolean;
  focusSongId?: string;''',
    '''  serviceLanguage: ServiceLanguage;
  disabled?: boolean;
  selectionUnavailable?: boolean;
  focusSongId?: string;''',
)
replace_once(
    'src/planning-lifecycle/candidate-list.tsx',
    '''        type="text"
        role="combobox"
        aria-label="Song lookup"''',
    '''        type="text"
        role="combobox"
        className={props.selectionUnavailable ? "candidate-selection-unavailable" : undefined}
        aria-invalid={props.selectionUnavailable || undefined}
        aria-label="Song lookup"''',
)

css_path = ROOT / 'app/globals.css'
css = css_path.read_text(encoding='utf-8')
css += '''\n\n/* Phase 31.17: a confirmed song that fails the current candidate context stays visible but muted. */
.candidate-combobox input::placeholder,
.candidate-combobox input.candidate-selection-unavailable {
  color: var(--muted);
}

.candidate-combobox input::placeholder {
  opacity: 1;
}
'''
css_path.write_text(css, encoding='utf-8')

# 3) Planning derives lookup validity from confirmed-vs-edited text and rechecks selected songs against current hard filters.
replace_once(
    'app/planning-lifecycle-client.tsx',
    'import { buildCandidateQueryInput, buildCanonicalCandidateUsages, candidateToSelectedSong, formatPlanningSongField, formatSongLabel, rehydrateCandidateFromSelectedSong, openSingleCandidateRow, planningCandidateRowReducer, restoreRowsExceptActive } from "../src/planning-lifecycle/candidate-flow";',
    'import { buildCandidateQueryInput, buildCanonicalCandidateUsages, candidateToSelectedSong, formatPlanningSongField, formatSongLabel, getPlanningCandidateRowLookupState, rehydrateCandidateFromSelectedSong, openSingleCandidateRow, planningCandidateRowReducer, restoreRowsExceptActive } from "../src/planning-lifecycle/candidate-flow";',
)
replace_once(
    'app/planning-lifecycle-client.tsx',
    'type SaveState = "unsaved" | "saved" | "finalized" | "completed" | "deleted" | "errors";\n',
    '''type SaveState = "unsaved" | "saved" | "finalized" | "completed" | "deleted" | "errors";
type SelectedCandidateAvailability = "available" | "unavailable" | "error";
type SelectedCandidateAvailabilitySnapshot = { key: string; byRow: Record<number, SelectedCandidateAvailability> };
''',
)
replace_once(
    'app/planning-lifecycle-client.tsx',
    '''  const [detailEligibilityError, setDetailEligibilityError] = useState<string | undefined>();
  const detailEligibilityRequest = useRef(0);''',
    '''  const [detailEligibilityError, setDetailEligibilityError] = useState<string | undefined>();
  const detailEligibilityRequest = useRef(0);
  const [selectedCandidateAvailability, setSelectedCandidateAvailability] = useState<SelectedCandidateAvailabilitySnapshot>({ key: "", byRow: {} });
  const selectedCandidateAvailabilityRequest = useRef(0);''',
)

old_validation_block = '''  const rowLookupStates = rows.map((row) => row.lookupOpen && row.songSearch.trim() ? { kind: "lookup" as const, text: row.songSearch } : row.selectedSong?.songId ? { kind: "selected" as const, songId: row.selectedSong.songId } : row.note.trim() ? { kind: "noteOnly" as const, note: row.note } : { kind: "empty" as const });
  const hasInvalidLookupState = !canAddOrPersistRows(rowLookupStates);
  const workspaceLeaveState = canLeaveWorkspace(rowLookupStates);
  const hasEmptyRowValidation = validationResults.some((result) => result.issues.some((issue) => issue.path === "row"));
  const planningActionValidationMessages = [
    ...(!serviceDate ? ["Service date is required."] : []),
    ...(!isValidServiceTime(serviceTime) ? ["Service time is required in HH:mm format between 00:00 and 23:59."] : []),
    ...(!priestId ? ["Priest must be selected from lookup."] : []),
    ...(!organistId ? ["Organist must be selected from lookup."] : []),
    ...(hasEmptyRowValidation ? ["Every row must include either a complete song reference or a non-empty textual note."] : []),
    ...validationResults.flatMap((result, index) => result.issues
      .filter((issue) => issue.path !== "row")
      .map((issue) => `Row ${index + 1}: ${issue.message}`)),
    ...(hasInvalidLookupState ? [workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving."] : []),
    ...(melodyFinalizationReason && !isCompletedRecordOpen && !isFinalSetOpen ? [melodyFinalizationReason] : []),
    ...(completeDateReason ? [`Complete service disabled: ${completeDateReason}`] : []),
  ].filter((message, index, messages) => messages.indexOf(message) === index);
'''
new_validation_block = '''  const rowLookupStates = rows.map(getPlanningCandidateRowLookupState);
  const hasInvalidLookupState = !canAddOrPersistRows(rowLookupStates);
  const workspaceLeaveState = canLeaveWorkspace(rowLookupStates);
  const selectedCandidateRows = rows.flatMap((row) => row.selectedSong?.songId ? [{ rowId: row.id, songId: row.selectedSong.songId, language: row.selectedSong.language }] : []);
  const candidateAvailabilityKey = JSON.stringify({
    runtimeMode,
    serviceContextGeneration,
    serviceDate,
    serviceLanguage,
    organistId: organistId ?? "",
    referenceAntiphonId: referenceAntiphon?.id ?? "",
    candidateAntiphonKey,
    candidateSeasonKey,
    currentPlanId: persistedSet?.id ?? "",
    selected: selectedCandidateRows,
    activePlans: savedDbSets.map((set) => [set.id, set.status, set.serviceContext.serviceDate, set.rows.map((row) => row.song?.songId ?? "")]),
    completed: completedRecords.map((record) => [record.id, record.serviceContext.serviceDate, record.set.rows.map((row) => row.song?.songId ?? "")]),
  });
  const candidateAvailabilityCurrent = selectedCandidateAvailability.key === candidateAvailabilityKey;
  const hasUnavailableCandidates = selectedCandidateRows.some((selected) => {
    if (serviceLanguage !== "mixed" && selected.language !== serviceLanguage) return true;
    return candidateAvailabilityCurrent && selectedCandidateAvailability.byRow[selected.rowId] === "unavailable";
  });
  const hasCandidateAvailabilityError = candidateAvailabilityCurrent && selectedCandidateRows.some((selected) => selectedCandidateAvailability.byRow[selected.rowId] === "error");
  const candidateAvailabilityPending = selectedCandidateRows.length > 0 && !candidateAvailabilityCurrent;
  const hasCandidateAvailabilityBlock = candidateAvailabilityPending || hasUnavailableCandidates || hasCandidateAvailabilityError;
  const rowCandidateUnavailable = (row: EditableRow) => Boolean(row.selectedSong?.songId) && (
    (serviceLanguage !== "mixed" && row.selectedSong!.language !== serviceLanguage)
    || (candidateAvailabilityCurrent && selectedCandidateAvailability.byRow[row.id] === "unavailable")
  );
  const hasEmptyRowValidation = validationResults.some((result) => result.issues.some((issue) => issue.path === "row"));
  const planningActionValidationMessages = [
    ...(!serviceDate ? ["Service date is required."] : []),
    ...(!isValidServiceTime(serviceTime) ? ["Service time is required in HH:mm format between 00:00 and 23:59."] : []),
    ...(!priestId ? ["Priest must be selected from lookup."] : []),
    ...(!organistId ? ["Organist must be selected from lookup."] : []),
    ...(hasEmptyRowValidation ? ["Every row must include either a complete song reference or a non-empty textual note."] : []),
    ...(hasUnavailableCandidates ? ["Every candidate must be available."] : []),
    ...(hasCandidateAvailabilityError ? ["Candidate availability could not be checked."] : []),
    ...validationResults.flatMap((result, index) => result.issues
      .filter((issue) => issue.path !== "row")
      .map((issue) => `Row ${index + 1}: ${issue.message}`)),
    ...(hasInvalidLookupState ? [workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving."] : []),
    ...(melodyFinalizationReason && !isCompletedRecordOpen && !isFinalSetOpen ? [melodyFinalizationReason] : []),
    ...(completeDateReason ? [`Complete service disabled: ${completeDateReason}`] : []),
  ].filter((message, index, messages) => messages.indexOf(message) === index);

  useEffect(() => {
    const request = ++selectedCandidateAvailabilityRequest.current;
    if (selectedCandidateRows.length === 0) {
      setSelectedCandidateAvailability({ key: candidateAvailabilityKey, byRow: {} });
      return;
    }
    if (!serviceDate || !organistId) {
      setSelectedCandidateAvailability({
        key: candidateAvailabilityKey,
        byRow: Object.fromEntries(selectedCandidateRows.map((selected) => [selected.rowId, "unavailable"])) as Record<number, SelectedCandidateAvailability>,
      });
      return;
    }
    void Promise.all(selectedCandidateRows.map(async (selected) => {
      if (serviceLanguage !== "mixed" && selected.language !== serviceLanguage) return [selected.rowId, "unavailable"] as const;
      try {
        const candidates = await interactionClient.queryCandidates({
          serviceDate,
          serviceLanguage,
          organistPersonId: organistId,
          referenceAntiphonId: referenceAntiphon?.id,
          antiphonKey: candidateAntiphonKey,
          liturgicalSeasonKey: candidateSeasonKey,
          queryText: "",
          preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD,
          candidateUsages: getCanonicalCandidateUsages(selected.rowId),
          currentPlanId: persistedSet?.id,
        });
        const candidate = candidates.find((item) => item.songId === selected.songId);
        return [selected.rowId, candidate?.availability.kind === "available" ? "available" : "unavailable"] as const;
      } catch {
        return [selected.rowId, "error"] as const;
      }
    })).then((entries) => {
      if (request !== selectedCandidateAvailabilityRequest.current) return;
      setSelectedCandidateAvailability({
        key: candidateAvailabilityKey,
        byRow: Object.fromEntries(entries) as Record<number, SelectedCandidateAvailability>,
      });
    });
    return () => {
      if (selectedCandidateAvailabilityRequest.current === request) selectedCandidateAvailabilityRequest.current += 1;
    };
  }, [candidateAvailabilityKey, interactionClient]);
'''
replace_once('app/planning-lifecycle-client.tsx', old_validation_block, new_validation_block)

# Robust action guards: a stale/invalid selected candidate cannot be persisted even if an action is invoked programmatically.
replace_once(
    'app/planning-lifecycle-client.tsx',
    '''    if (hasInvalidLookupState) { setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving." }); setSaveState("errors"); return; }
    if (!hasServiceContext) {''',
    '''    if (hasInvalidLookupState) { setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving." }); setSaveState("errors"); return; }
    if (hasCandidateAvailabilityBlock) { setServiceError({ code: "invalidInput", message: hasUnavailableCandidates ? "Every candidate must be available." : hasCandidateAvailabilityError ? "Candidate availability could not be checked." : "Candidate availability is being checked." }); setSaveState("errors"); return; }
    if (!hasServiceContext) {''',
)
replace_once(
    'app/planning-lifecycle-client.tsx',
    '''  async function saveCompletedChanges() {
    if (!completedRecord || selectedRole !== "admin") return;

    const languageDeviationConfirmation''',
    '''  async function saveCompletedChanges() {
    if (!completedRecord || selectedRole !== "admin") return;
    if (hasCandidateAvailabilityBlock) { setServiceError({ code: "invalidInput", message: hasUnavailableCandidates ? "Every candidate must be available." : hasCandidateAvailabilityError ? "Candidate availability could not be checked." : "Candidate availability is being checked." }); setSaveState("errors"); return; }

    const languageDeviationConfirmation''',
)

# Input state and action buttons use the same availability snapshot.
replace_once(
    'app/planning-lifecycle-client.tsx',
    '''                                              serviceLanguage={serviceLanguage}
                                              disabled={!canEditRows}
                                              onOpen={() => openCandidateList(row.id)}''',
    '''                                              serviceLanguage={serviceLanguage}
                                              disabled={!canEditRows}
                                              selectionUnavailable={rowCandidateUnavailable(row) && Boolean(row.selectedSong && row.songSearch === formatPlanningSongField(row.selectedSong))}
                                              onOpen={() => openCandidateList(row.id)}''',
)
replace_once(
    'app/planning-lifecycle-client.tsx',
    'disabled={!canSaveWorkingSet || !hasServiceContext || hasValidationErrors || hasInvalidLookupState}',
    'disabled={!canSaveWorkingSet || !hasServiceContext || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock}',
)
replace_once(
    'app/planning-lifecycle-client.tsx',
    'disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || hasValidationErrors || hasInvalidLookupState || hasMelodyCollisions}',
    'disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock || hasMelodyCollisions}',
)
replace_once(
    'app/planning-lifecycle-client.tsx',
    'disabled={!hasServiceContext || hasValidationErrors || hasInvalidLookupState}',
    'disabled={!hasServiceContext || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock}',
)

# 4) Focused Phase 31.17 evidence.
test_path = ROOT / 'scripts/phase-31-17-tests.tsx'
test = test_path.read_text(encoding='utf-8')
test = test.replace(
    'import { formatPlanningSongField, planningCandidateRowReducer } from "../src/planning-lifecycle/candidate-flow";',
    'import { formatPlanningSongField, getPlanningCandidateRowLookupState, planningCandidateRowReducer } from "../src/planning-lifecycle/candidate-flow";',
    1,
)
anchor = '''assert.equal(openedRow.selectedSong?.songId, available.songId);
assert.equal(openedRow.lookupOpen, true);
'''
addition = '''assert.equal(openedRow.selectedSong?.songId, available.songId);
assert.equal(openedRow.lookupOpen, true);
assert.deepEqual(getPlanningCandidateRowLookupState(openedRow), { kind: "selected", songId: available.songId }, "opening candidates over unchanged confirmed text remains a valid selected-row state");
assert.equal(getPlanningCandidateRowLookupState({ ...openedRow, songSearch: "30" }).kind, "lookup", "only edited non-confirmed lookup text blocks persistence/workspace departure");
'''
if test.count(anchor) != 1:
    raise RuntimeError('phase-31-17 test openedRow anchor mismatch')
test = test.replace(anchor, addition, 1)

anchor2 = 'assert.equal(memoryCandidates[0]?.melodyClassId, "demo-class");\n'
addition2 = '''assert.equal(memoryCandidates[0]?.melodyClassId, "demo-class");
const polishContextCandidates = queryCandidatesFromData(songs, preferences, new Set(["demo-cz"]), knowledge, { serviceDate: "2026-08-09", serviceLanguage: "polish", organistPersonId: "demo-organist", preferenceThreshold: 0 });
assert.equal(polishContextCandidates.some((candidate) => candidate.songId === "demo-cz"), false, "a Czech selected song is not an available candidate after the service language changes to Polish");
'''
if test.count(anchor2) != 1:
    raise RuntimeError('phase-31-17 memory candidate anchor mismatch')
test = test.replace(anchor2, addition2, 1)

console_anchor = 'console.log("Phase 31.17 inline melody-class detail and equivalent navigation: PASS");'
extra = '''assert.match(clientSource, /rows\.map\(getPlanningCandidateRowLookupState\)/, "confirmed lookup text is distinguished from a genuinely edited lookup query");
assert.match(clientSource, /candidateAvailabilityKey[\\s\\S]*?interactionClient\.queryCandidates[\\s\\S]*?candidateUsages: getCanonicalCandidateUsages\(selected\.rowId\)/, "selected candidates are revalidated against the current authoritative candidate context and row-specific occupancy");
assert.match(clientSource, /Every candidate must be available\./, "unavailable selected candidates share one set-level blocking message");
assert.match(clientSource, /hasCandidateAvailabilityBlock/, "candidate availability blocks persistence while stale, unavailable or failed to validate");
assert.match(clientSource, /selectionUnavailable=\{rowCandidateUnavailable\(row\)/, "the confirmed invalid Song lookup receives an explicit visual state");
assert.match(candidateListSource, /candidate-selection-unavailable/, "CandidateCombobox exposes the unavailable-selection visual class");
assert.match(candidateListSource, /aria-invalid=\{props\.selectionUnavailable \|\| undefined\}/, "the muted unavailable selection is also identified semantically");
assert.match(cssSource, /\.candidate-combobox input::placeholder,[\\s\\S]*?\.candidate-combobox input\.candidate-selection-unavailable[\\s\\S]*?color: var\(--muted\)/, "invalid confirmed text uses the same muted color as the empty Song lookup placeholder");

console.log("Phase 31.17 inline melody-class detail and equivalent navigation: PASS");'''
if test.count(console_anchor) != 1:
    raise RuntimeError('phase-31-17 console anchor mismatch')
test = test.replace(console_anchor, extra, 1)
test_path.write_text(test, encoding='utf-8')

# Static workflow guard also records the new action-level validation contract.
static_path = ROOT / 'scripts/planning-ui-workflow-static-tests.ts'
static = static_path.read_text(encoding='utf-8')
static = static.replace(
    '  "Every row must include either a complete song reference or a non-empty textual note.",',
    '  "Every row must include either a complete song reference or a non-empty textual note.",\n  "Every candidate must be available.",',
    1,
)
static_path.write_text(static, encoding='utf-8')

# Contract: this refinement is deliberately context-wide, not a language-only exception.
contract_path = ROOT / 'docs/phase-31-17-contract.md'
contract = contract_path.read_text(encoding='utf-8')
contract += '''

## HUMAN checkpoint update — context-sensitive selected-candidate validity (2026-08-08)

Browser-confirmed before this implementation:

- heavier row-control glyphs: PASS;
- active candidate contour encloses number/title/Detail: PASS;
- centralized Planning action validation placement and unified empty-row message: PASS.

Refinement now required:

- opening candidates over an unchanged confirmed and currently available Song lookup is a valid selected-row state; it must not emit `Select a candidate or cancel the active lookup before leaving Planning.` and must not by itself block Save Working Set;
- only manually changed non-confirmed lookup text is an active lookup state that blocks persistence/workspace departure;
- every selected catalog song is revalidated against the current authoritative candidate context whenever candidate-relevant Service context or current-row occupancy changes;
- candidate-relevant context includes service date, service language, organist/repertoire, authoritative antiphon/context candidate inputs, current plan identity and the current/historical usage snapshot used by the melody window and occupancy rules;
- if at least one selected candidate is no longer available, action-level validation contains one unified `Every candidate must be available.` message and persistence/finalization actions are blocked;
- a confirmed unavailable Song lookup remains visible so the user can repair it, but its text is muted to the same visual color as the empty `Song lookup` placeholder;
- changing Czech → Polish therefore leaves a previously selected Czech song visible but unavailable/muted until replaced (or the context is changed back);
- a failed fresh availability check blocks persistence with `Candidate availability could not be checked.` rather than silently trusting a stale snapshot;
- historical song snapshots without a catalog song id keep the established historical fallback behavior and are not falsely classified as current catalog candidates.
'''
contract_path.write_text(contract, encoding='utf-8')
