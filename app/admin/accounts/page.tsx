import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPool } from "../../../src/auth/server";
import { ACTIVE_ROLE_COOKIE_NAME, resolveOwnedActiveRole } from "../../../src/application/active-role";
import { PostgresProtectedAccountAdminService } from "../../../src/application/protected-account-admin";
import { ProtectedActorError, resolveProtectedUser } from "../../../src/application/protected-actor";
import { ProvisionProtectedAccountForm } from "./provision-protected-account-form";
import { ProtectedAccountEditor } from "./protected-account-editor";
import { ProtectedStaffOnboardingForm } from "./protected-staff-onboarding-form";
import { PersonDeleteButton } from "./person-delete-button";

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
    <div className="app-header"><div><p className="eyebrow">Administration</p><h1>Protected Accounts</h1></div><a href="/">Back to planning</a></div>
    <p className="field-help">Protected staff use username + password. Church-domain roles remain authoritative only in app_user_roles.</p>
    <section className="detail-panel" aria-label="Add staff account"><h2>Add priest / organist account</h2><ProtectedStaffOnboardingForm people={staffPeople} /></section>
    {message && <p className="saved-summary" role="status">{message}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <section className="detail-panel" aria-label="Provision protected Account"><h2>Provision future staff Account</h2><ProvisionProtectedAccountForm targets={snapshot.eligibleActors} /></section>
    <section aria-label="Existing protected Accounts"><h2>Existing protected Accounts</h2><div style={{ display: "grid", gap: "1rem" }}>{snapshot.accounts.map((account) => <ProtectedAccountEditor key={account.authUserId} account={account} currentAppUserId={currentUser.id} canDeactivate={!(account.active && account.roles.includes("admin") && activeAdminCount === 1)} />)}</div></section>
    <section className="detail-panel" aria-label="Person deletion"><h2>Persons</h2><p className="field-help">Permanent deletion is allowed only for a Person with no protected Account and no Working, Final, or Completed service reference. Otherwise deactivate the Person in Catalog.</p><div style={{ display: "grid", gap: "0.6rem" }}>{allPeople.map((person) => <div className="rows-header" key={person.id}><span>{person.displayName} · {person.active ? "active" : "inactive"} · {[person.priest ? "priest" : "", person.organist ? "organist" : ""].filter(Boolean).join(", ") || "no staff role"}</span><PersonDeleteButton personId={person.id} displayName={person.displayName} /></div>)}</div></section>
  </section></main>;
}

function first(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }