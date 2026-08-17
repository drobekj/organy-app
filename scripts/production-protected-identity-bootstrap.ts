import { Pool, type PoolClient, type QueryResult } from "pg";

const APPLY_FLAG = "--apply";
const DIRECT_URL_KEY = "DATABASE_URL_UNPOOLED";
const EXPECTED_PUBLIC_TABLES = 32;
const PROTECTED_ROLES = ["admin", "priest", "organist"] as const;
type ProtectedRole = typeof PROTECTED_ROLES[number];
type Queryable = { query: (text: string, values?: unknown[]) => Promise<QueryResult<any>> };

type IdentityInput = {
  actorId: string;
  displayName: string;
  username: string;
  password?: string;
  roles: ProtectedRole[];
  person?: {
    id: string;
    displayName: string;
    priest: boolean;
    organist: boolean;
  };
};

type IdentityState = "absent" | "exact";

const REFERENCE_NON_EMPTY_TABLES = new Set([
  "melody_non_repetition_config",
  "reference_antiphons",
  "reference_catalog_songs",
  "reference_melody_classes",
  "reference_song_melody_memberships",
  "reference_thematic_parents",
  "reference_thematic_ranges",
  "reference_thematic_sections",
]);

const IDENTITY_TABLES = new Set([
  "app_users",
  "app_user_roles",
  "catalog_persons",
  "auth_users",
  "auth_accounts",
  "protected_account_actor_links",
]);

