import czechCatalog from "../../data/catalog/catalog-czech-antiphons.json";
import polishCatalog from "../../data/catalog/catalog-polish-antiphons.json";
import type { ReferenceAntiphonPage, ReferenceAntiphonProvider, ReferenceAntiphonQuery, ReferenceAntiphonRecord } from "./reference-antiphon-contract";

const bundledCzechRecords: ReferenceAntiphonRecord[] = czechCatalog.map((record) => ({
  id: `czech:${record.number}`,
  language: "czech",
  canonicalNumber: record.number,
  displayNumber: String(record.number),
  title: record.title,
  sourceUrl: record.url,
}));

const bundledPolishRecords: ReferenceAntiphonRecord[] = polishCatalog.map((record) => ({
  id: `polish:${record.number}`,
  language: "polish",
  canonicalNumber: record.number,
  displayNumber: String(record.number),
  title: record.title,
}));

const bundledRecords: ReferenceAntiphonRecord[] = [...bundledCzechRecords, ...bundledPolishRecords];
const languageRank = (language: ReferenceAntiphonRecord["language"]) => language === "czech" ? 0 : 1;
const compareRecords = (left: ReferenceAntiphonRecord, right: ReferenceAntiphonRecord) =>
  languageRank(left.language) - languageRank(right.language)
  || left.canonicalNumber - right.canonicalNumber
  || left.id.localeCompare(right.id);

/** Read-only in-memory provider backed by the frozen Czech and Polish production catalogs. */
export class MemoryReferenceAntiphonProvider implements ReferenceAntiphonProvider {
  constructor(private readonly sourceRecords: readonly ReferenceAntiphonRecord[] = bundledRecords) {}

  async list(input: ReferenceAntiphonQuery = {}): Promise<ReferenceAntiphonPage> {
    const language = input.language ?? "all";
    const search = input.search?.trim() ?? "";
    const lowerSearch = search.toLocaleLowerCase();
    const numericSearch = /^\d+$/.test(search);
    const filtered = this.sourceRecords
      .filter((record) => language === "all" || record.language === language)
      .filter((record) => !search || (numericSearch
        ? record.displayNumber.startsWith(search)
        : record.title.toLocaleLowerCase().includes(lowerSearch)))
      .map((record) => ({ ...record }))
      .sort(compareRecords);
    const pageSize = input.pageSize ?? 50;
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(input.page ?? 0, pageCount - 1);
    const start = page * pageSize;
    const counts = {
      all: this.sourceRecords.length,
      czech: this.sourceRecords.filter((record) => record.language === "czech").length,
      polish: this.sourceRecords.filter((record) => record.language === "polish").length,
    };
    return { records: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize, pageCount, counts };
  }

  async getById(id: string): Promise<ReferenceAntiphonRecord | undefined> {
    const found = this.sourceRecords.find((record) => record.id === id);
    return found ? { ...found } : undefined;
  }
}
