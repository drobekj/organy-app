import { Pool } from "pg";
import { provisionStaffAccount } from "../src/auth/provisioning";

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) { const key = process.argv[index]; const value = process.argv[index + 1]; if (!key?.startsWith("--") || !value) throw new Error("Arguments must be --name value pairs."); args.set(key.slice(2), value); }
const actorUserId = args.get("actor-id")?.trim();
const displayName = args.get("display-name")?.trim();
const role = args.get("role")?.trim();
const username = args.get("username")?.trim();
const personId = args.get("person-id")?.trim();
const password = process.env.ORGANY_INITIAL_PASSWORD;
if (!actorUserId || !displayName || !username || !role || !["admin", "priest", "organist"].includes(role)) throw new Error("Required: --actor-id ID --display-name NAME --role admin|priest|organist --username USERNAME [--person-id ID].");
if (!password) throw new Error("ORGANY_INITIAL_PASSWORD is required; no default password is provided.");
if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL) throw new Error("DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL are required.");
process.env.ORGANY_RUNTIME = "db";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (personId) { const person = await pool.query("select 1 from catalog_persons where id = $1", [personId]); if (person.rows.length === 0) throw new Error("person-id does not exist in catalog_persons."); }
  await pool.query("insert into app_users (id, display_name, person_id, active) values ($1,$2,$3,true) on conflict (id) do update set display_name = excluded.display_name, person_id = coalesce(excluded.person_id, app_users.person_id), active = true", [actorUserId, displayName, personId ?? null]);
  await pool.query("insert into app_user_roles (user_id, role) values ($1, $2::user_role) on conflict do nothing", [actorUserId, role]);
  const result = await provisionStaffAccount(pool, { actorUserId, username, password });
  console.log("Protected staff account provisioned for actor " + result.actorUserId + " with username " + result.username + ".");
} finally { await pool.end(); }
