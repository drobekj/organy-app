import type { Pool, PoolClient } from "pg";
import type { ActorIdentity } from "./interaction-contracts";
import type { InteractionResult } from "./interaction-service";
import { displayReferenceNumber } from "./reference-catalog-contract";
import { appendAuditEvent, humanAuditActor } from "./audit-history";
import {
  normalizeReferenceMelodyEdge,
  recomputeReferenceMelodyPartition,
} from "./reference-melody-edge";

export type ReferenceMelodyMember = { referenceSongId: string; language: "czech" | "polish"; canonicalNumber: number; displayNumber: string; title: string };
export type ReferenceMelodyClass = { referenceSongId: string; classId: string; members: ReferenceMelodyMember[] };

export class ReferenceMelodyEdgeMutationError extends Error {
  constructor(readonly kind: "self" | "duplicate" | "missing", message: string) {
    super(message);
    this.name = "ReferenceMelodyEdgeMutationError";
  }
}

export interface ReferenceMelodyRepository {
  referenceSongExists(referenceSongId: string): Promise<boolean>;
  getReferenceMelodyClass(referenceSongId: string): Promise<ReferenceMelodyClass | undefined>;
  mergeReferenceMelodyClasses(referenceSongId: string, mergeWithReferenceSongId: string, actor?: ActorIdentity): Promise<ReferenceMelodyClass | undefined>;
  addReferenceMelodyEdge(referenceSongId: string, otherReferenceSongId: string, actor?: ActorIdentity): Promise<ReferenceMelodyClass | undefined>;
  removeReferenceMelodyEdge(referenceSongId: string, otherReferenceSongId: string, actor?: ActorIdentity): Promise<ReferenceMelodyClass | undefined>;
  hasReferenceMelodyEdge(referenceSongId: string, otherReferenceSongId: string): Promise<boolean>;
}

const memberSql = `select m.reference_song_id, m.class_id, s.language, s.canonical_number, s.title
  from reference_song_melody_memberships m join reference_catalog_songs s on s.id=m.reference_song_id
  where m.class_id=(select class_id from reference_song_melody_memberships where reference_song_id=$1)
  order by case s.language when 'czech' then 0 else 1 end, s.canonical_number, s.id`;

export class PgReferenceMelodyRepository implements ReferenceMelodyRepository {
  constructor(private readonly pool: Pool, private readonly options: { failAfterMembershipMove?: boolean } = {}) {}

  async referenceSongExists(id: string) {
    return (await this.pool.query("select 1 from reference_catalog_songs where id=$1", [id])).rows.length === 1;
  }

  async getReferenceMelodyClass(id: string) {
    return readClass(this.pool, id);
  }

  async hasReferenceMelodyEdge(a: string, b: string) {
    if (a === b) return false;
    const edge = normalizeReferenceMelodyEdge(a, b);
    const result = await this.pool.query(
      "select 1 from reference_melody_edges where song_a_id=$1 and song_b_id=$2",
      [edge.songAId, edge.songBId],
    );
    return result.rows.length === 1;
  }

  async mergeReferenceMelodyClasses(anchor: string, target: string, actor?: ActorIdentity) {
    if (anchor === target) return readClass(this.pool, anchor);
    return this.mutateEdge(anchor, target, "merge", actor);
  }

  async addReferenceMelodyEdge(anchor: string, target: string, actor?: ActorIdentity) {
    if (anchor === target) throw new ReferenceMelodyEdgeMutationError("self", "A Reference melody edge cannot connect a song to itself.");
    return this.mutateEdge(anchor, target, "add", actor);
  }

  async removeReferenceMelodyEdge(anchor: string, target: string, actor?: ActorIdentity) {
    if (anchor === target) throw new ReferenceMelodyEdgeMutationError("self", "A Reference melody edge cannot connect a song to itself.");
    return this.mutateEdge(anchor, target, "remove", actor);
  }

