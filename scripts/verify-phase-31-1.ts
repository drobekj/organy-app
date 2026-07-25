import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createReferenceCatalogRecords, displayReferenceNumber, InMemoryReferenceCatalogProvider, normalizeReferenceNumberQuery, referenceCatalogRecords } from "../src/application/reference-catalog";

const expected = {
  czechCatalog: "2f5af83546f9a5e89de2b089986cbd55ce754d306c3a994f4b21edc71f03e487",
  polishCatalog: "b06a3c452709213f4f60dcb0243e6a91bf00fd1881eac10b941b6bd05601cea9",
  czechValidation: "e47da19e263f1ba962cb8e2699c6e94125499438a3ff74ccf78bdb29517cab40",
  polishValidation: "49a0accd4392ff9167707e2677d9edab9b5ed9ceb7d0d023a2251dfbca1b5559",
};
function hash(path: string) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
assert.equal(hash("data/catalog/catalog-czech-final.json"), expected.czechCatalog);
assert.equal(hash("data/catalog/catalog-polish-final.json"), expected.polishCatalog);
assert.equal(hash("data/catalog/catalog-czech-validation.json"), expected.czechValidation);
assert.equal(hash("data/catalog/catalog-polish-validation.json"), expected.polishValidation);
const czech = JSON.parse(readFileSync("data/catalog/catalog-czech-final.json", "utf8"));
const polish = JSON.parse(readFileSync("data/catalog/catalog-polish-final.json", "utf8"));
assert.equal(czech.length, 808); assert.equal(polish.length, 990); assert.equal(czech.length + polish.length, 1798);
for (const r of [...czech, ...polish]) { assert(["czech", "polish"].includes(r.language)); assert(Number.isInteger(r.number) && r.number > 0); assert.equal(typeof r.title, "string"); assert(r.title.trim()); if (r.source_url !== null) assert.doesNotThrow(() => new URL(r.source_url)); }
assert.equal(new Set(referenceCatalogRecords.map((r) => r.id)).size, 1798);
assert.equal(new Set(czech.map((r: { language: string; number: number }) => `${r.language}:${r.number}`)).size, 808);
const correctedSource = czech.filter((r: { source_id: string }) => r.source_id === "6017");
assert.equal(correctedSource.length, 1);
assert.deepEqual(correctedSource[0], { source_id: "6017", language: "czech", number: 7521, title: "Blíž Tobě, Bože můj", source_url: "https://www.evangelickykancional.cz/pisen/6017/bliz-tobe-boze-muj" });
assert.equal(czech.filter((r: { number: number }) => r.number === 7522).length, 0);
assert(referenceCatalogRecords.every((r) => !/demo|synthetic/i.test(`${r.id} ${r.title}`)));
assert.equal(czech.filter((r: { source_url: string | null }) => r.source_url === null).length, 7);
assert.equal(polish.filter((r: { source_url: string | null }) => r.source_url !== null).length, 990);
assert.equal(displayReferenceNumber(5210), "52/1"); assert.equal(displayReferenceNumber(3478), "347/8"); assert.equal(displayReferenceNumber(1100), "1/1"); assert.equal(displayReferenceNumber(298), "298"); assert.equal(displayReferenceNumber(955), "955");
assert.equal(normalizeReferenceNumberQuery("52/1"), 5210); assert.equal(normalizeReferenceNumberQuery("347/8"), 3478); assert.equal(normalizeReferenceNumberQuery("1/1"), 1100);
const catalog = new InMemoryReferenceCatalogProvider();
assert.deepEqual(catalog.list({ search: "5210", pageSize: 2000 }).records.map((r) => r.id), catalog.list({ search: "52/1", pageSize: 2000 }).records.map((r) => r.id));
assert(catalog.list({ search: "298" }).records.some((r) => r.title === "Otevři své srdce")); assert(catalog.list({ search: "żegnamy" }).records.some((r) => r.title === "Żegnamy was w Bogu naszym"));
assert.equal(catalog.list({ language: "czech", pageSize: 2000 }).total, 808); assert.equal(catalog.list({ language: "polish", pageSize: 2000 }).total, 990); assert.equal(catalog.list({ language: "all", pageSize: 2000 }).total, 1798);
const naturalFixture = createReferenceCatalogRecords([
  { language: "czech", number: 53, title: "53", source_url: null }, { language: "czech", number: 5220, title: "52/2", source_url: null },
  { language: "czech", number: 51, title: "51", source_url: null }, { language: "czech", number: 5210, title: "52/1", source_url: null },
  { language: "czech", number: 52, title: "52", source_url: null }, { language: "czech", number: 348, title: "348", source_url: null },
  { language: "czech", number: 3478, title: "347/8", source_url: null }, { language: "czech", number: 347, title: "347", source_url: null },
  { language: "czech", number: 346, title: "346", source_url: null },
]);
assert.deepEqual(naturalFixture.map((r) => r.displayNumber), ["51", "52", "52/1", "52/2", "53", "346", "347", "347/8", "348"]);
const displays = (search: string) => catalog.list({ search, pageSize: 2000 }).records.map((r) => r.displayNumber);
assert(displays("52").includes("52") && displays("52").includes("52/1") && displays("52").includes("52/2"));
assert(displays("52/").includes("52/1") && displays("52/").includes("52/2") && !displays("52/").includes("52"));
assert(displays("52/1").every((number) => number === "52/1")); assert(!displays("52").includes("152") && !displays("52").includes("520"));
assert(displays("347").includes("347") && displays("347").includes("347/8")); assert(displays("347/").includes("347/8") && !displays("347/").includes("347"));
const corrected752 = catalog.list({ language: "czech", search: "752/1", pageSize: 2000 }).records; assert.equal(corrected752.length, 1); assert.equal(corrected752[0].canonicalNumber, 7521); assert.equal(corrected752[0].displayNumber, "752/1"); assert.equal(corrected752[0].title, "Blíž Tobě, Bože můj"); assert.equal(corrected752[0].sourceUrl, "https://www.evangelickykancional.cz/pisen/6017/bliz-tobe-boze-muj");
assert(catalog.list({ language: "czech", search: "752", pageSize: 2000 }).records.some((record) => record.id === corrected752[0].id)); assert(catalog.list({ language: "czech", search: "752/", pageSize: 2000 }).records.some((record) => record.id === corrected752[0].id)); assert.deepEqual(catalog.list({ language: "czech", search: "7521" }).records.map((record) => record.id), corrected752.map((record) => record.id)); assert.equal(catalog.list({ language: "czech", search: "752/2" }).total, 0); assert.equal(catalog.list({ language: "czech", search: "7522" }).total, 0);
const around752 = createReferenceCatalogRecords([{ language: "czech", number: 753, title: "753", source_url: null }, { language: "czech", number: 7521, title: "752/1", source_url: null }, { language: "czech", number: 751, title: "751", source_url: null }]); assert.deepEqual(around752.map((record) => record.displayNumber), ["751", "752/1", "753"]);
const firstPage = catalog.list({ page: 0, pageSize: 10 }); const secondPage = catalog.list({ page: 1, pageSize: 10 }); assert.equal(firstPage.records.length, 10); assert.equal(secondPage.records.length, 10); assert.notDeepEqual(firstPage.records.map((r) => r.id), secondPage.records.map((r) => r.id));
const cz298 = catalog.list({ language: "czech", search: "298" }).records.find((r) => r.canonicalNumber === 298)!; assert.equal(cz298.title, "Otevři své srdce"); assert.equal(cz298.sourceUrl, "https://www.evangelickykancional.cz/pisen/5593/otevri-sve-srdce");
const pl955 = catalog.list({ language: "polish", search: "955" }).records.find((r) => r.canonicalNumber === 955)!; assert.equal(pl955.title, "Żegnamy was w Bogu naszym"); assert.equal(pl955.sourceUrl, "https://hymnary.org/hymn/SE2002/955");
console.log(`Phase 31.1 data proof OK: Czech ${czech.length}, Polish ${polish.length}, total ${czech.length + polish.length}.`);
console.log(`Hashes OK: corrected Czech final output ${expected.czechCatalog}; Polish catalog ${expected.polishCatalog}; Czech validation ${expected.czechValidation}; Polish validation ${expected.polishValidation}.`);
console.log("Variants OK: 5210 -> 52/1; 3478 -> 347/8; 1100 -> 1/1. Natural ordering OK: 51, 52, 52/1, 52/2, 53 and 346, 347, 347/8, 348.");
console.log("Approved Czech erratum OK: source_id 6017, 7522 -> 7521, displayed 752/1; searches 752, 752/, 752/1, and 7521 pass; 752/2 and 7522 absent.");
console.log("Progressive searches OK: 52 family, 52/ variants, 52/1 == 5210; 347 family and 347/ variants; unrelated 152/520 excluded. Title, filters, pagination, samples, and provenance OK.");
