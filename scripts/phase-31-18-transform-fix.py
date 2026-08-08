from pathlib import Path

path = Path("scripts/phase-31-18-transform.py")
text = path.read_text(encoding="utf-8")
count = text.count("\\:")
if count < 2:
    raise RuntimeError(f"Expected at least two mistaken backslash-colon escapes, found {count}.")
path.write_text(text.replace("\\:", ":"), encoding="utf-8")
print(f"Corrected {count} transformation anchor escape(s).")
