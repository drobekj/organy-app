import czechArtifact from "../../data/catalog/catalog-czech-thematic-sections.json";
import polishArtifact from "../../data/catalog/catalog-polish-thematic-sections.json";
import { referenceNumberParts } from "./reference-catalog-contract";
import type {
  ReferenceThematicLanguage,
  ReferenceThematicSection,
  ReferenceThematicSectionProvider,
} from "./reference-thematic-section-contract";

const bundledSections: ReferenceThematicSection[] = [
  ...(czechArtifact.sections as ReferenceThematicSection[]),
  ...(polishArtifact.sections as ReferenceThematicSection[]),
];

export class MemoryReferenceThematicSectionProvider implements ReferenceThematicSectionProvider {
  private readonly byId: Map<string, ReferenceThematicSection>;
  private readonly byLanguage: Map<ReferenceThematicLanguage, ReferenceThematicSection[]>;

  constructor(sections: readonly ReferenceThematicSection[] = bundledSections) {
    this.byId = new Map(sections.map((section) => [section.id, clone(section)]));
    this.byLanguage = new Map((["czech", "polish"] as const).map((language) => [
      language,
      sections.filter((section) => section.language === language).sort((a, b) => a.order - b.order).map(clone),
    ]));
  }

  async listSections(language: ReferenceThematicLanguage): Promise<ReferenceThematicSection[]> {
    assertLanguage(language);
    return (this.byLanguage.get(language) ?? []).map(clone);
  }

  async getSectionById(id: string): Promise<ReferenceThematicSection | undefined> {
    const section = this.byId.get(id);
    return section ? clone(section) : undefined;
  }

  async resolveSection(
    language: ReferenceThematicLanguage,
    canonicalSongNumber: number,
  ): Promise<ReferenceThematicSection | undefined> {
    assertLanguage(language);
    const baseNumber = referenceNumberParts(canonicalSongNumber).base;
    const matches = (this.byLanguage.get(language) ?? []).filter((section) =>
      section.ranges.some((range) => baseNumber >= range.from && baseNumber <= range.to));
    if (matches.length > 1) throw new Error("Thematic-section resolution is ambiguous.");
    return matches[0] ? clone(matches[0]) : undefined;
  }
}

function clone(section: ReferenceThematicSection): ReferenceThematicSection {
  return {
    ...section,
    ranges: section.ranges.map((range) => ({ ...range })),
    sourcePage: { ...section.sourcePage },
  };
}

function assertLanguage(value: unknown): asserts value is ReferenceThematicLanguage {
  if (value !== "czech" && value !== "polish") throw new Error("Thematic language is invalid.");
}
