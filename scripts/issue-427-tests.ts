import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/admin/preferences/page.tsx", "utf8");
const behavior = readFileSync("app/admin/preferences/preference-song-menu-behavior.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const accounts = readFileSync("app/admin/accounts/page.tsx", "utf8");

assert.match(page, /<div className="app-header">\s*<div><h1>Manage Preferences<\/h1><\/div>\s*<a href="\/">Back to planning<\/a>\s*<\/div>/);
assert.match(accounts, /<div className="app-header"><div><h1>Manage Accounts<\/h1><\/div><a href="\/">Back to planning<\/a><\/div>/);

assert.match(page, /<p className="field-help">Current positive preferences and Admin-set zero preferences are listed\.[\s\S]*?<div className="planning-context-header preference-admin-context-header">/);
assert.match(page, /<div className="planning-context-info preference-admin-feedback" aria-label="Preference administration status">[\s\S]*?message[\s\S]*?error[\s\S]*?<\/div>/);
assert.match(page, /<div className="planning-melody-protection-slot preference-language-slot" aria-label="Language reserved area">[\s\S]*?<PreferenceLanguageFilter language=\{language\} \/>/);
assert.match(css, /\.preference-admin-feedback \{[\s\S]*?height: 100%;[\s\S]*?overflow: auto;/);
assert.match(css, /\.preference-language-panel \{[\s\S]*?height: 100%;[\s\S]*?width: 100%;/);

assert.match(page, /<details className="preference-song-menu" id=\{\`preference-song-menu-\$\{voter\.profileId\}\`\}>/);
assert.match(page, /<PreferenceSongMenuBehavior menuId=\{\`preference-song-menu-\$\{voter\.profileId\}\`} \/>/);
assert.match(behavior, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
assert.match(behavior, /document\.addEventListener\("keydown", handleKeyDown\)/);
assert.match(behavior, /event\.key !== "Escape" \|\| !menu\.open/);
assert.match(behavior, /!menu\.contains\(target\)/);
assert.match(behavior, /menu\.open = false/);
assert.match(behavior, /trigger\.focus\(\)/);
assert.match(behavior, /removeEventListener\("pointerdown", handlePointerDown\)/);
assert.match(behavior, /removeEventListener\("keydown", handleKeyDown\)/);

console.log("Issue 427 Manage Preferences UX acceptance passed.");
