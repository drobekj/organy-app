import assert from "node:assert/strict";
import { createReferenceCatalogRecords, displayReferenceNumber, InMemoryReferenceCatalogProvider, normalizeReferenceNumberQuery, referenceCatalogRecords } from "../src/application/reference-catalog";

const catalog = new InMemoryReferenceCatalogProvider();
assert.equal(displayReferenceNumber(5210), "52/1");
assert.equal(displayReferenceNumber(3478), "347/8");
assert.equal(displayReferenceNumber(1100), "1/1");
assert.equal(displayReferenceNumber(298), "298");
assert.equal(displayReferenceNumber(955), "955");
assert.equal(normalizeReferenceNumberQuery("52/1"), 5210);
assert.equal(normalizeReferenceNumberQuery("347/8"), 3478);
assert.equal(normalizeReferenceNumberQuery("1/1"), 1100);
assert.equal(catalog.counts.czech, 808);
assert.equal(catalog.counts.polish, 990);
assert.equal(catalog.counts.all, 1798);
assert.equal(new Set(referenceCatalogRecords.map((r) => r.id)).size, 1798);
assert(referenceCatalogRecords.every((r) => !r.id.toLowerCase().includes("demo") && !r.id.toLowerCase().includes("synthetic") && !r.title.toLowerCase().includes("demo") && !r.title.toLowerCase().includes("synthetic")));
assert.deepEqual(catalog.list({ search: "5210", pageSize: 2000 }).records.map((r) => r.id), catalog.list({ search: "52/1", pageSize: 2000 }).records.map((r) => r.id));
assert.deepEqual(catalog.list({ search: "3478", pageSize: 2000 }).records.map((r) => r.id), catalog.list({ search: "347/8", pageSize: 2000 }).records.map((r) => r.id));
assert(catalog.list({ search: "298" }).records.some((r) => r.language === "czech" && r.title === "Otevři své srdce"));
assert(catalog.list({ search: "ŻEGNAMY" }).records.some((r) => r.language === "polish" && r.canonicalNumber === 955));
assert.equal(catalog.list({ language: "czech", pageSize: 2000 }).total, 808);
assert.equal(catalog.list({ language: "polish", pageSize: 2000 }).total, 990);
assert.equal(catalog.list({ language: "all", pageSize: 2000 }).total, 1798);
const naturalFixture = createReferenceCatalogRecords([
  { language: "czech", number: 53, title: "53", source_url: null },
  { language: "czech", number: 5220, title: "52/2", source_url: null },
  { language: "czech", number: 51, title: "51", source_url: null },
  { language: "czech", number: 5210, title: "52/1", source_url: null },
  { language: "czech", number: 52, title: "52", source_url: null },
  { language: "czech", number: 348, title: "348", source_url: null },
  { language: "czech", number: 3478, title: "347/8", source_url: null },
  { language: "czech", number: 347, title: "347", source_url: null },
  { language: "czech", number: 346, title: "346", source_url: null },
]);
assert.deepEqual(naturalFixture.slice(0, 5).map((r) => r.displayNumber), ["51", "52", "52/1", "52/2", "53"]);
assert.deepEqual(naturalFixture.slice(5).map((r) => r.displayNumber), ["346", "347", "347/8", "348"]);
const displays = (search: string) => catalog.list({ search, pageSize: 2000 }).records.map((r) => r.displayNumber);
assert(displays("52").includes("52") && displays("52").includes("52/1") && displays("52").includes("52/2"));
assert(displays("52/").includes("52/1") && displays("52/").includes("52/2") && !displays("52/").includes("52"));
assert(displays("52/1").every((number) => number === "52/1"));
assert(!displays("52").includes("152") && !displays("52").includes("520"));
assert(displays("347").includes("347") && displays("347").includes("347/8"));
assert(displays("347/").includes("347/8") && !displays("347/").includes("347"));
const firstPage = catalog.list({ page: 0, pageSize: 10 });
const secondPage = catalog.list({ page: 1, pageSize: 10 });
assert.equal(firstPage.records.length, 10); assert.equal(secondPage.records.length, 10); assert.notDeepEqual(firstPage.records.map((r) => r.id), secondPage.records.map((r) => r.id));
const czech298 = catalog.list({ language: "czech", search: "298" }).records.find((r) => r.canonicalNumber === 298);
assert.equal(czech298?.title, "Otevři své srdce");
assert.equal(czech298?.sourceUrl, "https://www.evangelickykancional.cz/pisen/5593/otevri-sve-srdce");
const polish955 = catalog.list({ language: "polish", search: "955" }).records.find((r) => r.canonicalNumber === 955);
assert.equal(polish955?.title, "Żegnamy was w Bogu naszym");
assert.equal(polish955?.sourceUrl, "https://hymnary.org/hymn/SE2002/955");
assert.equal(referenceCatalogRecords.filter((r) => r.language === "czech" && !r.sourceUrl).length, 7);
assert.equal(referenceCatalogRecords.filter((r) => r.language === "polish" && r.sourceUrl).length, 990);
console.log("Reference catalog tests passed.");
