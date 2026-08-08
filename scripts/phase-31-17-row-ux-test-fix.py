from pathlib import Path

path = Path("scripts/phase-31-17-tests.tsx")
text = path.read_text(encoding="utf-8")
old = 'assert.match(clientSource, /detailButtonId={`selected-song-detail-button-/);'
new = 'assert.match(clientSource, /id={`selected-song-detail-button-/);'
if text.count(old) != 1:
    raise RuntimeError(f"expected one stale Detail id assertion, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Phase 31.17 compact-row static assertion aligned.")
