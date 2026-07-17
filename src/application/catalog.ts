import { and, asc, eq, ilike, or } from "drizzle-orm";
import { catalogPersons, catalogSongs } from "../db/schema";
import type { ConcreteSongLanguage, PlanningRole, ServiceLanguage } from "../planning-lifecycle";
import { failure, success, type PlanningServiceResult } from "./planning-lifecycle/results";

export type PersonRole = "priest" | "organist";
export type CatalogPerson = { id: string; displayName: string; active: boolean; priest: boolean; organist: boolean };
export type CatalogSong = { songId: string; language: ConcreteSongLanguage; number: string; title: string; active: boolean; sheetMusicUrl?: string };
export type CatalogSongImportRecord = { language: unknown; number: unknown; title: unknown; active?: unknown; sheetMusicUrl?: unknown };
export type CatalogImportValidationIssue = { path: string; message: string };

export interface CatalogRepository {
  findPersonById(id: string): Promise<CatalogPerson | undefined>;
  searchPeople(role: PersonRole, query: string): Promise<CatalogPerson[]>;
  listPeople(): Promise<CatalogPerson[]>;
  upsertPerson(person: CatalogPerson): Promise<CatalogPerson>;
  findSongById(id: string): Promise<CatalogSong | undefined>;
  searchSongs(languages: ConcreteSongLanguage[], query: string): Promise<CatalogSong[]>;
  listSongs(): Promise<CatalogSong[]>;
  upsertSong(song: CatalogSong): Promise<CatalogSong>;
  setSongActive(songId: string, active: boolean): Promise<CatalogSong | undefined>;
}

export class CatalogService {
  constructor(private readonly repo: CatalogRepository) {}
  async searchPeople(input: { role: PersonRole; query?: string }) { return success(await this.repo.searchPeople(input.role, input.query ?? "")); }
  async listPeople() { return success(await this.repo.listPeople()); }
  async savePerson(input: { role: PlanningRole; person: Omit<CatalogPerson, "id"> & { id?: string } }): Promise<PlanningServiceResult<CatalogPerson>> {
    if (input.role !== "admin") return failure({ code: "permissionDenied", message: "Only admin can manage person catalog." });
    const name = input.person.displayName.trim();
    if (!name) return failure({ code: "invalidInput", message: "Display name is required." });
    return success(await this.repo.upsertPerson({ id: input.person.id ?? crypto.randomUUID(), displayName: name, active: input.person.active, priest: input.person.priest, organist: input.person.organist }));
  }
  async listSongs() { return success(await this.repo.listSongs()); }
  async searchSongs(input: { language: ServiceLanguage; query?: string }) { return success(await this.repo.searchSongs(languagesForService(input.language), input.query ?? "")); }
  async setSongActive(input: { role: PlanningRole; songId: string; active: boolean }): Promise<PlanningServiceResult<CatalogSong>> {
    if (input.role !== "admin") return failure({ code: "permissionDenied", message: "Only admin can activate or deactivate songs." });
    const song = await this.repo.setSongActive(input.songId, input.active);
    return song ? success(song) : failure({ code: "notFound", message: "Song was not found." });
  }
}

export class InMemoryCatalogRepository implements CatalogRepository {
  constructor(private people = seedPeople(), private songs = seedSongs()) {}
  async findPersonById(id: string) { return this.people.find((p) => p.id === id); }
  async searchPeople(role: PersonRole, query: string) { const q = query.toLowerCase(); return this.people.filter((p) => p.active && p[role] && p.displayName.toLowerCase().includes(q)); }
  async listPeople() { return [...this.people]; }
  async upsertPerson(person: CatalogPerson) { const i = this.people.findIndex((p) => p.id === person.id); if (i >= 0) this.people[i] = person; else this.people.push(person); return person; }
  async findSongById(id: string) { return this.songs.find((s) => s.songId === id); }
  async searchSongs(languages: ConcreteSongLanguage[], query: string) { const q = query.toLowerCase(); return this.songs.filter((s) => s.active && languages.includes(s.language) && (s.number.toLowerCase().includes(q) || s.title.toLowerCase().includes(q))); }
  async listSongs() { return [...this.songs]; }
  async upsertSong(song: CatalogSong) { if (this.songs.some((s) => s.songId !== song.songId && s.language === song.language && s.number === song.number)) throw new Error("Duplicate song language/number."); const i = this.songs.findIndex((s) => s.songId === song.songId); if (i >= 0) this.songs[i] = song; else this.songs.push(song); return song; }
  async setSongActive(songId: string, active: boolean) { const song = await this.findSongById(songId); if (!song) return undefined; song.active = active; return song; }
}

