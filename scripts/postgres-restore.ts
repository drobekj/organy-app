import {
  assertSeparateEmptyRestoreTarget,
  requiredEnv,
  restoreLogicalBackup,
  revokeRestoredProtectedSessions,
  verifyArchiveIntegrity,
} from "./lib/postgres-recovery";

async function main() {
  const sourceUrl = requiredEnv("DATABASE_URL");
  const targetUrl = requiredEnv("ORGANY_RESTORE_DATABASE_URL");
  const backupFile = requiredEnv("ORGANY_BACKUP_FILE");

  await verifyArchiveIntegrity(backupFile);
  await assertSeparateEmptyRestoreTarget(sourceUrl, targetUrl);
  await restoreLogicalBackup(targetUrl, backupFile);
  const revoked = await revokeRestoredProtectedSessions(targetUrl);

  console.log("PostgreSQL logical restore: PASS");
  console.log(`Restored protected sessions revoked: ${revoked}`);
  console.log("Restore target remained separate from DATABASE_URL and no source database mutation was performed by this command.");
}

main().catch((error) => {
  console.error("PostgreSQL logical restore: FAIL");
  console.error(error instanceof Error ? error.message : "Restore failed.");
  process.exitCode = 1;
});
