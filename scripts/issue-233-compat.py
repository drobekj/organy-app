from pathlib import Path

path = Path("scripts/issue-224-tests.ts")
text = path.read_text(encoding="utf-8")
replacements = [
    (
        r'assert.match(cssSource, /\.needs-revision-row\s*\{[\s\S]*?outline:\s*3px solid var\(--danger\)/);',
        r'assert.match(cssSource, /\.needs-revision-row\s*\{[\s\S]*?border:\s*3px solid var\(--danger\)/);',
    ),
    (
        r'assert.match(cssSource, /\.saved-set-list button\.needs-revision-record\s*\{[\s\S]*?border-color:\s*var\(--danger\)/, "conflicting plan must replace the normal gray button border with red");',
        r'assert.match(cssSource, /\.saved-set-list button\.needs-revision-record\s*\{[\s\S]*?border:\s*3px solid var\(--danger\)/, "conflicting plan must replace the normal gray button border with one 3px red border");',
    ),
]
for old, new in replacements:
    if text.count(old) != 1:
        raise SystemExit(f"issue-224 acceptance drift: expected one {old!r}, found {text.count(old)}")
    text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
