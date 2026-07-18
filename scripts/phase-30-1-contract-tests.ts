import assert from "node:assert/strict";
import { InMemoryCatalogRepository } from "../src/application/catalog";
import { InteractionService, type InteractionRepository } from "../src/application/interaction-service";
import { cancelLookup, canAddOrPersistRows, canLeaveWorkspace, canManageKnowledge, canManageRepertoire, getCandidateSignal, getPreferenceShade, InMemoryInteractionRepository, restoreLookupOnCancel, restoreRowsForRowSwitch, validateOwnPreferenceScore } from "../src/application/interaction-contracts";

async function main() {
const interaction = new InMemoryInteractionRepository();
const priest = interaction.resolveActor("demo-priest-user", "priest")!;
const organist = interaction.resolveActor("demo-organist-user", "organist")!;
const admin = interaction.resolveActor("demo-admin-user", "admin")!;
assert.equal(priest.userId, "demo-priest-user");
assert.equal(validateOwnPreferenceScore("priest", 3), true);
assert.equal(validateOwnPreferenceScore("organist", 3), false);
assert.equal(validateOwnPreferenceScore("congregationMember", 2), false);
assert.equal(interaction.saveOwnPreference(priest, "demo-pl-101", 3)?.score, 3);
assert.equal(interaction.saveOwnPreference(organist, "demo-pl-101", 3), undefined);
assert.equal(canManageRepertoire({ role: "organist", personId: "p1" }, "p1"), true);
assert.equal(canManageRepertoire({ role: "priest", personId: "p1" }, "p1"), false);
assert.equal(interaction.setRepertoire(organist, "demo-organist", "demo-pl-101", true), true);
assert.equal(interaction.setRepertoire(priest, "demo-organist", "demo-pl-101", true), false);
assert.equal(interaction.setRepertoire(admin, "demo-organist", "demo-pl-101", true), true);
assert.equal(canManageKnowledge("admin"), true);
assert.equal(canManageKnowledge("organist"), false);
assert.equal(interaction.setMelodyWindow(organist, { daysBefore: 7, daysAfter: 0 }), false);
assert.equal(interaction.setMelodyWindow(admin, { daysBefore: 21, daysAfter: 0 }), true);
assert.deepEqual(interaction.getMelodyWindow(), { daysBefore: 21, daysAfter: 0 });
assert.equal(getCandidateSignal({ antiphonMatch: true, seasonMatch: true }), "antiphon");
assert.equal(getCandidateSignal({ antiphonMatch: false, seasonMatch: true }), "season");
assert.equal(getPreferenceShade(0), "none");
assert.equal(getPreferenceShade(3), "medium");
assert.equal(getPreferenceShade(6), "high");
assert.deepEqual(cancelLookup({ kind: "lookup", text: "demo", previous: { kind: "selected", songId: "s1" } }), { kind: "selected", songId: "s1" });
assert.equal(canAddOrPersistRows([{ kind: "lookup", text: "101" }]), false);
assert.equal(canLeaveWorkspace([{ kind: "lookup", text: "101" }]).allowed, false);
assert.deepEqual(restoreLookupOnCancel({ id: 1, lookupOpen: true, songSearch: "bad", selectedSong: { language: "czech" as const, number: "101", title: "Selected" }, note: "" }).songSearch, "czech 101 — Selected");
assert.deepEqual(restoreLookupOnCancel({ id: 1, lookupOpen: true, songSearch: "bad", note: "" }).songSearch, "");
assert.equal(restoreRowsForRowSwitch([{ id: 1, lookupOpen: true, songSearch: "bad", note: "" }, { id: 2, songSearch: "", note: "valid" }], 2)[0].lookupOpen, false);

const catalog = new InMemoryCatalogRepository();
const interactionService = new InteractionService(asInteractionRepository(interaction), catalog);
const serviceActor = await interactionService.resolveActor("demo-organist-user", "organist");
assert.equal(serviceActor.success && serviceActor.value.personId, "demo-organist");
const deniedKnowledge = serviceActor.success ? await interactionService.setMelodyWindow(serviceActor.value, { daysBefore: 7, daysAfter: 0 }) : serviceActor;
assert.equal(deniedKnowledge.success, false);
const adminActor = await interactionService.resolveActor("demo-admin-user", "admin");
const serviceWindow = adminActor.success ? await interactionService.setMelodyWindow(adminActor.value, { daysBefore: 28, daysAfter: 0 }) : adminActor;
assert.equal(serviceWindow.success && serviceWindow.value.daysBefore, 28);
const serviceCandidates = await interactionService.queryCandidates({ serviceDate: "2026-07-18", serviceLanguage: "mixed", organistPersonId: "demo-organist", antiphonKey: "synthetic-entry" });
assert.equal(serviceCandidates.success && serviceCandidates.value[0].signal, "antiphon");
const songs = await catalog.listSongs();
const candidates = interaction.queryCandidates(songs, { serviceDate: "2026-07-18", serviceLanguage: "mixed", organistPersonId: "demo-organist", antiphonKey: "synthetic-entry", liturgicalSeasonKey: "synthetic-advent" });
assert(candidates.length >= 2);
assert.equal(candidates[0].signal, "antiphon");
assert(candidates.some((candidate) => candidate.equivalentNumbers.length > 0));
const suppressed = interaction.queryCandidates(songs, { serviceDate: "2026-07-18", serviceLanguage: "mixed", recentSongIds: ["demo-pl-101"] });
assert(suppressed.some((candidate) => candidate.songId === "demo-cz-101" && candidate.suppressedByMelodyWindow));
const scaleSongs = interaction.createSyntheticScaleSongs(2500);
assert.equal(scaleSongs.length, 2500);
assert.equal(new Set(scaleSongs.map((song) => song.songId)).size, 2500);
assert(scaleSongs.every((song) => song.title.startsWith("Synthetic Scale Song")));
console.log("Phase 30.1 contract tests passed.");
}

main().catch((error) => { console.error(error); process.exit(1); });

function asInteractionRepository(repo: InMemoryInteractionRepository): InteractionRepository {
  return {
    listUsers: async () => repo.listUsers(),
    listProfiles: async () => repo.profiles.map((profile) => ({ ...profile })),
    listPreferences: async () => repo.listPreferences(),
    upsertPreference: async (preference) => { const actor = repo.listUsers().find((user) => repo.profiles.some((profile) => profile.id === preference.profileId && profile.userId === user.id)); if (!actor) return preference; repo.saveOwnPreference({ userId: actor.id, displayName: actor.displayName, role: actor.roles[0], ...(actor.personId ? { personId: actor.personId } : {}) }, preference.songId, preference.score); return preference; },
    listRepertoire: async (organistPersonId) => repo.listRepertoire(organistPersonId),
    setRepertoire: async (organistPersonId, songId, active) => { repo.setRepertoire({ userId: "admin", displayName: "Admin", role: "admin" }, organistPersonId, songId, active); },
    listMelodyClasses: async () => repo.listMelodyClasses(),
    listKnowledge: async () => repo.listKnowledge(),
    setMelodyWindow: async (config) => { repo.setMelodyWindow({ userId: "admin", displayName: "Admin", role: "admin" }, config); return repo.getMelodyWindow(); },
  };
}
