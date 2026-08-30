import { Pool } from "pg";
import { auditRetentionDryRun } from "../src/application/audit-retention-maintenance";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  if (!process.argv.includes("--dry-run")) {
    throw new Error("Only --dry-run is enabled in this phase. Production deletion remains disabled until dry-run acceptance is proven.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const report = await auditRetentionDryRun(pool);
    console.log("Audit retention maintenance dry-run: PASS");
    console.log(JSON.stringify(report, null, 2));
    console.log("No audit rows or business rows were changed.");
  } finally {
    await pool.end().catch(() => undefined);
  }
}

void main().catch((error: unknown) => {
  console.error("Audit retention maintenance dry-run: FAIL");
  console.error(error instanceof Error ? error.message : "Dry-run failed.");
  process.exitCode = 1;
});
