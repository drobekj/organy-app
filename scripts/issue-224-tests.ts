import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { POST as planningLifecyclePost } from "../app/api/planning-lifecycle/route";
import {
  DrizzleFinalSetCompletionRepository,
  DrizzlePlanningSetRepository,
  type PlanningLifecycleDrizzleAdapterDependencies,
  type PersistedPlanningSet,
} from "../src/application/planning-lifecycle";
import type { ActorIdentity } from "../src/application/interaction-contracts";
import { useProtectedActorForAcceptance } from "../src/application/protected-actor";
import { resolveOwnedActiveRole, serializeActiveRoleCookie } from "../src/application/active-role";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue 224 acceptance.");

  assert.equal(resolveOwnedActiveRole(["organist", "admin"], "admin"), "admin");
  assert.equal(resolveOwnedActiveRole(["organist", "admin"], "priest"), "organist");
  assert.match(serializeActiveRoleCookie("admin"), /^organy-active-role=admin;/);

  const clientSource = await readFile("app/planning-lifecycle-client.tsx", "utf8");
  const recordListsSource = await readFile("app/plan-history-record-lists.tsx", "utf8");
  const cssSource = await readFile("app/globals.css", "utf8");
  assert.match(clientSource, /previewCompletedRecordInvalidation/, "Completed editor must request invalidation preview before Save");
  assert.match(clientSource, /completed-invalidation-warning/, "immediate Completed conflict warning must be rendered");
  assert.match(clientSource, /conflictingRevisionRowIndexes\.has\(index\)/, "row styling must use exact conflicting row indexes");
  assert.match(clientSource, /needs-revision-row/, "conflicting rows must receive dedicated styling class");
  assert.match(clientSource, /completedRecordsNewestFirst/, "History must use newest-first ordering");
  assert.match(clientSource, /<HistoryRecordWorkspace/, "History workspace must mount the extracted record list");
  assert.match(recordListsSource, /history-scroll-list/, "History must render in a bounded scroll container");
  assert.match(clientSource, /serializeActiveRoleCookie\(role\)/, "active role switch must persist to a cookie");
  assert.match(cssSource, /\.needs-revision-row\s*\{[\s\S]*?border:\s*3px solid var\(--danger\)/);
  assert.match(cssSource, /\.history-scroll-list\s*\{[\s\S]*?overflow-y:\s*auto/);

  const previewWarningIndex = clientSource.indexOf('className="error-summary completed-invalidation-warning"');
  const serviceContextIndex = clientSource.indexOf('<legend>Service context</legend>');
  const formActionsIndex = clientSource.indexOf('<div className="form-actions">');
  assert.ok(previewWarningIndex > serviceContextIndex && previewWarningIndex < formActionsIndex, "Completed conflict warning must render in the Planning alert slot above form actions");
  assert.match(clientSource, /Historical correction conflicts with/, "Completed conflict warning must use terse copy");
  assert.doesNotMatch(clientSource, /Open a red-outlined plan/, "Plans alert must not contain verbose navigation copy");
  assert.doesNotMatch(clientSource, /needs-revision-message/, "per-plan revision explanation must be removed");
  assert.match(clientSource, /<PlansRecordWorkspace/, "Plans workspace must mount the extracted record list");
  assert.match(recordListsSource, /className=\{plan\.needsRevision \? "needs-revision-record" : undefined\}/, "revision styling must be applied to the existing plan button");
  assert.match(cssSource, /\.saved-set-list button\.needs-revision-record\s*\{[\s\S]*?border:\s*3px solid var\(--danger\)/, "conflicting plan must replace the normal gray button border with one 3px red border");
  const rowInputRule = cssSource.match(/\.needs-revision-row \.candidate-combobox > input\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(rowInputRule, /border-color:\s*var\(--border\)/, "inner conflicting-song control must keep the normal gray border");
  assert.doesNotMatch(rowInputRule, /border-color:\s*var\(--danger\)/, "inner conflicting-song control must not receive the red row border");
  assert.match(rowInputRule, /color:\s*#98a2b3/, "conflicting song text must remain muted");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  const dependencies: PlanningLifecycleDrizzleAdapterDependencies = {
    db: db as unknown as PlanningLifecycleDrizzleAdapterDependencies["db"],
    schema,
  };
  const plans = new DrizzlePlanningSetRepository(dependencies);
  const completion = new DrizzleFinalSetCompletionRepository(dependencies);
  const token = `${process.pid}-${Date.now()}`;
  const marker = `Issue 224 ${token}`;
  const actorUserId = `issue224-admin-${token}`;
  const actor: ActorIdentity = { userId: actorUserId, displayName: `${marker} Admin`, role: "admin" };
  const restoreActor = useProtectedActorForAcceptance(async () => actor);
  const previousRuntime = process.env.ORGANY_RUNTIME;
  process.env.ORGANY_RUNTIME = "db";

  const base = 900000 + (Date.now() % 50000);
  const songIds = [1, 2, 3, 4].map((offset) => `czech:${base + offset}`);
  const melodyIds = [`issue224-old-${token}`, `issue224-conflict-${token}`, `issue224-clear-${token}`];
  let completedId = "";

  const context = (date: string, time: string, note: string) => ({
    serviceDate: date,
    serviceTime: time,
    language: "czech" as const,
    priest: { displayName: "Anonymous" },
    organist: { displayName: "Anonymous" },
    note,
  });
  const song = (index: number) => ({ songId: songIds[index], language: "czech" as const, number: String(base + index + 1), title: `${marker} Song ${index + 1}` });

  try {
    await pool.query(
      `insert into reference_catalog_songs (id, language, canonical_number, source_id, title)
       values ($1,'czech',$2,$5,$9),($3,'czech',$4,$6,$10),($7,'czech',$8,$11,$12),($13,'czech',$14,$15,$16)`,
      [songIds[0], base + 1, songIds[1], base + 2, `issue224-${token}-1`, `issue224-${token}-2`, songIds[2], base + 3, `${marker} Song 1`, `${marker} Song 2`, `issue224-${token}-3`, `${marker} Song 3`, songIds[3], base + 4, `issue224-${token}-4`, `${marker} Song 4`],
    );
    await pool.query("insert into reference_melody_classes (id) values ($1),($2),($3)", melodyIds);
    await pool.query(
      `insert into reference_song_melody_memberships (reference_song_id, class_id)
       values ($1,$5),($2,$6),($3,$6),($4,$7)`,
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
      { status: "working", language: "czech", rows: [{ song: song(2) }, { song: song(3) }] },
      context("2026-09-10", "09:00", `${marker} working`),
    );
    const final = await plans.saveFinalSet(
      { status: "final", language: "czech", rows: [{ song: song(2) }, { song: song(3) }] },
      context("2026-10-01", "10:00", `${marker} final`),
    );

    const proposedContext = context("2026-08-20", "08:00", `${marker} completed corrected`);
    const proposedSet = { status: "final" as const, language: "czech" as const, rows: [{ song: song(1) }] };

    const previewResponse = await planningLifecyclePost(requestFor("previewCompletedRecordInvalidation", {
      recordId: completedId,
      serviceContext: proposedContext,
      set: proposedSet,
    }));
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json() as { success: boolean; value?: { newlyImpactedPlans: Array<{ planId: string; planStatus: string; conflictingRowIndexes: number[] }> } };
    assert.equal(preview.success, true);
    assert.deepEqual(new Set(preview.value?.newlyImpactedPlans.map((impact) => impact.planId)), new Set([working.id, final.id]));
    for (const impact of preview.value?.newlyImpactedPlans ?? []) assert.deepEqual(impact.conflictingRowIndexes, [0], "only the actual conflicting row is flagged");
    assert.equal(preview.value?.newlyImpactedPlans.find((impact) => impact.planId === final.id)?.planStatus, "final");

    const refusedResponse = await planningLifecyclePost(requestFor("updateCompletedRecord", {
      recordId: completedId,
      serviceContext: proposedContext,
      set: proposedSet,
    }));
    assert.equal(refusedResponse.status, 200);
    const refused = await refusedResponse.json() as { success: boolean; error?: { message: string; issues?: Array<{ path: string }> } };
    assert.equal(refused.success, false, "Save without explicit confirmation must be refused");
    assert.match(refused.error?.message ?? "", /Confirmation is required/);
    assert.equal(refused.error?.issues?.filter((issue) => issue.path.startsWith("retroactivePlan.")).length, 2);
    const unchanged = await pool.query("select song_id from completed_service_rows where completed_service_id = $1 order by position", [completedId]);
    assert.deepEqual(unchanged.rows.map((row) => row.song_id), [songIds[0]], "refused Save must not mutate Completed truth");

    const acceptedResponse = await planningLifecyclePost(requestFor("updateCompletedRecord", {
      recordId: completedId,
      serviceContext: proposedContext,
      set: proposedSet,
      acceptPlanInvalidation: true,
    }));
    assert.equal(acceptedResponse.status, 200);
    const accepted = await acceptedResponse.json() as { success: boolean };
    assert.equal(accepted.success, true, "confirmed historical correction must persist");

    const listResponse = await planningLifecyclePost(requestFor("listPlanningSets", {}));
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json() as { success: boolean; value?: PersistedPlanningSet[] };
    assert.equal(listed.success, true);
    for (const id of [working.id, final.id]) {
      const plan = listed.value?.find((candidate) => candidate.id === id);
      assert.ok(plan, `affected plan ${id} must remain visible`);
      assert.equal(plan!.status, "working", "an affected Final is demoted to Working and an affected Working remains Working");
      assert.ok(plan!.needsRevision, "affected plan must reload with needsRevision from DB truth");
      assert.deepEqual(plan!.needsRevision?.conflictingRowIndexes, [0], "reloaded state must identify only the conflicting row");
      assert.ok(plan!.needsRevision?.conflictingCompletedRecordIds.includes(completedId));
    }

    const acceptedAudit = await pool.query(
      "select count(*)::int as count from audit_events where actor_user_id = $1 and action = 'planning.completed.update' and object_ref = $2",
      [actorUserId, completedId],
    );
    assert.equal(acceptedAudit.rows[0].count, 1, "accepted correction creates exactly one business audit event");

    console.log("Issue #224 pre-deploy acceptance passed.");
  } finally {
    restoreActor();
    if (previousRuntime === undefined) delete process.env.ORGANY_RUNTIME;
    else process.env.ORGANY_RUNTIME = previousRuntime;
    await pool.query("delete from audit_events where actor_user_id = $1", [actorUserId]).catch(() => undefined);
    await pool.query("delete from service_contexts where note like $1", [`${marker}%`]).catch(() => undefined);
    await pool.query("delete from reference_song_melody_memberships where reference_song_id = any($1::text[])", [songIds]).catch(() => undefined);
    await pool.query("delete from reference_melody_classes where id = any($1::text[])", [melodyIds]).catch(() => undefined);
    await pool.query("delete from reference_catalog_songs where id = any($1::text[])", [songIds]).catch(() => undefined);
    await pool.end();
  }
}

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
