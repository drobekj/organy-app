import { readRecoverySummary, requiredEnv } from "./lib/postgres-recovery";

async function main() {
  const targetUrl = requiredEnv("ORGANY_RESTORE_DATABASE_URL");
  const summary = await readRecoverySummary(targetUrl);
  if (summary.authSessions !== 0) {
    throw new Error("Restore target still contains protected sessions; recovery must not be accepted.");
  }

  console.log("PostgreSQL recovery read-only check: PASS");
  console.log(`Service contexts: ${summary.serviceContexts}`);
  console.log(`Reference catalog songs: ${summary.referenceCatalogSongs}`);
  console.log(`Protected auth users: ${summary.authUsers}`);
  console.log(`Protected Account/Actor links: ${summary.protectedAccountActorLinks}`);
  console.log(`Authoritative role rows: ${summary.appUserRoles}`);
  console.log("Protected sessions: 0");
}

main().catch((error) => {
  console.error("PostgreSQL recovery read-only check: FAIL");
  console.error(error instanceof Error ? error.message : "Recovery check failed.");
  process.exitCode = 1;
});
