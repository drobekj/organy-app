import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/workspace-shell.css", "utf8");
const guide = readFileSync("app/guide-hints-setting.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");

assert.match(guide, /className="workspace-toggle-switch"/);
assert.match(planning, /className="workspace-toggle-switch"/);

const pseudo = css.match(/\.workspace-toggle-switch::after \{([^}]*)\}/)?.[1] ?? "";
assert.match(pseudo, /content:\s*"";/);
assert.match(pseudo, /background:\s*#fff;/);
assert.match(pseudo, /border-radius:\s*50%;/);
assert.match(pseudo, /flex:\s*0 0 1\.05rem;/);

const legacyThumb = css.match(/\.workspace-toggle-thumb \{([^}]*)\}/)?.[1] ?? "";
assert.match(legacyThumb, /display:\s*none;/);

console.log("Issue #474 visible shared ball-toggle acceptance: PASS");
