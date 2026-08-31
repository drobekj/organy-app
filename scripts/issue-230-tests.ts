import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { POST as planningLifecyclePost } from "../app/api/planning-lifecycle/route";
import {
  DrizzleFinalSetCompletionRepository,
  DrizzlePlanningSetRepository,
  type CompletedServiceRecord,
  type PersistedPlanningSet,
  type PlanningLifecycleDrizzleAdapterDependencies,
} from "../src/application/planning-lifecycle";
import type { ActorIdentity } from "../src/application/interaction-contracts";
import { useProtectedActorForAcceptance } from "../src/application/protected-actor";
import { disposeAppDbPoolForAcceptance } from "../src/db/app-pool";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue 230 acceptance.");

  const clientSource = await readFile("app/planning-lifecycle-client.tsx", "utf8");
  const recordListsSource = await readFile("app/plan-history-record-lists.tsx", "utf8");
  const cssSource = await readFile("app/globals.css", "utf8");
  assert.match(clientSource, /<HistoryRecordWorkspace/, "History must mount the extracted record list");
  assert.match(recordListsSource, /record\.conflictState \? "needs-revision-record" : undefined/, "History must style conflicting Completed records");
  assert.match(clientSource, /completedConflictRowIndexes\.has\(index\)/, "opened Completed records must mark exact conflicting rows");
  assert.match(clientSource, /completedInvalidationPreview\?\.impactedPlans/, "Completed editor must render current authoritative conflict state, not only new deltas");
  assert.match(clientSource, /historyConflictCount/, "History must expose a concise current-conflict count");
  const recordAlarmRule = cssSource.match(/\.saved-set-list button\.needs-revision-record\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(recordAlarmRule, /border:\s*3px solid var\(--danger\)/);
  assert.doesNotMatch(recordAlarmRule, /outline:/, "conflicting record must have one red contour, not border plus outline");
  assert.match(recordAlarmRule, /background:\s*#fef3f2/);
  const rowAlarmRule = cssSource.match(/\.needs-revision-row\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(rowAlarmRule, /border:\s*3px solid var\(--danger\)/);
  assert.doesNotMatch(rowAlarmRule, /outline:/, "conflicting fieldset must preserve native legend-gap geometry with one border");
  assert.match(rowAlarmRule, /background:\s*#fef3f2/);
  const rowInputRule = cssSource.match(/\.needs-revision-row \.candidate-combobox > input\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(rowInputRule, /border-color:\s*var\(--border\)/, "inner song control stays gray inside a red conflict row");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  const dependencies: PlanningLifecycleDrizzleAdapterDependencies = {
    db: db as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"],
    schema,
  };
  const plans = new DrizzlePlanningSetRepository(dependencies);
  const completion = new DrizzleFinalSetCompletionRepository(dependencies);
  const token = `${process.pid}-${Date.now()}`;
  const marker = `Issue 230 ${token}`;
  const actorUserId = `issue230-admin-${token}`;
  const actor: ActorIdentity = { userId: actorUserId, displayName: `${marker} Admin`, role: "admin" };
  const restoreActor = useProtectedActorForAcceptance(async () => actor);
  const previousRuntime = process.env.ORGANY_RUNTIME;
  process.env.ORGANY_RUNTIME = "db";

  const base = 950000 + (Date.now() % 30000);
  const songIds = Array.from({ length: 5 }, (_, index) => `czech:${base + index + 1}`);
  const melodyIds = [`issue230-old-${token}`, `issue230-a-${token}`, `issue230-b-${token}`];
  let completedId = "";

  const context = (date: string, time: string, note: string) => ({
    serviceDate: date,
    serviceTime: time,
    language: "czech" as const,
    priest: { displayName: "Anonymous" },
    organist: { displayName: "Anonymous" },
    note,
  });
  const song = (index: number) => ({
    songId: songIds[index],
    language: "czech" as const,
    number: String(base + index + 1),
    title: `${marker} Song ${index + 1}`,
  });

  try {
    for (let index = 0; index < songIds.length; index += 1) {
      await pool.query(
        "insert into reference_catalog_songs (id, language, canonical_number, source_id, title) values ($1, 'czech', $2, $3, $4)",
        [songIds[index], base + index + 1, `issue230-${token}-${index + 1}`, `${marker} Song ${index + 1}`],
      );
    }
    for (const melodyId of melodyIds) await pool.query("insert into reference_melody_classes (id) values ($1)", [melodyId]);
    await pool.query(
      `insert into reference_song_melody_memberships (reference_song_id, class_id)
       values ($1,$6),($2,$7),($3,$7),($4,$8),($5,$8)`,
      [...songIds, ...melodyIds],
    );
    await pool.query("insert into melody_non_repetition_config (id, months) values ('global', 2) on conflict (id) do update set months = 2");

    const historicalFinal = await plans.saveFinalSet(
      { status: "final", language: "czech", rows: [{ song: song(0) }] },
      context("2026-08-20", "08:00", `${marker} completed`),
    );
    const completed = await completion.completeFinalSet(historicalFinal.id, new Date("2026-08-20T10:00:00Z"));
    assert.equal(completed.status, "completed");
    if (completed.status !== "completed") throw new Error("Fixture completion failed.");
    completedId = completed.record.id;

    const working = await plans.saveWorkingSet(
      { status: "working", language: "czech", rows: [{ song: song(2) }, { song: song(4) }] },
      context("2026-09-10", "09:00", `${marker} working`),
    );

    const proposedContext = context("2026-08-20", "08:00", `${marker} completed corrected`);
    const firstConflictSet = { status: "final" as const, language: "czech" as const, rows: [{ song: song(1) }] };

    const firstPreviewResponse = await planningLifecyclePost(requestFor("previewCompletedRecordInvalidation", {
      recordId: completedId,
      serviceContext: proposedContext,
      set: firstConflictSet,
    }));
    assert.equal(firstPreviewResponse.status, 200);
    const firstPreview = await firstPreviewResponse.json() as { success: boolean; value?: PreviewValue };
    assert.equal(firstPreview.success, true);
    assert.equal(firstPreview.value?.impactedPlans.length, 1);
    assert.equal(firstPreview.value?.newlyImpactedPlans.length, 1);
    assert.deepEqual(firstPreview.value?.newlyImpactedPlans[0]?.conflictingRowIndexes, [0]);
    assert.deepEqual(firstPreview.value?.newlyImpactedPlans[0]?.conflictingCompletedRowIndexes, [0]);

    const firstAcceptedResponse = await planningLifecyclePost(requestFor("updateCompletedRecord", {
      recordId: completedId,
      serviceContext: proposedContext,
      set: firstConflictSet,
      acceptPlanInvalidation: true,
    }));
    assert.equal(firstAcceptedResponse.status, 200);
    const firstAccepted = await firstAcceptedResponse.json() as { success: boolean };
    assert.equal(firstAccepted.success, true);

    const snapshotAfterFirst = await getSnapshot();
    const historyAfterFirst = snapshotAfterFirst.completedRecords.find((record) => record.id === completedId);
    assert.ok(historyAfterFirst?.conflictState, "History must carry current conflict state after navigation/reload boundary");
    assert.deepEqual(historyAfterFirst?.conflictState?.conflictingPlanIds, [working.id]);
    assert.deepEqual(historyAfterFirst?.conflictState?.conflictingRowIndexes, [0]);
    const activeAfterFirst = snapshotAfterFirst.activeSets.find((plan) => plan.id === working.id);
    assert.deepEqual(activeAfterFirst?.needsRevision?.conflictingRowIndexes, [0]);

    const workingConflictPreviewResponse = await planningLifecyclePost(requestFor("previewPlanningSetConflict", {
      setId: working.id,
      serviceDate: working.serviceContext.serviceDate,
      rows: working.rows,
    }));
    assert.equal(workingConflictPreviewResponse.status, 200);
    const workingConflictPreview = await workingConflictPreviewResponse.json() as { success: boolean; value?: PlanningPreviewValue };
    assert.equal(workingConflictPreview.success, true);
    assert.deepEqual(workingConflictPreview.value?.conflictingRowIndexes, [0], "current Working draft preview must expose the persisted historical conflict");

    const resolvedWorkingPreviewResponse = await planningLifecyclePost(requestFor("previewPlanningSetConflict", {
      setId: working.id,
      serviceDate: working.serviceContext.serviceDate,
      rows: [{ song: song(0) }, { song: song(4) }],
    }));
    assert.equal(resolvedWorkingPreviewResponse.status, 200);
    const resolvedWorkingPreview = await resolvedWorkingPreviewResponse.json() as { success: boolean; value?: PlanningPreviewValue };
    assert.equal(resolvedWorkingPreview.success, true);
    assert.deepEqual(resolvedWorkingPreview.value?.conflictingRowIndexes, [], "replacing the conflicting Working song must clear the authoritative draft conflict before Save");

    const loadedResponse = await planningLifecyclePost(requestFor("loadCompletedRecord", { recordId: completedId }));
    assert.equal(loadedResponse.status, 200);
    const loaded = await loadedResponse.json() as { success: boolean; value?: CompletedServiceRecord };
    assert.equal(loaded.success, true);
    assert.deepEqual(loaded.value?.conflictState?.conflictingPlanIds, [working.id], "reopening Completed must recompute authoritative conflict state");
    assert.deepEqual(loaded.value?.conflictState?.conflictingRowIndexes, [0]);

    const reopenedPreviewResponse = await planningLifecyclePost(requestFor("previewCompletedRecordInvalidation", {
      recordId: completedId,
      serviceContext: proposedContext,
      set: firstConflictSet,
    }));
    const reopenedPreview = await reopenedPreviewResponse.json() as { success: boolean; value?: PreviewValue };
    assert.equal(reopenedPreview.success, true);
    assert.equal(reopenedPreview.value?.impactedPlans.length, 1, "unchanged reopened Completed must still report its existing conflict");
    assert.equal(reopenedPreview.value?.newlyImpactedPlans.length, 0, "existing conflict alone must not require a new confirmation");
    assert.deepEqual(reopenedPreview.value?.impactedPlans[0]?.conflictingCompletedRowIndexes, [0]);

    const expandedConflictSet = {
      status: "final" as const,
      language: "czech" as const,
      rows: [{ song: song(1) }, { song: song(3) }],
    };
    const expandedPreviewResponse = await planningLifecyclePost(requestFor("previewCompletedRecordInvalidation", {
      recordId: completedId,
      serviceContext: proposedContext,
      set: expandedConflictSet,
    }));
    const expandedPreview = await expandedPreviewResponse.json() as { success: boolean; value?: PreviewValue };
    assert.equal(expandedPreview.success, true);
    assert.equal(expandedPreview.value?.impactedPlans.length, 1, "same active plan remains the conflict target");
    assert.deepEqual(expandedPreview.value?.impactedPlans[0]?.conflictingRowIndexes, [0, 1]);
    assert.deepEqual(expandedPreview.value?.impactedPlans[0]?.conflictingCompletedRowIndexes, [0, 1]);
    assert.equal(expandedPreview.value?.newlyImpactedPlans.length, 1, "expanding an already-conflicting plan must still be a new guarded conflict delta");
    assert.deepEqual(expandedPreview.value?.newlyImpactedPlans[0]?.conflictingRowIndexes, [1]);
    assert.deepEqual(expandedPreview.value?.newlyImpactedPlans[0]?.conflictingCompletedRowIndexes, [1]);

    const secondRefusedResponse = await planningLifecyclePost(requestFor("updateCompletedRecord", {
      recordId: completedId,
      serviceContext: proposedContext,
      set: expandedConflictSet,
    }));
    const secondRefused = await secondRefusedResponse.json() as { success: boolean; error?: { issues?: Array<{ path: string }> } };
    assert.equal(secondRefused.success, false, "expanded conflict must be refused without explicit confirmation even when the plan was already conflicting");
    assert.equal(secondRefused.error?.issues?.filter((issue) => issue.path.startsWith("retroactivePlan.")).length, 1);
    const rowsAfterRefusal = await pool.query("select song_id from completed_service_rows where completed_service_id = $1 order by position", [completedId]);
    assert.deepEqual(rowsAfterRefusal.rows.map((row) => row.song_id), [songIds[1]], "refused expanded conflict must not mutate Completed truth");

    const secondAcceptedResponse = await planningLifecyclePost(requestFor("updateCompletedRecord", {
      recordId: completedId,
      serviceContext: proposedContext,
      set: expandedConflictSet,
      acceptPlanInvalidation: true,
    }));
    const secondAccepted = await secondAcceptedResponse.json() as { success: boolean };
    assert.equal(secondAccepted.success, true);

    const snapshotAfterSecond = await getSnapshot();
    const historyAfterSecond = snapshotAfterSecond.completedRecords.find((record) => record.id === completedId);
    assert.deepEqual(historyAfterSecond?.conflictState?.conflictingRowIndexes, [0, 1]);
    assert.deepEqual(historyAfterSecond?.conflictState?.conflictingPlanIds, [working.id]);
    const activeAfterSecond = snapshotAfterSecond.activeSets.find((plan) => plan.id === working.id);
    assert.deepEqual(activeAfterSecond?.needsRevision?.conflictingRowIndexes, [0, 1]);

    const acceptedAudit = await pool.query(
      "select count(*)::int as count from audit_events where actor_user_id = $1 and action = 'planning.completed.update' and object_ref = $2",
      [actorUserId, completedId],
    );
    assert.equal(acceptedAudit.rows[0].count, 2, "only the two accepted Completed updates create business audit events");

    console.log("Issue #230 persistent bidirectional conflict acceptance passed.");
  } finally {
    restoreActor();
    if (previousRuntime === undefined) delete process.env.ORGANY_RUNTIME;
    else process.env.ORGANY_RUNTIME = previousRuntime;
    await pool.query("delete from audit_events where actor_user_id = $1", [actorUserId]).catch(() => undefined);
    await pool.query("delete from service_contexts where note like $1", [`${marker}%`]).catch(() => undefined);
    await pool.query("delete from reference_song_melody_memberships where reference_song_id = any($1::text[])", [songIds]).catch(() => undefined);
    await pool.query("delete from reference_melody_classes where id = any($1::text[])", [melodyIds]).catch(() => undefined);
    await pool.query("delete from reference_catalog_songs where id = any($1::text[])", [songIds]).catch(() => undefined);
    await disposeAppDbPoolForAcceptance(databaseUrl).catch(() => undefined);
    await pool.end();
  }

  async function getSnapshot(): Promise<{ activeSets: PersistedPlanningSet[]; completedRecords: CompletedServiceRecord[] }> {
    const response = await planningLifecyclePost(requestFor("getWorkspaceSnapshot", {}));
    assert.equal(response.status, 200);
    const payload = await response.json() as { success: boolean; value?: { activeSets: PersistedPlanningSet[]; completedRecords: CompletedServiceRecord[] } };
    assert.equal(payload.success, true);
    if (!payload.value) throw new Error("Workspace snapshot missing.");
    return payload.value;
  }
}

type PreviewImpact = {
  planId: string;
  conflictingRowIndexes: number[];
  conflictingCompletedRowIndexes: number[];
};
type PreviewValue = {
  impactedPlans: PreviewImpact[];
  newlyImpactedPlans: PreviewImpact[];
};
type PlanningPreviewValue = {
  conflictingRowIndexes: number[];
};

function requestFor(action: string, input: unknown): Request {
  return new Request("http://localhost/api/planning-lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});