import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", env: process.env });
const write = (path, content) => { mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true }); writeFileSync(path, content); };
const replace = (path, before, after) => {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing exact replacement anchor in ${path}: ${before.slice(0, 100)}`);
  writeFileSync(path, source.replace(before, after));
};

write("src/db/schema/auth-link.ts", `import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { auth_user } from "./auth-generated";
import { appUsers } from "./index";

export const authUserActorLinks = pgTable("auth_user_actor_links", {
  authUserId: text("auth_user_id").primaryKey().references(() => auth_user.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("auth_user_actor_links_actor_user_idx").on(table.actorUserId)]);
`);

write("src/auth/server.ts", `import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { username } from "better-auth/plugins";
import * as authSchema from "../db/schema/auth-generated";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/organy_app";
const authSecret = process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex");
const pool = new Pool({ connectionString: databaseUrl, max: 6 });
const db = drizzle(pool, { schema: authSchema });

function createStaffAuth(disableSignUp: boolean) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    secret: authSecret,
    ...(process.env.BETTER_AUTH_URL ? { baseURL: process.env.BETTER_AUTH_URL } : {}),
    user: { modelName: "auth_user" },
    session: { modelName: "auth_session" },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    emailAndPassword: { enabled: true, disableSignUp, ...(disableSignUp ? {} : { autoSignIn: false }) },
    disabledPaths: disableSignUp ? ["/sign-up/email", "/is-username-available"] : ["/is-username-available"],
    plugins: [username()],
  });
}

export const auth = createStaffAuth(true);
export const provisioningAuth = createStaffAuth(false);

export function authRuntimeConfigurationError(): string | undefined {
  if (process.env.ORGANY_RUNTIME !== "db") return "Protected authentication is only enabled in DB runtime.";
  if (!process.env.DATABASE_URL) return "DATABASE_URL is required for protected authentication.";
  if (!process.env.BETTER_AUTH_SECRET) return "BETTER_AUTH_SECRET is required for protected authentication.";
  if (!process.env.BETTER_AUTH_URL) return "BETTER_AUTH_URL is required for protected authentication.";
  return undefined;
}
`);

write("src/auth/client.ts", `"use client";
import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [usernameClient()] });
`);

write("src/application/authenticated-actor.ts", `import type { Pool } from "pg";
import type { ActorIdentity, AppUser } from "./interaction-contracts";
import type { PlanningRole } from "../planning-lifecycle";
import { LocalActorError } from "./local-actor";
import { auth, authRuntimeConfigurationError } from "../auth/server";

const databaseRoleToPlanningRole = (role: string): PlanningRole | undefined => role === "congregation_member" ? "congregationMember" : role === "admin" || role === "priest" || role === "organist" ? role : undefined;
const roleOrder: PlanningRole[] = ["admin", "priest", "organist", "congregationMember"];
const protectedRoles = new Set<PlanningRole>(["admin", "priest", "organist"]);

export function requestedRoleFromActorEnvelope(value: unknown): PlanningRole | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new LocalActorError("invalidInput", "Actor context is malformed.");
  const role = (value as Record<string, unknown>).role;
  if (role === undefined) return undefined;
  if (role !== "admin" && role !== "priest" && role !== "organist" && role !== "congregationMember") throw new LocalActorError("invalidInput", "Actor role is invalid.");
  return role;
}

export async function getAuthenticatedStaffUser(headers: Headers, pool: Pool): Promise<AppUser> {
  const configurationError = authRuntimeConfigurationError();
  if (configurationError) throw new Error(configurationError);
  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) throw new LocalActorError("permissionDenied", "Staff sign-in is required.");
  const { rows } = await pool.query(
    `select u.id, u.display_name, u.person_id, u.active, array_remove(array_agg(r.role::text order by r.role::text), null) as roles
       from auth_user_actor_links l
       join app_users u on u.id = l.actor_user_id
       left join app_user_roles r on r.user_id = u.id
      where l.auth_user_id = $1
      group by u.id, u.display_name, u.person_id, u.active`,
    [session.user.id],
  );
  if (rows.length !== 1) throw new LocalActorError("permissionDenied", "Authenticated account is not linked to exactly one application user.");
  const row = rows[0];
  if (!row.active) throw new LocalActorError("permissionDenied", "Authenticated application user is inactive.");
  const roles = (Array.isArray(row.roles) ? row.roles : []).map((role) => databaseRoleToPlanningRole(String(role))).filter((role): role is PlanningRole => Boolean(role)).sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b));
  if (!roles.some((role) => protectedRoles.has(role))) throw new LocalActorError("permissionDenied", "Authenticated account has no protected staff role.");
  return { id: String(row.id), displayName: String(row.display_name), ...(row.person_id ? { personId: String(row.person_id) } : {}), roles, active: true };
}

export async function resolveAuthenticatedActor(headers: Headers, pool: Pool, requestedRole?: PlanningRole): Promise<ActorIdentity> {
  const user = await getAuthenticatedStaffUser(headers, pool);
  const role = requestedRole ?? user.roles[0];
  if (!role || !user.roles.includes(role)) throw new LocalActorError("permissionDenied", "Requested role is not assigned to the authenticated user.");
  return { userId: user.id, displayName: user.displayName, role, ...(user.personId ? { personId: user.personId } : {}) };
}
`);

write("src/auth/provisioning.ts", `import { randomUUID } from "node:crypto";
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
    `select u.display_name, u.active, array_remove(array_agg(r.role::text), null) as roles
       from app_users u left join app_user_roles r on r.user_id = u.id
      where u.id = $1 group by u.id, u.display_name, u.active`,
    [actorUserId],
  );
  if (actorResult.rows.length !== 1 || !actorResult.rows[0].active) throw new Error("Target application user must exist and be active.");
  const roles = Array.isArray(actorResult.rows[0].roles) ? actorResult.rows[0].roles.map(String) : [];
  if (!roles.some((role) => protectedDbRoles.has(role))) throw new Error("Target application user must have admin, priest, or organist role.");
  const linked = await pool.query("select 1 from auth_user_actor_links where actor_user_id = $1", [actorUserId]);
  if (linked.rowCount) throw new Error("Target application user already has a protected account.");

  const syntheticEmail = `auth-${randomUUID()}@organy.invalid`;
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
`);

write("app/api/auth/[...all]/route.ts", `import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { auth, authRuntimeConfigurationError } from "../../../../src/auth/server";

const handlers = toNextJsHandler(auth);
const unavailable = () => NextResponse.json({ error: { code: "internalError", message: authRuntimeConfigurationError() } }, { status: 500 });
export async function GET(request: Request) { return authRuntimeConfigurationError() ? unavailable() : handlers.GET(request); }
export async function POST(request: Request) { return authRuntimeConfigurationError() ? unavailable() : handlers.POST(request); }
`);

write("app/api/staff-session/route.ts", `import { NextResponse } from "next/server";
import { Pool } from "pg";
import { getAuthenticatedStaffUser } from "../../../src/application/authenticated-actor";
import { LocalActorError } from "../../../src/application/local-actor";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: { code: "internalError", message: "DATABASE_URL is required." } }, { status: 500 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { return NextResponse.json({ success: true, value: await getAuthenticatedStaffUser(request.headers, pool) }); }
  catch (error) {
    if (error instanceof LocalActorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "invalidInput" ? 400 : 401 });
    return NextResponse.json({ error: { code: "internalError", message: error instanceof Error ? error.message : "Staff session failed." } }, { status: 500 });
  } finally { await pool.end(); }
}
`);

write("app/api/staff-admin/provision/route.ts", `import { NextResponse } from "next/server";
import { Pool } from "pg";
import { resolveAuthenticatedActor } from "../../../../src/application/authenticated-actor";
import { LocalActorError } from "../../../../src/application/local-actor";
import { provisionStaffAccount } from "../../../../src/auth/provisioning";

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: { code: "internalError", message: "DATABASE_URL is required." } }, { status: 500 });
  const body = await request.json().catch(() => undefined) as { actorUserId?: unknown; username?: unknown; password?: unknown } | undefined;
  if (!body || typeof body.actorUserId !== "string" || typeof body.username !== "string" || typeof body.password !== "string") return NextResponse.json({ error: { code: "invalidInput", message: "actorUserId, username and password are required." } }, { status: 400 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await resolveAuthenticatedActor(request.headers, pool, "admin");
    return NextResponse.json({ success: true, value: await provisionStaffAccount(pool, { actorUserId: body.actorUserId, username: body.username, password: body.password }) });
  } catch (error) {
    if (error instanceof LocalActorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 403 });
    return NextResponse.json({ error: { code: "internalError", message: error instanceof Error ? error.message : "Account provisioning failed." } }, { status: 500 });
  } finally { await pool.end(); }
}
`);

write("app/staff-auth-gate.tsx", `"use client";
import { FormEvent, useEffect, useState } from "react";
import type { AppUser } from "../src/application/interaction-contracts";
import { authClient } from "../src/auth/client";
import PlanningLifecycleClient from "./planning-lifecycle-client";

