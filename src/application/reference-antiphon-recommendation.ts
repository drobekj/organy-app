import type { Pool } from "pg";
import type { ActorIdentity } from "./interaction-contracts";
import type { InteractionResult } from "./interaction-service";

export type ReferenceAntiphonRecommendation = {
  antiphonId: string;
  antiphonNumber: number;
  antiphonTitle: string;
  referenceSongId: string;
};

export interface ReferenceAntiphonRecommendationRepository {
  antiphonExists(id: string): Promise<boolean>;
  referenceSongExists(id: string): Promise<boolean>;
  listForReferenceSong(referenceSongId: string): Promise<ReferenceAntiphonRecommendation[]>;
  set(antiphonId: string, referenceSongId: string | null): Promise<void>;
}

export class PgReferenceAntiphonRecommendationRepository implements ReferenceAntiphonRecommendationRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}
  async antiphonExists(id: string) { return (await this.pool.query("select 1 from reference_antiphons where id=$1", [id])).rows.length === 1; }
  async referenceSongExists(id: string) { return (await this.pool.query("select 1 from reference_catalog_songs where id=$1", [id])).rows.length === 1; }
  async listForReferenceSong(id: string) {
    const { rows } = await this.pool.query(`select r.antiphon_id,a.canonical_number,a.title,r.reference_song_id
      from reference_antiphon_recommendations r join reference_antiphons a on a.id=r.antiphon_id
      where r.reference_song_id=$1 order by a.canonical_number`, [id]);
    return rows.map((row) => ({ antiphonId: String(row.antiphon_id), antiphonNumber: Number(row.canonical_number), antiphonTitle: String(row.title), referenceSongId: String(row.reference_song_id) }));
  }
  async set(antiphonId: string, referenceSongId: string | null) {
    if (referenceSongId) await this.pool.query(`insert into reference_antiphon_recommendations(antiphon_id,reference_song_id,updated_at)
      values($1,$2,now()) on conflict(antiphon_id) do update set reference_song_id=excluded.reference_song_id,updated_at=now()`, [antiphonId, referenceSongId]);
    else await this.pool.query("delete from reference_antiphon_recommendations where antiphon_id=$1", [antiphonId]);
  }
}

export class ReferenceAntiphonRecommendationService {
  constructor(private readonly repo: ReferenceAntiphonRecommendationRepository) {}
  async list(actor: ActorIdentity, referenceSongId: string): Promise<InteractionResult<ReferenceAntiphonRecommendation[]>> {
    if (!actor.role) return fail("permissionDenied", "An assigned role is required.");
    if (!await this.repo.referenceSongExists(referenceSongId)) return fail("notFound", "Reference catalog record was not found.");
    return ok(await this.repo.listForReferenceSong(referenceSongId));
  }
  async set(actor: ActorIdentity, antiphonId: string, referenceSongId: string | null): Promise<InteractionResult<{ antiphonId: string; referenceSongId: string | null }>> {
    if (actor.role !== "admin") return fail("permissionDenied", "Only admin may manage Reference antiphon recommendations.");
    if (!await this.repo.antiphonExists(antiphonId)) return fail("notFound", "Reference antiphon was not found.");
    if (referenceSongId !== null && !await this.repo.referenceSongExists(referenceSongId)) return fail("notFound", "Reference catalog record was not found.");
    await this.repo.set(antiphonId, referenceSongId);
    return ok({ antiphonId, referenceSongId });
  }
}
const ok = <T>(value: T): InteractionResult<T> => ({ success: true, value });
const fail = <T>(code: "permissionDenied" | "notFound", message: string): InteractionResult<T> => ({ success: false, error: { code, message } });
