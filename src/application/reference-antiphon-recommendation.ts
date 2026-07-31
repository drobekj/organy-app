import type { Pool } from "pg";
import type { ActorIdentity } from "./interaction-contracts";
import type { InteractionResult } from "./interaction-service";

export type ReferenceAntiphonRecommendation = { referenceAntiphonId: string; referenceSongId: string | null };

export interface ReferenceAntiphonRecommendationRepository {
  referenceAntiphonExists(id: string): Promise<boolean>;
  referenceSongExists(id: string): Promise<boolean>;
  get(id: string): Promise<string | undefined>;
  set(antiphonId: string, songId: string | null): Promise<string | undefined>;
}

export class PgReferenceAntiphonRecommendationRepository implements ReferenceAntiphonRecommendationRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}
  async referenceAntiphonExists(id: string) { return (await this.pool.query("select 1 from reference_antiphons where id=$1", [id])).rows.length === 1; }
  async referenceSongExists(id: string) { return (await this.pool.query("select 1 from reference_catalog_songs where id=$1", [id])).rows.length === 1; }
  async get(id: string) { const row = (await this.pool.query("select reference_song_id from reference_antiphon_recommendations where reference_antiphon_id=$1", [id])).rows[0]; return row ? String(row.reference_song_id) : undefined; }
  async set(antiphonId: string, songId: string | null) {
    if (songId === null) { await this.pool.query("delete from reference_antiphon_recommendations where reference_antiphon_id=$1", [antiphonId]); return undefined; }
    const { rows } = await this.pool.query("insert into reference_antiphon_recommendations(reference_antiphon_id,reference_song_id,updated_at) values($1,$2,now()) on conflict(reference_antiphon_id) do update set reference_song_id=excluded.reference_song_id,updated_at=now() returning reference_song_id", [antiphonId, songId]);
    return String(rows[0].reference_song_id);
  }
}

export class ReferenceAntiphonRecommendationService {
  constructor(private readonly repo: ReferenceAntiphonRecommendationRepository) {}
  async get(actor: ActorIdentity, antiphonId: string): Promise<InteractionResult<ReferenceAntiphonRecommendation>> {
    if (!actor.role) return fail("permissionDenied", "An assigned role is required.");
    if (!await this.repo.referenceAntiphonExists(antiphonId)) return fail("notFound", "Reference antiphon was not found.");
    return ok({ referenceAntiphonId: antiphonId, referenceSongId: await this.repo.get(antiphonId) ?? null });
  }
  async set(actor: ActorIdentity, antiphonId: string, songId: string | null): Promise<InteractionResult<ReferenceAntiphonRecommendation>> {
    if (actor.role !== "admin") return fail("permissionDenied", "Only admin may manage antiphon recommendations.");
    if (!await this.repo.referenceAntiphonExists(antiphonId)) return fail("notFound", "Reference antiphon was not found.");
    if (songId !== null && !await this.repo.referenceSongExists(songId)) return fail("notFound", "Reference catalog record was not found.");
    return ok({ referenceAntiphonId: antiphonId, referenceSongId: await this.repo.set(antiphonId, songId) ?? null });
  }
}
const ok = <T>(value: T): InteractionResult<T> => ({ success: true, value });
const fail = <T>(code: "permissionDenied" | "notFound", message: string): InteractionResult<T> => ({ success: false, error: { code, message } });
