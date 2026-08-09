import type {
  ReferenceThematicLanguage,
  ReferenceThematicSection,
  ReferenceThematicSectionProvider,
} from "./reference-thematic-section-contract";
import { MemoryReferenceThematicSectionProvider } from "./reference-thematic-section";

type Transport = (action: "listSections" | "getSectionById" | "resolveSection", input: unknown) => Promise<unknown>;

async function transport(action: "listSections" | "getSectionById" | "resolveSection", input: unknown) {
  const response = await fetch("/api/reference-topics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Reference Topic request failed.");
  return body;
}

export class DbReferenceTopicClient implements ReferenceThematicSectionProvider {
  constructor(private readonly send: Transport = transport) {}
  async listSections(language: ReferenceThematicLanguage) { return this.send("listSections", { language }) as Promise<ReferenceThematicSection[]>; }
  async getSectionById(id: string) { return this.send("getSectionById", { id }) as Promise<ReferenceThematicSection | undefined>; }
  async resolveSection(language: ReferenceThematicLanguage, canonicalSongNumber: number) { return this.send("resolveSection", { language, canonicalSongNumber }) as Promise<ReferenceThematicSection | undefined>; }
}

export class MemoryReferenceTopicClient implements ReferenceThematicSectionProvider {
  constructor(private readonly provider = new MemoryReferenceThematicSectionProvider()) {}
  async listSections(language: ReferenceThematicLanguage) { return this.provider.listSections(language); }
  async getSectionById(id: string) { return this.provider.getSectionById(id); }
  async resolveSection(language: ReferenceThematicLanguage, canonicalSongNumber: number) { return this.provider.resolveSection(language, canonicalSongNumber); }
}
