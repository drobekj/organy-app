import assert from "node:assert/strict";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Issue #470 DB acceptance.");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const column = await pool.query(
      `select column_default, is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'service_sets'
          and column_name = 'organist_reviewed'`,
    );
    assert.equal(column.rows.length, 1);
    assert.equal(column.rows[0].is_nullable, "NO");
    assert.match(String(column.rows[0].column_default), /false/i);

    const context = await pool.query(
      `insert into service_contexts
        (service_date, service_time, service_language, priest_display_name, organist_id, organist_display_name, melody_protection_months)
       values ('2026-10-18', '10:00', 'czech', 'Pastor', null, 'Organist', 0)
       returning id`,
    );
    const contextId = context.rows[0].id;
    const inserted = await pool.query(
      `insert into service_sets (service_context_id, status)
       values ($1, 'working')
       returning id, organist_reviewed`,
      [contextId],
    );
    assert.equal(inserted.rows[0].organist_reviewed, false);

    const setId = inserted.rows[0].id;
    await pool.query("update service_sets set organist_reviewed = true where id = $1", [setId]);
    const reviewed = await pool.query("select organist_reviewed from service_sets where id = $1", [setId]);
    assert.equal(reviewed.rows[0].organist_reviewed, true);

    await pool.query("delete from service_sets where id = $1", [setId]);
    await pool.query("delete from service_contexts where id = $1", [contextId]);
    console.log("Issue #470 Organist Reviewed PostgreSQL migration acceptance: PASS");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
