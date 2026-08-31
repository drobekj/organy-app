import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { AppUser } from "../src/application/interaction-contracts";
import { PostgresProtectedWhatsAppPhoneService } from "../src/application/protected-whatsapp-phone";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const token = randomUUID().replace(/-/g, "");
  const appUserId = `phone-test-user-${token}`;
  const authUserId = `phone-test-auth-${token}`;
  const user: AppUser = { id: appUserId, displayName: "Phone Test Priest", roles: ["priest"], active: true };
  const service = new PostgresProtectedWhatsAppPhoneService(pool);

  try {
    await pool.query(
      `insert into app_users (id, display_name, active) values ($1, $2, true)`,
      [appUserId, user.displayName],
    );
    await pool.query(`insert into app_user_roles (user_id, role) values ($1, 'priest')`, [appUserId]);
    await pool.query(
      `insert into auth_users (id, name, email, email_verified, created_at, updated_at)
       values ($1, $2, $3, false, now(), now())`,
      [authUserId, user.displayName, `${authUserId}@organy.invalid`],
    );
    await pool.query(
      `insert into protected_account_actor_links (auth_user_id, app_user_id) values ($1, $2)`,
      [authUserId, appUserId],
    );

    assert.deepEqual(await service.get(user), { phoneE164: null, confirmedAt: null });

    const saved = await service.save(user, "priest", "774 880 971");
    assert.equal(saved.phoneE164, "+420774880971");
    assert.ok(saved.confirmedAt);
    const dbSaved = await pool.query(
      `select whatsapp_phone_e164, whatsapp_phone_confirmed_at from protected_account_actor_links where app_user_id = $1`,
      [appUserId],
    );
    assert.equal(dbSaved.rows[0].whatsapp_phone_e164, "+420774880971");
    assert.ok(dbSaved.rows[0].whatsapp_phone_confirmed_at);

    const updated = await service.save(user, "priest", "+421 905 123 456");
    assert.equal(updated.phoneE164, "+421905123456");

    const auditBeforeForget = await pool.query(
      `select action, before_state, after_state from audit_events where object_kind = 'protectedAccount' and object_ref = $1 order by id`,
      [appUserId],
    );
    assert.deepEqual(auditBeforeForget.rows.map((row) => row.action), [
      "account.whatsappPhone.save",
      "account.whatsappPhone.update",
    ]);
    const auditJson = JSON.stringify(auditBeforeForget.rows);
    assert.ok(!auditJson.includes("+420774880971"));
    assert.ok(!auditJson.includes("+421905123456"));

    assert.deepEqual(await service.forget(user, "priest"), { phoneE164: null, confirmedAt: null });
    assert.deepEqual(await service.get(user), { phoneE164: null, confirmedAt: null });

    const audit = await pool.query(
      `select action, before_state, after_state from audit_events where object_kind = 'protectedAccount' and object_ref = $1 order by id`,
      [appUserId],
    );
    assert.deepEqual(audit.rows.map((row) => row.action), [
      "account.whatsappPhone.save",
      "account.whatsappPhone.update",
      "account.whatsappPhone.forget",
    ]);
    assert.deepEqual(audit.rows[0].before_state, { configured: false });
    assert.deepEqual(audit.rows[0].after_state, { configured: true });
    assert.deepEqual(audit.rows[2].before_state, { configured: true });
    assert.deepEqual(audit.rows[2].after_state, { configured: false });

    await assert.rejects(
      () => service.save({ ...user, roles: ["organist"] }, "organist", "+420601234567"),
      /Only priest or admin/,
    );

    console.log("Protected Account WhatsApp phone DB acceptance: PASS");
  } finally {
    await pool.query("delete from audit_events where object_kind = 'protectedAccount' and object_ref = $1", [appUserId]).catch(() => undefined);
    await pool.query("delete from auth_users where id = $1", [authUserId]).catch(() => undefined);
    await pool.query("delete from app_users where id = $1", [appUserId]).catch(() => undefined);
    await pool.end();
  }

}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
