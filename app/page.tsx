import { headers } from "next/headers";
import { redirect } from "next/navigation";
import PlanningLifecycleClient, { type RuntimeMode } from "./planning-lifecycle-client";
import { ProtectedAccountControls } from "./protected-account-controls";
import { ProtectedActorError, resolveProtectedUser } from "../src/application/protected-actor";
import { authPool } from "../src/auth/server";

export default async function Home() {
  const runtimeMode: RuntimeMode = process.env.ORGANY_RUNTIME === "db" ? "db" : "memory";
  if (runtimeMode === "memory") return <PlanningLifecycleClient runtimeMode="memory" />;

  try {
    const authenticatedUser = await resolveProtectedUser(await headers(), authPool);
    return (
      <>
        <ProtectedAccountControls displayName={authenticatedUser.displayName} />
        <PlanningLifecycleClient runtimeMode="db" authenticatedUser={authenticatedUser} />
      </>
    );
  } catch (error) {
    if (error instanceof ProtectedActorError) redirect("/sign-in");
    throw error;
  }
}
