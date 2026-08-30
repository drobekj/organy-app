import { Pool } from "pg";
import { inspectAuditRetentionDryRun } from "../src/application/audit-retention-maintenance";

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--dry-run") {
    throw new Error("Issue 312 safety gate: only --dry-run is available. Destructive retention is not enabled yet.");
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const plan = await inspectAuditRetentionDryRun(pool);
    console.log("Audit retention maintenance dry-run: PASS");
    console.log(`Completed services: ${plan.completedServiceCount}`);

    if (!plan.cutoffServiceDate) {
      console.log("Retention cutoff: none (fewer than five Completed Services)");
      console.log("Candidate audit events: 0");
      console.log("No database rows were changed.");
      return;
    }

    console.log(`Retention cutoff: ${plan.cutoffServiceDate}${plan.cutoffServiceTime ? ` ${plan.cutoffServiceTime}` : ""} (Completed Service ${plan.cutoffCompletedServiceId})`);
    console.log(`Candidate audit events: ${plan.candidateEventCount}`);
    console.log(`Protected active-plan audit events before cutoff: ${plan.protectedActivePlanningEventCount}`);
    console.log(`Excluded non-planning audit events before cutoff: ${plan.excludedNonPlanningEventCount}`);
    console.log("Retention-protected successful maintenance events are never candidates.");
    console.log("No database rows were changed.");
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("Audit retention maintenance dry-run: FAIL");
  console.error(error instanceof Error ? error.message : "Dry-run failed.");
  process.exitCode = 1;
});
