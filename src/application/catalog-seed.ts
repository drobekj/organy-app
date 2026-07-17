import type { CatalogPerson, CatalogRepository, CatalogSong } from "./catalog";

export const phase29DemoPeople: CatalogPerson[] = [
  { id: "phase29-demo-priest", displayName: "Phase 29 Demo Priest", active: true, priest: true, organist: false },
  { id: "phase29-demo-organist", displayName: "Phase 29 Demo Organist", active: true, priest: false, organist: true },
  { id: "phase29-demo-both", displayName: "Phase 29 Demo Priest+Organist", active: true, priest: true, organist: true },
  { id: "phase29-demo-inactive", displayName: "Phase 29 Demo Inactive Person", active: false, priest: true, organist: true },
];

export const phase29DemoSongs: CatalogSong[] = [
  { songId: "phase29-demo-cz-101", language: "czech", number: "PH29-DEMO-101", title: "Phase 29 Czech Demo With Sheet", active: true, sheetMusicUrl: "https://example.com/phase29-cz-101.pdf" },
  { songId: "phase29-demo-pl-101", language: "polish", number: "PH29-DEMO-101", title: "Phase 29 Polish Demo", active: true },
  { songId: "phase29-demo-cz-202", language: "czech", number: "PH29-DEMO-202", title: "Phase 29 Czech Demo No Sheet", active: true },
  { songId: "phase29-demo-pl-inactive", language: "polish", number: "PH29-DEMO-999", title: "Phase 29 Inactive Polish Demo", active: false, sheetMusicUrl: "https://example.com/phase29-pl-999.pdf" },
];

export async function seedCatalog(repo: Pick<CatalogRepository, "upsertPerson" | "upsertSong">): Promise<void> {
  for (const person of phase29DemoPeople) await repo.upsertPerson(person);
  for (const song of phase29DemoSongs) await repo.upsertSong(song);
}
