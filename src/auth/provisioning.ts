import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { provisioningAuth, authRuntimeConfigurationError } from "./server";

const protectedDbRoles = new Set(["admin", "priest", "organist"]);

export async function provisionStaffAccount(pool: Pool, input: { actorUserId: string; username: string; password: string }) {
  const configurationError = authRuntimeConfigurationError();
  if (configurationError) throw new Error(configurationError);
  const actorUserId = input.actorUserId.trim();
  const username = input.username.trim();
  if (!actorUserId) throw new Error("actorUserId is required.");
  if (!username) throw new Error("username is required.");
  if (input.password.length < 8) throw new Error("Initial password must contain at least 8 characters.");

  const actorResult = await pool.query(
    "select u.display_name, u.active, array_remove(array_agg(r.role::text), null) as roles " +
      "from app_users u left join app_user_roles r on r.user_id = u.id " +
      "where u.id = $1 group by u.id, u.display_name, u.active",
    [actorUserId],
  );
  if (actorResult.rows.length !== 1 || !actorResult.rows[0].active) throw new Error("Target application user must exist and be active.");
  const roles = Array.isArray(actorResult.rows[0].roles) ? actorResult.rows[0].roles.map(String) : [];
  if (!roles.some((role) => protectedDbRoles.has(role))) throw new Error("Target application user must have admin, priest, or organist role.");
  const linked = await pool.query("select 1 from auth_user_actor_links where actor_user_id = $1", [actorUserId]);
  if (linked.rows.length > 0) throw new Error("Target application user already has a protected account.");

  const syntheticEmail = "auth-" + randomUUID() + "@organy.invalid";
  await provisioningAuth.api.signUpEmail({ body: { email: syntheticEmail, name: String(actorResult.rows[0].display_name), password: input.password, username, displayUsername: username } });
  const created = await pool.query("select id from auth_user where email = $1", [syntheticEmail]);
  if (created.rows.length !== 1) throw new Error("Protected credential identity was not created deterministically.");
  const authUserId = String(created.rows[0].id);
  try {
    await pool.query("insert into auth_user_actor_links (auth_user_id, actor_user_id) values ($1, $2)", [authUserId, actorUserId]);
  } catch (error) {
    await pool.query("delete from auth_user where id = $1", [authUserId]).catch(() => undefined);
    throw error;
  }
  return { actorUserId, username };
}
