import atexit
from pathlib import Path


def _apply_final_compact_row_alignment() -> None:
    replacements = {
        "src/planning-lifecycle/candidate-flow.ts": [
            ("`${song.number}${song.title ? ` — ${song.title}` : \"\"}`", "`${song.number}${song.title ? ` · ${song.title}` : \"\"}`"),
        ],
        "scripts/phase-31-17-tests.tsx": [
            ("29 — Czech song", "29 · Czech song"),
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

    for path_text, pairs in replacements.items():
        path = Path(path_text)
        text = path.read_text(encoding="utf-8")
        for old, new in pairs:
            text = text.replace(old, new)
        path.write_text(text, encoding="utf-8")

    print("Phase 31.17 final compact-row separator alignment applied.")


atexit.register(_apply_final_compact_row_alignment)
