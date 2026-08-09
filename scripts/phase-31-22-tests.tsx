import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serviceContextLookupInputClickAction } from "../app/service-context-reference-antiphon-field";

assert.equal(serviceContextLookupInputClickAction(false), "open", "a closed lookup must open on input click");
assert.equal(serviceContextLookupInputClickAction(true), "close", "an already-open lookup must close on the repeated input click");

const antiphon = readFileSync("app/service-context-reference-antiphon-field.tsx", "utf8");
const topic = readFileSync("app/service-context-reference-topic-field.tsx", "utf8");
const css = readFileSync("app/service-context-minimal.css", "utf8");

for (const [name, source] of [["Antiphon", antiphon], ["Topic", topic]] as const) {
  assert.match(source, /const inputWasOpenOnPointerDown = useRef\(false\);/, `${name} must remember whether its list was open at pointer-down`);
  assert.match(source, /onInputPointerDown=\{\(\) => \{ inputWasOpenOnPointerDown\.current = open; \}\}/, `${name} must capture pre-click open state on pointer-down`);
  assert.match(source, /serviceContextLookupInputClickAction\(inputWasOpenOnPointerDown\.current\) === "close"/, `${name} must use the shared repeated-click close decision`);
  assert.match(source, /if \(!open\) openLookup\(\);/, `${name} must still open from a closed, already-focused input`);
  assert.match(source, /onPointerDown=\{props\.onInputPointerDown\}/, `${name} view must expose input pointer-down wiring`);
  assert.match(source, /onClick=\{props\.onInputClick \?\? props\.onOpen\}/, `${name} view must use the toggle click handler while retaining legacy view fallback`);
}

assert.match(css, /\.note-field > textarea::placeholder \{[\s\S]*?color:\s*transparent;[\s\S]*?opacity:\s*0;/, "the old native Service note placeholder must be visually suppressed");
assert.match(css, /textarea:placeholder-shown\)::after \{[\s\S]*?color:\s*var\(--muted\);[\s\S]*?content:\s*"Add service note…";[\s\S]*?opacity:\s*0\.62;/, "empty Service note must show the muted Add service note prompt");
assert.match(css, /> \.note-field\s*\{[\s\S]*?grid-column:\s*1 \/ -1;/, "Service note must remain full width");
assert.match(css, /> \.note-field > textarea\s*\{[\s\S]*?height:\s*2\.65rem;[\s\S]*?min-height:\s*2\.65rem;/, "Service note must retain the accepted one-line height");

console.log("Phase 31.22 Service Context toggle parity and note prompt: PASS");
