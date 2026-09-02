import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import PlanningLifecycleClient, { type RuntimeMode } from "./planning-lifecycle-client";
import { ProtectedAccountControls } from "./protected-account-controls";
import { ProtectedActorError, resolveProtectedUser } from "../src/application/protected-actor";
import { ACTIVE_ROLE_COOKIE_NAME, resolveOwnedActiveRole } from "../src/application/active-role";
import { getUnresolvedAuditRetentionIncident } from "../src/application/audit-retention-maintenance";
import { resolveApplicationRuntimeMode } from "../src/config/production-runtime";
import { assertDemoRuntimeConfig, resolveApplicationExperience } from "../src/config/application-experience";
import { authPool } from "../src/auth/server";
import { DemoD1Shell } from "./demo-d1-shell";

export const dynamic = "force-dynamic";

export default async function Home() {
  const experience = resolveApplicationExperience();
  if (experience === "demo") {
    assertDemoRuntimeConfig();
    return <DemoD1Shell />;
  }

  const runtimeMode: RuntimeMode = resolveApplicationRuntimeMode();
  if (runtimeMode === "memory") return <PlanningLifecycleClient runtimeMode="memory" />;

  try {
    const authenticatedUser = await resolveProtectedUser(await headers(), authPool);
    const activeRole = resolveOwnedActiveRole(authenticatedUser.roles, (await cookies()).get(ACTIVE_ROLE_COOKIE_NAME)?.value);
    const maintenanceIncident = authenticatedUser.roles.includes("admin")
      ? await getUnresolvedAuditRetentionIncident(authPool)
      : null;
    return (
      <>
        <ProtectedAccountControls displayName={authenticatedUser.displayName} roles={authenticatedUser.roles} initialActiveRole={activeRole} initialWhatsAppPhone={authenticatedUser.whatsappPhone} />
        {maintenanceIncident && (
          <aside className="maintenance-incident-alert" role="alert">
            <strong>Audit maintenance requires attention.</strong>
            <span>The latest retention maintenance attempt did not complete successfully. Review Audit History before treating retention as healthy.</span>
            <a href="/admin/audit-history">Open Audit History</a>
          </aside>
        )}
        <PlanningLifecycleClient runtimeMode="db" authenticatedUser={authenticatedUser} initialActiveRole={activeRole} />
      </>
    );
  } catch (error) {
    if (error instanceof ProtectedActorError) redirect("/sign-in");
    throw error;
  }
}
