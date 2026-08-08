from pathlib import Path
import re

ROOT = Path('.')


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one anchor, found {count}: {old[:120]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1) Candidate cursor encloses the whole candidate row, including Detail.
list_path = ROOT / 'src/planning-lifecycle/candidate-list.tsx'
component = list_path.read_text(encoding='utf-8')
component = component.replace(
    '  font-weight: 900;\n  height: 1.72rem;',
    '  font-weight: 900;\n  height: 1.72rem;',
    1,
)
component = component.replace(
    '''  width: 1.72rem;\n}\n.row-card .candidate-combobox { position: relative; }''',
    '''  width: 1.72rem;\n}\n.row-icon-palette .row-icon-button:not(.row-icon-remove) {\n  -webkit-text-stroke: 0.35px currentColor;\n  text-shadow: 0.25px 0 currentColor, -0.25px 0 currentColor;\n}\n.row-card .candidate-combobox { position: relative; }''',
    1,
)
component = component.replace(
    'className={`candidate-option-row${current ? " candidate-option-current" : ""}`}',
    'className={`candidate-option-row${current ? " candidate-option-current" : ""}${index === activeIndex && !current ? " candidate-option-active" : ""}`}',
    1,
)
component = component.replace(
    'className={`candidate-option${index === activeIndex && !current ? " candidate-option-active" : ""}${selectable ? "" : " candidate-option-disabled"}`}',
    'className={`candidate-option${selectable ? "" : " candidate-option-disabled"}`}',
    1,
)
list_path.write_text(component, encoding='utf-8')

# Canonical CSS: the active contour belongs to the complete candidate row, not only its text cell.
replace_once(
    'app/globals.css',
    '''.candidate-option-active .candidate-option-content {\n  outline: 3px solid #84adff;\n  outline-offset: -3px;\n}\n''',
    '''.candidate-option-row.candidate-option-active {\n  border-radius: 0.65rem;\n  outline: 3px solid #84adff;\n  outline-offset: -3px;\n}\n''',
)
css_path = ROOT / 'app/globals.css'
css = css_path.read_text(encoding='utf-8')
if '.planning-action-validation-list {' not in css:
    css += '''\n\n.planning-action-validation-list {\n  margin: 0;\n}\n'''
css_path.write_text(css, encoding='utf-8')

# 2) Validation belongs to one action-level bullet list between Rows and the action palette.
client_path = ROOT / 'app/planning-lifecycle-client.tsx'
client = client_path.read_text(encoding='utf-8')
client = client.replace(
    'canPerformPlanningAction, findMelodyCollisions, isValidServiceTime, melodyCollisionRowIssues, melodyCollisionSummary, normalizeServiceTime, validatePlanningRow',
    'canPerformPlanningAction, findMelodyCollisions, isValidServiceTime, melodyCollisionSummary, normalizeServiceTime, validatePlanningRow',
    1,
)
melody_map_pattern = re.compile(
    r'  const melodyIssuesByRow = useMemo\(\(\) => \{\n.*?\n  \}, \[melodyCollisions\]\);\n',
    re.S,
)
client, count = melody_map_pattern.subn('', client, count=1)
if count != 1:
    raise RuntimeError(f'app/planning-lifecycle-client.tsx: melodyIssuesByRow removal count={count}')

anchor = '''  const hasInvalidLookupState = !canAddOrPersistRows(rowLookupStates);\n  const workspaceLeaveState = canLeaveWorkspace(rowLookupStates);\n'''
replacement = '''  const hasInvalidLookupState = !canAddOrPersistRows(rowLookupStates);\n  const workspaceLeaveState = canLeaveWorkspace(rowLookupStates);\n  const hasEmptyRowValidation = validationResults.some((result) => result.issues.some((issue) => issue.path === "row"));\n  const planningActionValidationMessages = [\n    ...(!serviceDate ? ["Service date is required."] : []),\n    ...(!isValidServiceTime(serviceTime) ? ["Service time is required in HH:mm format between 00:00 and 23:59."] : []),\n    ...(!priestId ? ["Priest must be selected from lookup."] : []),\n    ...(!organistId ? ["Organist must be selected from lookup."] : []),\n    ...(hasEmptyRowValidation ? ["Every row must include either a complete song reference or a non-empty textual note."] : []),\n    ...validationResults.flatMap((result, index) => result.issues\n      .filter((issue) => issue.path !== "row")\n      .map((issue) => `Row ${index + 1}: ${issue.message}`)),\n    ...(hasInvalidLookupState ? [workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving."] : []),\n    ...(melodyFinalizationReason && !isCompletedRecordOpen && !isFinalSetOpen ? [melodyFinalizationReason] : []),\n    ...(completeDateReason ? [`Complete service disabled: ${completeDateReason}`] : []),\n  ].filter((message, index, messages) => messages.indexOf(message) === index);\n'''
if anchor not in client:
    raise RuntimeError('app/planning-lifecycle-client.tsx: action validation anchor not found')
client = client.replace(anchor, replacement, 1)

row_prelude = '''            {rows.map((row, index) => {\n              const validation = validationResults[index];\n              const melodyIssues = melodyIssuesByRow.get(row.id) ?? [];\n              const rowIssues = [...validation.issues, ...melodyIssues.map((issue) => ({ path: "song", message: issue.message }))];\n\n              return ('''
if row_prelude not in client:
    raise RuntimeError('app/planning-lifecycle-client.tsx: row validation prelude not found')
client = client.replace(
    row_prelude,
    '''            {rows.map((row, index) => {\n              return (''',
    1,
)

