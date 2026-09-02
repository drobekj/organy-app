import type { CatalogPerson, CatalogSong } from "../application/catalog";
import type { ActorIdentity } from "../application/interaction-contracts";
import { InMemoryInteractionRepository } from "../application/interaction-contracts";
import type { CompletedServiceRecord, PersistedPlanningPlan } from "../application/planning-lifecycle";

export const DEMO_D2_PEOPLE: CatalogPerson[] = [
  { id: "demo-priest", displayName: "Demo Priest", active: true, priest: true, organist: false },
  { id: "demo-priest-anna", displayName: "Anna Nováková", active: true, priest: true, organist: false },
  { id: "demo-organist", displayName: "Demo Organist", active: true, priest: false, organist: true },
  { id: "demo-organist-petr", displayName: "Petr Svoboda", active: true, priest: false, organist: true },
  { id: "demo-both", displayName: "Jan Dvořák", active: true, priest: true, organist: true },
];

export const DEMO_D2_SONGS: CatalogSong[] = [
  { songId: "demo-cz-101", language: "czech", number: "101", title: "Demo Czech Song", active: true, sheetMusicUrl: "https://example.com/demo-cz-101.pdf" },
  { songId: "demo-cz-205", language: "czech", number: "205", title: "Demo Entrance Song", active: true },
  { songId: "demo-cz-310", language: "czech", number: "310", title: "Demo Offering Song", active: true },
  { songId: "demo-cz-420", language: "czech", number: "420", title: "Demo Communion Song", active: true },
  { songId: "demo-cz-530", language: "czech", number: "530", title: "Demo Closing Song", active: true },
  { songId: "demo-pl-101", language: "polish", number: "101", title: "Demo Polish Song", active: true },
  { songId: "demo-pl-220", language: "polish", number: "220", title: "Demo Polish Psalm", active: true },
  { songId: "demo-pl-440", language: "polish", number: "440", title: "Demo Polish Communion Song", active: true },
];

const servicePerson = {
  priest: { id: "demo-priest", displayName: "Demo Priest" },
  organist: { id: "demo-organist", displayName: "Demo Organist" },
};

export const DEMO_D2_ACTIVE_PLANS: PersistedPlanningPlan[] = [
  {
    id: "demo-working-1",
    status: "working",
    language: "czech",
    serviceContext: {
      serviceDate: "2026-09-13",
      serviceTime: "10:00",
      language: "czech",
      ...servicePerson,
      melodyProtectionMonths: 2,
      note: "Working demo plan — changes remain local.",
    },
    rows: [
      { song: { songId: "demo-cz-205", language: "czech", number: "205", title: "Demo Entrance Song" } },
      { note: "Add another song or a text note." },
    ],
  },
  {
    id: "demo-final-1",
    status: "final",
    language: "czech",
    serviceContext: {
      serviceDate: "2026-09-20",
      serviceTime: "10:00",
      language: "czech",
      priest: { id: "demo-priest-anna", displayName: "Anna Nováková" },
      organist: { id: "demo-organist-petr", displayName: "Petr Svoboda" },
      melodyProtectionMonths: 3,
      note: "Final demo plan — lifecycle mutations are disabled.",
    },
    rows: [
      { song: { songId: "demo-cz-310", language: "czech", number: "310", title: "Demo Offering Song" } },
      { song: { songId: "demo-cz-420", language: "czech", number: "420", title: "Demo Communion Song" } },
    ],
  },
];

export const DEMO_D2_COMPLETED_RECORDS: CompletedServiceRecord[] = [
  {
    id: "demo-completed-1",
    sourceFinalSetId: "demo-completed-source-1",
    completedAt: new Date("2026-08-30T10:45:00+02:00"),
    serviceContext: {
      serviceDate: "2026-08-30",
      serviceTime: "10:00",
      language: "czech",
      ...servicePerson,
      melodyProtectionMonths: 2,
      note: "Completed demo service used as the Start New Plan people default.",
    },
    set: {
      status: "final",
      language: "czech",
      rows: [
        { song: { songId: "demo-cz-101", language: "czech", number: "101", title: "Demo Czech Song" } },
        { song: { songId: "demo-cz-530", language: "czech", number: "530", title: "Demo Closing Song" } },
      ],
    },
  },
  {
    id: "demo-completed-2",
    sourceFinalSetId: "demo-completed-source-2",
    completedAt: new Date("2026-08-23T10:40:00+02:00"),
    serviceContext: {
      serviceDate: "2026-08-23",
      serviceTime: "10:00",
      language: "polish",
      priest: { id: "demo-both", displayName: "Jan Dvořák" },
      organist: { id: "demo-organist", displayName: "Demo Organist" },
      melodyProtectionMonths: 1,
      note: "Older Polish completed demo service.",
    },
    set: {
      status: "final",
      language: "polish",
      rows: [
        { song: { songId: "demo-pl-101", language: "polish", number: "101", title: "Demo Polish Song" } },
        { song: { songId: "demo-pl-440", language: "polish", number: "440", title: "Demo Polish Communion Song" } },
      ],
    },
  },
];

export function createDemoD2InteractionRepository(): InMemoryInteractionRepository {
  const repo = new InMemoryInteractionRepository();
  const seeder: ActorIdentity = { userId: "demo-fixture-seeder", displayName: "Demo fixture seeder", role: "admin" };
  for (const song of DEMO_D2_SONGS) {
    repo.setRepertoire(seeder, "demo-organist", song.songId, true);
    repo.setRepertoire(seeder, "demo-organist-petr", song.songId, true);
  }
  return repo;
}
