import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Pool } from "pg";

export type PgToolMode = "path" | "docker-compose";

type DatabaseIdentity = {
  database: string;
  serverAddress: string;
  serverPort: number;
};

export type RecoverySummary = {
  serviceContexts: number;
  referenceCatalogSongs: number;
  authUsers: number;
  protectedAccountActorLinks: number;
  appUserRoles: number;
  authSessions: number;
};

const DEFAULT_BACKUP_DIR = ".organy-backups";

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function parsePostgresUrl(value: string, name: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL connection URL.`);
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || !databaseName(parsed)) {
    throw new Error(`${name} must be a valid PostgreSQL connection URL.`);
  }
  return parsed;
}

export function backupFileFromEnvironment(): string {
  const explicit = process.env.ORGANY_BACKUP_FILE?.trim();
  if (explicit) {
    const explicitPath = resolve(explicit);
    assertSafeBackupPath(explicitPath);
    return explicitPath;
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return resolve(DEFAULT_BACKUP_DIR, `organy-${stamp}.dump`);
}

export function backupManifestPath(backupFile: string): string {
  return `${backupFile}.sha256`;
}

export async function prepareNewBackupPath(backupFile: string): Promise<void> {
  await mkdir(dirname(backupFile), { recursive: true });
  await refuseExistingPath(backupFile, "Backup artifact");
  await refuseExistingPath(backupManifestPath(backupFile), "Backup integrity manifest");
}

export async function removePartialBackup(backupFile: string): Promise<void> {
  await rm(backupFile, { force: true }).catch(() => undefined);
  await rm(backupManifestPath(backupFile), { force: true }).catch(() => undefined);
}

export async function createLogicalBackup(sourceUrlText: string, backupFile: string): Promise<void> {
  const sourceUrl = parsePostgresUrl(sourceUrlText, "DATABASE_URL");
  const mode = pgToolMode();
  if (mode === "docker-compose") {
    assertLocalDockerUrl(sourceUrl, "DATABASE_URL");
    await runDockerDump(sourceUrl, backupFile);
    return;
  }

  const command = pgToolPath("pg_dump");
  const args = [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--no-password",
    "--file",
    backupFile,
    "--dbname",
    libpqUrlWithoutPassword(sourceUrl),
  ];
  await runCommand(command, args, pgEnvironment(sourceUrl), "pg_dump");
}

export async function writeIntegrityManifest(backupFile: string): Promise<string> {
  const hash = await sha256File(backupFile);
  await writeFile(backupManifestPath(backupFile), `${hash}  ${basename(backupFile)}\n`, { encoding: "utf8", flag: "wx" });
  return hash;
}

export async function verifyArchiveIntegrity(backupFile: string): Promise<string> {
  await requireReadableFile(backupFile, "Backup artifact");
  const manifest = backupManifestPath(backupFile);
  await requireReadableFile(manifest, "Backup integrity manifest");
  const text = (await readFile(manifest, "utf8")).trim();
  const match = /^([a-f0-9]{64})  (.+)$/.exec(text);
  if (!match || match[2] !== basename(backupFile)) {
    throw new Error("Backup integrity manifest is malformed or does not match the selected artifact.");
  }
  const actual = await sha256File(backupFile);
  if (actual !== match[1]) throw new Error("Backup integrity verification failed.");
  return actual;
}

export async function assertSeparateEmptyRestoreTarget(sourceUrlText: string, targetUrlText: string): Promise<void> {
  const sourceUrl = parsePostgresUrl(sourceUrlText, "DATABASE_URL");
  const targetUrl = parsePostgresUrl(targetUrlText, "ORGANY_RESTORE_DATABASE_URL");
  const [sourceIdentity, targetIdentity] = await Promise.all([
    inspectDatabaseIdentity(sourceUrl, "source"),
    inspectDatabaseIdentity(targetUrl, "restore target"),
  ]);
  if (sameDatabase(sourceIdentity, targetIdentity)) {
    throw new Error("Restore target must be a separate database from DATABASE_URL.");
  }
  if (await targetContainsUserObjects(targetUrl)) {
    throw new Error("Restore target database must be empty; existing user objects were found.");
  }
  if (pgToolMode() === "docker-compose") assertLocalDockerUrl(targetUrl, "ORGANY_RESTORE_DATABASE_URL");
}

export async function restoreLogicalBackup(targetUrlText: string, backupFile: string): Promise<void> {
  const targetUrl = parsePostgresUrl(targetUrlText, "ORGANY_RESTORE_DATABASE_URL");
  const mode = pgToolMode();
  if (mode === "docker-compose") {
    assertLocalDockerUrl(targetUrl, "ORGANY_RESTORE_DATABASE_URL");
    await runDockerRestore(targetUrl, backupFile);
    return;
  }

  const command = pgToolPath("pg_restore");
  const args = [
    "--exit-on-error",
    "--single-transaction",
    "--no-owner",
    "--no-privileges",
    "--no-password",
    "--dbname",
    libpqUrlWithoutPassword(targetUrl),
    backupFile,
  ];
  await runCommand(command, args, pgEnvironment(targetUrl), "pg_restore");
}

export async function revokeRestoredProtectedSessions(targetUrlText: string): Promise<number> {
  const targetUrl = parsePostgresUrl(targetUrlText, "ORGANY_RESTORE_DATABASE_URL");
  const pool = new Pool({ connectionString: targetUrl.toString() });
  try {
    const result = await pool.query("delete from auth_sessions returning id");
    return result.rows.length;
  } catch {
    throw new Error("Could not revoke restored protected sessions; recovery is not complete.");
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function readRecoverySummary(targetUrlText: string): Promise<RecoverySummary> {
  const targetUrl = parsePostgresUrl(targetUrlText, "ORGANY_RESTORE_DATABASE_URL");
  const pool = new Pool({ connectionString: targetUrl.toString() });
  try {
    const result = await pool.query(`
      select
        (select count(*)::int from service_contexts) service_contexts,
        (select count(*)::int from reference_catalog_songs) reference_catalog_songs,
        (select count(*)::int from auth_users) auth_users,
        (select count(*)::int from protected_account_actor_links) protected_account_actor_links,
        (select count(*)::int from app_user_roles) app_user_roles,
        (select count(*)::int from auth_sessions) auth_sessions
    `);
    const row = result.rows[0];
    return {
      serviceContexts: Number(row.service_contexts),
      referenceCatalogSongs: Number(row.reference_catalog_songs),
      authUsers: Number(row.auth_users),
      protectedAccountActorLinks: Number(row.protected_account_actor_links),
      appUserRoles: Number(row.app_user_roles),
      authSessions: Number(row.auth_sessions),
    };
  } catch {
    throw new Error("Could not run read-only recovery checks against the restore target.");
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export function pgToolMode(): PgToolMode {
  const value = process.env.ORGANY_PG_TOOL_MODE?.trim() || "path";
  if (value !== "path" && value !== "docker-compose") {
    throw new Error("ORGANY_PG_TOOL_MODE must be 'path' or 'docker-compose'.");
  }
  return value;
}

async function inspectDatabaseIdentity(url: URL, label: string): Promise<DatabaseIdentity> {
  const pool = new Pool({ connectionString: url.toString() });
  try {
    const result = await pool.query(`select current_database() database, coalesce(inet_server_addr()::text, '') server_address, inet_server_port() server_port`);
    const row = result.rows[0];
    return {
      database: String(row.database),
      serverAddress: String(row.server_address || url.hostname).toLowerCase(),
      serverPort: Number(row.server_port || url.port || 5432),
    };
  } catch {
    throw new Error(`Could not inspect the ${label} PostgreSQL database.`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function targetContainsUserObjects(url: URL): Promise<boolean> {
  const pool = new Pool({ connectionString: url.toString() });
  try {
    const result = await pool.query(`
      select (
        exists (
          select 1
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname not in ('pg_catalog', 'information_schema')
            and n.nspname !~ '^pg_toast'
            and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f', 'c')
        ) or exists (
          select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname not in ('pg_catalog', 'information_schema')
            and n.nspname !~ '^pg_toast'
        ) or exists (
          select 1
          from pg_type t
          join pg_namespace n on n.oid = t.typnamespace
          where n.nspname not in ('pg_catalog', 'information_schema')
            and n.nspname !~ '^pg_toast'
            and t.typtype in ('e', 'd')
        ) or exists (
          select 1
          from pg_namespace n
          where n.nspname not in ('pg_catalog', 'information_schema', 'public')
            and n.nspname !~ '^pg_toast'
        )
      ) non_empty
    `);
    return Boolean(result.rows[0]?.non_empty);
  } catch {
    throw new Error("Could not verify that the restore target database is empty.");
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function sameDatabase(a: DatabaseIdentity, b: DatabaseIdentity): boolean {
  return a.database === b.database && a.serverAddress === b.serverAddress && a.serverPort === b.serverPort;
}

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

function libpqUrlWithoutPassword(url: URL): string {
  const clone = new URL(url.toString());
  clone.password = "";
  return clone.toString();
}

function pgEnvironment(url: URL): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  return env;
}

function pgToolPath(name: "pg_dump" | "pg_restore"): string {
  const dir = process.env.ORGANY_PG_BIN_DIR?.trim();
  if (!dir) return name;
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  return join(dir, executable);
}

function assertLocalDockerUrl(url: URL, name: string): void {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const port = url.port || "5432";
  if (!["localhost", "127.0.0.1", "::1"].includes(host) || port !== "5432") {
    throw new Error(`${name} must point to the local loopback PostgreSQL service when ORGANY_PG_TOOL_MODE=docker-compose.`);
  }
  if (!decodeURIComponent(url.username) || !databaseName(url)) {
    throw new Error(`${name} must include the local PostgreSQL user and database name.`);
  }
}

function assertSafeBackupPath(resolvedPath: string): void {
  const repositoryRoot = resolve(".");
  const repositoryRelative = relative(repositoryRoot, resolvedPath);
  const isRepositoryLocal = repositoryRelative === "" || (!repositoryRelative.startsWith("..") && !isAbsolute(repositoryRelative));
  if (!isRepositoryLocal) return;

  const ignoredRoot = resolve(DEFAULT_BACKUP_DIR);
  const ignoredRelative = relative(ignoredRoot, resolvedPath);
  if (ignoredRelative !== "" && !ignoredRelative.startsWith("..") && !isAbsolute(ignoredRelative)) return;
  throw new Error(`Repository-local ORGANY_BACKUP_FILE must be inside ${DEFAULT_BACKUP_DIR}/.`);
}

async function runDockerDump(url: URL, backupFile: string): Promise<void> {
  const args = [
    "compose", "exec", "-T", "postgres", "pg_dump",
    "--format=custom", "--no-owner", "--no-privileges", "--no-password",
    "-U", decodeURIComponent(url.username),
    "-d", databaseName(url),
  ];
  await runCommandToFile("docker", args, process.env, "docker compose pg_dump", backupFile);
}

async function runDockerRestore(url: URL, backupFile: string): Promise<void> {
  const args = [
    "compose", "exec", "-T", "postgres", "pg_restore",
    "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--no-password",
    "-U", decodeURIComponent(url.username),
    "-d", databaseName(url),
  ];
  await runCommandFromFile("docker", args, process.env, "docker compose pg_restore", backupFile);
}

async function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv, label: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    child.stderr?.resume();
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") rejectPromise(new Error(`${label} tool was not found. Install PostgreSQL client tools, set ORGANY_PG_BIN_DIR, or use ORGANY_PG_TOOL_MODE=docker-compose for the local Docker database.`));
      else rejectPromise(new Error(`${label} could not be started.`));
    });
    child.on("close", (code) => code === 0 ? resolvePromise() : rejectPromise(new Error(`${label} failed with exit code ${code ?? "unknown"}.`)));
  });
}

async function runCommandToFile(command: string, args: string[], env: NodeJS.ProcessEnv, label: string, outputFile: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const output = createWriteStream(outputFile, { flags: "wx" });
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child.stderr?.resume();
    child.stdout?.pipe(output);
    let settled = false;
    let childSucceeded = false;
    let outputFinished = false;
    const maybeResolve = () => {
      if (!settled && childSucceeded && outputFinished) {
        settled = true;
        resolvePromise();
      }
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      output.destroy();
      rejectPromise(new Error(message));
    };
    child.on("error", (error: NodeJS.ErrnoException) => fail(error.code === "ENOENT" ? `${label} tool was not found.` : `${label} could not be started.`));
    child.on("close", (code) => {
      if (code !== 0) return fail(`${label} failed with exit code ${code ?? "unknown"}.`);
      childSucceeded = true;
      maybeResolve();
    });
    output.on("finish", () => {
      outputFinished = true;
      maybeResolve();
    });
    output.on("error", () => fail("Backup artifact could not be written."));
  });
}

async function runCommandFromFile(command: string, args: string[], env: NodeJS.ProcessEnv, label: string, inputFile: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const input = createReadStream(inputFile);
    const child = spawn(command, args, { env, stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
    child.stderr?.resume();
    input.pipe(child.stdin!);
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      input.destroy();
      child.stdin?.destroy();
      rejectPromise(new Error(message));
    };
    child.on("error", (error: NodeJS.ErrnoException) => fail(error.code === "ENOENT" ? `${label} tool was not found.` : `${label} could not be started.`));
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      code === 0 ? resolvePromise() : rejectPromise(new Error(`${label} failed with exit code ${code ?? "unknown"}.`));
    });
    input.on("error", () => fail("Backup artifact could not be read."));
    child.stdin?.on("error", () => fail(`${label} could not read the backup artifact stream.`));
  });
}

async function sha256File(path: string): Promise<string> {
  return await new Promise<string>((resolvePromise, rejectPromise) => {
    const hash = createHash("sha256");
    const input = createReadStream(path);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("error", () => rejectPromise(new Error("Backup artifact could not be read for integrity verification.")));
    input.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

async function refuseExistingPath(path: string, label: string): Promise<void> {
  try {
    await access(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error(`${label} path could not be checked safely.`);
  }
  throw new Error(`${label} already exists; refusing to overwrite it.`);
}

async function requireReadableFile(path: string, label: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} was not found.`);
  }
}
