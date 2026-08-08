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

path.write_text(text, encoding="utf-8")
print(f"Corrected {escape_count} anchor escape(s) and made regex replacement literal-safe.")