type StaffSessionPayload = { success?: boolean; value?: AppUser; error?: { message?: string } };

export default function StaffAuthGate() {
  const [user, setUser] = useState<AppUser>();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");

  async function refreshSession() {
    const response = await fetch("/api/staff-session", { cache: "no-store" });
    if (!response.ok) { setUser(undefined); return false; }
    const payload = await response.json() as StaffSessionPayload;
    if (!payload.success || !payload.value) { setUser(undefined); return false; }
    setUser(payload.value); return true;
  }
  useEffect(() => { void refreshSession().finally(() => setLoading(false)); }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setError("");
    const result = await authClient.signIn.username({ username, password });
    if (result.error) { setError(result.error.message ?? "Sign-in failed."); return; }
    if (!await refreshSession()) { setError("Account signed in but has no valid active staff link."); return; }
    setPassword("");
  }
  async function signOut() { await authClient.signOut(); setUser(undefined); setUsername(""); setPassword(""); setError(""); }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordStatus("");
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (result.error) { setPasswordStatus(result.error.message ?? "Password change failed."); return; }
    event.currentTarget.reset(); setPasswordStatus("Password changed.");
  }

  if (loading) return <main style={{ maxWidth: 460, margin: "5rem auto", padding: "1.5rem" }}>Loading staff session…</main>;
  if (!user) return <main style={{ maxWidth: 420, margin: "5rem auto", padding: "1.5rem", border: "1px solid #d8dbe0", borderRadius: 10 }}><h1 style={{ marginTop: 0, fontSize: "1.35rem" }}>Staff sign in</h1><form onSubmit={signIn} style={{ display: "grid", gap: "0.8rem" }}><label>Username<input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "0.55rem" }} /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "0.55rem" }} /></label>{error ? <div role="alert">{error}</div> : null}<button type="submit">Sign in</button></form></main>;
  return <><div style={{ maxWidth: 1180, margin: "0.8rem auto 0", padding: "0 1rem", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.7rem", flexWrap: "wrap" }}><strong>{user.displayName}</strong><details><summary style={{ cursor: "pointer" }}>Change password</summary><form onSubmit={changePassword} style={{ display: "grid", gap: "0.45rem", paddingTop: "0.5rem" }}><input name="currentPassword" type="password" autoComplete="current-password" placeholder="Current password" required /><input name="newPassword" type="password" autoComplete="new-password" placeholder="New password" minLength={8} required /><button type="submit">Save password</button>{passwordStatus ? <small>{passwordStatus}</small> : null}</form></details><button type="button" onClick={() => void signOut()}>Sign out</button></div><PlanningLifecycleClient runtimeMode="db" authenticatedUser={user} /></>;
}
`);

write("scripts/auth-bootstrap-staff.ts", `import { Pool } from "pg";
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
  if (personId) { const person = await pool.query("select 1 from catalog_persons where id = $1", [personId]); if (!person.rowCount) throw new Error("person-id does not exist in catalog_persons."); }
  await pool.query("insert into app_users (id, display_name, person_id, active) values ($1,$2,$3,true) on conflict (id) do update set display_name = excluded.display_name, person_id = coalesce(excluded.person_id, app_users.person_id), active = true", [actorUserId, displayName, personId ?? null]);
  await pool.query("insert into app_user_roles (user_id, role) values ($1, $2::user_role) on conflict do nothing", [actorUserId, role]);
  const result = await provisionStaffAccount(pool, { actorUserId, username, password });
  console.log(`Protected staff account provisioned for actor ${result.actorUserId} with username ${result.username}.`);
} finally { await pool.end(); }
`);

write("docs/phase-31-28-contract.md", `# Phase 31.28 — protected staff username/password authentication

Authority: Contract Gate #168. Baseline: main 10bec3d6488bd34a758ba2e8732766a5e50d5aea.

This phase implements protected admin/priest/organist username/password authentication for DB runtime. Public protected signup is disabled. Better Auth 1.6.25 uses an internal synthetic email only as a storage requirement; it is not requested, displayed, verified, used for login, or used for recovery. Authenticated sessions map one-to-one to an active app_users Actor, while app_user_roles remains the sole church-domain role authority. Client actor IDs are ignored for DB authorization; a requested role is only honored after the server verifies that it is currently assigned. Memory runtime keeps Change user for deterministic development and regression testing.

