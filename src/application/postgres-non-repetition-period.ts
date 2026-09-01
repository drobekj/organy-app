import type { Pool, PoolClient } from "pg";
import type { ActorIdentity } from "./interaction-contracts";
import { appendAuditEvent, humanAuditActor } from "./audit-history";
import {
  findNonRepetitionPlanConflicts,
  melodyWindowConflictMessage,
  validateMelodyWindowMonths,
  type MelodyWindowResult,
  type NonRepetitionPlanMelodyUsage,
} from "./non-repetition-period";

type PersistedUsageRow = {
  plan_id: unknown;
  status: unknown;
  service_date: unknown;
  melody_class_id: unknown;
};

export class PostgresNonRepetitionPeriodService {
  constructor(private readonly pool: Pool) {}

  async getOrganistMinimum(actor: ActorIdentity, organistPersonId?: string): Promise<MelodyWindowResult> {
    if (!actor.userId || !actor.role) return failure("permissionDenied", "An active actor is required.");
    if (!organistPersonId) return success(0);
    const result = await this.pool.query(
      "select melody_protection_months from catalog_persons where id = $1 and active = true and organist = true",
      [organistPersonId],
    );
    if (!result.rows[0]) return failure("notFound", "Selected Organist is not available.");
    return success(Number(result.rows[0].melody_protection_months ?? 2));
  }

  async getOwnOrganistMinimum(actor: ActorIdentity): Promise<MelodyWindowResult> {
    if (actor.role !== "organist" || !actor.personId) return failure("permissionDenied", "Only an Organist can read their own Melody Protection.");
    return this.getOrganistMinimum(actor, actor.personId);
  }

  async setOwnOrganistMinimum(actor: ActorIdentity, months: unknown): Promise<MelodyWindowResult> {
    if (actor.role !== "organist" || !actor.personId) return failure("permissionDenied", "Only an Organist can change their own Melody Protection.");
    if (!validateMelodyWindowMonths(months)) return failure("invalidInput", "Melody Protection must be between 0 and 12 calendar months.");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const before = await client.query(
        "select melody_protection_months from catalog_persons where id = $1 and active = true and organist = true for update",
        [actor.personId],
      );
      if (!before.rows[0]) {
        await client.query("rollback");
        return failure("notFound", "The Organist profile is not available.");
      }
      const beforeMonths = Number(before.rows[0].melody_protection_months ?? 2);
      if (beforeMonths !== months) {
        await client.query(
          "update catalog_persons set melody_protection_months = $2, updated_at = now() where id = $1",
          [actor.personId, months],
        );
        await appendAuditEvent(client, {
          actor: humanAuditActor(actor),
          action: "knowledge.melodyProtection.own.set",
          objectKind: "catalogPerson",
          objectRef: actor.personId,
          beforeState: { melodyProtectionMonths: beforeMonths },
          afterState: { melodyProtectionMonths: months },
        });
      }
      await client.query("commit");
      return success(months);
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async get(actor: ActorIdentity): Promise<MelodyWindowResult> {
    if (!actor.userId || !actor.role) {
      return failure("permissionDenied", "An active actor is required to read melody non-repetition configuration.");
    }
    const { rows } = await this.pool.query("select months from melody_non_repetition_config where id = 'global'");
    return success(Number(rows[0]?.months ?? 2));
  }

  async set(actor: ActorIdentity, months: unknown): Promise<MelodyWindowResult> {
    if (actor.role !== "admin") {
      return failure("permissionDenied", "Only admin can change the melody non-repetition period.");
    }
    if (!validateMelodyWindowMonths(months)) {
      return failure("invalidInput", "Melody Protection must be between 0 and 12 calendar months.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("lock table service_contexts, service_sets, service_set_rows, reference_song_melody_memberships in share mode");
      const currentResult = await client.query("select months from melody_non_repetition_config where id = 'global' for update");
      const beforeMonths = Number(currentResult.rows[0]?.months ?? 2);
      const usages = await listSavedPlanMelodyUsages(client);
      const conflicts = findNonRepetitionPlanConflicts(usages, months);
      if (conflicts.length > 0) {
        await client.query("rollback");
        return {
          success: false,
          error: {
            code: "conflict",
            message: melodyWindowConflictMessage(conflicts, months),
            conflicts,
          },
        };
      }

      if (beforeMonths !== months) {
        await client.query(
          "insert into melody_non_repetition_config (id, months) values ('global', $1) on conflict (id) do update set months = excluded.months, updated_at = now()",
          [months],
        );
        await appendAuditEvent(client, {
          actor: humanAuditActor(actor),
          action: "knowledge.nonRepetition.set",
          objectKind: "nonRepetitionConfig",
          objectRef: "global",
          beforeState: { months: beforeMonths },
          afterState: { months },
        });
      }
      await client.query("commit");
      return success(months);
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function listSavedPlanMelodyUsages(client: PoolClient): Promise<NonRepetitionPlanMelodyUsage[]> {
  const result = await client.query(
    `select distinct
       ss.id as plan_id,
       ss.status,
       sc.service_date,
       m.class_id as melody_class_id
     from service_sets ss
     join service_contexts sc on sc.id = ss.service_context_id
     join service_set_rows sr on sr.service_set_id = ss.id
     join reference_song_melody_memberships m on m.reference_song_id = sr.song_id
     where ss.status in ('working', 'final')
     order by sc.service_date, ss.id, m.class_id`,
  );

  return (result.rows as PersistedUsageRow[]).map((row) => ({
    planId: String(row.plan_id),
    status: persistedPlanStatus(row.status),
    serviceDate: normalizeDate(row.service_date),
    melodyClassId: String(row.melody_class_id),
  }));
}

function persistedPlanStatus(value: unknown): NonRepetitionPlanMelodyUsage["status"] {
  if (value === "working" || value === "final") return value;
  throw new Error(`Unexpected saved planning-set status '${String(value)}'.`);
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the original failure.
  }
}

function success(months: number): MelodyWindowResult {
  return { success: true, value: { months } };
}

function failure(code: "permissionDenied" | "invalidInput" | "notFound", message: string): MelodyWindowResult {
  return { success: false, error: { code, message } };
}
