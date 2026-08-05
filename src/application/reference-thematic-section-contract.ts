import type { ConcreteSongLanguage } from "../planning-lifecycle";

export type ReferenceThematicLanguage = ConcreteSongLanguage;
export type ReferenceThematicRange = { from: number; to: number };
export type ReferenceThematicSourcePage = { scanPage: number; printedPage: number };
export type ReferenceThematicParent = {
  id: string;
  language: ReferenceThematicLanguage;
  title: string;
  parentId: string | null;
  order: number;
  sourcePage: { scanPage: number };
};
export type ReferenceThematicSection = {
  id: string;
  themeKey: string;
  language: ReferenceThematicLanguage;
  title: string;
  parentId: string;
  order: number;
  ranges: ReferenceThematicRange[];
  sourcePage: ReferenceThematicSourcePage;
};
export type ReferenceThematicCatalog = {
  language: ReferenceThematicLanguage;
  sourceFile: string;
  parents: ReferenceThematicParent[];
  sections: ReferenceThematicSection[];
};
export type ReferenceThematicGap = {
  language: ReferenceThematicLanguage;
  after: number;
  before: number;
};
export interface ReferenceThematicSectionProvider {
  listSections(language: ReferenceThematicLanguage): Promise<ReferenceThematicSection[]>;
  getSectionById(id: string): Promise<ReferenceThematicSection | undefined>;
  resolveSection(language: ReferenceThematicLanguage, canonicalSongNumber: number): Promise<ReferenceThematicSection | undefined>;
}
