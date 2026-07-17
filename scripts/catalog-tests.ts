import assert from "node:assert/strict";
import { CatalogService, InMemoryCatalogRepository, validateCatalogSongImport } from "../src/application/catalog";
import { InMemoryCompletedServiceRecordRepository, InMemoryPlanningSetRepository, PlanningLifecycleService } from "../src/application/planning-lifecycle";
import type { ServiceContext, PlanningSet } from "../src/planning-lifecycle";

async function main() {
  const repo = new InMemoryCatalogRepository();
  const catalog = new CatalogService(repo);
  assert((await must(catalog.searchPeople({ role: "priest", query: "Organist" }))).some((p) => p.id === "demo-both"));
  assert(!(await must(catalog.searchPeople({ role: "priest", query: "Demo Organist" }))).some((p) => p.id === "demo-organist"));
  assert(!(await must(catalog.searchPeople({ role: "organist", query: "Demo Priest" }))).some((p) => p.id === "demo-priest"));
  assert(!(await must(catalog.searchPeople({ role: "priest", query: "Inactive" }))).length);
  assert.equal((await catalog.savePerson({ role: "organist", person: { displayName: "X", active: true, priest: true, organist: false } })).success, false);
  const created = await catalog.savePerson({ role: "admin", person: { displayName: "Created Both", active: true, priest: true, organist: true } });
  assert.equal(created.success, true);
  const removedRole = created.success ? await catalog.savePerson({ role: "admin", person: { ...created.value, organist: false } }) : created;
  assert.equal(removedRole.success, true);
  assert(!(await must(catalog.searchPeople({ role: "organist", query: "Created Both" }))).length);

  assert(validateCatalogSongImport([{ language: "bad", number: "", title: "", active: "yes", sheetMusicUrl: 1 }, { language: "czech", number: "1", title: "A" }, { language: "czech", number: "1", title: "B" }]).length >= 6);
  assert.equal(validateCatalogSongImport([{ language: "czech", number: "1", title: "A" }, { language: "polish", number: "1", title: "B" }]).length, 0);
  assert((await must(catalog.searchSongs({ language: "czech", query: "101" }))).every((s) => s.language === "czech"));
  assert((await must(catalog.searchSongs({ language: "polish", query: "Polish" }))).every((s) => s.language === "polish"));
  assert((await must(catalog.searchSongs({ language: "mixed", query: "101" }))).length >= 2);
  assert(!(await must(catalog.searchSongs({ language: "mixed", query: "Inactive" }))).length);
  assert((await must(catalog.searchSongs({ language: "czech", query: "101" })))[0].sheetMusicUrl);
  assert.equal((await catalog.setSongActive({ role: "priest", songId: "demo-cz-101", active: false })).success, false);
  assert.equal((await catalog.setSongActive({ role: "admin", songId: "demo-cz-101", active: false })).success, true);

  const service = new PlanningLifecycleService({ planningSets: new InMemoryPlanningSetRepository(), completedServiceRecords: new InMemoryCompletedServiceRecordRepository(), catalog: repo, now: () => new Date("2026-01-01T00:00:00Z") });
  const ctx: ServiceContext = { serviceDate: "2025-01-01", serviceTime: "10:00", language: "mixed", priest: { id: "demo-priest", displayName: "Typed ignored" }, organist: { id: "demo-organist", displayName: "Typed ignored" } };
  const set: PlanningSet & { status: "working" } = { status: "working", language: "mixed", rows: [{ song: { songId: "demo-pl-101", language: "polish", number: "101", title: "Old title" } }, { note: "note-only valid" }] };
  const noPersonId = await service.saveWorkingSet({ role: "admin", serviceContext: { ...ctx, priest: { displayName: "free text" } }, set });
  assert.equal(noPersonId.success, false);
  const noSongId = await service.saveWorkingSet({ role: "admin", serviceContext: { ...ctx, serviceTime: "10:01" }, set: { ...set, rows: [{ song: { language: "polish", number: "101" } }] } });
  assert.equal(noSongId.success, false);
  const saved = await service.saveWorkingSet({ role: "admin", serviceContext: ctx, set });
  assert.equal(saved.success, true);
  if (!saved.success) throw new Error("save failed");
  assert.equal(saved.value.serviceContext.priest.displayName, "Demo Priest");
  assert.equal(saved.value.rows[0].song?.title, "Demo Polish Song");
  await catalog.savePerson({ role: "admin", person: { id: "demo-priest", displayName: "Renamed Priest", active: false, priest: false, organist: false } });
  await catalog.setSongActive({ role: "admin", songId: "demo-pl-101", active: false });
  const unchanged = await service.saveWorkingSet({ role: "admin", existingSetId: saved.value.id, serviceContext: saved.value.serviceContext, set: { status: "working", language: "mixed", rows: saved.value.rows } });
  assert.equal(unchanged.success, true);
  assert.equal(unchanged.success && unchanged.value.serviceContext.priest.displayName, "Demo Priest");
  assert.equal(unchanged.success && unchanged.value.rows[0].song?.title, "Demo Polish Song");
  const movedInactive = await service.saveWorkingSet({ role: "admin", existingSetId: saved.value.id, serviceContext: saved.value.serviceContext, set: { status: "working", language: "mixed", rows: [{ note: "inserted before inactive" }, saved.value.rows[0]] } });
  assert.equal(movedInactive.success, true);
  const duplicatedInactive = await service.saveWorkingSet({ role: "admin", existingSetId: saved.value.id, serviceContext: saved.value.serviceContext, set: { status: "working", language: "mixed", rows: [saved.value.rows[0], saved.value.rows[0]] } });
  assert.equal(duplicatedInactive.success, false);
  await catalog.savePerson({ role: "admin", person: { id: "demo-priest", displayName: "Renamed Priest", active: true, priest: true, organist: false } });
  await catalog.setSongActive({ role: "admin", songId: "demo-pl-101", active: true });
  await catalogRepoUpsertSongTitle(repo, "demo-pl-101", "Renamed Polish Song");
  const updatedSnapshotSave = await service.saveWorkingSet({ role: "admin", existingSetId: saved.value.id, serviceContext: saved.value.serviceContext, set });
  assert.equal(updatedSnapshotSave.success, true);
  assert.equal(updatedSnapshotSave.success && updatedSnapshotSave.value.rows[0].song?.title, "Renamed Polish Song");
  const finalized = await service.finalizeWorkingSet({ role: "admin", workingSetId: saved.value.id });
  assert.equal(finalized.success, true);
  const completed = await service.completeFinalSet({ role: "admin", finalSetId: finalized.success ? finalized.value.id : "missing" });
  assert.equal(completed.success, true);
  assert.equal(completed.success && completed.value.set.rows[1].note, "note-only valid");
  console.log("Catalog tests passed.");
}
async function catalogRepoUpsertSongTitle(repo: InMemoryCatalogRepository, songId: string, title: string) { const song = await repo.findSongById(songId); if (!song) throw new Error("song missing"); await repo.upsertSong({ ...song, title }); }
async function must<T>(promise: Promise<{ success: true; value: T } | { success: false; error: unknown }>): Promise<T> { const result = await promise; if (!result.success) throw new Error("expected success"); return result.value; }
main().catch((e) => { console.error(e); process.exit(1); });
