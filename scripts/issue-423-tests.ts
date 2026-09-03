import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/congregation-preferences/page.tsx", "utf8");
const workspace = readFileSync("app/congregation-preferences/congregation-preference-workspace.tsx", "utf8");
const signIn = readFileSync("app/sign-in/protected-sign-in-form.tsx", "utf8");
const route = readFileSync("app/api/congregation-preferences/route.ts", "utf8");
const voter = readFileSync("src/application/congregation-preference-voter.ts", "utf8");
const catalog = readFileSync("src/application/postgres-reference-catalog.ts", "utf8");
const globals = readFileSync("app/globals.css", "utf8");
const shell = readFileSync("app/workspace-shell.css", "utf8");
const phase3129 = readFileSync("scripts/phase-31-29-tests.ts", "utf8");

// Server renders the full authoritative catalog + entire own preference set.
assert.match(page, /catalog\.listAll\("all"\)/);
assert.match(page, /service\.listOwnReferencePreferences\(token\)/);
assert.match(page, /<CongregationPreferenceWorkspace records=\{records\} preferences=\{preferences\} \/>/);
assert.doesNotMatch(page, /pageSize|Showing .* matching songs|detail-panel|Set 0|Set 1|songHref/);

// Final entry/language corrections: fresh workspace defaults Czech and base Sign In never reuses a voter cookie implicitly.
assert.match(workspace, /useState<CongregationLanguage>\("czech"\)/);
assert.doesNotMatch(workspace, /useState<CongregationLanguage>\("mixed"\)/);
assert.match(signIn, /href="\/congregation-preferences\?entry=1">Congregation preferences<\/a>/);
assert.match(page, /if \(first\(params\.entry\) === "1"\) return nicknameEntry\(\);[\s\S]*?const cookieStore = await cookies\(\);/);

// Active nickname workspace exposes Change nickname only; Staff sign in remains on nickname-entry.
const workspaceHeaderStart = page.indexOf('<div className="app-header">');
const workspaceHeaderEnd = page.indexOf('</div>\n\n        <p className="field-help">', workspaceHeaderStart);
const workspaceHeader = page.slice(workspaceHeaderStart, workspaceHeaderEnd);
assert.match(workspaceHeader, />Change nickname<\/button>/);
assert.doesNotMatch(workspaceHeader, /Staff sign in/);
const nicknameEntryStart = page.indexOf("function nicknameEntry");
const nicknameEntryBody = page.slice(nicknameEntryStart);
assert.match(nicknameEntryBody, /href="\/sign-in">Staff sign in<\/a>/);

// Standalone Language panel uses the same Melody Protection visual contract.
assert.match(workspace, /className="melody-protection-panel congregation-language-panel"/);
assert.match(workspace, /className="melody-protection-control"/);
assert.match(workspace, /<option value="mixed">Mixed<\/option>/);
assert.match(workspace, /<option value="czech">Czech<\/option>/);
assert.match(workspace, /<option value="polish">Polish<\/option>/);
assert.match(workspace, /language === "mixed" \|\| record\.language === language/);

