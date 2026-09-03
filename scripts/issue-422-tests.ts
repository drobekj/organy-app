import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const voterPage = readFileSync("app/congregation-preferences/page.tsx", "utf8");
const controls = readFileSync("app/protected-account-controls.tsx", "utf8");
const adminPage = readFileSync("app/admin/preferences/page.tsx", "utf8");
const languageFilter = readFileSync("app/admin/preferences/preference-language-filter.tsx", "utf8");
const adminRoute = readFileSync("app/api/admin/congregation-preferences/route.ts", "utf8");
const service = readFileSync("src/application/congregation-preference-admin.ts", "utf8");
const guide = readFileSync("app/guide-content.ts", "utf8");
const css = readFileSync("app/globals.css", "utf8");

assert.match(
  planning,
  /Changes are temporary and are never saved\. But at least, you can set your song preferences <a href="https:\/\/organy-app\.vercel\.app\/congregation-preferences\?entry=1" target="_blank" rel="noopener noreferrer">here<\/a>\./,
);
assert.match(voterPage, /className="card planning-form congregation-preferences-card"/);
assert.match(css, /\.congregation-preferences-card,[\s\S]*?width: min\(100%, 78rem\);/);

assert.match(controls, /<a href="\/admin\/preferences">Manage Preferences<\/a>/);
assert.match(guide, /Manage Accounts, Manage Preferences, Audit History and Verify DB/);

assert.match(languageFilter, /className="melody-protection-panel preference-language-panel"/);
assert.match(languageFilter, /className="melody-protection-control"/);
assert.match(languageFilter, /<option value="czech">czech<\/option>/);
assert.match(languageFilter, /<option value="polish">polish<\/option>/);
assert.match(languageFilter, /<option value="mixed">mixed<\/option>/);
assert.match(css, /\.preference-admin-toolbar \{[\s\S]*?justify-content: flex-end;/);
assert.match(css, /\.preference-language-panel \{[\s\S]*?height: 4\.75rem;[\s\S]*?width: calc\(33\.333333% \+ 0\.066667rem \+ 1\.333333px\);/);

assert.match(adminPage, /<h1>Manage Preferences<\/h1>/);
assert.match(adminPage, /Current positive preferences and Admin-set zero preferences are listed\./);
assert.match(adminPage, /<span>Songs<\/span>/);
assert.match(adminPage, /className="preference-song-popover"/);
assert.match(adminPage, /song\.adminZero \? "Undo to 1" : "Set 0"/);
assert.match(adminPage, /<button type="submit">Remove<\/button>/);
assert.match(adminPage, /Undo to 1/);
assert.match(adminPage, /Delete nickname/);
assert.match(adminPage, /voter\.songs\.length > 0/);
assert.match(adminPage, /Songs <span className="preference-song-count">0<\/span>/);

assert.match(service, /left join lateral \([\s\S]*?rsp\.score > 0[\s\S]*?preference\.congregation\.admin\.set/);
assert.match(service, /\$1 = 'mixed' or rcs\.language::text = \$1/);
assert.match(service, /if \(row\.reference_song_id === null \|\| row\.reference_song_id === undefined\) continue;/);
assert.match(service, /beforeScore !== 1[\s\S]*?target\.adminZero[\s\S]*?Only a visible congregation preference can be removed here/);
assert.match(service, /preference\.congregation\.admin\.set/);
assert.match(service, /preference\.congregation\.admin\.remove/);
assert.match(service, /preference\.congregation\.admin\.nickname\.delete/);
assert.match(service, /delete from app_users where id = \$1/);
assert.match(service, /protected_account_actor_links/);
assert.match(service, /other_roles\.role <> 'congregation_member'/);

assert.match(adminRoute, /action === "setScore"/);
assert.match(adminRoute, /action === "removePreference"/);
assert.match(adminRoute, /action === "deleteNickname"/);
assert.match(adminRoute, /target\.searchParams\.set\("language", language\)/);

console.log("Issue 422 Demo preference CTA and Manage Preferences acceptance passed.");
