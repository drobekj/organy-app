import type { Pool, PoolClient } from "pg";
import type { ActorIdentity } from "./interaction-contracts";
import {
  findNonRepetitionPlanConflicts,
  melodyWindowConflictMessage,
  validateMelodyWindowMonths,
  type MelodyWindowResult,
  type NonRepetitionPlanMelodyUsage,
} from "./non-repetition-period";

type PersistedUsageRow = {
  plan_id: string | number;
  status: "working" | "final";
  service_date: string | Date;
  melody_class_id: string;
};

export class PostgresNonRepetitionPeriodService {
  constructor(private readonly pool: Pool) {}

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
      return failure("invalidInput", "Melody non-repetition period must be a finite non-negative integer number of calendar months.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("lock table service_contexts, service_sets, service_set_rows, reference_song_melody_memberships in share mode");
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

      await client.query(
        "insert into melody_non_repetition_config (id, months) values ('global', $1) on conflict (id) do update set months = excluded.months, updated_at = now()",
        [months],
      );
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
  const { rows } = await client.query<PersistedUsageRow>(
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

  return rows.map((row) => ({
    planId: String(row.plan_id),
    status: row.status,
    serviceDate: normalizeDate(row.service_date),
    melodyClassId: String(row.melody_class_id),
  }));
}

function normalizeDate(value: string | Date): string {
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

function failure(code: "permissionDenied" | "invalidInput", message: string): MelodyWindowResult {
  return { success: false, error: { code, message } };
}
