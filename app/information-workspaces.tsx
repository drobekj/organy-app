export function AboutWorkspace() {
  return (
    <section className="information-workspace" aria-labelledby="about-workspace-title">
      <div className="information-copy">
        <h2 id="about-workspace-title">Organ Planner</h2>
        <p>
          Organ Planner supports church-service music planning, shared repertoire knowledge, and coordination
          between the priest and organist.
        </p>
        <p>
          Reusable musical knowledge stays in the application; final liturgical decisions remain with people.
        </p>
      </div>
      <div className="information-links" aria-label="Project links">
        <a href="https://github.com/drobekj/organy-app" target="_blank" rel="noopener noreferrer">
          GitHub repository
        </a>
        <a href="https://drobek-portfolio.vercel.app" target="_blank" rel="noopener noreferrer">
          DrSoft portfolio
        </a>
      </div>
    </section>
  );
}

export function GuideWorkspaceEntry() {
  return (
    <section className="information-workspace" aria-labelledby="guide-workspace-title">
      <div className="information-copy">
        <h2 id="guide-workspace-title">Practical guide</h2>
        <p>
          The role-aware EN/CZ guide will be built here in the next approved stage. This entry is already
          placed at the stable end of the main navigation.
        </p>
      </div>
    </section>
  );
}