export class DrizzleCatalogRepository implements CatalogRepository {
  constructor(private readonly db: any) {}
  async findPersonById(id: string) { const [r] = await this.db.select().from(catalogPersons).where(eq(catalogPersons.id, id)).limit(1); return r && mapPerson(r); }
  async searchPeople(role: PersonRole, query: string) { const roleCol = role === "priest" ? catalogPersons.priest : catalogPersons.organist; const rows = await this.db.select().from(catalogPersons).where(and(eq(catalogPersons.active, true), eq(roleCol, true), ilike(catalogPersons.displayName, `%${query}%`))).orderBy(asc(catalogPersons.displayName)); return rows.map(mapPerson); }
  async listPeople() { return (await this.db.select().from(catalogPersons).orderBy(asc(catalogPersons.displayName))).map(mapPerson); }
  async upsertPerson(person: CatalogPerson) { const now = new Date(); const [r] = await this.db.insert(catalogPersons).values({ ...person, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: catalogPersons.id, set: { displayName: person.displayName, active: person.active, priest: person.priest, organist: person.organist, updatedAt: now } }).returning(); return mapPerson(r); }
  async findSongById(id: string) { const [r] = await this.db.select().from(catalogSongs).where(eq(catalogSongs.songId, id)).limit(1); return r && mapSong(r); }
  async searchSongs(languages: ConcreteSongLanguage[], query: string) { const rows = await this.db.select().from(catalogSongs).where(and(eq(catalogSongs.active, true), or(...languages.map((l) => eq(catalogSongs.language, l))), or(ilike(catalogSongs.number, `%${query}%`), ilike(catalogSongs.title, `%${query}%`)))).orderBy(asc(catalogSongs.language), asc(catalogSongs.number)); return rows.map(mapSong); }
  async listSongs() { return (await this.db.select().from(catalogSongs).orderBy(asc(catalogSongs.language), asc(catalogSongs.number))).map(mapSong); }
  async upsertSong(song: CatalogSong) { const now = new Date(); const [r] = await this.db.insert(catalogSongs).values({ ...song, sheetMusicUrl: song.sheetMusicUrl ?? null, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: catalogSongs.songId, set: { title: song.title, active: song.active, sheetMusicUrl: song.sheetMusicUrl ?? null, updatedAt: now } }).returning(); return mapSong(r); }
  async setSongActive(songId: string, active: boolean) { const [r] = await this.db.update(catalogSongs).set({ active, updatedAt: new Date() }).where(eq(catalogSongs.songId, songId)).returning(); return r && mapSong(r); }
}

export function languagesForService(language: ServiceLanguage): ConcreteSongLanguage[] { return language === "mixed" ? ["czech", "polish"] : [language]; }
export function isEligiblePerson(person: CatalogPerson | undefined, role: PersonRole) { return Boolean(person?.active && person[role]); }
export function isEligibleSong(song: CatalogSong | undefined, serviceLanguage: ServiceLanguage) { return Boolean(song?.active && languagesForService(serviceLanguage).includes(song.language)); }
export function validateCatalogSongImport(input: CatalogSongImportRecord[]): CatalogImportValidationIssue[] { const issues: CatalogImportValidationIssue[] = []; const seen = new Set<string>(); input.forEach((r, i) => { if (r.language !== "czech" && r.language !== "polish") issues.push({ path: `${i}.language`, message: "Unsupported language." }); if (typeof r.number !== "string" || !r.number.trim()) issues.push({ path: `${i}.number`, message: "Number is required." }); if (typeof r.title !== "string" || !r.title.trim()) issues.push({ path: `${i}.title`, message: "Title is required." }); if (r.sheetMusicUrl !== undefined && r.sheetMusicUrl !== null && typeof r.sheetMusicUrl !== "string") issues.push({ path: `${i}.sheetMusicUrl`, message: "Sheet music URL must be a string." }); if (typeof r.sheetMusicUrl === "string" && r.sheetMusicUrl && !/^https?:\/\//.test(r.sheetMusicUrl)) issues.push({ path: `${i}.sheetMusicUrl`, message: "Sheet music URL must be http(s)." }); const key = `${r.language}:${r.number}`; if (seen.has(key)) issues.push({ path: `${i}`, message: "Duplicate language/number in import." }); seen.add(key); }); return issues; }
function mapPerson(r: any): CatalogPerson { return { id: r.id, displayName: r.displayName, active: r.active, priest: r.priest, organist: r.organist }; }
function mapSong(r: any): CatalogSong { return { songId: r.songId, language: r.language, number: r.number, title: r.title, active: r.active, ...(r.sheetMusicUrl ? { sheetMusicUrl: r.sheetMusicUrl } : {}) }; }
function seedPeople(): CatalogPerson[] { return [{ id: "demo-priest", displayName: "Demo Priest", active: true, priest: true, organist: false }, { id: "demo-organist", displayName: "Demo Organist", active: true, priest: false, organist: true }, { id: "demo-both", displayName: "Demo Priest Organist", active: true, priest: true, organist: true }, { id: "demo-inactive-priest", displayName: "Demo Inactive Priest", active: false, priest: true, organist: false }]; }
function seedSongs(): CatalogSong[] { return [{ songId: "demo-cz-101", language: "czech", number: "101", title: "Demo Czech Song", active: true, sheetMusicUrl: "https://example.com/cz-101.pdf" }, { songId: "demo-pl-101", language: "polish", number: "101", title: "Demo Polish Song", active: true }, { songId: "demo-cz-inactive", language: "czech", number: "999", title: "Demo Inactive Song", active: false }]; }