row_validation_pattern = re.compile(
    r'\n                  \{rowIssues\.length > 0 && \(\n                    <ul className="validation-list" aria-label=\{`Row \$\{index \+ 1\} validation errors`\}>\n.*?\n                  \)\}',
    re.S,
)
client, count = row_validation_pattern.subn('', client, count=1)
if count != 1:
    raise RuntimeError(f'app/planning-lifecycle-client.tsx: per-row validation removal count={count}')

form_actions_anchor = '''          </div>\n\n          <div className="form-actions">'''
central_list = '''          </div>\n\n          {planningActionValidationMessages.length > 0 && (\n            <ul className="validation-list planning-action-validation-list" aria-label="Planning action validation errors">\n              {planningActionValidationMessages.map((message) => <li key={message}>{message}</li>)}\n            </ul>\n          )}\n\n          <div className="form-actions">'''
if form_actions_anchor not in client:
    raise RuntimeError('app/planning-lifecycle-client.tsx: form actions anchor not found')
client = client.replace(form_actions_anchor, central_list, 1)

client = client.replace(
    '''          </div>\n          {melodyFinalizationReason && !isCompletedRecordOpen && !isFinalSetOpen && <p className="field-help" role="alert">{melodyFinalizationReason}</p>}\n          {completeDateReason && <p className="field-help">Complete service disabled: {completeDateReason}</p>}''',
    '''          </div>''',
    1,
)
if 'rowIssues' in client or 'melodyIssuesByRow' in client:
    raise RuntimeError('app/planning-lifecycle-client.tsx: stale per-row validation symbols remain')
client_path.write_text(client, encoding='utf-8')

# 3) Acceptance guards for the final browser-facing protocol.
test_path = ROOT / 'scripts/phase-31-17-tests.tsx'
test = test_path.read_text(encoding='utf-8')
insert_before = 'assert.match(candidateListSource, /\\.row-icon-palette \\.row-icon-button \\{[\\s\\S]*?font-size: 1rem;[\\s\\S]*?font-weight: 900;[\\s\\S]*?height: 1\\.72rem;[\\s\\S]*?width: 1\\.72rem;/, "row controls become slightly smaller while their symbols become substantially bolder");\n'
if insert_before not in test:
    raise RuntimeError('scripts/phase-31-17-tests.tsx: icon assertion anchor not found')
extra = insert_before + '''assert.match(candidateListSource, /\\.row-icon-palette \\.row-icon-button:not\\(\\.row-icon-remove\\) \\{[\\s\\S]*?-webkit-text-stroke: 0\\.35px currentColor;[\\s\\S]*?text-shadow:/, "arrow glyphs receive additional stroke weight without changing control geometry");\nassert.match(candidateListSource, /className=\\{`candidate-option-row\\$\\{current \\? " candidate-option-current" : ""\\}\\$\\{index === activeIndex && !current \\? " candidate-option-active" : ""\\}`\\}/, "candidate cursor state belongs to the whole candidate row including Detail");\nassert.doesNotMatch(candidateListSource, /className=\\{`candidate-option\\$\\{index === activeIndex/, "candidate cursor must no longer be limited to the text cell");\nassert.match(cssSource, /\\.candidate-option-row\\.candidate-option-active \\{[\\s\\S]*?outline: 3px solid #84adff;[\\s\\S]*?outline-offset: -3px;/, "candidate active contour encloses number, title and Detail as one row");\nassert.match(clientSource, /Every row must include either a complete song reference or a non-empty textual note\\./, "empty-row validation is one set-level message");\nassert.match(clientSource, /planningActionValidationMessages[\\s\\S]*?Planning action validation errors[\\s\\S]*?<div className="form-actions">/, "blocking validation bullets render between the last row and the action palette");\nassert.doesNotMatch(clientSource, /aria-label=\\{`Row \\$\\{index \\+ 1\\} validation errors`\\}/, "blocking validation is no longer rendered inside each row");\n'''
test = test.replace(insert_before, extra, 1)
test_path.write_text(test, encoding='utf-8')

static_path = ROOT / 'scripts/planning-ui-workflow-static-tests.ts'
static = static_path.read_text(encoding='utf-8')
static = static.replace(
    '  "placeholder=\\"Text note\\"",\n',
    '  "placeholder=\\"Text note\\"",\n  "planning-action-validation-list",\n  "Every row must include either a complete song reference or a non-empty textual note.",\n',
    1,
)
static_path.write_text(static, encoding='utf-8')

# 4) Contract records the two newly HUMAN-passed interactions and the pending visual/validation refinement.
contract_path = ROOT / 'docs/phase-31-17-contract.md'
contract = contract_path.read_text(encoding='utf-8')
contract += '''\n\n## HUMAN checkpoint update — 2026-08-08\n\nBrowser-confirmed PASS:\n\n- clicking an exposed candidate row beneath candidate-origin Detail closes Detail back to exactly that candidate without selecting/replacing Song lookup;\n- generic outside-dismiss outside the union of candidate list + candidate Detail closes both overlays and preserves the confirmed row values;\n- the selected-song right-side `Detail` switch exception remains separately HUMAN-passed.\n\nLatest refinement pending a focused browser check:\n\n- the already accepted row-control vertical center and square size remain unchanged, while arrow glyphs receive additional visual stroke weight;\n- the active candidate cursor contour encloses the whole candidate row, including its right-side `Detail` control, matching the whole-item contour used in expanded melody Detail;\n- row-level blocking validation is removed from each `Row N`; one action-level bullet list sits between the last Planning row and the `Save working set` / action palette;\n- if at least one row lacks both a complete song and a non-empty text note, that list contains exactly one unified message: `Every row must include either a complete song reference or a non-empty textual note.`;\n- other current missing/invalid data that disable Planning actions may share the same list, while permission/lifecycle state is not misrepresented as validation.\n'''
contract_path.write_text(contract, encoding='utf-8')

print('Phase 31.17 final refinement applied.')
