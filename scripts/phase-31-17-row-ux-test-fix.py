from pathlib import Path

phase_path = Path("scripts/phase-31-17-tests.tsx")
phase_text = phase_path.read_text(encoding="utf-8")
old = 'assert.match(clientSource, /detailButtonId={`selected-song-detail-button-/);'
new = 'assert.match(clientSource, /id={`selected-song-detail-button-/);'
if old in phase_text:
    phase_text = phase_text.replace(old, new, 1)
elif new not in phase_text:
    raise RuntimeError("neither stale nor aligned Detail id assertion was found")
phase_path.write_text(phase_text, encoding="utf-8")

static_path = Path("scripts/planning-ui-workflow-static-tests.ts")
static_text = static_path.read_text(encoding="utf-8")
stale = '  "candidate-line",\n'
if stale in static_text:
    static_text = static_text.replace(stale, "", 1)
static_path.write_text(static_text, encoding="utf-8")

print("Phase 31.17 compact-row static assertions aligned.")
