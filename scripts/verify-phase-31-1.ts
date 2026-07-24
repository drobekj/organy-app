import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { displayReferenceNumber, InMemoryReferenceCatalogProvider, normalizeReferenceNumberQuery, referenceCatalogRecords } from "../src/application/reference-catalog";

const expected = {
  czechCatalog: "5aaf767a5cc7f21d2c428be6ef3d07f58ebf6f5e1303807177254283cd1896f9",
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
assert(referenceCatalogRecords.every((r) => !/demo|synthetic/i.test(`${r.id} ${r.title}`)));
assert.equal(czech.filter((r: { source_url: string | null }) => r.source_url === null).length, 7);
assert.equal(polish.filter((r: { source_url: string | null }) => r.source_url !== null).length, 990);
assert.equal(displayReferenceNumber(5210), "52/1"); assert.equal(displayReferenceNumber(3478), "347/8"); assert.equal(displayReferenceNumber(1100), "1/1"); assert.equal(displayReferenceNumber(298), "298"); assert.equal(displayReferenceNumber(955), "955");
assert.equal(normalizeReferenceNumberQuery("52/1"), 5210); assert.equal(normalizeReferenceNumberQuery("347/8"), 3478); assert.equal(normalizeReferenceNumberQuery("1/1"), 1100);
const catalog = new InMemoryReferenceCatalogProvider();
assert.deepEqual(catalog.list({ search: "5210", pageSize: 2000 }).records.map((r) => r.id), catalog.list({ search: "52/1", pageSize: 2000 }).records.map((r) => r.id));
assert(catalog.list({ search: "298" }).records.some((r) => r.title === "Otevři své srdce")); assert(catalog.list({ search: "żegnamy" }).records.some((r) => r.title === "Żegnamy was w Bogu naszym"));
assert.equal(catalog.list({ language: "czech", pageSize: 2000 }).total, 808); assert.equal(catalog.list({ language: "polish", pageSize: 2000 }).total, 990); assert.equal(catalog.list({ language: "all", pageSize: 2000 }).total, 1798);
const ordered = catalog.list({ pageSize: 2000 }).records.map((r) => r.canonicalNumber); assert.deepEqual(ordered, [...ordered].sort((a,b)=>a-b)); assert(ordered.indexOf(10) < ordered.indexOf(100));
const cz298 = catalog.list({ language: "czech", search: "298" }).records.find((r) => r.canonicalNumber === 298)!; assert.equal(cz298.title, "Otevři své srdce"); assert.equal(cz298.sourceUrl, "https://www.evangelickykancional.cz/pisen/5593/otevri-sve-srdce");
const pl955 = catalog.list({ language: "polish", search: "955" }).records.find((r) => r.canonicalNumber === 955)!; assert.equal(pl955.title, "Żegnamy was w Bogu naszym"); assert.equal(pl955.sourceUrl, "https://hymnary.org/hymn/SE2002/955");
console.log(`Phase 31.1 data proof OK: Czech ${czech.length}, Polish ${polish.length}, total ${czech.length + polish.length}.`);
console.log(`Hashes OK: Czech catalog ${expected.czechCatalog}; Polish catalog ${expected.polishCatalog}; Czech validation ${expected.czechValidation}; Polish validation ${expected.polishValidation}.`);
console.log("Variants OK: 5210 -> 52/1; 3478 -> 347/8; 1100 -> 1/1. Searches OK: 5210 == 52/1, ordinary 298/955, title search. Numeric ordering OK.");