  private async mutateEdge(
    anchor: string,
    target: string,
    operation: "merge" | "add" | "remove",
    actor?: ActorIdentity,
  ): Promise<ReferenceMelodyClass | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext('reference-melody-edge-mutation'))");

      const beforeAnchor = await readClass(client, anchor);
      const beforeTarget = await readClass(client, target);
      if (!beforeAnchor || !beforeTarget) {
        await client.query("rollback");
        return undefined;
      }

      if (operation === "merge" && beforeAnchor.classId === beforeTarget.classId) {
        await client.query("commit");
        return beforeAnchor;
      }

      const edge = normalizeReferenceMelodyEdge(anchor, target);
      if (operation === "remove") {
        const removed = await client.query(
          "delete from reference_melody_edges where song_a_id=$1 and song_b_id=$2 returning song_a_id",
          [edge.songAId, edge.songBId],
        );
        if (removed.rows.length !== 1) {
          throw new ReferenceMelodyEdgeMutationError("missing", "Reference melody edge does not exist.");
        }
      } else {
        const inserted = await client.query(
          "insert into reference_melody_edges(song_a_id,song_b_id) values ($1,$2) on conflict do nothing returning song_a_id",
          [edge.songAId, edge.songBId],
        );
        if (inserted.rows.length !== 1) {
          if (operation === "merge") {
            const existing = await readClass(client, anchor);
            await client.query("commit");
            return existing;
          }
          throw new ReferenceMelodyEdgeMutationError("duplicate", "Reference melody edge already exists.");
        }
      }

      await recomputeReferenceMelodyPartition(client, {
        failAfterMembershipUpdate: this.options.failAfterMembershipMove,
      });
      const result = await readClass(client, anchor);
      if (!result) throw new Error("Reference melody recompute lost the anchor song.");

      if (actor) {
        const action = operation === "merge"
          ? "knowledge.melody.merge"
          : operation === "add"
            ? "knowledge.melody.edge.add"
            : "knowledge.melody.edge.remove";
        await appendAuditEvent(client, {
          actor: humanAuditActor(actor),
          action,
          objectKind: operation === "merge" ? "melodyClass" : "melodyEdge",
          objectRef: operation === "merge" ? result.classId : `${edge.songAId}<->${edge.songBId}`,
          beforeState: { anchor: beforeAnchor, target: beforeTarget, edge },
          afterState: { anchor: result, edge },
        });
      }

      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function readClass(db: Pick<Pool, "query"> | Pick<PoolClient, "query">, referenceSongId: string): Promise<ReferenceMelodyClass | undefined> {
  const { rows } = await db.query(memberSql, [referenceSongId]);
  if (!rows.length) return undefined;
  return {
    referenceSongId,
    classId: String(rows[0].class_id),
    members: rows.map((row) => ({
      referenceSongId: String(row.reference_song_id),
      language: row.language as "czech" | "polish",
      canonicalNumber: Number(row.canonical_number),
      displayNumber: displayReferenceNumber(Number(row.canonical_number)),
      title: String(row.title),
    })),
  };
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
    const value = await this.repo.mergeReferenceMelodyClasses(anchor, target, actor);
    return value ? ok(value) : fail("notFound", "Reference catalog record was not found.");
  }

  async hasEdge(actor: ActorIdentity, a: string, b: string): Promise<InteractionResult<{ exists: boolean }>> {
    if (!actor.role) return fail("permissionDenied", "An assigned role is required.");
    if (!await this.repo.referenceSongExists(a) || !await this.repo.referenceSongExists(b)) {
      return fail("notFound", "Reference catalog record was not found.");
    }
    return ok({ exists: await this.repo.hasReferenceMelodyEdge(a, b) });
  }

  async addEdge(actor: ActorIdentity, a: string, b: string): Promise<InteractionResult<ReferenceMelodyClass>> {
    if (actor.role !== "admin") return fail("permissionDenied", "Only admin may add Reference melody edges.");
    if (a === b) return fail("invalidInput", "A Reference melody edge cannot connect a song to itself.");
    if (!await this.repo.referenceSongExists(a) || !await this.repo.referenceSongExists(b)) {
      return fail("notFound", "Reference catalog record was not found.");
    }
    try {
      const value = await this.repo.addReferenceMelodyEdge(a, b, actor);
      return value ? ok(value) : fail("notFound", "Reference catalog record was not found.");
    } catch (error) {
      if (error instanceof ReferenceMelodyEdgeMutationError && error.kind === "duplicate") return fail("invalidInput", error.message);
      throw error;
    }
  }

  async removeEdge(actor: ActorIdentity, a: string, b: string): Promise<InteractionResult<ReferenceMelodyClass>> {
    if (actor.role !== "admin") return fail("permissionDenied", "Only admin may remove Reference melody edges.");
    if (a === b) return fail("invalidInput", "A Reference melody edge cannot connect a song to itself.");
    if (!await this.repo.referenceSongExists(a) || !await this.repo.referenceSongExists(b)) {
      return fail("notFound", "Reference catalog record was not found.");
    }
    try {
      const value = await this.repo.removeReferenceMelodyEdge(a, b, actor);
      return value ? ok(value) : fail("notFound", "Reference catalog record was not found.");
    } catch (error) {
      if (error instanceof ReferenceMelodyEdgeMutationError && error.kind === "missing") return fail("notFound", error.message);
      throw error;
    }
  }
}

const ok = <T>(value: T): InteractionResult<T> => ({ success: true, value });
const fail = <T>(code: "permissionDenied" | "notFound" | "invalidInput", message: string): InteractionResult<T> => ({
  success: false,
  error: { code, message },
});
