import { DEMO_CAPABILITIES } from "../src/application/demo-safety";
import { DEMO_D1_FIXTURE } from "../src/demo/d1-fixture";

export function DemoD1Shell() {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-label="Demo safety shell">
        <p><strong>Demo mode</strong></p>
        <h1>{DEMO_D1_FIXTURE.title}</h1>
        <p>Stage D1 safety shell. This public runtime uses only synthetic in-memory data.</p>
        <dl>
          <div><dt>Data backend</dt><dd>memory</dd></div>
          <div><dt>Experience</dt><dd>demo</dd></div>
          <div><dt>Persistent writes</dt><dd>{DEMO_CAPABILITIES.persistentPlanningWrites ? "enabled" : "denied"}</dd></div>
          <div><dt>Protected Production API</dt><dd>{DEMO_CAPABILITIES.protectedProductionApiAccess ? "enabled" : "denied"}</dd></div>
          <div><dt>Fixture people</dt><dd>{DEMO_D1_FIXTURE.people.length}</dd></div>
          <div><dt>Fixture plans</dt><dd>{DEMO_D1_FIXTURE.plans.length}</dd></div>
        </dl>
        <p>Interactive Planning and Catalog demo features are intentionally not part of Stage D1.</p>
      </section>
    </main>
  );
}
