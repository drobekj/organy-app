import PlanningLifecycleClient from "./planning-lifecycle-client";

/**
 * D1 established the isolated public memory+demo runtime.
 * D2 keeps that same shell boundary and mounts the read-only Planning experience inside it.
 */
export function DemoD1Shell() {
  return <PlanningLifecycleClient runtimeMode="memory" experience="demo" />;
}
