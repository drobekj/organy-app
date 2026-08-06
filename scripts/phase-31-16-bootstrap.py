from __future__ import annotations

import json
import re
from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(source: str, before: str, after: str, label: str) -> str:
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"Expected one anchor for {label}, found {count}")
    return source.replace(before, after, 1)


def replace_regex_once(source: str, pattern: str, after: str, label: str) -> str:
    updated, count = re.subn(pattern, after, source, count=1, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError(f"Expected one regex anchor for {label}, found {count}")
    return updated


flow = read("src/planning-lifecycle/candidate-flow.ts")
flow = replace_once(
    flow,
    'export const PHASE_30_1_PREFERENCE_THRESHOLD = 1;',
    'export const PHASE_30_1_PREFERENCE_THRESHOLD = 0;',
    "candidate-flow default threshold",
)
flow = replace_once(
    flow,
    '''export type PlanningCandidateRowAction =
  | { type: "lookupChanged"; text: string }
''',
    '''export type PlanningCandidateRowAction =
  | { type: "lookupOpened" }
  | { type: "lookupChanged"; text: string }
''',
    "lookup-open action",
)
flow = replace_once(
    flow,
    '''  switch (action.type) {
    case "lookupChanged":
''',
    '''  switch (action.type) {
    case "lookupOpened":
      return { ...row, songSearch: "", lookupOpen: true };
    case "lookupChanged":
''',
    "lookup-open reducer",
)
flow = replace_once(
    flow,
    '''export function restoreRowsExceptActive<T extends PlanningCandidateEditableRow>(rows: T[], targetRowId: number): T[] {
  return rows.map((row) => row.id === targetRowId ? row : row.lookupOpen ? restoreConfirmedCandidate(row) : row);
}
''',
    '''export function restoreRowsExceptActive<T extends PlanningCandidateEditableRow>(rows: T[], targetRowId: number): T[] {
  return rows.map((row) => row.id === targetRowId ? row : row.lookupOpen ? restoreConfirmedCandidate(row) : row);
}

export function openSingleCandidateRow<T extends PlanningCandidateEditableRow>(rows: T[], targetRowId: number): T[] {
  return rows.map((row) => row.id === targetRowId
    ? planningCandidateRowReducer(row, { type: "lookupOpened" }) as T
    : row.lookupOpen ? restoreConfirmedCandidate(row) : row);
}
''',
    "single-open helper",
)
write("src/planning-lifecycle/candidate-flow.ts", flow)

client = read("app/planning-lifecycle-client.tsx")
client = replace_once(
    client,
    '''import { CandidateLine } from "../src/planning-lifecycle/candidate-line";
import { buildCandidateQueryInput, buildCanonicalCandidateUsages, candidateToSelectedSong, formatSongLabel, rehydrateCandidateFromSelectedSong, getCandidatePopupRows, planningCandidateRowReducer, restoreRowsExceptActive } from "../src/planning-lifecycle/candidate-flow";
''',
    '''import { CandidateLine } from "../src/planning-lifecycle/candidate-line";
import { CandidateCombobox } from "../src/planning-lifecycle/candidate-list";
import { buildCandidateQueryInput, buildCanonicalCandidateUsages, candidateToSelectedSong, formatSongLabel, rehydrateCandidateFromSelectedSong, openSingleCandidateRow, planningCandidateRowReducer, restoreRowsExceptActive } from "../src/planning-lifecycle/candidate-flow";
''',
    "client candidate imports",
)
client = client.replace("refreshOpenSongLookupsOnContextChange, ", "", 1)
client = replace_once(
    client,
    'const PHASE_30_1_PREFERENCE_THRESHOLD = 1;',
    'const PHASE_30_1_PREFERENCE_THRESHOLD = 0;',
    "client default threshold",
)
client = replace_once(
    client,
    '''  const [candidateResults, setCandidateResults] = useState<Record<number, CandidateQueryResult[]>>({});
''',
    '''  const [candidateResults, setCandidateResults] = useState<Record<number, CandidateQueryResult[]>>({});
  const [openCandidateRowId, setOpenCandidateRowId] = useState<number | null>(null);
  const [candidateLoading, setCandidateLoading] = useState<Record<number, boolean>>({});
  const [candidateErrors, setCandidateErrors] = useState<Record<number, string | undefined>>({});
  const [candidateRefreshGeneration, setCandidateRefreshGeneration] = useState(0);
''',
    "candidate-list state",
)
client = replace_once(
    client,
    '''  const serviceContextRecordKey = `${serviceContextGeneration}:${completedRecord ? `completed:${completedRecord.id}` : persistedSet ? `set:${persistedSet.id}:${persistedSet.status}` : "new"}`;
  useEffect(() => {
    lookupTracker.invalidatePrefix("song:");
    setCandidateResults({});
    void refreshOpenSongLookupsOnContextChange(rows, queryCandidateResults);
  }, [runtimeMode, serviceContextRecordKey, organistId, referenceAntiphon?.id, serviceLanguage, serviceDate, lookupTracker]);
''',
    '''  const serviceContextRecordKey = `${serviceContextGeneration}:${completedRecord ? `completed:${completedRecord.id}` : persistedSet ? `set:${persistedSet.id}:${persistedSet.status}` : "new"}`;
  const candidateRecordKeyRef = useRef(serviceContextRecordKey);
  useEffect(() => {
    const recordChanged = candidateRecordKeyRef.current !== serviceContextRecordKey;
    candidateRecordKeyRef.current = serviceContextRecordKey;
    lookupTracker.invalidatePrefix("song:");
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
    if (recordChanged) {
      setOpenCandidateRowId(null);
      setRows((currentRows) => currentRows.map((row) => row.lookupOpen ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
      return;
    }
    if (openCandidateRowId !== null) {
      const openRow = rows.find((row) => row.id === openCandidateRowId);
      if (openRow) void queryCandidateResults(openRow.id, openRow.songSearch);
    }
  }, [runtimeMode, serviceContextRecordKey, organistId, referenceAntiphon?.id, serviceLanguage, serviceDate, lookupTracker, candidateRefreshGeneration]);
''',
    "context refresh effect",
)
client = replace_regex_once(
    client,
    r'''  async function queryCandidateResults\(rowId: number, value: string\) \{.*?\n  function selectCandidate\(rowId: number, candidate: CandidateQueryResult\) \{''',
    '''  async function queryCandidateResults(rowId: number, value: string) {
    const scope = getSongLookupScope(rowId);
    const languageAtRequest = serviceLanguage;
    const requestIdentity = [runtimeMode, serviceContextRecordKey, serviceDate, languageAtRequest, organistId ?? "", referenceAntiphon?.id ?? "", value].join("|");
    const token = lookupTracker.begin(scope, requestIdentity);
    setCandidateLoading((current) => ({ ...current, [rowId]: true }));
    setCandidateErrors((current) => ({ ...current, [rowId]: undefined }));
    setCandidateResults((current) => ({ ...current, [rowId]: [] }));
    try {
      const candidates = await interactionClient.queryCandidates({ serviceDate, serviceLanguage: languageAtRequest, organistPersonId: organistId, referenceAntiphonId: referenceAntiphon?.id, antiphonKey: candidateAntiphonKey, liturgicalSeasonKey: candidateSeasonKey, queryText: value, preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD, candidateUsages: getCanonicalCandidateUsages(rowId), currentPlanId: persistedSet?.id });
      if (!lookupTracker.isCurrent(token, requestIdentity)) return;
      setCandidateResults((current) => ({ ...current, [rowId]: candidates }));
      setCandidateLoading((current) => ({ ...current, [rowId]: false }));
      setCandidateErrors((current) => ({ ...current, [rowId]: undefined }));
      setServiceError(null);
    } catch (error) {
      if (!lookupTracker.isCurrent(token, requestIdentity)) return;
      const candidateError = error as Error & { code?: PlanningServiceError["code"] };
      const message = candidateError.message || "Candidate lookup failed.";
      setCandidateResults((current) => ({ ...current, [rowId]: [] }));
      setCandidateLoading((current) => ({ ...current, [rowId]: false }));
      setCandidateErrors((current) => ({ ...current, [rowId]: message }));
      setServiceError({ code: candidateError.code ?? "invalidInput", message });
    }
  }

  function openCandidateList(rowId: number) {
    if (!canEditRows || openCandidateRowId === rowId) return;
    lookupTracker.invalidatePrefix("song:");
    setRows((currentRows) => openSingleCandidateRow(currentRows, rowId));
    setOpenCandidateRowId(rowId);
    setCandidateResults({});
    setCandidateLoading({ [rowId]: true });
    setCandidateErrors({});
    void queryCandidateResults(rowId, "");
  }

  async function updateSongSearch(rowId: number, value: string) {
    setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "lookupChanged", text: value }) : row));
    await queryCandidateResults(rowId, value);
  }

  function closeCandidateList(rowId: number) {
    lookupTracker.invalidate(getSongLookupScope(rowId));
    setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
    if (openCandidateRowId === rowId) setOpenCandidateRowId(null);
    setCandidateResults((current) => { const next = { ...current }; delete next[rowId]; return next; });
    setCandidateLoading((current) => { const next = { ...current }; delete next[rowId]; return next; });
    setCandidateErrors((current) => { const next = { ...current }; delete next[rowId]; return next; });
  }

  function selectCandidate(rowId: number, candidate: CandidateQueryResult) {''',
    "candidate query/open block",
)
client = replace_regex_once(
    client,
    r'''  function selectCandidate\(rowId: number, candidate: CandidateQueryResult\) \{.*?\n  function activateExistingRow\(rowId: number\) \{''',
    '''  function selectCandidate(rowId: number, candidate: CandidateQueryResult) {
    if (candidate.availability.kind !== "available") {
      setServiceError({ code: "invalidInput", message: `Same melody is already used in ${candidate.availability.rows.map((row) => row.label).join(" and ")}.` });
      return;
    }
    const currentRow = rows.find((row) => row.id === rowId);
    lookupTracker.invalidatePrefix("song:");
    if (currentRow?.selectedSong?.songId === candidate.songId) {
      setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "candidateSelected", song: candidateToSelectedSong(candidate), candidate }) : row));
    } else {
      guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "candidateSelected", song: candidateToSelectedSong(candidate), candidate }) : row)));
    }
    setOpenCandidateRowId(null);
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
  }

  function clearSong(rowId: number) {
    lookupTracker.invalidatePrefix("song:");
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "songCleared" }) : row)));
    setOpenCandidateRowId(null);
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
  }

  function cancelActiveLookup(rowId: number) {
    closeCandidateList(rowId);
    setServiceError(null);
  }

  function activateExistingRow(rowId: number) {''',
    "candidate selection/close block",
)
client = replace_once(
    client,
    '''  function removeRow(id: number) {
    lookupTracker.invalidatePrefix("song:");
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.filter((row) => row.id !== id)));
    setSongResults({});
    setCandidateResults({});
  }
''',
    '''  function removeRow(id: number) {
    lookupTracker.invalidatePrefix("song:");
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.filter((row) => row.id !== id)));
    if (openCandidateRowId === id) setOpenCandidateRowId(null);
    else if (openCandidateRowId !== null) setCandidateRefreshGeneration((generation) => generation + 1);
    setSongResults({});
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
  }
''',
    "remove-row list state",
)
client = replace_once(
    client,
    '''    lookupTracker.invalidatePrefix("song:");
    setSongResults({});
    setCandidateResults({});
    setSaveState("unsaved");
    setServiceError(null);
  }

  function updateServiceLanguage''',
    '''    lookupTracker.invalidatePrefix("song:");
    setSongResults({});
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
    if (openCandidateRowId !== null) setCandidateRefreshGeneration((generation) => generation + 1);
    setSaveState("unsaved");
    setServiceError(null);
  }

  function updateServiceLanguage''',
    "move-row list refresh",
)
client = replace_once(
    client,
    '''    setWorkspace(nextWorkspace);
  }

  function openCatalogSongDetail''',
    '''    if (nextWorkspace !== workspace && workspace === "planning") {
      lookupTracker.invalidatePrefix("song:");
      setOpenCandidateRowId(null);
      setCandidateResults({});
      setCandidateLoading({});
      setCandidateErrors({});
      setRows((currentRows) => currentRows.map((row) => row.lookupOpen ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
    }
    setWorkspace(nextWorkspace);
  }

  function openCatalogSongDetail''',
    "workspace list close",
)
client = replace_once(
    client,
    '''                      <input
                        type="text"
                        value={row.songSearch}
                        onChange={(event) => { void updateSongSearch(row.id, event.target.value); }}
                        placeholder="Search by number or title"
                        disabled={!canEditRows}
                      />
''',
    '''                      <CandidateCombobox
                        rowId={row.id}
                        rowLabel={`Row ${index + 1}`}
                        open={openCandidateRowId === row.id}
                        value={row.songSearch}
                        selectedSong={row.selectedSong}
                        candidates={candidateResults[row.id] ?? []}
                        loading={candidateLoading[row.id] ?? false}
                        error={candidateErrors[row.id]}
                        serviceLanguage={serviceLanguage}
                        disabled={!canEditRows}
                        onOpen={() => openCandidateList(row.id)}
                        onQueryChange={(value) => { void updateSongSearch(row.id, value); }}
                        onSelect={(candidate) => selectCandidate(row.id, candidate)}
                        onCancel={() => cancelActiveLookup(row.id)}
                        onRetry={() => { void queryCandidateResults(row.id, row.songSearch); }}
                      />
''',
    "combobox render",
)
client = replace_regex_once(
    client,
    r'''\n                      \{getCandidatePopupRows\(candidateResults\[row\.id\] \?\? \[\]\)\.length > 0 && canEditRows && \(.*?\n                      \)\}''',
    "",
    "remove provisional popup",
)
write("app/planning-lifecycle-client.tsx", client)

css = read("app/globals.css")
css += '''

.candidate-combobox {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}

.candidate-listbox {
  align-content: start;
  overflow-anchor: none;
}

.candidate-list-state,
.candidate-current-context {
  border-radius: 0.65rem;
  margin: 0;
  padding: 0.65rem 0.75rem;
}

.candidate-list-state {
  background: #f2f4f7;
  color: var(--muted);
}

.candidate-list-error {
  background: #fef3f2;
  color: var(--danger);
  display: grid;
  gap: 0.5rem;
}

.candidate-list-error p {
  margin: 0;
}

.candidate-list-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.candidate-current-context {
  background: #fff7ed;
  border: 1px solid #f79009;
  display: grid;
  gap: 0.25rem;
}

.candidate-option {
  border-bottom: 1px solid var(--border);
  scroll-margin-block: 0.5rem;
}

.candidate-option > button {
  border: 0;
  border-radius: 0.65rem;
  display: grid;
  gap: 0.25rem;
  text-align: left;
  width: 100%;
}

.candidate-option-active > button {
  outline: 3px solid #84adff;
  outline-offset: -3px;
}

.candidate-option-current > button {
  background: #eff6ff;
}

.candidate-option-disabled > button {
  opacity: 0.72;
}

.candidate-option-main {
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.candidate-option-main strong {
  font-size: 1rem;
}

.candidate-option-meta,
.candidate-current-marker,
.candidate-unavailable-reason {
  color: var(--muted);
  font-size: 0.82rem;
}

.candidate-current-marker {
  color: #175cd3;
  font-weight: 700;
}

.candidate-unavailable-reason {
  color: var(--danger);
  font-weight: 700;
}

.candidate-list-cancel {
  justify-self: start;
  margin-top: 0.35rem;
}
'''
write("app/globals.css", css)

package = json.loads(read("package.json"))
package["scripts"]["test:phase-31-16"] = "tsx scripts/phase-31-16-tests.tsx"
package["scripts"]["verify:phase-31-16"] = "npm run test:phase-31-16 && npm run verify:phase-31-15"
package["scripts"]["verify:phase-31-16:local"] = "tsx scripts/verify-phase-31-16-local.ts"
write("package.json", json.dumps(package, indent=2) + "\n")

old_tests = read("scripts/phase-30-1-candidate-flow-tests.ts")
old_tests = replace_once(
    old_tests,
    "assert.equal(PHASE_30_1_PREFERENCE_THRESHOLD, 1);",
    "assert.equal(PHASE_30_1_PREFERENCE_THRESHOLD, 0);",
    "superseded threshold regression",
)
write("scripts/phase-30-1-candidate-flow-tests.ts", old_tests)

static_tests = read("scripts/planning-ui-workflow-static-tests.ts")
static_tests = replace_once(
    static_tests,
    'const css = readFileSync("app/globals.css", "utf8");\n',
    'const css = readFileSync("app/globals.css", "utf8");\nconst candidateList = readFileSync("src/planning-lifecycle/candidate-list.tsx", "utf8");\n',
    "static candidate-list source",
)
static_tests = replace_once(
    static_tests,
    '  "role=\\"listbox\\"",\n  "Cancel lookup",\n',
    '  "<CandidateCombobox",\n',
    "moved list assertions",
)
static_tests = replace_once(
    static_tests,
    'for (const required of ["position: sticky", ".candidate-popup", ".candidate-detail-button", "@media (max-width: 899px)"]) {\n',
    'for (const required of ["position: sticky", ".candidate-popup", ".candidate-detail-button", "@media (max-width: 899px)", ".candidate-option-current"]) {\n',
    "candidate CSS assertion",
)
static_tests += '''
for (const required of ["role=\\"listbox\\"", "role=\\"combobox\\"", "aria-activedescendant", "Loading candidates", "No candidate matches", "Retry"]) {
  assert(candidateList.includes(required), `Candidate list UI is missing ${required}`);
}
'''
write("scripts/planning-ui-workflow-static-tests.ts", static_tests)

knowledge = read("docs/candidate-selection-knowledge-transfer.md")
knowledge = replace_once(
    knowledge,
    "- Phase 31.15 is authorized by issue #135 and implements current-service occupancy plus collision validation.\n",
    "- Phase 31.15, current-service occupancy and collision validation, is merged on `main` as commit `db67b168a05fb7604f22ccf25efbb4f48e3b61c2`.\n- Phase 31.16 is authorized by issue #137 and implements the single-open concrete candidate-list UI.\n",
    "phase history",
)
knowledge = replace_once(
    knowledge,
    "### Phase 31.15 — local melody occupancy and collision validation\n\nCurrent phase:",
    "### Phase 31.15 — local melody occupancy and collision validation\n\nCompleted and merged:",
    "31.15 status",
)
knowledge = replace_once(
    knowledge,
    "### Phase 31.16 — concrete candidate-list UI\n\n- one open list;",
    "### Phase 31.16 — concrete candidate-list UI\n\nCurrent phase:\n\n- one open list;",
    "31.16 status",
)
write("docs/candidate-selection-knowledge-transfer.md", knowledge)

Path(__file__).unlink(missing_ok=True)
print("Phase 31.16 integration bootstrap completed.")
