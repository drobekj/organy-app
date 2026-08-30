import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import PlanningLifecycleClient, { type RuntimeMode } from "./planning-lifecycle-client";
import { ProtectedAccountControls } from "./protected-account-controls";
import { ProtectedActorError, resolveProtectedUser } from "../src/application/protected-actor";
import { ACTIVE_ROLE_COOKIE_NAME, resolveOwnedActiveRole } from "../src/application/active-role";
import { authPool } from "../src/auth/server";
import { readAuditRetentionMaintenanceIncident } from "../src/application/audit-retention-maintenance";

export default async function Home() {
  const runtimeMode: RuntimeMode = process.env.ORGANY_RUNTIME === "db" ? "db" : "memory";
  if (runtimeMode === "memory") return <PlanningLifecycleClient runtimeMode="memory" />;

  try {
    const authenticatedUser = await resolveProtectedUser(await headers(), authPool);
    const activeRole = resolveOwnedActiveRole(authenticatedUser.roles, (await cookies()).get(ACTIVE_ROLE_COOKIE_NAME)?.value);
    const maintenanceIncident = authenticatedUser.roles.includes("admin")
      ? await readAuditRetentionMaintenanceIncident(authPool)
      : null;
    return (
      <>
        <ProtectedAccountControls
          displayName={authenticatedUser.displayName}
          roles={authenticatedUser.roles}
          initialActiveRole={activeRole}
          maintenanceIncident={maintenanceIncident ? {
            eventId: maintenanceIncident.eventId,
            occurredAt: maintenanceIncident.occurredAt.toISOString(),
            message: maintenanceIncident.message,
          } : null}
        />
        <PlanningLifecycleClient runtimeMode="db" authenticatedUser={authenticatedUser} initialActiveRole={activeRole} />
      </>
    );
  } catch (error) {
    if (error instanceof ProtectedActorError) redirect("/sign-in");
    throw error;
  }
}