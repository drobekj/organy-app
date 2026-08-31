import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/workspace-shell.css", "utf8");

assert.match(css, /\.workspace-account-popover a,[\s\S]*?\.workspace-account-popover button \{[\s\S]*?text-align: left;[\s\S]*?width: 100%;/, "Popover buttons keep their established width and left-aligned labels");
assert.match(css, /\.workspace-sign-role-options \{[\s\S]*?direction: rtl;[\s\S]*?overflow-y: auto;[\s\S]*?scrollbar-gutter: stable;/, "Sign Role scroll gutter must be reserved on the left");
assert.match(css, /\.workspace-sign-role-options button \{[\s\S]*?direction: ltr;[\s\S]*?text-align: left;/, "Organist/Admin labels must remain left-aligned");
assert.doesNotMatch(css, /\.workspace-sign-role-options button \{[\s\S]*?text-align: right;/, "Role label text must not be right-aligned");

console.log("Issue 308 Sign Role button right-edge alignment coverage passed.");
