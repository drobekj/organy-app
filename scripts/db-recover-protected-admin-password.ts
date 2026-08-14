import { authPool } from "../src/auth/server";
import { replaceCredentialPasswordAndRevokeSessions } from "../src/application/protected-account-admin";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const username = requiredEnv("ORGANY_RECOVERY_ADMIN_USERNAME").trim().toLowerCase();
  const password = requiredEnv("ORGANY_RECOVERY_ADMIN_PASSWORD");
  if (!username) throw new Error("ORGANY_RECOVERY_ADMIN_USERNAME must not be blank.");
  if (password.length < 8 || password.length > 128) throw new Error("ORGANY_RECOVERY_ADMIN_PASSWORD must contain 8-128 characters.");

  const client = await authPool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('organy-protected-account-admin'))");
    const result = await client.query(`
      select au.id auth_user_id, u.id app_user_id, u.active,
        exists(select 1 from app_user_roles r where r.user_id = u.id and r.role = 'admin') is_admin
      from auth_users au
      join protected_account_actor_links l on l.auth_user_id = au.id
      join app_users u on u.id = l.app_user_id
      join auth_accounts aa on aa.user_id = au.id and aa.provider_id = 'credential' and aa.password is not null
      where au.username = $1
      for update of u
    `, [username]);
    const target = result.rows[0];
    if (!target) throw new Error(`Protected Account '${username}' was not found.`);
    if (!Boolean(target.is_admin)) throw new Error(`Protected Account '${username}' does not currently have the authoritative admin role.`);

    await replaceCredentialPasswordAndRevokeSessions(client, String(target.auth_user_id), password);
    await client.query("commit");
    console.log(`Recovered protected admin '${username}'. Existing sessions were revoked; roles and active state were unchanged (active=${Boolean(target.active)}).`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

main().then(async () => {
  await authPool.end();
}).catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await authPool.end().catch(() => undefined);
  process.exit(1);
});
