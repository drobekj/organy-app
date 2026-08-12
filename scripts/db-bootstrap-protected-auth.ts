import { randomUUID } from "node:crypto";
import { createOrganyAuth, assertProtectedAuthConfigured, authPool } from "../src/auth/server";

const accounts = [
  { kind: "ADMIN", defaultActorId: "demo-admin-user", defaultUsername: "admin" },
  { kind: "PRIEST", defaultActorId: "demo-priest-user", defaultUsername: "priest" },
  { kind: "ORGANIST", defaultActorId: "demo-organist-user", defaultUsername: "organist" },
] as const;

async function main() {
  assertProtectedAuthConfigured();
  const bootstrapAuth = createOrganyAuth({ allowSignUp: true });

  for (const account of accounts) {
    const actorId = process.env[`ORGANY_BOOTSTRAP_${account.kind}_ACTOR_ID`] ?? account.defaultActorId;
    const username = process.env[`ORGANY_BOOTSTRAP_${account.kind}_USERNAME`] ?? account.defaultUsername;
    const password = process.env[`ORGANY_BOOTSTRAP_${account.kind}_PASSWORD`];
    if (!password) throw new Error(`ORGANY_BOOTSTRAP_${account.kind}_PASSWORD is required.`);

    const actorResult = await authPool.query("select id, display_name, active from app_users where id = $1", [actorId]);
    const actor = actorResult.rows[0];
    if (!actor) throw new Error(`Application user '${actorId}' does not exist. Run the normal catalog/interaction seed first.`);
    if (!actor.active) throw new Error(`Application user '${actorId}' is inactive.`);

    const existingLink = await authPool.query(`
      select l.auth_user_id, u.username
      from protected_account_actor_links l
      join auth_users u on u.id = l.auth_user_id
      where l.app_user_id = $1
    `, [actorId]);
    if (existingLink.rows[0]) {
      if (String(existingLink.rows[0].username) !== username.toLowerCase()) {
        throw new Error(`Actor '${actorId}' is already linked to username '${existingLink.rows[0].username}'.`);
      }
      console.log(`Protected account '${username}' already exists for ${actorId}; leaving its password unchanged.`);
      continue;
    }

    const usernameTaken = await authPool.query("select id from auth_users where username = $1", [username.toLowerCase()]);
    if (usernameTaken.rows[0]) throw new Error(`Username '${username}' already exists but is not linked to '${actorId}'.`);

    const syntheticEmail = `protected-${randomUUID()}@organy.invalid`;
    const result = await bootstrapAuth.api.signUpEmail({
      body: {
        email: syntheticEmail,
        name: String(actor.display_name),
        password,
        username,
      },
    });
    const authUserId = result.user.id;
    await authPool.query(
      "insert into protected_account_actor_links (auth_user_id, app_user_id) values ($1, $2)",
      [authUserId, actorId],
    );
    console.log(`Created protected username '${username}' for ${actorId}.`);
  }
}

main().then(async () => {
  await authPool.end();
}).catch(async (error) => {
  console.error(error);
  await authPool.end().catch(() => undefined);
  process.exit(1);
});
