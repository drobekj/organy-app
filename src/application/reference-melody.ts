import type { Pool, PoolClient } from "pg";
import type { ActorIdentity } from "./interaction-contracts";
import type { InteractionResult } from "./interaction-service";
import { displayReferenceNumber } from "./reference-catalog-contract";

export type ReferenceMelodyMember = { referenceSongId: string; language: "czech" | "polish"; canonicalNumber: number; displayNumber: string; title: string };
export type ReferenceMelodyClass = { referenceSongId: string; classId: string; members: ReferenceMelodyMember[] };

export interface ReferenceMelodyRepository {
  referenceSongExists(referenceSongId: string): Promise<boolean>;
  getReferenceMelodyClass(referenceSongId: string): Promise<ReferenceMelodyClass | undefined>;
  mergeReferenceMelodyClasses(referenceSongId: string, mergeWithReferenceSongId: string): Promise<ReferenceMelodyClass | undefined>;
}

const memberSql = `select m.reference_song_id, m.class_id, s.language, s.canonical_number, s.title
  from reference_song_melody_memberships m join reference_catalog_songs s on s.id=m.reference_song_id
  where m.class_id=(select class_id from reference_song_melody_memberships where reference_song_id=$1)
  order by case s.language when 'czech' then 0 else 1 end, s.canonical_number`;

export class PgReferenceMelodyRepository implements ReferenceMelodyRepository {
  constructor(private readonly pool: Pool) {}
  async referenceSongExists(id: string) { return (await this.pool.query("select 1 from reference_catalog_songs where id=$1", [id])).rows.length === 1; }
  async getReferenceMelodyClass(id: string) { return readClass(this.pool, id); }
  async mergeReferenceMelodyClasses(anchor: string, target: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      // A transaction-scoped lock serializes the small administrative merge operation,
      // including overlapping merges whose class ids change while another waits.
      await client.query("select pg_advisory_xact_lock(hashtext('reference-melody-merge'))");
      const memberships = await client.query("select reference_song_id,class_id from reference_song_melody_memberships where reference_song_id=any($1::text[]) order by class_id for update", [[anchor, target]]);
      if (memberships.rows.length !== (anchor === target ? 1 : 2)) { await client.query("rollback"); return undefined; }
      const anchorClass = String(memberships.rows.find((row) => row.reference_song_id === anchor)!.class_id);
      const targetClass = String(memberships.rows.find((row) => row.reference_song_id === target)!.class_id);
      if (anchorClass !== targetClass) {
        const ordered = [anchorClass, targetClass].sort();
        await client.query("select id from reference_melody_classes where id=any($1::text[]) order by id for update", [ordered]);
        await client.query("select reference_song_id from reference_song_melody_memberships where class_id=any($1::text[]) order by class_id,reference_song_id for update", [ordered]);
        await client.query("update reference_song_melody_memberships set class_id=$1,updated_at=now() where class_id=$2", [anchorClass, targetClass]);
        await client.query("update reference_melody_classes set updated_at=now() where id=$1", [anchorClass]);
        await client.query("delete from reference_melody_classes where id=$1", [targetClass]);
      }
      const result = await readClass(client, anchor);
      await client.query("commit");
      return result;
    } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}

async function readClass(db: Pick<Pool, "query"> | Pick<PoolClient, "query">, referenceSongId: string): Promise<ReferenceMelodyClass | undefined> {
  const { rows } = await db.query(memberSql, [referenceSongId]);
  if (!rows.length) return undefined;
  return { referenceSongId, classId: String(rows[0].class_id), members: rows.map((row) => ({ referenceSongId: String(row.reference_song_id), language: row.language as "czech" | "polish", canonicalNumber: Number(row.canonical_number), displayNumber: displayReferenceNumber(Number(row.canonical_number)), title: String(row.title) })) };
}

export class ReferenceMelodyService {
  constructor(private readonly repo: ReferenceMelodyRepository) {}
  async get(actor: ActorIdentity, id: string): Promise<InteractionResult<ReferenceMelodyClass>> {
    if (!actor.role) return fail("permissionDenied", "An assigned role is required.");
    if (!await this.repo.referenceSongExists(id)) return fail("notFound", "Reference catalog record was not found.");
    const value = await this.repo.getReferenceMelodyClass(id);
    return value ? ok(value) : fail("notFound", "Reference melody membership was not found.");
  }
  async merge(actor: ActorIdentity, anchor: string, target: string): Promise<InteractionResult<ReferenceMelodyClass>> {
    if (actor.role !== "admin") return fail("permissionDenied", "Only admin may merge reference melody classes.");
    if (!await this.repo.referenceSongExists(anchor)) return fail("notFound", "Anchor Reference catalog record was not found.");
    if (!await this.repo.referenceSongExists(target)) return fail("notFound", "Merge target Reference catalog record was not found.");
    const value = await this.repo.mergeReferenceMelodyClasses(anchor, target);
    return value ? ok(value) : fail("notFound", "Reference catalog record was not found.");
  }
}
const ok = <T>(value: T): InteractionResult<T> => ({ success: true, value });
const fail = <T>(code: "permissionDenied" | "notFound", message: string): InteractionResult<T> => ({ success: false, error: { code, message } });
