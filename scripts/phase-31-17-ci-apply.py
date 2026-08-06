from pathlib import Path
import runpy

runpy.run_path("scripts/phase-31-17-row-ux-fix.py", run_name="__main__")
runpy.run_path("scripts/phase-31-17-row-ux-test-fix.py", run_name="__main__")

replacements = {
    "src/planning-lifecycle/candidate-flow.ts": [
        ("return `${song.number}${song.title ? ` — ${song.title}` : \"\"}`;", "return `${song.number}${song.title ? ` · ${song.title}` : \"\"}`;"),
    ],
    "scripts/phase-31-17-tests.tsx": [
        ('"29 — Czech song"', '"29 · Czech song"'),
    ],
    "scripts/phase-31-16-tests.tsx": [
        ("29 — Current", "29 · Current"),
        ("421 — Equivalent", "421 · Equivalent"),
        ("101 — Visible", "101 · Visible"),
    ],
    "scripts/phase-30-1-candidate-flow-tests.ts": [
        ("29 — Current", "29 · Current"),
        ("421 — Equivalent", "421 · Equivalent"),
        ("101 — Visible", "101 · Visible"),
    ],
}

for filename, pairs in replacements.items():
    path = Path(filename)
    text = path.read_text(encoding="utf-8")
    for old, new in pairs:
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")

print("Phase 31.17 CI application aligned to number · title.")
