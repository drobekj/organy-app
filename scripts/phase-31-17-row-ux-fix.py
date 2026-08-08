from pathlib import Path
import re
import textwrap

ROOT = Path('.')


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one anchor, found {count}: {old[:100]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


# Planning display and explicit whole-row clearing.
flow_path = ROOT / 'src/planning-lifecycle/candidate-flow.ts'
flow = flow_path.read_text(encoding='utf-8')
flow = flow.replace(
    '  | { type: "songCleared" }\n  | { type: "noteChanged"; note: string };',
    '  | { type: "songCleared" }\n  | { type: "rowCleared" }\n  | { type: "noteChanged"; note: string };',
    1,
)
flow = flow.replace(
    '      return { ...row, songSearch: formatSongLabel(action.song), selectedSong: action.song, selectedCandidate: action.candidate, lookupOpen: false };',
    '      return { ...row, songSearch: formatPlanningSongField(action.song), selectedSong: action.song, selectedCandidate: action.candidate, lookupOpen: false };',
    1,
)
flow = flow.replace(
    '    case "songCleared":\n      return { ...row, songSearch: "", selectedSong: undefined, selectedCandidate: undefined, lookupOpen: false };\n    case "noteChanged":',
    '    case "songCleared":\n      return { ...row, songSearch: "", selectedSong: undefined, selectedCandidate: undefined, lookupOpen: false };\n    case "rowCleared":\n      return { ...row, songSearch: "", selectedSong: undefined, selectedCandidate: undefined, note: "", lookupOpen: false };\n    case "noteChanged":',
    1,
)
flow = flow.replace(
    '  return { ...row, lookupOpen: false, songSearch: row.selectedSong ? formatSongLabel(row.selectedSong) : "" };',
    '  return { ...row, lookupOpen: false, songSearch: row.selectedSong ? formatPlanningSongField(row.selectedSong) : "" };',
    1,
)
flow = flow.replace(
    'export function formatSongLabel(song: { language: ConcreteSongLanguage; number: string; title?: string }): string {',
    'export function formatPlanningSongField(song: { number: string; title?: string }): string {\n  return `${song.number}${song.title ? ` — ${song.title}` : ""}`;\n}\n\nexport function formatSongLabel(song: { language: ConcreteSongLanguage; number: string; title?: string }): string {',
    1,
)
flow_path.write_text(flow, encoding='utf-8')

# Candidate list closes when its field truly loses interaction focus, while clicks inside remain safe.
list_path = ROOT / 'src/planning-lifecycle/candidate-list.tsx'
component = list_path.read_text(encoding='utf-8')
component = component.replace(
    '  const listRef = useRef<HTMLDivElement>(null);\n  const autoScrolled = useRef(false);',
    '  const listRef = useRef<HTMLDivElement>(null);\n  const rootRef = useRef<HTMLDivElement>(null);\n  const autoScrolled = useRef(false);',
    1,
)
component = component.replace(
    '  const candidateIds = useMemo(() => props.candidates.map((candidate) => candidate.songId).join("|"), [props.candidates]);\n\n  useEffect(() => {',
    '''  const candidateIds = useMemo(() => props.candidates.map((candidate) => candidate.songId).join("|"), [props.candidates]);

  useEffect(() => {
    if (!props.open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && rootRef.current && !rootRef.current.contains(target)) props.onCancel();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [props.open, props.onCancel]);

  useEffect(() => {''',
    1,
)
component = component.replace(
    '    <div className="candidate-combobox">\n      <input',
    '''    <div
      ref={rootRef}
      className="candidate-combobox"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (props.open && next instanceof Node && !event.currentTarget.contains(next)) props.onCancel();
      }}
    >
      <input''',
    1,
)
component = component.replace(
    '        aria-autocomplete="list"\n        aria-expanded={props.open}',
    '        aria-label="Song lookup"\n        aria-autocomplete="list"\n        aria-expanded={props.open}',
    1,
)
component = component.replace('        placeholder="Search by number or title"', '        placeholder="Song lookup"', 1)
list_path.write_text(component, encoding='utf-8')

# Compact, invariant row skeleton and icon palette.
client_path = ROOT / 'app/planning-lifecycle-client.tsx'
client = client_path.read_text(encoding='utf-8')
client = client.replace('import { CandidateLine } from "../src/planning-lifecycle/candidate-line";\n', '', 1)
client = client.replace(
    'candidateToSelectedSong, formatSongLabel, rehydrateCandidateFromSelectedSong, openSingleCandidateRow',
    'candidateToSelectedSong, formatPlanningSongField, formatSongLabel, rehydrateCandidateFromSelectedSong, openSingleCandidateRow',
    1,
)
client = client.replace('songSearch: row.song ? formatSongLabel(row.song) : "",', 'songSearch: row.song ? formatPlanningSongField(row.song) : "",', 1)

clear_pattern = re.compile(r'  function clearSong\(rowId: number\) \{.*?\n  \}\n\n  function cancelActiveLookup', re.S)
clear_replacement = '''  function clearRow(rowId: number) {
    resetDetailEligibility();
    lookupTracker.invalidatePrefix("song:");
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "rowCleared" }) : row)));
    setPlanningExpansion(null);
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
  }

  function focusNoteField(rowId: number) {
    lookupTracker.invalidatePrefix("song:");
    setRows((currentRows) => currentRows.map((row) => row.lookupOpen ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
    setPlanningExpansion(null);
    resetDetailEligibility();
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
    activateExistingRow(rowId);
  }

  function cancelActiveLookup'''
client, count = clear_pattern.subn(clear_replacement, client, count=1)
if count != 1:
    raise RuntimeError(f'app/planning-lifecycle-client.tsx: clearSong block replacements={count}')

actions_pattern = re.compile(
    r'(\s*<legend>Row \{index \+ 1\}</legend>\n)\s*<div className="row-actions">.*?</div>\n\s*<div className="row-fields">',
    re.S,
)
actions_replacement = r'''\1                  <div className="row-icon-palette" role="group" aria-label={`Row ${index + 1} controls`}>
                    <button type="button" className="row-icon-button" aria-label="Move row up" title="Move row up" onClick={() => moveRow(index, -1)} disabled={!canEditRows || index === 0}>↑</button>
                    <button type="button" className="row-icon-button" aria-label="Move row down" title="Move row down" onClick={() => moveRow(index, 1)} disabled={!canEditRows || index === rows.length - 1}>↓</button>
                    <button type="button" className="row-icon-button" aria-label="Clear row" title="Clear row" onClick={() => clearRow(row.id)} disabled={!canEditRows || (!row.selectedSong && !row.note.trim() && !row.songSearch.trim() && planningExpansion?.rowId !== row.id)}>↶</button>
                    <button type="button" className="row-icon-button row-icon-remove" aria-label="Remove row" title="Remove row" onClick={() => removeRow(row.id)} disabled={!canEditRows || rows.length === 1}>×</button>
                  </div>
                  <div className="compact-row-fields">'''
client, count = actions_pattern.subn(actions_replacement, client, count=1)
if count != 1:
    raise RuntimeError(f'app/planning-lifecycle-client.tsx: row action block replacements={count}')

start_marker = '                  <div className="compact-row-fields">'
end_marker = '                  {planningExpansion?.kind === "selectedSongDetail"'
start = client.index(start_marker)
end = client.index(end_marker, start)
old_segment = client[start:end]
combo_match = re.search(r'<CandidateCombobox\b.*?\n\s*/>', old_segment, re.S)
if not combo_match:
    raise RuntimeError('CandidateCombobox JSX not found inside row field block')
combo = textwrap.indent(textwrap.dedent(combo_match.group(0)).strip(), '                      ')
new_segment = f'''                  <div className="compact-row-fields">
                    <div className="song-field-row">
{combo}
                      <button
                        id={{`selected-song-detail-button-${{row.id}}`}}
                        type="button"
                        className="song-field-detail"
                        disabled={{!row.selectedSong}}
                        onClick={{() => row.selectedSong && openSelectedSongDetail(row.id, row.selectedCandidate ?? candidateFromSelectedSong(row.selectedSong))}}
                      >
                        Detail
                      </button>
                    </div>
                    <input
                      className="row-note-input"
                      aria-label={{`Text note for Row ${{index + 1}}`}}
                      type="text"
                      value={{row.note}}
                      readOnly={{!canEditRows}}
                      onFocus={{() => focusNoteField(row.id)}}
                      onChange={{(event) => updateRow(row.id, {{ note: event.target.value }})}}
                      placeholder="Text note"
                    />
                  </div>
'''
client = client[:start] + new_segment + client[end:]
if '<CandidateLine' in client or 'clearSong(' in client:
    raise RuntimeError('Legacy selected CandidateLine or clearSong remains in Planning row')
client_path.write_text(client, encoding='utf-8')

# Compact row visual hierarchy: legend left, icon palette right, exactly two base fields.
css_path = ROOT / 'app/globals.css'
css = css_path.read_text(encoding='utf-8')
css += r'''

/* Phase 31.17 HUMAN refinement: invariant compact Planning row. */
.row-card {
  position: relative;
}

.row-icon-palette {
  align-items: center;
  background: var(--surface);
  display: flex;
  gap: 0.2rem;
  padding: 0 0.35rem;
  position: absolute;
  right: 0.75rem;
  top: -1rem;
}

.row-icon-button {
  align-items: center;
  border-radius: 0.35rem;
  display: inline-flex;
  font-size: 1.05rem;
  height: 1.9rem;
  justify-content: center;
  line-height: 1;
  padding: 0;
  width: 1.9rem;
}

.row-icon-remove {
  color: var(--danger);
}

.compact-row-fields {
  display: grid;
  gap: 0.55rem;
  min-width: 0;
}

.song-field-row {
  align-items: start;
  display: grid;
  gap: 0.45rem;
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 0;
}

.song-field-detail {
  align-self: start;
  border-radius: 0.65rem;
  min-width: 4.7rem;
  padding: 0.65rem 0.75rem;
}

.row-note-input {
  width: 100%;
}

@media (max-width: 520px) {
  .row-card {
    padding-top: 1.35rem;
  }

  .row-icon-palette {
    right: 0.45rem;
  }
}
'''
css_path.write_text(css, encoding='utf-8')

# Current contract and authoritative knowledge.
contract_path = ROOT / 'docs/phase-31-17-contract.md'
contract = contract_path.read_text(encoding='utf-8')
contract += '''

## HUMAN row-UX refinement — 2026-08-06

The first browser checkpoint confirmed the Phase 31.17 behavior but requested a compact invariant row protocol before approval:

- every row keeps one outer `Row N` fieldset in all empty, partial and selected states;
- the upper border carries `Row N` on the left and the compact control palette on the right;
- palette order and meaning are `↑` move up, `↓` move down, `↶` clear row contents, `×` remove row;
- the interior has exactly two permanent base fields: song lookup and text note, with no visible labels above them;
- empty-field guidance is provided by the placeholders `Song lookup` and `Text note`;
- after selection, the collapsed song field contains only the concrete song number and title; language, repertoire, preference, signals, equivalents and score context remain in the candidate list or Detail;
- Detail remains on the right side of the song field and is disabled only when no song is selected;
- focusing the note field or otherwise leaving the lookup interaction closes the candidate list and restores the confirmed number/title or an empty field;
- `↶` clears both the selected song and the text note, closes list/detail state and remains available for note-only rows;
- `×` removes the whole row;
- candidate list, inline detail, validation, occupancy and persistence behavior otherwise remain unchanged.

A fresh exact-head automated gate and focused browser HUMAN checkpoint are required after this refinement.
'''
contract_path.write_text(contract, encoding='utf-8')

knowledge_path = ROOT / 'docs/candidate-selection-knowledge-transfer.md'
knowledge = knowledge_path.read_text(encoding='utf-8')
knowledge += '''

## Compact Planning row protocol

The Phase 31.17 browser refinement fixes the collapsed Planning-row presentation:

- the selected song field shows only concrete number and title;
- all other candidate and melody metadata remains in the list or inline Detail;
- each row always presents the same two base fields, `Song lookup` and `Text note`;
- the border-level control palette is ordered `↑`, `↓`, `↶`, `×`;
- `↶` clears both song and note while preserving the row, including note-only rows;
- `×` removes the row;
- leaving the active lookup closes its candidate list and restores the confirmed number/title.
'''
knowledge_path.write_text(knowledge, encoding='utf-8')

# Align superseded UI expectations and strengthen focused evidence.
for test_file in ['scripts/phase-31-16-tests.tsx', 'scripts/phase-30-1-candidate-flow-tests.ts']:
    path = ROOT / test_file
    test = path.read_text(encoding='utf-8')
    test = test.replace('czech 29 — Current', '29 — Current')
    test = test.replace('czech 421 — Equivalent', '421 — Equivalent')
    test = test.replace('czech 101 — Visible', '101 — Visible')
    path.write_text(test, encoding='utf-8')

static_path = ROOT / 'scripts/planning-ui-workflow-static-tests.ts'
static = static_path.read_text(encoding='utf-8')
static = static.replace(
    '  "onOpenDetail={() => openSelectedSongDetail(row.id, row.selectedCandidate ?? candidateFromSelectedSong(row.selectedSong!))}",\n  "<CandidateLine",',
    '  "openSelectedSongDetail(row.id",\n  "row-icon-palette",\n  "placeholder=\\"Text note\\"",',
    1,
)
static = static.replace(
    'for (const required of ["position: sticky", ".candidate-popup", ".candidate-detail-button", "@media (max-width: 899px)", ".candidate-option-current"])',
    'for (const required of ["position: sticky", ".candidate-popup", ".candidate-detail-button", "@media (max-width: 899px)", ".candidate-option-current", ".row-icon-palette", ".compact-row-fields"])',
    1,
)
static_path.write_text(static, encoding='utf-8')

phase_path = ROOT / 'scripts/phase-31-17-tests.tsx'
phase = phase_path.read_text(encoding='utf-8')
phase = phase.replace(
    'import { CandidateCombobox } from "../src/planning-lifecycle/candidate-list";\n',
    'import { CandidateCombobox } from "../src/planning-lifecycle/candidate-list";\nimport { formatPlanningSongField, planningCandidateRowReducer } from "../src/planning-lifecycle/candidate-flow";\n',
    1,
)
phase = phase.replace(
    'const clientSource = readFileSync("app/planning-lifecycle-client.tsx", "utf8");',
    '''assert.equal(formatPlanningSongField({ number: "29", title: "Czech song" }), "29 — Czech song");
const clearedRow = planningCandidateRowReducer({
  id: 1,
  songSearch: "29 — Czech song",
  selectedSong: { songId: available.songId, language: available.language, number: available.number, title: available.title },
  selectedCandidate: available,
  note: "clear this note",
  lookupOpen: false,
}, { type: "rowCleared" });
assert.equal(clearedRow.selectedSong, undefined);
assert.equal(clearedRow.selectedCandidate, undefined);
assert.equal(clearedRow.note, "");
assert.equal(clearedRow.songSearch, "");

const clientSource = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const candidateListSource = readFileSync("src/planning-lifecycle/candidate-list.tsx", "utf8");''',
    1,
)
phase = phase.replace(
    'assert.doesNotMatch(clientSource, /onOpenDetail=\\{\\(\\) => row\\.selectedSong\\?\\.songId && openCatalogSongDetail/);',
    '''assert.doesNotMatch(clientSource, /onOpenDetail=\\{\\(\\) => row\\.selectedSong\\?\\.songId && openCatalogSongDetail/);
assert.doesNotMatch(clientSource, /<CandidateLine/);
assert.match(clientSource, /className="row-icon-palette"/);
assert.ok(clientSource.indexOf('aria-label="Move row up"') < clientSource.indexOf('aria-label="Move row down"'));
assert.ok(clientSource.indexOf('aria-label="Move row down"') < clientSource.indexOf('aria-label="Clear row"'));
assert.ok(clientSource.indexOf('aria-label="Clear row"') < clientSource.indexOf('aria-label="Remove row"'));
assert.match(clientSource, />↶<\\/button>/);
assert.match(clientSource, /placeholder="Text note"/);
assert.match(candidateListSource, /placeholder="Song lookup"/);
assert.match(candidateListSource, /closeOnOutsidePointer/);''',
    1,
)
phase_path.write_text(phase, encoding='utf-8')

print('Phase 31.17 compact-row HUMAN refinement applied.')
