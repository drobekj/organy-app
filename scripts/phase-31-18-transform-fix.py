from pathlib import Path

path = Path("scripts/phase-31-18-transform.py")
text = path.read_text(encoding="utf-8")

escape_count = text.count("\\:")
if escape_count < 2:
    raise RuntimeError(f"Expected at least two mistaken backslash-colon escapes, found {escape_count}.")
text = text.replace("\\:", ":")

old_subn = "next_text, actual = re.subn(pattern, replacement, text, count=count, flags=re.S)"
new_subn = "next_text, actual = re.subn(pattern, lambda _match: replacement, text, count=count, flags=re.S)"
if text.count(old_subn) != 1:
    raise RuntimeError("Expected one replace_regex re.subn implementation anchor.")
text = text.replace(old_subn, new_subn)

old_message = "replace_exact('app/api/interaction/route.ts', 'referenceAntiphonId must be an authoritative Czech antiphon id.', 'referenceAntiphonId must be an authoritative Czech or Polish antiphon id.')"
new_message = "replace_exact('app/api/interaction/route.ts', 'referenceAntiphonId must be an authoritative Czech antiphon id.', 'referenceAntiphonId must be an authoritative Czech or Polish antiphon id.', count=2)"
if text.count(old_message) != 1:
    raise RuntimeError("Expected one interaction antiphon-message transformation anchor.")
text = text.replace(old_message, new_message)

path.write_text(text, encoding="utf-8")
print(f"Corrected {escape_count} anchor escape(s), regex replacement handling, and API message cardinality.")
