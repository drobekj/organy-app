import { requiredEnv, verifyArchiveIntegrity } from "./lib/postgres-recovery";

async function main() {
  const backupFile = requiredEnv("ORGANY_BACKUP_FILE");
  await verifyArchiveIntegrity(backupFile);
  console.log("PostgreSQL backup integrity: PASS");
  console.log("Selected backup artifact matches its SHA-256 integrity manifest.");
}

main().catch((error) => {
  console.error("PostgreSQL backup integrity: FAIL");
  console.error(error instanceof Error ? error.message : "Integrity verification failed.");
  process.exitCode = 1;
});
