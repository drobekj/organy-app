import {
  backupFileFromEnvironment,
  createLogicalBackup,
  prepareNewBackupPath,
  removePartialBackup,
  requiredEnv,
  writeIntegrityManifest,
} from "./lib/postgres-recovery";

async function main() {
  const sourceUrl = requiredEnv("DATABASE_URL");
  const backupFile = backupFileFromEnvironment();
  await prepareNewBackupPath(backupFile);
  try {
    await createLogicalBackup(sourceUrl, backupFile);
    await writeIntegrityManifest(backupFile);
  } catch (error) {
    await removePartialBackup(backupFile);
    throw error;
  }
  console.log("PostgreSQL logical backup: PASS");
  console.log(`Artifact: ${backupFile}`);
  console.log(`Integrity manifest: ${backupFile}.sha256`);
  console.log("Backup contents and database credentials were not printed. Treat both files as sensitive operational data.");
}

main().catch((error) => {
  console.error("PostgreSQL logical backup: FAIL");
  console.error(error instanceof Error ? error.message : "Backup failed.");
  process.exitCode = 1;
});
