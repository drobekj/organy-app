import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findCatalogCandidateJumpMatch, normalizeCatalogCandidateJumpText } from "../src/planning-lifecycle/catalog-candidate-jump";

const candidates = [
  { songId: "song-12", number: "12", title: "Píseň první" },
  { songId: "song-120", number: "120", title: "Kristus vítězí" },
  { songId: "song-305", number: "305", title: "Ó Bože, sílo má" },
];

assert.equal(normalizeCatalogCandidateJumpText("  Ó BOŽE "), "o boze");
assert.equal(findCatalogCandidateJumpMatch(candidates, "12")?.songId, "song-12", "Exact song number must win over a broader text match.");
assert.equal(findCatalogCandidateJumpMatch(candidates, "120")?.songId, "song-120");
assert.equal(findCatalogCandidateJumpMatch(candidates, "kristus")?.songId, "song-120");
assert.equal(findCatalogCandidateJumpMatch(candidates, "boze")?.songId, "song-305", "Title navigation must ignore Czech diacritics.");
assert.equal(findCatalogCandidateJumpMatch(candidates, "999"), undefined);
assert.equal(findCatalogCandidateJumpMatch(candidates, "   "), undefined);

const workspace = readFileSync("app/catalog-workspace.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const hints = readFileSync("app/guide-control-hints.ts", "utf8");

const headerStart = workspace.indexOf('<div className="catalog-candidate-header">');
const availability = workspace.indexOf('className="catalog-availability-switch"', headerStart);
const jump = workspace.indexOf('className="catalog-candidate-jump"', headerStart);
const view = workspace.indexOf('className="workspace-nav catalog-view-switch"', headerStart);
assert.ok(headerStart >= 0 && availability > headerStart && jump > availability && view > jump, "Quick jump must sit between availability and Songs/Melodies controls.");

assert.match(workspace, /placeholder="Jump by number or title"/);
assert.match(workspace, /aria-label="Jump to Catalog candidate by number or title"/);
assert.match(workspace, /findCatalogCandidateJumpMatch\(visibleCandidates, candidateJumpQuery\)/);
assert.match(workspace, /if \(event\.key !== "Escape"\) return;[\s\S]*?clearCandidateJump\(\)/);
assert.match(workspace, /function clearCandidateJump\(\)[\s\S]*?setCandidateJumpQuery\(""\)[\s\S]*?scrollTop = 0/);
assert.match(workspace, /ref=\{candidateScrollRef\} className="catalog-candidate-scroll"/);
assert.match(workspace, /data-candidate-song-id=\{candidate\.songId\}/);
assert.match(workspace, /jumpTarget=\{candidateJumpMatch\?\.songId === candidate\.songId\}/);
assert.match(workspace, /visibleCandidates\.map\(\(candidate\) => <CatalogCandidateRow/, "Navigation must retain the full visible list instead of replacing it with filtered results.");
assert.doesNotMatch(workspace.slice(jump, view), /onSelect|setSelectedDetail|mutateRepertoire/, "Quick jump control must not select, open, or mutate a candidate.");

assert.match(css, /\.catalog-candidate-jump \{[\s\S]*?flex: 1 1 15rem;[\s\S]*?max-width: 26rem;/);
assert.match(css, /\.catalog-candidate-jump-target \{[\s\S]*?box-shadow: inset 0 0 0 2px #84adff;/);
assert.match(hints, /"catalog\.candidates\.jump"[\s\S]*?does not select or change the song[\s\S]*?Escape clears the field/);

console.log("Issue #468 Catalog candidate navigation-only quick jump acceptance: PASS");
