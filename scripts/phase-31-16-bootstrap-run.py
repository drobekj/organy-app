from pathlib import Path

path = Path("scripts/phase-31-16-bootstrap.py")
source = path.read_text(encoding="utf-8")
old = """flow = replace_once(
    flow,
    '''  switch (action.type) {
    case \"lookupChanged\":
''',
    '''  switch (action.type) {
    case \"lookupOpened\":
      return { ...row, songSearch: \"\", lookupOpen: true };
    case \"lookupChanged\":
''',
    \"lookup-open reducer\",
)
"""
new = """flow = replace_once(
    flow,
    '''export function planningCandidateRowReducer(row: PlanningCandidateEditableRow, action: PlanningCandidateRowAction): PlanningCandidateEditableRow {
  switch (action.type) {
    case \"lookupChanged\":
''',
    '''export function planningCandidateRowReducer(row: PlanningCandidateEditableRow, action: PlanningCandidateRowAction): PlanningCandidateEditableRow {
  switch (action.type) {
    case \"lookupOpened\":
      return { ...row, songSearch: \"\", lookupOpen: true };
    case \"lookupChanged\":
''',
    \"lookup-open reducer\",
)
"""
if source.count(old) != 1:
    raise RuntimeError(f"Expected one ambiguous reducer bootstrap block, found {source.count(old)}")
path.write_text(source.replace(old, new, 1), encoding="utf-8")
exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"), {"__name__": "__main__", "__file__": str(path)})
