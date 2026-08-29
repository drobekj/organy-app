import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const antiphon = readFileSync("app/service-context-reference-antiphon-field.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

const detailStart = antiphon.indexOf('{props.detail && <section');
const detailEnd = antiphon.indexOf("const defaultClientFactory", detailStart);
const detailMarkup = antiphon.slice(detailStart, detailEnd);
const referenceRowStart = detailMarkup.indexOf('className="service-antiphon-detail-row service-antiphon-detail-reference-row"');
const referenceRow = detailMarkup.slice(referenceRowStart);

assert.ok(referenceRowStart >= 0, "Antiphon Detail reference row is missing.");
assert.match(
  referenceRow,
  /^className="service-antiphon-detail-row service-antiphon-detail-reference-row">\s*<strong className="service-antiphon-detail-reference-label">Ref song<\/strong>/,
  "The second Antiphon Detail row must always begin with Ref song.",
);
assert.match(referenceRow, /props\.detail\.loading/);
assert.match(referenceRow, /<ReferenceSongLookupField/);
assert.match(referenceRow, /props\.detail\.recommendation\?\.recommendedSong/);
assert.match(referenceRow, />none<\/span>/);

assert.match(css, /\.service-antiphon-detail-reference-row \{[\s\S]*?grid-template-columns: auto auto minmax\(0, 1fr\);/);
assert.match(css, /\.service-antiphon-detail-reference-label \{[\s\S]*?white-space: nowrap;/);
assert.match(css, /\.service-antiphon-detail-reference-row > \.reference-song-lookup,[\s\S]*?grid-column: 2 \/ -1;/);

console.log("Issue 289 third corrective HUMAN checkpoint 4 Ref song label coverage passed.");
