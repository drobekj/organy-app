import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPool } from "../../../src/auth/server";
import { PostgresProtectedAccountAdminService } from "../../../src/application/protected-account-admin";
import { ProtectedActorError, resolveProtectedUser } from "../../../src/application/protected-actor";
import { ProvisionProtectedAccountForm } from "./provision-protected-account-form";
import { ProtectedAccountEditor } from "./protected-account-editor";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProtectedAccountsAdminPage({ searchParams }: PageProps) {
  if (process.env.ORGANY_RUNTIME !== "db") redirect("/");
  const requestHeaders = await headers();
  let currentUser;
  try { currentUser = await resolveProtectedUser(requestHeaders, authPool); }
  catch (error) { if (error instanceof ProtectedActorError) redirect("/sign-in"); throw error; }
  if (!currentUser.roles.includes("admin")) redirect("/");
  const snapshot = await new PostgresProtectedAccountAdminService(authPool).list(requestHeaders);
  const params = await searchParams;
  const message = first(params.message);
  const error = first(params.error);
  return <main className="shell"><section className="card planning-form" aria-label="Protected Account administration">
    <div className="app-header"><div><p className="eyebrow">Administration</p><h1>Protected Accounts</h1></div><a href="/">Back to planning</a></div>
    <p className="field-help">Protected staff use username + password. Church-domain roles remain authoritative only in app_user_roles.</p>
    {message && <p className="saved-summary" role="status">{message}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <section className="detail-panel" aria-label="Provision protected Account"><h2>Provision future staff Account</h2><ProvisionProtectedAccountForm targets={snapshot.eligibleActors} /></section>
    <section aria-label="Existing protected Accounts"><h2>Existing protected Accounts</h2><div style={{ display: "grid", gap: "1rem" }}>{snapshot.accounts.map((account) => <ProtectedAccountEditor key={account.authUserId} account={account} />)}</div></section>
  </section></main>;
}

function first(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