const MUST_REMAIN_EMPTY = new Set([
  "auth_sessions",
  "auth_verifications",
  "preference_profiles",
  "song_preferences",
  "reference_song_preferences",
  "organist_repertoire",
  "reference_organist_repertoire",
  "antiphon_mappings",
  "liturgical_season_mappings",
  "reference_antiphon_recommendations",
  "catalog_songs",
  "melody_equivalence_classes",
  "song_melody_equivalence",
  "service_contexts",
  "service_sets",
  "service_set_rows",
  "completed_services",
  "completed_service_rows",
]);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for protected Production identity bootstrap.`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function readDirectUrl(): string {
  const value = required(DIRECT_URL_KEY);
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${DIRECT_URL_KEY} must be a valid PostgreSQL URL.`); }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${DIRECT_URL_KEY} must use the postgres or postgresql protocol.`);
  }
  if (parsed.hostname.toLowerCase().includes("-pooler")) {
    throw new Error(`${DIRECT_URL_KEY} must be the direct/unpooled PostgreSQL endpoint.`);
  }
  return value;
}

function requestedApply(): boolean {
  const args = process.argv.slice(2);
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === APPLY_FLAG) return true;
  throw new Error(`Only the optional ${APPLY_FLAG} argument is accepted.`);
}

function parseCsv(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].sort();
}

function readIdentityInput(apply: boolean): IdentityInput {
  const actorId = required("ORGANY_BOOTSTRAP_ACTOR_ID");
  const displayName = required("ORGANY_BOOTSTRAP_DISPLAY_NAME");
  const username = required("ORGANY_BOOTSTRAP_USERNAME").toLowerCase();
  const roles = parseCsv(required("ORGANY_BOOTSTRAP_ROLES"));

  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(actorId)) {
    throw new Error("ORGANY_BOOTSTRAP_ACTOR_ID has an invalid format.");
  }
  if (displayName.length > 255) throw new Error("ORGANY_BOOTSTRAP_DISPLAY_NAME is too long.");
  if (username.length < 3 || username.length > 64 || !/^[a-z0-9._-]+$/.test(username)) {
    throw new Error("ORGANY_BOOTSTRAP_USERNAME has an invalid format.");
  }
  if (roles.length === 0 || roles.some((role) => !PROTECTED_ROLES.includes(role as ProtectedRole))) {
    throw new Error("ORGANY_BOOTSTRAP_ROLES may contain only admin, priest, or organist.");
  }

  const personId = optional("ORGANY_BOOTSTRAP_PERSON_ID");
  const personDisplayName = optional("ORGANY_BOOTSTRAP_PERSON_DISPLAY_NAME");
  const personEligibilityRaw = optional("ORGANY_BOOTSTRAP_PERSON_ELIGIBILITY");
  const anyPersonField = Boolean(personId || personDisplayName || personEligibilityRaw);
  let person: IdentityInput["person"];

  if (anyPersonField) {
    if (!personId || !personDisplayName || personEligibilityRaw === undefined) {
      throw new Error("Production Person bootstrap requires id, display name, and explicit eligibility together.");
    }
    if (!/^[A-Za-z0-9._:-]{3,128}$/.test(personId)) throw new Error("ORGANY_BOOTSTRAP_PERSON_ID has an invalid format.");
    if (personDisplayName.length > 255) throw new Error("ORGANY_BOOTSTRAP_PERSON_DISPLAY_NAME is too long.");
    const eligibility = parseCsv(personEligibilityRaw);
    if (eligibility.some((role) => role !== "priest" && role !== "organist")) {
      throw new Error("ORGANY_BOOTSTRAP_PERSON_ELIGIBILITY may contain only priest and/or organist.");
    }
    person = {
      id: personId,
      displayName: personDisplayName,
      priest: eligibility.includes("priest"),
      organist: eligibility.includes("organist"),
    };
  }

  if (roles.includes("priest") && !person?.priest) {
    throw new Error("A bootstrapped priest role requires an explicitly priest-eligible Person linkage.");
  }
  if (roles.includes("organist") && !person?.organist) {
    throw new Error("A bootstrapped organist role requires an explicitly organist-eligible Person linkage.");
  }

  const password = optional("ORGANY_BOOTSTRAP_PASSWORD");
  if (apply) {
    if (!password || password.length < 8 || password.length > 128) {
      throw new Error("ORGANY_BOOTSTRAP_PASSWORD must contain 8-128 characters when --apply is used.");
    }
  }

  return {
    actorId,
    displayName,
    username,
    ...(password ? { password } : {}),
    roles: roles as ProtectedRole[],
    ...(person ? { person } : {}),
  };
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function assertProviderAndReferenceBoundary(db: Queryable): Promise<void> {
  const tables = (await db.query("select tablename from pg_tables where schemaname='public' order by tablename"))
    .rows.map((row) => String(row.tablename));
  if (tables.length !== EXPECTED_PUBLIC_TABLES) {
    throw new Error(`Protected Production identity bootstrap requires the reviewed ${EXPECTED_PUBLIC_TABLES}-table Production schema.`);
  }

  const provider = (await db.query(`
    select
      exists(select 1 from pg_namespace where nspname='neon_auth') neon_auth_schema,
      exists(select 1 from pg_roles where rolname='authenticated') authenticated_role,
      exists(select 1 from pg_roles where rolname='anonymous') anonymous_role
  `)).rows[0];
  if (provider?.neon_auth_schema || provider?.authenticated_role || provider?.anonymous_role) {
    throw new Error("Protected Production identity bootstrap refuses Neon Auth/Data API state.");
  }

  const reference = (await db.query(`
    select
      (select count(*)::int from reference_catalog_songs) catalog_total,
      (select count(*)::int from reference_catalog_songs where language='czech') catalog_czech,
      (select count(*)::int from reference_catalog_songs where language='polish') catalog_polish,
      (select count(*)::int from reference_melody_classes) melody_classes,
      (select count(*)::int from reference_song_melody_memberships) melody_memberships,
      (select count(*)::int from reference_antiphons) antiphons_total,
      (select count(*)::int from reference_antiphons where language='czech') antiphons_czech,
      (select count(*)::int from reference_antiphons where language='polish') antiphons_polish,
      (select count(*)::int from reference_thematic_parents) thematic_parents,
      (select count(*)::int from reference_thematic_sections) thematic_sections,
      (select count(*)::int from reference_thematic_ranges) thematic_ranges,
      (select count(*)::int from melody_non_repetition_config where id='global' and months=2) config_ok
  `)).rows[0];

  const exactReference = Number(reference?.catalog_total) === 1798
    && Number(reference?.catalog_czech) === 808
    && Number(reference?.catalog_polish) === 990
    && Number(reference?.melody_classes) === 1798
    && Number(reference?.melody_memberships) === 1798
    && Number(reference?.antiphons_total) === 232
    && Number(reference?.antiphons_czech) === 116
    && Number(reference?.antiphons_polish) === 116
    && Number(reference?.thematic_parents) === 6
    && Number(reference?.thematic_sections) === 71
    && Number(reference?.thematic_ranges) === 71
    && Number(reference?.config_ok) === 1;
  if (!exactReference) throw new Error("Protected Production identity bootstrap requires the exact accepted Production Reference snapshot.");

  for (const table of tables) {
    if (REFERENCE_NON_EMPTY_TABLES.has(table) || IDENTITY_TABLES.has(table)) continue;
    const count = Number((await db.query(`select count(*)::int n from public.${quoteIdentifier(table)}`)).rows[0]?.n ?? 0);
    if (count !== 0) throw new Error("Protected Production identity bootstrap refuses unrelated operational data.");
  }

  for (const table of MUST_REMAIN_EMPTY) {
    if (!tables.includes(table)) continue;
    const count = Number((await db.query(`select count(*)::int n from public.${quoteIdentifier(table)}`)).rows[0]?.n ?? 0);
    if (count !== 0) throw new Error("Protected Production identity bootstrap refuses unrelated operational data.");
  }
}

async function assertIdentityBoundary(db: Queryable): Promise<void> {
  const anomalies = (await db.query(`
    select
      (select count(*)::int from app_users u left join protected_account_actor_links l on l.app_user_id=u.id where l.app_user_id is null) unlinked_actors,
      (select count(*)::int from auth_users au left join protected_account_actor_links l on l.auth_user_id=au.id where l.auth_user_id is null) unlinked_auth_users,
      (select count(*)::int from app_user_roles r where r.role not in ('admin','priest','organist')) non_protected_roles,
      (select count(*)::int from auth_accounts aa where aa.provider_id <> 'credential' or aa.password is null) non_credential_accounts,
      (select count(*)::int from auth_users au where (select count(*) from auth_accounts aa where aa.user_id=au.id and aa.provider_id='credential' and aa.password is not null) <> 1) bad_credential_cardinality,
      (select count(*)::int from app_users where id like 'congregation-voter:%') nickname_actors,
      (select count(*)::int from auth_sessions) sessions,
      (select count(*)::int from auth_verifications) verifications,
      (select count(*)::int from catalog_persons p where not exists(select 1 from app_users u where u.person_id=p.id)) orphan_persons,
      (select count(*)::int from (select person_id from app_users where person_id is not null group by person_id having count(*) > 1) d) shared_persons
  `)).rows[0];

  if (Object.values(anomalies ?? {}).some((value) => Number(value) !== 0)) {
    throw new Error("Protected Production identity bootstrap refuses partial or unexpected identity state.");
  }
}

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function classifyIdentity(db: Queryable, input: IdentityInput): Promise<IdentityState> {
  const actor = (await db.query(`
    select u.id, u.display_name, u.person_id, u.active,
      l.auth_user_id, au.username,
      coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') roles,
      p.display_name person_display_name, p.priest person_priest, p.organist person_organist,
      (select count(*)::int from auth_accounts aa where aa.user_id=l.auth_user_id and aa.provider_id='credential' and aa.password is not null) credential_count
    from app_users u
    left join protected_account_actor_links l on l.app_user_id=u.id
    left join auth_users au on au.id=l.auth_user_id
    left join app_user_roles r on r.user_id=u.id
    left join catalog_persons p on p.id=u.person_id
    where u.id=$1
    group by u.id, l.auth_user_id, au.username, p.id
  `, [input.actorId])).rows[0];

  if (!actor) {
    if ((await db.query("select 1 from auth_users where username=$1 limit 1", [input.username])).rows[0]) {
      throw new Error("Protected Production identity bootstrap found a conflicting username.");
    }
    if (input.person && (await db.query("select 1 from catalog_persons where id=$1 limit 1", [input.person.id])).rows[0]) {
      throw new Error("Protected Production identity bootstrap found a conflicting Person identity.");
    }
    return "absent";
  }

  const actualRoles = Array.isArray(actor.roles)
    ? actor.roles.map(String).sort()
    : String(actor.roles ?? "").replace(/[{}]/g, "").split(",").filter(Boolean).sort();
  const expectedPersonId = input.person?.id ?? null;
  const exactPerson = input.person
    ? String(actor.person_id ?? "") === input.person.id
      && String(actor.person_display_name ?? "") === input.person.displayName
      && Boolean(actor.person_priest) === input.person.priest
      && Boolean(actor.person_organist) === input.person.organist
    : actor.person_id === null;

  const exact = String(actor.display_name) === input.displayName
    && Boolean(actor.active)
    && String(actor.username ?? "") === input.username
    && actor.person_id === expectedPersonId
    && exactPerson
    && sameStrings(actualRoles, [...input.roles].sort())
    && Number(actor.credential_count) === 1
    && Boolean(actor.auth_user_id);

  if (!exact) throw new Error("Protected Production identity bootstrap found conflicting state for the requested Actor.");
  return "exact";
}

async function createIdentity(client: PoolClient, pool: Pool, directUrl: string, input: IdentityInput): Promise<void> {
  await client.query("begin");
  let createdAuthUserId: string | undefined;
  let authPoolToClose: { end: () => Promise<void> } | undefined;
  try {
    await client.query("select pg_advisory_xact_lock(hashtext('organy-production-protected-identity-bootstrap'))");
    await assertProviderAndReferenceBoundary(client);
    await assertIdentityBoundary(client);
    const state = await classifyIdentity(client, input);
    if (state === "exact") {
      await client.query("rollback");
      return;
    }

    process.env.DATABASE_URL = directUrl;
    const authModule = await import("../src/auth/server");
    authPoolToClose = authModule.authPool;
    const provisioningAuth = authModule.createOrganyAuth({ allowSignUp: true });
    const result = await provisioningAuth.api.signUpEmail({
      body: {
        email: `protected-${crypto.randomUUID()}@organy.invalid`,
        name: input.displayName,
        password: input.password!,
        username: input.username,
      },
    });
    createdAuthUserId = result.user.id;

    await client.query("delete from auth_sessions where user_id=$1", [createdAuthUserId]);
    if (input.person) {
      await client.query(
        "insert into catalog_persons (id, display_name, active, priest, organist) values ($1,$2,true,$3,$4)",
        [input.person.id, input.person.displayName, input.person.priest, input.person.organist],
      );
    }
    await client.query(
      "insert into app_users (id, display_name, person_id, active) values ($1,$2,$3,true)",
      [input.actorId, input.displayName, input.person?.id ?? null],
    );
    for (const role of input.roles) {
      await client.query("insert into app_user_roles (user_id, role) values ($1,$2)", [input.actorId, role]);
    }
    await client.query(
      "insert into protected_account_actor_links (auth_user_id, app_user_id) values ($1,$2)",
      [createdAuthUserId, input.actorId],
    );
    await client.query("delete from auth_sessions where user_id=$1", [createdAuthUserId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (createdAuthUserId) await pool.query("delete from auth_users where id=$1", [createdAuthUserId]).catch(() => undefined);
    throw error;
  } finally {
    if (authPoolToClose) await authPoolToClose.end().catch(() => undefined);
  }
}

function safeFailure(error: unknown): string {
  if (!(error instanceof Error)) return "Protected Production identity bootstrap failed.";
  const allowedPrefixes = [
    "DATABASE_URL_UNPOOLED",
    "ORGANY_BOOTSTRAP_",
    "Production Person bootstrap",
    "A bootstrapped priest role",
    "A bootstrapped organist role",
    "Only the optional --apply argument",
    "Protected Production identity bootstrap",
  ];
  if (allowedPrefixes.some((prefix) => error.message.startsWith(prefix))) return error.message;
  const code = (error as Error & { code?: string }).code;
  if (code && /^[0-9A-Z]{5}$/.test(code)) return `Database operation failed (${code}).`;
  return "Protected Production identity bootstrap failed.";
}

async function main(): Promise<void> {
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  let apply = false;
  try {
    apply = requestedApply();
    const directUrl = readDirectUrl();
    required("BETTER_AUTH_SECRET");
    const authUrl = required("BETTER_AUTH_URL");
    let parsedAuthUrl: URL;
    try { parsedAuthUrl = new URL(authUrl); } catch { throw new Error("BETTER_AUTH_URL must be an absolute URL for protected Production identity bootstrap."); }
    if (parsedAuthUrl.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsedAuthUrl.hostname)) {
      throw new Error("BETTER_AUTH_URL must use HTTPS outside loopback acceptance.");
    }
    const input = readIdentityInput(apply);

    pool = new Pool({ connectionString: directUrl, max: 2 });
    await assertProviderAndReferenceBoundary(pool);
    await assertIdentityBoundary(pool);
    const before = await classifyIdentity(pool, input);

    if (!apply) {
      console.log("Protected Production identity bootstrap preflight: PASS");
      console.log(before === "exact"
        ? "Requested protected identity already matches the reviewed state; no data was changed."
        : `Target and explicit identity inputs verified; no data was changed. Re-run with ${APPLY_FLAG} only at the authorized HUMAN checkpoint.`);
      return;
    }

    if (before === "absent") {
      client = await pool.connect();
      await createIdentity(client, pool, directUrl, input);
    }

    await assertProviderAndReferenceBoundary(pool);
    await assertIdentityBoundary(pool);
    const after = await classifyIdentity(pool, input);
    if (after !== "exact") throw new Error("Protected Production identity bootstrap did not produce the exact requested identity state.");

    console.log("Protected Production identity bootstrap: PASS");
    console.log(before === "exact"
      ? "Exact protected identity already existed; password and identity state were not overwritten."
      : "Exactly one explicit protected identity was established; signup session was removed and unrelated Production data was left unchanged.");
  } catch (error) {
    console.error(apply ? "Protected Production identity bootstrap: FAIL" : "Protected Production identity bootstrap preflight: FAIL");
    console.error(safeFailure(error));
    process.exitCode = 1;
  } finally {
    client?.release();
    if (pool) await pool.end().catch(() => undefined);
  }
}

void main();