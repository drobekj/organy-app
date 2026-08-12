import fs from "node:fs";

function replaceExactly(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one transform target, found ${count}`);
  fs.writeFileSync(path, source.replace(before, after));
}

function appendOnce(path, marker, text) {
  const source = fs.readFileSync(path, "utf8");
  if (source.includes(marker)) return;
  fs.writeFileSync(path, `${source.trimEnd()}\n\n${text.trim()}\n`);
}

const schemaPath = "src/db/schema/index.ts";
replaceExactly(
  schemaPath,
  `export const appUserRoles = pgTable("app_user_roles", {\n  userId: text("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),\n  role: userRole("role").notNull(),\n}, (table) => ({ userRoleUnique: uniqueIndex("app_user_roles_user_role_idx").on(table.userId, table.role) }));\n\nexport const preferenceProfiles = pgTable("preference_profiles", {`,
  `export const appUserRoles = pgTable("app_user_roles", {\n  userId: text("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),\n  role: userRole("role").notNull(),\n}, (table) => ({ userRoleUnique: uniqueIndex("app_user_roles_user_role_idx").on(table.userId, table.role) }));\n\nexport const authUsers = pgTable("auth_users", {\n  id: text("id").primaryKey(),\n  name: text("name").notNull(),\n  email: text("email").notNull(),\n  emailVerified: boolean("email_verified").notNull().default(false),\n  image: text("image"),\n  username: text("username"),\n  displayUsername: text("display_username"),\n  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),\n  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),\n}, (table) => ({\n  emailUnique: uniqueIndex("auth_users_email_idx").on(table.email),\n  usernameUnique: uniqueIndex("auth_users_username_idx").on(table.username),\n}));\n\nexport const authSessions = pgTable("auth_sessions", {\n  id: text("id").primaryKey(),\n  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),\n  token: text("token").notNull(),\n  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),\n  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),\n  ipAddress: text("ip_address"),\n  userAgent: text("user_agent"),\n  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),\n}, (table) => ({\n  tokenUnique: uniqueIndex("auth_sessions_token_idx").on(table.token),\n  userIndex: index("auth_sessions_user_id_idx").on(table.userId),\n}));\n\nexport const authAccounts = pgTable("auth_accounts", {\n  id: text("id").primaryKey(),\n  accountId: text("account_id").notNull(),\n  providerId: text("provider_id").notNull(),\n  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),\n  accessToken: text("access_token"),\n  refreshToken: text("refresh_token"),\n  idToken: text("id_token"),\n  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),\n  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),\n  scope: text("scope"),\n  password: text("password"),\n  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),\n  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),\n}, (table) => ({\n  userIndex: index("auth_accounts_user_id_idx").on(table.userId),\n}));\n\nexport const authVerifications = pgTable("auth_verifications", {\n  id: text("id").primaryKey(),\n  identifier: text("identifier").notNull(),\n  value: text("value").notNull(),\n  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),\n  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),\n  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),\n}, (table) => ({\n  identifierIndex: index("auth_verifications_identifier_idx").on(table.identifier),\n}));\n\nexport const protectedAccountActorLinks = pgTable("protected_account_actor_links", {\n  authUserId: text("auth_user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),\n  appUserId: text("app_user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),\n  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),\n}, (table) => ({\n  oneAccountPerActor: uniqueIndex("protected_account_actor_links_app_user_idx").on(table.appUserId),\n}));\n\nexport const preferenceProfiles = pgTable("preference_profiles", {`,
);

const clientPath = "app/planning-lifecycle-client.tsx";
replaceExactly(
  clientPath,
  `type PlanningLifecycleClientProps = {\n  runtimeMode: RuntimeMode;\n};`,
  `type PlanningLifecycleClientProps = {\n  runtimeMode: RuntimeMode;\n  authenticatedUser?: AppUser;\n};`,
);
replaceExactly(
  clientPath,
  `type LocalActorRequest = { userId: string; role?: PlanningRole };\nasync function callInteractionApi(action: string, input: unknown, actor?: LocalActorRequest) {\n  const response = await fetch("/api/interaction", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ action, input, ...(actor ? { actor: { userId: actor.userId, role: actor.role } } : {}) }) });`,
  `type LocalActorRequest = { userId?: string; role?: PlanningRole };\nfunction protectedActorEnvelope(actor?: LocalActorRequest) { return actor ? { actor: { ...(actor.role ? { role: actor.role } : {}) } } : {}; }\nasync function callInteractionApi(action: string, input: unknown, actor?: LocalActorRequest) {\n  const response = await fetch("/api/interaction", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ action, input, ...protectedActorEnvelope(actor) }) });`,
);
replaceExactly(
  clientPath,
  `body: JSON.stringify({ action, input, ...(actor ? { actor } : {}) })`,
  `body: JSON.stringify({ action, input, ...protectedActorEnvelope(actor) })`,
);
replaceExactly(
  clientPath,
  `export default function PlanningLifecycleClient({ runtimeMode }: PlanningLifecycleClientProps) {`,
  `export default function PlanningLifecycleClient({ runtimeMode, authenticatedUser }: PlanningLifecycleClientProps) {`,
);
replaceExactly(
  clientPath,
  `  const [dbUsers, setDbUsers] = useState<AppUser[]>([]);\n  const memoryUsers = useMemo(() => interactionRepository.listUsers(), [interactionRepository]);\n  const availableUsers = runtimeMode === "db" ? dbUsers : memoryUsers;\n  const demoUsers = availableUsers.map((user) => ({ id: user.id, label: user.displayName, roles: user.roles }));\n  const [selectedUserId, setSelectedUserId] = useState("demo-priest-user");\n  const [selectedAssignedRole, setSelectedAssignedRole] = useState<PlanningRole>("priest");`,
  `  const memoryUsers = useMemo(() => interactionRepository.listUsers(), [interactionRepository]);\n  const availableUsers = runtimeMode === "db" ? (authenticatedUser ? [authenticatedUser] : []) : memoryUsers;\n  const demoUsers = availableUsers.map((user) => ({ id: user.id, label: user.displayName, roles: user.roles }));\n  const [selectedUserId, setSelectedUserId] = useState(authenticatedUser?.id ?? "demo-priest-user");\n  const [selectedAssignedRole, setSelectedAssignedRole] = useState<PlanningRole>(authenticatedUser?.roles[0] ?? "priest");`,
);
replaceExactly(
  clientPath,
  `  useEffect(() => {\n    if (runtimeMode !== "db") return;\n    void callInteractionApi("listLocalActors", {}).then((result) => {\n      if (!result.success || !Array.isArray(result.value)) return;\n      const users = result.value as AppUser[];\n      setDbUsers(users);\n      if (users.length > 0 && !users.some((user) => user.id === selectedUserId)) { setSelectedUserId(users[0].id); setSelectedAssignedRole(users[0].roles[0]); }\n    });\n  }, [runtimeMode, selectedUserId]);\n\n`,
  ``,
);
replaceExactly(
  clientPath,
  `<div><span className="guidance-label">Deterministic test user</span><strong>{activeUser.label} ({activeUser.id})</strong><label>Change user<select value={selectedUserId} onChange={(event) => { const user = demoUsers.find((candidate) => candidate.id === event.target.value); if (user) { setSelectedUserId(user.id); setSelectedAssignedRole(user.roles[0]); } }}>{demoUsers.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}</select></label><label>Assigned role<select value={effectiveRole} onChange={(event) => setSelectedAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><p>Development switches stable user IDs and stored assigned roles until authentication exists.</p></div>`,
  `{runtimeMode === "memory" ? <div><span className="guidance-label">Deterministic test user</span><strong>{activeUser.label} ({activeUser.id})</strong><label>Change user<select value={selectedUserId} onChange={(event) => { const user = demoUsers.find((candidate) => candidate.id === event.target.value); if (user) { setSelectedUserId(user.id); setSelectedAssignedRole(user.roles[0]); } }}>{demoUsers.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}</select></label><label>Assigned role<select value={effectiveRole} onChange={(event) => setSelectedAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><p>Memory development switches deterministic seeded users and roles.</p></div> : <div><span className="guidance-label">Authenticated user</span><strong>{activeUser.label} ({activeUser.id})</strong>{storedUser.roles.length > 1 && <label>Assigned role<select value={effectiveRole} onChange={(event) => setSelectedAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>}<p>DB runtime identity comes from the protected server session. No user switch is available.</p></div>}`,
);

const interactionRoute = "app/api/interaction/route.ts";
replaceExactly(
  interactionRoute,
  `import { LocalActorError, parseLocalActorContext, PostgresLocalActorResolver } from "../../../src/application/local-actor";`,
  `import { LocalActorError } from "../../../src/application/local-actor";\nimport { ProtectedActorError, resolveProtectedActor } from "../../../src/application/protected-actor";`,
);
replaceExactly(
  interactionRoute,
  `    const resolver = new PostgresLocalActorResolver(pool);\n    switch (body.action) {\n      case "listLocalActors": return NextResponse.json({ success: true, value: await resolver.listActiveUsers() });\n      case "resolveActor": return NextResponse.json({ success: true, value: await resolver.resolve(parseLocalActorContext(body.actor)) });`,
  `    const actor = await resolveProtectedActor(request.headers, pool, body.actor);\n    switch (body.action) {\n      case "listLocalActors": return NextResponse.json({ success: true, value: [{ id: actor.userId, displayName: actor.displayName, ...(actor.personId ? { personId: actor.personId } : {}), active: true, roles: [actor.role] }] });\n      case "resolveActor": return NextResponse.json({ success: true, value: actor });`,
);
{
  const source = fs.readFileSync(interactionRoute, "utf8");
  const target = `await resolver.resolve(parseLocalActorContext(body.actor))`;
  const count = source.split(target).length - 1;
  if (count < 6) throw new Error(`${interactionRoute}: expected resolver usages, found ${count}`);
  fs.writeFileSync(interactionRoute, source.split(target).join("actor"));
}
replaceExactly(
  interactionRoute,
  `  } catch (error) {\n    if (error instanceof LocalActorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "invalidInput" ? 400 : 403 });`,
  `  } catch (error) {\n    if (error instanceof ProtectedActorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "unauthenticated" ? 401 : error.code === "invalidInput" ? 400 : 403 });\n    if (error instanceof LocalActorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "invalidInput" ? 400 : 403 });`,
);

const packagePath = "package.json";
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.scripts["db:bootstrap:auth"] = "tsx scripts/db-bootstrap-protected-auth.ts";
pkg.scripts["test:phase-31-28"] = "tsx scripts/phase-31-28-tests.ts";
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

appendOnce("app/globals.css", ".auth-shell {", `
.auth-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
}

.auth-card {
  width: min(26rem, 100%);
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
  border: 1px solid #d7d7d7;
  border-radius: 0.75rem;
  background: white;
}

.auth-card label,
.protected-account-controls form label {
  display: grid;
  gap: 0.35rem;
}

.auth-card input,
.protected-account-controls input {
  min-height: 2.5rem;
  padding: 0.45rem 0.6rem;
  font: inherit;
}

.auth-error { color: #a40000; }

.protected-account-controls {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid #e2e2e2;
  background: #fafafa;
}

.protected-account-controls form {
  flex-basis: 100%;
  display: flex;
  align-items: end;
  gap: 0.65rem;
  flex-wrap: wrap;
}
`);

const contract = `# Phase 31.28 — Protected username/password authentication slice\n\nAuthority: Contract Gate #170 and merged Phase 31.27.\n\n- DB runtime protected staff authentication is username + password.\n- Better Auth 1.6.25 and @better-auth/drizzle-adapter 1.6.25 are pinned for this slice.\n- Better Auth's required email is a server-generated internal synthetic value only; it is never requested from or displayed to staff and is not a login identifier.\n- No public privileged signup exists.\n- Protected auth user maps one-to-one to an active app_users Actor; app_user_roles remains the only church-domain role authority.\n- DB protected authorization resolves server-side session → linked Actor → current roles. Client user IDs are not authority; a requested role is accepted only when currently assigned to that Actor.\n- Memory runtime retains deterministic Change user. DB runtime does not.\n- Staff can sign out and change their own password.\n- Initial/local protected accounts are created by an explicit server-side bootstrap using externally supplied passwords.\n- Congregation nickname voting, admin account-management UI, password reset, forced first change, OAuth/passkeys/2FA, deployment and security logging are outside this phase.\n`;
fs.writeFileSync("docs/phase-31-28-contract.md", contract);

console.log("Phase 31.28 one-shot transform complete.");
