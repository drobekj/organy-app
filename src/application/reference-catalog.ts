import czechCatalog from "../../data/catalog/catalog-czech-final.json";
import polishCatalog from "../../data/catalog/catalog-polish-final.json";
import type { ConcreteSongLanguage } from "../planning-lifecycle";
import { compareReferenceCatalogRecords, displayReferenceNumber, normalizeReferenceNumberQuery, referenceNumberParts, type ReferenceCatalogPage, type ReferenceCatalogQuery, type ReferenceCatalogRecord } from "./reference-catalog-contract";
export * from "./reference-catalog-contract";
type RawReferenceCatalogRecord = { language: unknown; number: unknown; title: unknown; source_url: unknown };

export function createReferenceCatalogRecords(rawRecords: RawReferenceCatalogRecord[]): ReferenceCatalogRecord[] {
  return rawRecords.map((record) => {
    if ((record.language !== "czech" && record.language !== "polish") || !Number.isInteger(record.number) || typeof record.title !== "string" || !record.title.trim()) throw new Error("Invalid frozen reference catalog record.");
    const language = record.language as ConcreteSongLanguage;
    const canonicalNumber = record.number as number;
    const title = record.title as string;
    const sourceUrl = record.source_url === null ? undefined : record.source_url;
    if (sourceUrl !== undefined && typeof sourceUrl !== "string") throw new Error("Invalid reference catalog source URL.");
    return { id: `${language}:${canonicalNumber}`, language, canonicalNumber, displayNumber: displayReferenceNumber(canonicalNumber), title, ...(sourceUrl ? { sourceUrl } : {}) };
  }).sort(compareReferenceCatalogRecords);
}

function matchesReferenceNumber(record: ReferenceCatalogRecord, query: string): boolean {
  if (/^[1-9]\d{3,}$/.test(query)) return record.canonicalNumber === Number(query);
  const family = query.match(/^([1-9]\d*)\/?$/);
  if (family) {
    const { base, variant } = referenceNumberParts(record.canonicalNumber);
    return base === Number(family[1]) && (query.endsWith("/") ? variant > 0 : true);
  }
  const canonical = normalizeReferenceNumberQuery(query);
  return canonical !== undefined && record.canonicalNumber === canonical;
}

export class InMemoryReferenceCatalogProvider {
  private readonly records: ReferenceCatalogRecord[];
  readonly counts: ReferenceCatalogPage["counts"];
  constructor(records: ReferenceCatalogRecord[] = referenceCatalogRecords) {
    this.records = [...records].sort(compareReferenceCatalogRecords);
    this.counts = { all: this.records.length, czech: this.records.filter((r) => r.language === "czech").length, polish: this.records.filter((r) => r.language === "polish").length };
  }
  list(input: ReferenceCatalogQuery = {}): ReferenceCatalogPage {
    const language = input.language ?? "all";
    const search = input.search?.trim() ?? "";
    const isNumberQuery = /^[1-9]\d*(?:\/[1-8]?)?$/.test(search);
    const titleQuery = search.toLocaleLowerCase();
    const filtered = this.records.filter((record) => (language === "all" || record.language === language) && (!search || (isNumberQuery ? matchesReferenceNumber(record, search) : record.title.toLocaleLowerCase().includes(titleQuery))));
    const pageSize = input.pageSize ?? 50;
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(Math.max(input.page ?? 0, 0), pageCount - 1);
    return { records: filtered.slice(page * pageSize, page * pageSize + pageSize), total: filtered.length, page, pageSize, pageCount, counts: this.counts };
  }
  getById(id: string): ReferenceCatalogRecord | undefined { return this.records.find((record) => record.id === id); }
}

export const referenceCatalogRecords = createReferenceCatalogRecords([...(czechCatalog as RawReferenceCatalogRecord[]), ...(polishCatalog as RawReferenceCatalogRecord[])]);
export const referenceCatalog = new InMemoryReferenceCatalogProvider(referenceCatalogRecords);
