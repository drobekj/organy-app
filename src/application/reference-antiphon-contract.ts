export type ReferenceAntiphonLanguage = "czech" | "polish";
export type ReferenceAntiphonLanguageFilter = ReferenceAntiphonLanguage | "all";

export type ReferenceAntiphonRecord = {
  id: string;
  language: ReferenceAntiphonLanguage;
  canonicalNumber: number;
  displayNumber: string;
  title: string;
  sourceUrl?: string;
};

export type ReferenceAntiphonQuery = {
  language?: ReferenceAntiphonLanguageFilter;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ReferenceAntiphonPage = {
  records: ReferenceAntiphonRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: { all: number; czech: number; polish: number };
};

export interface ReferenceAntiphonProvider {
  list(input?: ReferenceAntiphonQuery): Promise<ReferenceAntiphonPage>;
  getById(id: string): Promise<ReferenceAntiphonRecord | undefined>;
}
