import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPool } from "../../../src/auth/server";
import { ACTIVE_ROLE_COOKIE_NAME, resolveOwnedActiveRole } from "../../../src/application/active-role";
import { PostgresProtectedAccountAdminService } from "../../../src/application/protected-account-admin";
import { ProtectedActorError, resolveProtectedUser } from "../../../src/application/protected-actor";
import { ProvisionProtectedAccountForm } from "./provision-protected-account-form";
import { ProtectedAccountEditor } from "./protected-account-editor";
import { ProtectedStaffOnboardingForm } from "./protected-staff-onboarding-form";
import { PersonAdminPanel } from "./person-admin-panel";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProtectedAccountsAdminPage({ searchParams }: PageProps) {
  if (process.env.ORGANY_RUNTIME !== "db") redirect("/");
  const requestHeaders = await headers();
  let currentUser;
  try { currentUser = await resolveProtectedUser(requestHeaders, authPool); }
  catch (error) { if (error instanceof ProtectedActorError) redirect("/sign-in"); throw error; }
  const activeRole = resolveOwnedActiveRole(currentUser.roles, (await cookies()).get(ACTIVE_ROLE_COOKIE_NAME)?.value);
  if (!currentUser.roles.includes("admin") || activeRole !== "admin") redirect("/");
  const snapshot = await new PostgresProtectedAccountAdminService(authPool).list(requestHeaders);
  const phoneResult = await authPool.query(`select id, whatsapp_phone_e164 from app_users where whatsapp_phone_e164 is not null`);
  const phones = new Map(phoneResult.rows.map((row) => [String(row.id), String(row.whatsapp_phone_e164)]));
  const activeAdminCount = snapshot.accounts.filter((account) => account.active && account.roles.includes("admin")).length;
  const peopleResult = await authPool.query(`
    select p.id, p.display_name, p.priest, p.organist
    from catalog_persons p
    where p.active = true and (p.priest = true or p.organist = true)
    order by lower(p.display_name)
  `);
  const staffPeople = peopleResult.rows.map((row) => ({ id: String(row.id), displayName: String(row.display_name), priest: Boolean(row.priest), organist: Boolean(row.organist) }));
  const allPeopleResult = await authPool.query(`select id, display_name, active, priest, organist from catalog_persons order by lower(display_name)`);
  const allPeople = allPeopleResult.rows.map((row) => ({ id: String(row.id), displayName: String(row.display_name), active: Boolean(row.active), priest: Boolean(row.priest), organist: Boolean(row.organist) }));
  const params = await searchParams;
  const message = first(params.message);
  const error = first(params.error);
  return <main className="shell"><section className="card planning-form" aria-label="Protected Account administration">
    <div className="app-header"><div><h1>Manage Accounts</h1></div><a href="/">Back to planning</a></div>
    <p className="field-help">Protected staff use username + password. Church-domain roles remain authoritative only in app_user_roles.</p>
    <section className="detail-panel" aria-label="Add staff account"><h2>Add priest / organist account</h2><ProtectedStaffOnboardingForm people={staffPeople} /></section>
    {message && <p className="saved-summary" role="status">{message}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <section className="detail-panel" aria-label="Provision protected Account"><h2>Provision future staff Account</h2><ProvisionProtectedAccountForm targets={snapshot.eligibleActors} /></section>
    <section aria-label="Existing protected Accounts"><h2>Existing protected Accounts</h2><div style={{ display: "grid", gap: "1rem" }}>{snapshot.accounts.map((account) => <ProtectedAccountEditor key={account.authUserId} account={{ ...account, whatsappPhoneE164: phones.get(account.appUserId) }} currentAppUserId={currentUser.id} canDeactivate={!(account.active && account.roles.includes("admin") && activeAdminCount === 1)} />)}</div></section>
    <PersonAdminPanel people={allPeople} />
  </section></main>;
}

function first(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
