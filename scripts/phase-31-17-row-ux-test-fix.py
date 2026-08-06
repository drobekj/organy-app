from pathlib import Path

phase_path = Path("scripts/phase-31-17-tests.tsx")
phase_text = phase_path.read_text(encoding="utf-8")
old = 'assert.match(clientSource, /detailButtonId={`selected-song-detail-button-/);'
new = 'assert.match(clientSource, /id={`selected-song-detail-button-/);'
if phase_text.count(old) != 1:
    raise RuntimeError(f"expected one stale Detail id assertion, found {phase_text.count(old)}")
phase_path.write_text(phase_text.replace(old, new, 1), encoding="utf-8")

static_path = Path("scripts/planning-ui-workflow-static-tests.ts")
static_text = static_path.read_text(encoding="utf-8")
stale = '  "candidate-line",\n'
if static_text.count(stale) != 1:
    raise RuntimeError(f"expected one stale candidate-line assertion, found {static_text.count(stale)}")
static_path.write_text(static_text.replace(stale, "", 1), encoding="utf-8")

print("Phase 31.17 compact-row static assertions aligned.")
