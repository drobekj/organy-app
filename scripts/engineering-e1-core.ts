import { randomBytes } from "node:crypto";

export const E1_DATABASE_PATTERN = /^organy_e1_[a-z0-9_]+$/;
const FORBIDDEN_GUARDS = new Set(["postgres", "template0", "template1"]);

export type E1ChildProcessInvocation = { command: string; args: string[] };

export function createNpmInvocation(
  nodeExecutable: string,
  npmCliPath: string | undefined,
  npmArguments: readonly string[],
): E1ChildProcessInvocation {
  if (!npmCliPath?.trim()) {
    throw new Error("Engineering E1 requires npm_execpath to invoke a nested npm command.");
  }
  return { command: nodeExecutable, args: [npmCliPath, ...npmArguments] };
}

export function resolveDockerExecutable(): "docker" {
  return "docker";
}

export function parseGuardDatabaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.", { cause: error });
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)) {
    throw new Error("Engineering E1 accepts only a loopback PostgreSQL server.");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database) throw new Error("DATABASE_URL must identify a guard database.");
  const normalized = database.toLowerCase();
  if (FORBIDDEN_GUARDS.has(normalized) || normalized.startsWith("organy_e1_")) {
    throw new Error(`The selected guard database is not permitted for Engineering E1.`);
  }
  return url;
}

export function deriveDatabaseUrl(source: URL, database: string): string {
  const result = new URL(source.toString());
  result.pathname = `/${encodeURIComponent(database)}`;
  return result.toString();
}

export function deriveControlUrl(source: URL): string {
  return deriveDatabaseUrl(source, "postgres");
}

export function generateE1DatabaseName(): string {
  return `organy_e1_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
}

export function quoteE1DatabaseName(name: string): string {
  if (!E1_DATABASE_PATTERN.test(name)) {
    throw new Error("Refusing an unsafe Engineering E1 database identifier.");
  }
  return `"${name}"`;
}

export function createDatabaseSql(name: string): string {
  return `CREATE DATABASE ${quoteE1DatabaseName(name)}`;
}

export function dropDatabaseSql(name: string): string[] {
  const quoted = quoteE1DatabaseName(name);
  return [
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    `DROP DATABASE IF EXISTS ${quoted}`,
  ];
}

export async function withCleanup<T>(callback: () => Promise<T>, cleanup: () => Promise<void>): Promise<T> {
  let value: T | undefined;
  let callbackError: unknown;
  try {
    value = await callback();
  } catch (error) {
    callbackError = error;
  }
  try {
    await cleanup();
  } catch (cleanupError) {
    if (callbackError !== undefined) {
      throw new AggregateError([callbackError, cleanupError], "Engineering E1 callback and cleanup both failed.");
    }
    throw cleanupError;
  }
  if (callbackError !== undefined) throw callbackError;
  return value as T;
}
