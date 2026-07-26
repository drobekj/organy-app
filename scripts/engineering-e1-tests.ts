import assert from "node:assert/strict";
import {
  createDatabaseSql, deriveControlUrl, E1_DATABASE_PATTERN, generateE1DatabaseName,
  dropDatabaseSql, parseGuardDatabaseUrl, quoteE1DatabaseName, resolveE1Executable, withCleanup,
} from "./engineering-e1-core";

async function main(): Promise<void> {
assert.equal(resolveE1Executable("docker", "win32"), "docker");
assert.equal(resolveE1Executable("npm", "win32"), "npm.cmd");
assert.equal(resolveE1Executable("docker", "linux"), "docker");
assert.equal(resolveE1Executable("npm", "linux"), "npm");

for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
  assert.doesNotThrow(() => parseGuardDatabaseUrl(`postgres://user:pass@${host}:5432/guard`));
}
for (const value of [
  "postgres://user:pass@example.com/guard", "postgres://user:pass@192.0.2.1/guard",
  "postgres://user:pass@localhost/postgres", "postgres://user:pass@localhost/template0",
  "postgres://user:pass@localhost/template1", "postgres://user:pass@localhost/organy_e1_bad",
  "not a url", "https://localhost/guard", "postgres://user:pass@localhost/",
]) assert.throws(() => parseGuardDatabaseUrl(value));

const names = new Set(Array.from({ length: 100 }, generateE1DatabaseName));
assert.equal(names.size, 100);
for (const name of names) assert.match(name, E1_DATABASE_PATTERN);
for (const unsafe of ["guard", "organy_e1_x; DROP DATABASE guard", "organy_e1_UPPER", "postgres"]) {
  assert.throws(() => quoteE1DatabaseName(unsafe));
  assert.throws(() => createDatabaseSql(unsafe));
  assert.throws(() => dropDatabaseSql(unsafe));
}

const guard = parseGuardDatabaseUrl("postgresql://user:p%40ss@[::1]:5544/guard?sslmode=require&application_name=e1");
const control = new URL(deriveControlUrl(guard));
assert.equal(control.pathname, "/postgres");
assert.equal(control.username, guard.username);
assert.equal(control.password, guard.password);
assert.equal(control.hostname, guard.hostname);
assert.equal(control.port, "5544");
assert.equal(control.search, guard.search);

let cleaned = false;
assert.equal(await withCleanup(async () => 42, async () => { cleaned = true; }), 42);
assert.equal(cleaned, true);
const callbackError = new Error("callback failed");
cleaned = false;
await assert.rejects(withCleanup(async () => { throw callbackError; }, async () => { cleaned = true; }), (error) => error === callbackError);
assert.equal(cleaned, true);
const cleanupError = new Error("cleanup failed");
await assert.rejects(withCleanup(async () => { throw callbackError; }, async () => { throw cleanupError; }), (error) => {
  assert(error instanceof AggregateError);
  assert.deepEqual(error.errors, [callbackError, cleanupError]);
  return true;
});

console.log("Engineering E1 pure safety and lifecycle tests: PASS");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
