import PlanningLifecycleClient, { type RuntimeMode } from "./planning-lifecycle-client";
import StaffAuthGate from "./staff-auth-gate";

export default function Home() {
  const runtimeMode: RuntimeMode = process.env.ORGANY_RUNTIME === "db" ? "db" : "memory";
  return runtimeMode === "db" ? <StaffAuthGate /> : <PlanningLifecycleClient runtimeMode="memory" />;
}
