import type { Pool, PoolClient } from "pg";
import type { ActorIdentity } from "./interaction-contracts";
import type { InteractionResult } from "./interaction-service";
import { displayReferenceNumber } from "./reference-catalog-contract";

export type RecommendedReferenceSong = {
  referenceSongId: string;
  language: "czech" | "polish";
  canonicalNumber: number;
  displayNumber: string;
  title: string;
};
export type ReferenceAntiphonRecommendation = { antiphonId: string; recommendedSong: RecommendedReferenceSong | null };
type SetResult =
  | { kind: "ok"; value: ReferenceAntiphonRecommendation }
  | { kind: "antiphonNotFound" }
  | { kind: "songNotFound" }
  | { kind: "languageMismatch" };

export interface ReferenceAntiphonRecommendationRepository {
  get(antiphonId: string): Promise<ReferenceAntiphonRecommendation | undefined>;
  set(antiphonId: string, referenceSongId: string | null): Promise<SetResult>;
}

const joinedReadSql = `select a.id antiphon_id, s.id reference_song_id, s.language, s.canonical_number, s.title
  from reference_antiphons a
  left join reference_antiphon_recommendations r on r.antiphon_id=a.id
  left join reference_catalog_songs s on s.id=r.reference_song_id
  where a.id=$1`;

export class PgReferenceAntiphonRecommendationRepository implements ReferenceAntiphonRecommendationRepository {
  constructor(private readonly pool: Pool) {}
  async get(antiphonId: string) { return joinedRead(this.pool, antiphonId); }
  async set(antiphonId: string, referenceSongId: string | null): Promise<SetResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const antiphon = (await client.query("select language from reference_antiphons where id=$1 for update", [antiphonId])).rows[0] as { language: "czech" | "polish" } | undefined;
      if (!antiphon) {
        await client.query("rollback");
        return { kind: "antiphonNotFound" };
      }
      let song: { language: "czech" | "polish" } | undefined;
      if (referenceSongId !== null) {
        song = (await client.query("select language from reference_catalog_songs where id=$1 for update", [referenceSongId])).rows[0] as { language: "czech" | "polish" } | undefined;
        if (!song) {
          await client.query("rollback");
          return { kind: "songNotFound" };
        }
        if (song.language !== antiphon.language) {
          await client.query("rollback");
          return { kind: "languageMismatch" };
        }
      }
      if (referenceSongId === null) {
        await client.query("delete from reference_antiphon_recommendations where antiphon_id=$1", [antiphonId]);
      } else {
        await client.query(`insert into reference_antiphon_recommendations(antiphon_id,reference_song_id,updated_at) values($1,$2,now())
          on conflict(antiphon_id) do update set reference_song_id=excluded.reference_song_id,updated_at=now()`, [antiphonId, referenceSongId]);
      }
      const value = await joinedRead(client, antiphonId);
      await client.query("commit");
      return { kind: "ok", value: value! };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}

async function joinedRead(db: Pick<Pool, "query"> | Pick<PoolClient, "query">, antiphonId: string): Promise<ReferenceAntiphonRecommendation | undefined> {
  const row = (await db.query(joinedReadSql, [antiphonId])).rows[0];
  if (!row) return undefined;
  return {
    antiphonId: String(row.antiphon_id),
    recommendedSong: row.reference_song_id ? {
      referenceSongId: String(row.reference_song_id),
      language: row.language as "czech" | "polish",
      canonicalNumber: Number(row.canonical_number),
      displayNumber: displayReferenceNumber(Number(row.canonical_number)),
      title: String(row.title),
    } : null,
  };
}

export class ReferenceAntiphonRecommendationService {
  constructor(private readonly repo: ReferenceAntiphonRecommendationRepository) {}
  async get(actor: ActorIdentity, antiphonId: string): Promise<InteractionResult<ReferenceAntiphonRecommendation>> {
    if (!actor.role) return fail("permissionDenied", "An assigned role is required.");
    const value = await this.repo.get(antiphonId);
    return value ? ok(value) : fail("notFound", "Reference antiphon was not found.");
  }
  async set(actor: ActorIdentity, antiphonId: string, referenceSongId: string | null): Promise<InteractionResult<ReferenceAntiphonRecommendation>> {
    if (actor.role !== "admin") return fail("permissionDenied", "Only admin may manage antiphon recommendations.");
    const result = await this.repo.set(antiphonId, referenceSongId);
    if (result.kind === "antiphonNotFound") return fail("notFound", "Reference antiphon was not found.");
    if (result.kind === "songNotFound") return fail("notFound", "Reference catalog record was not found.");
    if (result.kind === "languageMismatch") return fail("invalidInput", "Recommended song must match the antiphon language.");
    return ok(result.value);
  }
}
const ok = <T>(value: T): InteractionResult<T> => ({ success: true, value });
const fail = <T>(code: "permissionDenied" | "notFound" | "invalidInput", message: string): InteractionResult<T> => ({ success: false, error: { code, message } });
