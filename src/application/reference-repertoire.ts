import type { Pool } from "pg";
import type { ActorIdentity } from "./interaction-contracts";
import type { InteractionResult } from "./interaction-service";

export type ReferenceRepertoireMembership = { referenceSongId: string; organistPersonId: string; active: boolean };

export interface ReferenceRepertoireRepository {
  referenceSongExists(referenceSongId: string): Promise<boolean>;
  isActiveOrganistPerson(personId: string): Promise<boolean>;
  getReferenceRepertoireMembership(organistPersonId: string, referenceSongId: string): Promise<boolean>;
  setReferenceRepertoireMembership(organistPersonId: string, referenceSongId: string, active: boolean): Promise<boolean>;
}

export class PgReferenceRepertoireRepository implements ReferenceRepertoireRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}
  async referenceSongExists(id: string) { return (await this.pool.query("select 1 from reference_catalog_songs where id=$1", [id])).rows.length === 1; }
  async isActiveOrganistPerson(id: string) { return (await this.pool.query("select 1 from catalog_persons where id=$1 and active=true and organist=true", [id])).rows.length === 1; }
  async getReferenceRepertoireMembership(personId: string, songId: string) { return (await this.pool.query("select 1 from reference_organist_repertoire where organist_person_id=$1 and reference_song_id=$2", [personId, songId])).rows.length === 1; }
  async setReferenceRepertoireMembership(personId: string, songId: string, active: boolean) {
    if (active) await this.pool.query("insert into reference_organist_repertoire (organist_person_id, reference_song_id, updated_at) values ($1,$2,now()) on conflict (organist_person_id, reference_song_id) do nothing", [personId, songId]);
    else await this.pool.query("delete from reference_organist_repertoire where organist_person_id=$1 and reference_song_id=$2", [personId, songId]);
    return active;
  }
}

export class ReferenceRepertoireService {
  constructor(private readonly repo: ReferenceRepertoireRepository) {}
  async get(actor: ActorIdentity, referenceSongId: string, requestedPersonId?: string): Promise<InteractionResult<ReferenceRepertoireMembership>> {
    const target = await this.resolveTarget(actor, requestedPersonId); if (!target.success) return target;
    if (!await this.repo.referenceSongExists(referenceSongId)) return fail("notFound", "Reference catalog record was not found.");
    return ok({ referenceSongId, organistPersonId: target.value, active: await this.repo.getReferenceRepertoireMembership(target.value, referenceSongId) });
  }
  async set(actor: ActorIdentity, referenceSongId: string, requestedPersonId: string | undefined, active: boolean): Promise<InteractionResult<ReferenceRepertoireMembership>> {
    const target = await this.resolveTarget(actor, requestedPersonId); if (!target.success) return target;
    if (!await this.repo.referenceSongExists(referenceSongId)) return fail("notFound", "Reference catalog record was not found.");
    return ok({ referenceSongId, organistPersonId: target.value, active: await this.repo.setReferenceRepertoireMembership(target.value, referenceSongId, active) });
  }
  private async resolveTarget(actor: ActorIdentity, requested?: string): Promise<InteractionResult<string>> {
    if (actor.role === "priest" || actor.role === "congregationMember") return fail("permissionDenied", "Actor cannot manage authoritative repertoire.");
    if (actor.role === "organist") {
      if (requested !== undefined) return fail("invalidInput", "Organists must not supply an organistPersonId.");
      if (!actor.personId || !await this.repo.isActiveOrganistPerson(actor.personId)) return fail("permissionDenied", "Actor is not linked to an active organist person.");
      return ok(actor.personId);
    }
    if (actor.role === "admin") {
      if (!requested) return fail("invalidInput", "Admin must select an organistPersonId.");
      if (!await this.repo.isActiveOrganistPerson(requested)) return fail("notFound", "Active organist person was not found.");
      return ok(requested);
    }
    return fail("permissionDenied", "Actor cannot manage authoritative repertoire.");
  }
}
const ok = <T>(value: T): InteractionResult<T> => ({ success: true, value });
const fail = <T>(code: "permissionDenied" | "notFound" | "invalidInput", message: string): InteractionResult<T> => ({ success: false, error: { code, message } });
