import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const voterPage = readFileSync("app/congregation-preferences/page.tsx", "utf8");
const adminPage = readFileSync("app/admin/preferences/page.tsx", "utf8");
const adminRoute = readFileSync("app/api/admin/congregation-preferences/route.ts", "utf8");
const languageFilter = readFileSync("app/admin/preferences/preference-language-filter.tsx", "utf8");
const service = readFileSync("src/application/congregation-preference-admin.ts", "utf8");
const phase3130 = readFileSync("scripts/phase-31-30-tests.ts", "utf8");
const css = readFileSync("app/globals.css", "utf8");

// Demo banner remains exactly two logical columns: flexible message + reset action.
assert.match(planning, /<aside className="demo-mode-banner"[\s\S]*?<div className="demo-mode-banner-message">[\s\S]*?<DemoResetButton \/>[\s\S]*?<\/aside>/);
assert.match(css, /\.demo-mode-banner \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/);
assert.match(css, /\.demo-mode-banner-message \{[\s\S]*?flex-wrap: wrap;[\s\S]*?min-width: 0;/);
assert.match(css, /\.demo-reset-button \{[\s\S]*?justify-self: end;[\s\S]*?white-space: nowrap;/);

// Demo CTA always renders the nickname-entry view even when the browser still has a voter cookie.
assert.match(planning, /https:\/\/organy-app\.vercel\.app\/congregation-preferences\?entry=1/);
const paramsIndex = voterPage.indexOf("const params = await searchParams;");
const freshEntryIndex = voterPage.indexOf('if (first(params.entry) === "1") return nicknameEntry();');
const cookieIndex = voterPage.indexOf("const cookieStore = await cookies();");
assert.ok(
  paramsIndex >= 0 && freshEntryIndex > paramsIndex && cookieIndex > freshEntryIndex,
  "forced fresh entry must be resolved before reading the existing voter cookie",
);

// Admin language contract includes mixed.
assert.match(service, /CongregationPreferenceAdminLanguage = "czech" \| "polish" \| "mixed"/);
assert.match(languageFilter, /<option value="mixed">mixed<\/option>/);
assert.match(adminRoute, /language !== "czech" && language !== "polish" && language !== "mixed"/);
assert.match(service, /\$1 = 'mixed' or rcs\.language::text = \$1/);

// Only positive or authoritative Admin-zero rows are visible.
assert.match(
  service,
  /rsp\.score > 0[\s\S]*?rsp\.score = 0[\s\S]*?latest\.action = 'preference\.congregation\.admin\.set'[\s\S]*?latest\.after_state ->> 'score' = '0'/,
);
assert.match(service, /ae\.action in \('preference\.congregation\.admin\.set', 'preference\.reference\.save'\)/);
assert.match(service, /adminZero: Boolean\(row\.admin_zero\)/);
assert.match(adminPage, /song\.adminZero && <span className="preference-song-state">Admin 0<\/span>/);
assert.match(adminPage, /value=\{song\.adminZero \? "1" : "0"\}/);
assert.match(adminPage, /\{song\.adminZero \? "Undo to 1" : "Set 0"\}/);
assert.doesNotMatch(adminRoute, /undoProfileId|undoSongId/);
assert.match(service, /beforeScore === 0 && target\.adminZero/);

// DB acceptance proves the state transition and mixed aggregation against PostgreSQL.
for (const phrase of [
  "ordinary voter-set zero remains invisible to Admin",
  "Admin-set zero remains visible and is distinguished from ordinary zero",
  "mixed Admin language lists visible Czech and Polish preferences together",
  "Admin-zero preference can still be explicitly removed",
]) {
  assert.ok(phase3130.includes(phrase), "Phase 31.30 DB acceptance must retain: " + phrase);
}

console.log("Issue 425 Demo entry and Admin-zero corrective acceptance passed.");
