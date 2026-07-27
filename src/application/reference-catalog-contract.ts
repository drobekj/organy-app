import type { ConcreteSongLanguage } from "../planning-lifecycle";

export type ReferenceCatalogLanguageFilter = ConcreteSongLanguage | "all";
export type ReferenceCatalogRecord = { id: string; language: ConcreteSongLanguage; canonicalNumber: number; displayNumber: string; title: string; sourceUrl?: string };
export type ReferenceCatalogQuery = { language?: ReferenceCatalogLanguageFilter; search?: string; page?: number; pageSize?: number };
export type ReferenceCatalogPage = { records: ReferenceCatalogRecord[]; total: number; page: number; pageSize: number; pageCount: number; counts: { all: number; czech: number; polish: number } };

export function displayReferenceNumber(encoded: number): string {
  if (!Number.isInteger(encoded) || encoded <= 0) throw new Error("Reference catalog number must be a positive integer.");
  if (encoded < 1000) return String(encoded);
  if (encoded % 10 !== 0) return `${Math.floor(encoded / 10)}/${encoded % 10}`;
  if (encoded % 100 !== 0) return `${Math.floor(encoded / 100)}/${Math.floor(encoded / 10) % 10}`;
  if (encoded % 1000 !== 0) return `${Math.floor(encoded / 1000)}/${Math.floor(encoded / 100) % 10}`;
  return String(encoded);
}

export function normalizeReferenceNumberQuery(query: string): number | undefined {
  const trimmed = query.trim();
  if (/^[1-9]\d*$/.test(trimmed)) return Number(trimmed);
  const slash = trimmed.match(/^([1-9]\d*)\/([1-8])$/);
  if (!slash) return undefined;
  const base = Number(slash[1]); const variant = Number(slash[2]);
  if (base < 10) return base * 1000 + variant * 100;
  if (base < 100) return base * 100 + variant * 10;
  if (base < 1000) return base * 10 + variant;
  return undefined;
}

export function referenceNumberParts(encoded: number): { base: number; variant: number } {
  const [base, variant] = displayReferenceNumber(encoded).split("/").map(Number);
  return { base, variant: variant ?? 0 };
}

export function compareReferenceCatalogRecords(a: ReferenceCatalogRecord, b: ReferenceCatalogRecord): number {
  const an = referenceNumberParts(a.canonicalNumber); const bn = referenceNumberParts(b.canonicalNumber);
  return an.base - bn.base || an.variant - bn.variant || a.language.localeCompare(b.language) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}
