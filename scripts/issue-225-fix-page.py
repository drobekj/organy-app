from pathlib import Path

path = Path("app/congregation-preferences/page.tsx")
text = path.read_text(encoding="utf-8")

old_start = '''  const pool = getAppDbPool(databaseUrl);
  try {
    const service = new PostgresCongregationPreferenceService(pool);
'''
new_start = '''  const pool = getAppDbPool(databaseUrl);
  const service = new PostgresCongregationPreferenceService(pool);
'''
if text.count(old_start) != 1:
    raise SystemExit(f"Expected one outer try start, found {text.count(old_start)}")
text = text.replace(old_start, new_start, 1)

old_end = '''    );
  }
}

function nicknameEntry'''
new_end = '''    );
}

function nicknameEntry'''
if text.count(old_end) != 1:
    raise SystemExit(f"Expected one outer try end, found {text.count(old_end)}")
text = text.replace(old_end, new_end, 1)

path.write_text(text, encoding="utf-8")
print("Issue #225 congregation page wrapper corrected.")
