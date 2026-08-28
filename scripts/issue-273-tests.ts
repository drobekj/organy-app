import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  queryReferenceCatalogCandidatesFromData,
  type ReferenceCandidateData,
  type ReferenceCandidateSong,
} from "../src/application/reference-candidate-service";
import { candidatesForView } from "../src/planning-lifecycle/candidate-view";

function song(
  id: string,
  language: "czech" | "polish",
  canonicalNumber: number,
  title: string,
  classId: string,
  repertoire: boolean,
): ReferenceCandidateSong {
  return {
    id,
    language,
    canonicalNumber,
    displayNumber: String(canonicalNumber),
    title,
    classId,
    aggregatePreferenceScore: 0,
    repertoire,
  };
}

const data: ReferenceCandidateData = {
  songs: [
    song("czech:1", "czech", 1, "Available Czech pivot", "class-a", true),
    song("polish:11", "polish", 11, "Available Polish equivalent", "class-a", false),
    song("czech:2", "czech", 2, "Unavailable Czech", "class-b", false),
    song("polish:12", "polish", 12, "Unavailable Polish", "class-b", false),
    song("polish:3", "polish", 3, "Available Polish pivot", "class-c", true),
  ],
  melodyWindowMonths: 12,
  recommendedReferenceSongId: "czech:1",
  referenceTopic: { language: "czech", ranges: [{ from: 1, to: 2 }] },
};

const available = queryReferenceCatalogCandidatesFromData(data, {
  serviceLanguage: "mixed",
  organistPersonId: "organist-1",
  availabilityMode: "available",
});
assert.deepEqual(candidatesForView(available, "songs").map((item) => item.songId), ["czech:1", "polish:3", "polish:11"]);
assert.deepEqual(candidatesForView(available, "melodies").map((item) => item.songId), ["czech:1", "polish:3"]);
assert.equal(available.find((item) => item.songId === "czech:1")?.antiphonMatch, true);
assert.equal(available.find((item) => item.songId === "czech:1")?.seasonMatch, true);

const unavailable = queryReferenceCatalogCandidatesFromData(data, {
  serviceLanguage: "mixed",
  organistPersonId: "organist-1",
  availabilityMode: "unavailable",
});
assert.deepEqual(candidatesForView(unavailable, "songs").map((item) => item.songId), ["czech:2", "polish:12"]);
assert.deepEqual(candidatesForView(unavailable, "melodies").map((item) => item.songId), ["czech:2"]);

const czechUnavailable = queryReferenceCatalogCandidatesFromData(data, {
  serviceLanguage: "czech",
  organistPersonId: "organist-1",
  availabilityMode: "unavailable",
});
assert.deepEqual(candidatesForView(czechUnavailable, "songs").map((item) => item.songId), ["czech:2"]);
assert.deepEqual(candidatesForView(czechUnavailable, "melodies").map((item) => item.songId), ["czech:2"]);

const anonymousAvailable = queryReferenceCatalogCandidatesFromData(data, {
  serviceLanguage: "mixed",
  availabilityMode: "available",
});
assert.equal(candidatesForView(anonymousAvailable, "songs").length, 5);
assert.equal(candidatesForView(anonymousAvailable, "melodies").length, 3);

const anonymousUnavailable = queryReferenceCatalogCandidatesFromData(data, {
  serviceLanguage: "mixed",
  availabilityMode: "unavailable",
});
assert.deepEqual(anonymousUnavailable, []);

const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const workspace = readFileSync("app/catalog-workspace.tsx", "utf8");
const route = readFileSync("app/api/interaction/route.ts", "utf8");
const css = readFileSync("app/globals.css", "utf8");

assert(client.includes("<CatalogWorkspace"), "Catalog must render the new CatalogWorkspace");
assert(!client.includes('aria-label="Catalog sections"'), "Catalog sub-tab navigation must be removed");
assert(!client.includes("demo + 1,600 synthetic scale records"), "Legacy synthetic Songs UI must be removed");
for (const required of [
  "<legend>Catalog context</legend>",
  "Available",
  "Unavailable",
  ">Songs</button>",
  ">Melodies</button>",
  'aria-label="Catalog organist"',
  'aria-label="Catalog language"',
  "<ServiceContextReferenceAntiphonField",
  "<ServiceContextReferenceTopicField",
]) assert(workspace.includes(required), `Catalog workspace is missing ${required}`);

assert(workspace.includes('aria-label="Reference preference aggregate"'), "Catalog Detail must preserve aggregate preference for all DB roles");
assert(workspace.includes('aria-label="My reference preference"'), "Catalog Detail must preserve own preference editing for non-admin roles");
assert(workspace.includes(">Save preference</button>"), "Catalog Detail must preserve preference save control");
assert(workspace.includes("await reloadCandidates(songId)"), "Preference save must refresh authoritative Catalog candidates");
assert(!workspace.includes("Melody Protection"), "Catalog must not expose Melody Protection");
assert(!workspace.includes("serviceDate"), "Catalog candidate UI must not depend on service date");
assert(route.includes('case "queryCatalogCandidates"'), "Interaction API must expose the Catalog candidate query");
assert(css.includes(".catalog-candidate-scroll"), "Catalog candidate scroll styling is missing");
assert.match(css, /\.catalog-candidate-scroll\s*\{[\s\S]*?direction:\s*rtl;/, "Catalog list must keep the scrollbar on the left");

console.log("Issue 273 Catalog step 2 coverage passed.");
