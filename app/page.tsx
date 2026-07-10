import PlanningLifecycleClient, { type RuntimeMode } from "./planning-lifecycle-client";

export default function Home() {
  const runtimeMode: RuntimeMode = process.env.ORGANY_RUNTIME === "db" ? "db" : "memory";

  return <PlanningLifecycleClient runtimeMode={runtimeMode} />;
}
