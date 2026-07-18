import assert from "node:assert/strict";
import { InMemoryCatalogRepository } from "../src/application/catalog";
import { InMemoryInteractionRepository, type ActorIdentity } from "../src/application/interaction-contracts";
import { InteractionService, type InteractionRepository } from "../src/application/interaction-service";

async function main() {
  const repo = new InMemoryInteractionRepository();
  const service = new InteractionService(asInteractionRepository(repo), new InMemoryCatalogRepository());

  const spoofedAdmin: ActorIdentity = { userId: "demo-priest-user", displayName: "Spoofed Priest", role: "admin", personId: "demo-priest" };
  const repertoire = await service.setRepertoire(spoofedAdmin, "demo-organist", "demo-pl-101", true);
  assert.equal(repertoire.success, false, "service must reject client-supplied admin role when stored actor is priest");

  const spoofedProfileOwner: ActorIdentity = { userId: "demo-member-user", displayName: "Spoofed Member", role: "priest" };
  const preference = await service.saveOwnPreference(spoofedProfileOwner, "demo-cz-101", 3);
  assert.equal(preference.success, false, "service must reject client-supplied role/category escalation for preference score");

  const realOrganist = await service.resolveActor("demo-organist-user", "organist");
  assert.equal(realOrganist.success, true);
  if (!realOrganist.success) throw new Error("organist actor missing");
  const ownRepertoire = await service.setRepertoire(realOrganist.value, "demo-organist", "demo-pl-101", true);
  assert.equal(ownRepertoire.success, true, "stored organist actor can manage own repertoire");

  console.log("Phase 30.1 adversarial tests passed.");
}

function asInteractionRepository(repo: InMemoryInteractionRepository): InteractionRepository {
  return {
    listUsers: async () => repo.listUsers(),
    listProfiles: async () => repo.profiles.map((profile) => ({ ...profile })),
    listPreferences: async () => repo.listPreferences(),
    upsertPreference: async (preference) => preference,
    listRepertoire: async (organistPersonId) => repo.listRepertoire(organistPersonId),
    setRepertoire: async (organistPersonId, songId, active) => { repo.setRepertoire({ userId: "demo-admin-user", displayName: "Admin", role: "admin" }, organistPersonId, songId, active); },
    listMelodyClasses: async () => repo.listMelodyClasses(),
    listKnowledge: async () => repo.listKnowledge(),
    setMelodyWindow: async (config) => config,
  };
}

main().catch((error) => { console.error(error); process.exit(1); });
