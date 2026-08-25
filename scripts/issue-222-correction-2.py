from pathlib import Path

path = Path(__file__).resolve().parents[1] / "app/api/catalog/route.ts"
text = path.read_text(encoding="utf-8")
old = '            objectRef: action === "savePerson" ? mutation.value.id : mutation.value.songId,\n'
new = '            objectRef: action === "savePerson" ? (mutation.value as { id: string }).id : (mutation.value as { songId: string }).songId,\n'
if old not in text:
    raise RuntimeError("Catalog audit objectRef marker missing")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Issue #222 catalog result narrowing corrected.")