The slice includes login, logout, own password change, explicit initial bootstrap, admin-authorized server provisioning, auth schema/migration, and session-to-Actor authorization for Planning Lifecycle, interaction/knowledge, and catalog mutations. Congregation-member nickname voting, recovery email, OAuth/passkeys/2FA, deployment, hosting, and security/audit expansion remain outside Phase 31.28.

Never merge without exact user command MERGOVAT.
`);

replace("drizzle.config.ts", `  schema: "./src/db/schema/index.ts",`, `  schema: ["./src/db/schema/index.ts", "./src/db/schema/auth-generated.ts", "./src/db/schema/auth-link.ts"],`);

replace("package.json", `    "verify:phase-31-20": "npm run test:phase-31-20 && tsx scripts/verify-phase-31-20.ts"`, `    "verify:phase-31-20": "npm run test:phase-31-20 && tsx scripts/verify-phase-31-20.ts",\n    "auth:bootstrap-staff": "tsx scripts/auth-bootstrap-staff.ts"`);

replace("app/page.tsx", `import PlanningLifecycleClient, { type RuntimeMode } from "./planning-lifecycle-client";\n\nexport default function Home() {\n  const runtimeMode: RuntimeMode = process.env.ORGANY_RUNTIME === "db" ? "db" : "memory";\n  return <PlanningLifecycleClient runtimeMode={runtimeMode} />;\n}\n`, `import PlanningLifecycleClient, { type RuntimeMode } from "./planning-lifecycle-client";\nimport StaffAuthGate from "./staff-auth-gate";\n\nexport default function Home() {\n  const runtimeMode: RuntimeMode = process.env.ORGANY_RUNTIME === "db" ? "db" : "memory";\n  return runtimeMode === "db" ? <StaffAuthGate /> : <PlanningLifecycleClient runtimeMode="memory" />;\n}\n`);

replace("app/planning-lifecycle-client.tsx", `type PlanningLifecycleClientProps = {\n  runtimeMode: RuntimeMode;\n};`, `type PlanningLifecycleClientProps = {\n  runtimeMode: RuntimeMode;\n  authenticatedUser?: AppUser;\n};`);
replace("app/planning-lifecycle-client.tsx", `export default function PlanningLifecycleClient({ runtimeMode }: PlanningLifecycleClientProps) {`, `export default function PlanningLifecycleClient({ runtimeMode, authenticatedUser }: PlanningLifecycleClientProps) {`);
replace("app/planning-lifecycle-client.tsx", `  const [dbUsers, setDbUsers] = useState<AppUser[]>([]);\n  const memoryUsers = useMemo(() => interactionRepository.listUsers(), [interactionRepository]);\n  const availableUsers = runtimeMode === "db" ? dbUsers : memoryUsers;\n  const demoUsers = availableUsers.map((user) => ({ id: user.id, label: user.displayName, roles: user.roles }));\n  const [selectedUserId, setSelectedUserId] = useState("demo-priest-user");\n  const [selectedAssignedRole, setSelectedAssignedRole] = useState<PlanningRole>("priest");`, `  const memoryUsers = useMemo(() => interactionRepository.listUsers(), [interactionRepository]);\n  const availableUsers = runtimeMode === "db" ? (authenticatedUser ? [authenticatedUser] : []) : memoryUsers;\n  const demoUsers = availableUsers.map((user) => ({ id: user.id, label: user.displayName, roles: user.roles }));\n  const [selectedUserId, setSelectedUserId] = useState(authenticatedUser?.id ?? "demo-priest-user");\n  const [selectedAssignedRole, setSelectedAssignedRole] = useState<PlanningRole>(authenticatedUser?.roles[0] ?? "priest");`);
replace("app/planning-lifecycle-client.tsx", `  useEffect(() => {\n    if (runtimeMode !== "db") return;\n    void callInteractionApi("listLocalActors", {}).then((result) => {\n      if (!result.success || !Array.isArray(result.value)) return;\n      const users = result.value as AppUser[];\n      setDbUsers(users);\n      if (users.length > 0 && !users.some((user) => user.id === selectedUserId)) { setSelectedUserId(users[0].id); setSelectedAssignedRole(users[0].roles[0]); }\n    });\n  }, [runtimeMode, selectedUserId]);\n\n`, ``);
replace("app/planning-lifecycle-client.tsx", `<div><span className="field-label">Deterministic test user</span><div className="user-selector-grid"><label className="field"><span>Change user</span><select value={storedUser.id} onChange={(e) => { const user = availableUsers.find((item) => item.id === e.target.value); if (!user) return; setSelectedUserId(user.id); setSelectedAssignedRole(user.roles[0]); }} disabled={demoUsers.length <= 1}>{demoUsers.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label><label className="field"><span>Assigned role</span><select value={effectiveRole} onChange={(e) => setSelectedAssignedRole(e.target.value as PlanningRole)}>{storedUser.roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label></div></div>`, `{runtimeMode === "memory" ? <div><span className="field-label">Deterministic test user</span><div className="user-selector-grid"><label className="field"><span>Change user</span><select value={storedUser.id} onChange={(e) => { const user = availableUsers.find((item) => item.id === e.target.value); if (!user) return; setSelectedUserId(user.id); setSelectedAssignedRole(user.roles[0]); }} disabled={demoUsers.length <= 1}>{demoUsers.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label><label className="field"><span>Assigned role</span><select value={effectiveRole} onChange={(e) => setSelectedAssignedRole(e.target.value as PlanningRole)}>{storedUser.roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label></div></div> : <div><span className="field-label">Authenticated staff</span><div className="user-selector-grid"><label className="field"><span>Signed in as</span><input value={storedUser.displayName} readOnly /></label><label className="field"><span>Active role</span><select value={effectiveRole} onChange={(e) => setSelectedAssignedRole(e.target.value as PlanningRole)}>{storedUser.roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label></div></div>}`);

replace("app/api/catalog/route.ts", `import { LocalActorError, parseLocalActorContext, PostgresLocalActorResolver } from "../../../src/application/local-actor";`, `import { LocalActorError } from "../../../src/application/local-actor";\nimport { requestedRoleFromActorEnvelope, resolveAuthenticatedActor } from "../../../src/application/authenticated-actor";`);
replace("app/api/catalog/route.ts", `      const actor = await new PostgresLocalActorResolver(pool).resolve(parseLocalActorContext(body.actor));`, `      const actor = await resolveAuthenticatedActor(request.headers, pool, requestedRoleFromActorEnvelope(body.actor));`);

replace("app/api/planning-lifecycle/route.ts", `import { LocalActorError, parseLocalActorContext, PostgresLocalActorResolver } from "../../../src/application/local-actor";`, `import { LocalActorError } from "../../../src/application/local-actor";\nimport { requestedRoleFromActorEnvelope, resolveAuthenticatedActor } from "../../../src/application/authenticated-actor";`);
replace("app/api/planning-lifecycle/route.ts", `    const actor = await new PostgresLocalActorResolver(pool).resolve(parseLocalActorContext(body.actor));`, `    const actor = await resolveAuthenticatedActor(request.headers, pool, requestedRoleFromActorEnvelope(body.actor));`);

replace("app/api/interaction/route.ts", `import { LocalActorError, parseLocalActorContext, PostgresLocalActorResolver } from "../../../src/application/local-actor";`, `import { LocalActorError } from "../../../src/application/local-actor";\nimport { requestedRoleFromActorEnvelope, resolveAuthenticatedActor } from "../../../src/application/authenticated-actor";`);
replace("app/api/interaction/route.ts", `    const resolver = new PostgresLocalActorResolver(pool);\n    switch (body.action) {\n      case "listLocalActors": return NextResponse.json({ success: true, value: await resolver.listActiveUsers() });\n      case "resolveActor": return NextResponse.json({ success: true, value: await resolver.resolve(parseLocalActorContext(body.actor)) });`, `    const resolveActor = () => resolveAuthenticatedActor(request.headers, pool, requestedRoleFromActorEnvelope(body.actor));\n    switch (body.action) {\n      case "listLocalActors": return NextResponse.json({ error: { code: "permissionDenied", message: "Local actor enumeration is disabled in protected DB runtime." } }, { status: 403 });\n      case "resolveActor": return NextResponse.json({ success: true, value: await resolveActor() });`);
replace("app/api/interaction/route.ts", `resolver.resolve(parseLocalActorContext(body.actor))`, `resolveActor()`);

run("npx", ["drizzle-kit", "generate", "--name", "phase_31_28_staff_auth"]);
run("npm", ["run", "typecheck"]);
rmSync("scripts/phase-31-28-implement.mjs", { force: true });
rmSync(".github/workflows/phase-31-28-implement.yml", { force: true });
