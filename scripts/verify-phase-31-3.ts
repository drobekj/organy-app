import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { POST } from "../app/api/reference-catalog/route";
import { DbReferenceCatalogClient } from "../src/application/reference-catalog-client";
import { referenceCatalog } from "../src/application/reference-catalog";
import { createDatabaseSql, createNpmInvocation, deriveControlUrl, deriveDatabaseUrl, dropDatabaseSql, generateE1DatabaseName, parseGuardDatabaseUrl, withCleanup } from "./engineering-e1-core";

async function fingerprint(url: string): Promise<string> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    const counts = await Promise.all(tables.rows.map(async ({ table_name }) => [table_name, (await pool.query(`SELECT count(*)::text count FROM public.\"${String(table_name).replaceAll('"', '""')}\"`)).rows[0]?.count]));
    return JSON.stringify({ tables: tables.rows, counts });
  } finally { await pool.end(); }
}

async function npmRun(name: string, databaseUrl: string): Promise<void> {
  const invocation = createNpmInvocation(process.execPath, process.env.npm_execpath, ["run", name]);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit" });
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${name} exited with code ${code}.`)));
  });
}

async function route(action: string, input: unknown, rawBody?: string): Promise<Response> {
  return POST(new Request("http://localhost/api/reference-catalog", { method: "POST", headers: { "content-type": "application/json" }, body: rawBody ?? JSON.stringify({ action, input }) }));
}

async function payload(response: Response): Promise<unknown> { return response.json(); }

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Phase 31.3 verification.");
  const guard = parseGuardDatabaseUrl(process.env.DATABASE_URL); const guardBefore = await fingerprint(process.env.DATABASE_URL);
  const control = new Pool({ connectionString: deriveControlUrl(guard), max: 1 }); const name = generateE1DatabaseName();
  await control.query(createDatabaseSql(name)); const databaseUrl = deriveDatabaseUrl(guard, name);
  const priorRuntime = process.env.ORGANY_RUNTIME; const priorUrl = process.env.DATABASE_URL;
  try {
    await withCleanup(async () => {
      await npmRun("db:migrate", databaseUrl); await npmRun("db:sync:reference-catalog", databaseUrl);
      process.env.ORGANY_RUNTIME = "db"; process.env.DATABASE_URL = databaseUrl;
      const transport = async (action: "list" | "getById", input: unknown): Promise<unknown> => {
        const response = await route(action, input); const body = await payload(response) as { error?: unknown };
        if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `HTTP ${response.status}`);
        return body;
      };
      const client = new DbReferenceCatalogClient(transport);

      const [all, czech, polish] = await Promise.all([
        client.list({ language: "all", pageSize: 50 }), client.list({ language: "czech", pageSize: 50 }), client.list({ language: "polish", pageSize: 50 }),
      ]);
      assert.deepEqual(all.counts, { all: 1798, czech: 808, polish: 990 });
      assert.deepEqual([all.total, czech.total, polish.total], [1798, 808, 990]);
      const polish955 = await client.list({ language: "polish", search: "Żegnamy was w Bogu naszym" });
      assert.deepEqual(polish955.records.map(({ canonicalNumber, title, sourceUrl }) => ({ canonicalNumber, title, sourceUrl })), [{ canonicalNumber: 955, title: "Żegnamy was w Bogu naszym", sourceUrl: "https://hymnary.org/hymn/SE2002/955" }]);
      const czech298 = await client.list({ language: "czech", search: "298" });
      assert.equal(czech298.records.find((record) => record.id === "czech:298")?.title, "Otevři své srdce");
      assert.equal(czech298.records.find((record) => record.id === "czech:298")?.sourceUrl, "https://www.evangelickykancional.cz/pisen/5593/otevri-sve-srdce");
      for (const [search, ids] of [
        ["751/1", ["czech:7511"]], ["7512", ["czech:7512"]], ["52/1", ["czech:5210"]], ["347/8", ["polish:3478"]],
      ] as const) assert.deepEqual((await client.list({ search })).records.map((record) => record.id), ids);
      for (const search of ["7521", "752/1", "7522", "752/2"]) assert.equal((await client.list({ search })).total, 0);
      const family = await client.list({ language: "polish", search: "347", pageSize: 20 });
      assert.deepEqual(family.records.map((record) => record.displayNumber), ["347/1", "347/2", "347/3", "347/4", "347/5", "347/6", "347/7", "347/8"]);
      const page0 = await client.list({ page: 0, pageSize: 10 }); const page1 = await client.list({ page: 1, pageSize: 10 });
      assert.equal(page0.records[0]?.displayNumber, "1"); assert.notDeepEqual(page0.records.map((record) => record.id), page1.records.map((record) => record.id));
      assert.deepEqual(await client.getById("polish:955"), polish955.records[0]);

      const pool = new Pool({ connectionString: databaseUrl, max: 1 });
      try { await pool.query("UPDATE reference_catalog_songs SET title='DATABASE-ONLY RUNTIME PROOF' WHERE id='czech:1'"); } finally { await pool.end(); }
      assert.deepEqual((await client.list({ language: "czech", search: "DATABASE-ONLY RUNTIME PROOF" })).records.map((record) => record.id), ["czech:1"]);
      assert.equal((await client.getById("czech:1"))?.title, "DATABASE-ONLY RUNTIME PROOF");
      assert.notEqual(referenceCatalog.getById("czech:1")?.title, "DATABASE-ONLY RUNTIME PROOF");

      for (const [action, input] of [["list", { language: "german" }], ["list", { page: -1 }], ["list", { pageSize: 201 }], ["list", { unexpected: true }], ["getById", { id: "bad" }], ["delete", { id: "czech:1" }]] as const) {
        assert.equal((await route(action, input)).status, 400);
      }
      assert.equal((await route("list", {}, "{" )).status, 400);
      assert.equal((await route("getById", { id: "czech:999999" })).status, 404);
      delete process.env.DATABASE_URL; assert.equal((await route("list", {})).status, 500); process.env.DATABASE_URL = databaseUrl;
      process.env.ORGANY_RUNTIME = "memory"; assert.equal((await route("list", {})).status, 400); process.env.ORGANY_RUNTIME = "db";
      assert.deepEqual(referenceCatalog.counts, { all: 1798, czech: 808, polish: 990 });
      assert.equal(referenceCatalog.getById("polish:955")?.title, "Żegnamy was w Bogu naszym");
    }, async () => {
      const [terminate, drop] = dropDatabaseSql(name); await control.query(terminate, [name]); await control.query(drop);
      assert.equal((await control.query("SELECT 1 FROM pg_database WHERE datname=$1", [name])).rows.length, 0);
    });
    process.env.DATABASE_URL = priorUrl; assert.equal(await fingerprint(priorUrl), guardBefore);
    console.log("Phase 31.3 evidence: API/client PostgreSQL counts 808 / 990 / 1,798; samples, variants, ordering, paging, DB-only mutation, errors, read-only action rejection, cleanup and guard checks passed.");
    console.log("Phase 31.3 PostgreSQL reference catalog runtime: PASS");
  } finally {
    if (priorRuntime === undefined) delete process.env.ORGANY_RUNTIME; else process.env.ORGANY_RUNTIME = priorRuntime;
    process.env.DATABASE_URL = priorUrl; await control.end();
  }
}
void main().catch((error: unknown) => { console.error("Phase 31.3 PostgreSQL reference catalog runtime: FAIL"); console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
