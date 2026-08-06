from pathlib import Path
path = Path('scripts/phase-31-17-tests.tsx')
text = path.read_text(encoding='utf-8')
text = text.replace('import { readFile } from "node:fs/promises";', 'import { readFileSync } from "node:fs";')
text = text.replace('const clientSource = await readFile("app/planning-lifecycle-client.tsx", "utf8");', 'const clientSource = readFileSync("app/planning-lifecycle-client.tsx", "utf8");')
path.write_text(text, encoding='utf-8')