// Find Song is a permanently open Candidate-style panel; search navigates the intact list.
assert.match(workspace, /<fieldset className="field-group congregation-find-song-panel" aria-label="Find Song">/);
assert.match(workspace, /<legend>Find Song<\/legend>/);
assert.match(workspace, /placeholder="Number or song title"/);
assert.match(workspace, /id="congregation-song-list"/);
assert.match(workspace, /className="congregation-song-scroll"/);
assert.doesNotMatch(workspace, /pagination|Previous|Next|pageCount|slice\(/);
assert.match(workspace, /displayNumber\.toLocaleLowerCase\(\)\.startsWith\(query\)/);
assert.match(workspace, /title\.toLocaleLowerCase\(\)\.includes\(query\)/);
assert.match(workspace, /scrollIntoView\(\{ block: "nearest" \}\)/);
assert.match(workspace, /event\.key === "ArrowDown"/);
assert.match(workspace, /event\.key === "ArrowUp"/);
assert.match(workspace, /event\.key === "Escape"/);

// Each row is number + title + optional Source + Guide-Hints-style toggle only.
assert.match(workspace, /<strong>\{record\.displayNumber\}<\/strong>/);
assert.match(workspace, /className="congregation-song-title">\{record\.title\}<\/span>/);
assert.match(workspace, /record\.sourceUrl && \(/);
assert.match(workspace, />\s*Source\s*<\/a>/);
assert.match(workspace, /className="workspace-toggle-switch congregation-preference-toggle"/);
assert.match(workspace, /role="switch"/);
assert.match(workspace, /aria-checked=\{selected\}/);
assert.match(workspace, /<span className="workspace-toggle-thumb" aria-hidden="true" \/>/);
assert.doesNotMatch(workspace, />Detail<\/button>|Current preference:|Allowed values:|>0<|>1</);

// Toggle persists immediately via JSON and UI treats absent/null state as OFF.
assert.match(workspace, /const before = scores\[referenceSongId\] \?\? 0;/);
assert.match(workspace, /const next: 0 \| 1 = before === 1 \? 0 : 1;/);
assert.match(workspace, /fetch\("\/api\/congregation-preferences"/);
assert.match(workspace, /"content-type": "application\/json"/);
assert.match(route, /contentType\.includes\("application\/json"\)/);
assert.match(route, /body\.action !== "saveOwnPreference"/);
assert.match(route, /request\.cookies\.get\(congregationVoterCookie\)\?\.value/);

// Visual contract: left scrollbar, ~20-row viewport, active cursor, yellow ON row and shared toggle CSS.
assert.match(globals, /\.congregation-song-scroll \{[\s\S]*?direction: rtl;[\s\S]*?height: min\(calc\(var\(--congregation-song-row-height\) \* 20\), 72vh\);[\s\S]*?overflow-y: auto;/);
assert.match(globals, /\.congregation-song-scroll > \* \{[\s\S]*?direction: ltr;/);
assert.match(globals, /\.congregation-song-row-selected \{[\s\S]*?background: #fffbeb;/);
assert.match(globals, /\.congregation-song-row-active \{[\s\S]*?outline: 3px solid #84adff;/);
assert.match(shell, /\.workspace-toggle-switch \{[\s\S]*?height: 1\.4rem;[\s\S]*?width: 2\.6rem;/);
assert.match(shell, /\.workspace-toggle-switch\[aria-checked="true"\] \{[\s\S]*?justify-content: flex-end;/);

// Provider has a true full-list path without pagination.
assert.match(catalog, /async listAll\(language: ReferenceCatalogQuery\["language"\] = "all"\)/);
const listAllStart = catalog.indexOf("async listAll(");
const listAllEnd = catalog.indexOf("async getById(", listAllStart);
const listAllBody = catalog.slice(listAllStart, listAllEnd);
assert.doesNotMatch(listAllBody, /LIMIT|OFFSET/);
assert.match(listAllBody, /ORDER BY \$\{ORDER_BY_NATURAL_NUMBER\}/);

// Preference service returns the complete existing 0/1 state for this nickname only.
assert.match(voter, /async listOwnReferencePreferences\(token: unknown\)/);
assert.match(voter, /where rsp\.profile_id = \$1/);
assert.match(voter, /const context = await this\.resolveContext\(token\)/);

// DB acceptance exercises full-set loading, JSON toggle save and nickname isolation.
for (const phrase of [
  "voter workspace can load the complete existing own-preference set",
  "toggle JSON save returns an in-place response",
  "JSON toggle cannot mutate another nickname",
]) {
  assert.ok(phase3129.includes(phrase), "Phase 31.29 DB acceptance must retain: " + phrase);
}

console.log("Issue 423 full Congregation Preferences catalog acceptance passed.");
