import { GuidePanelHelpButton } from "./guide-panel-help-button";

export function AboutWorkspace() {
  return (
    <section className="information-workspace" aria-labelledby="about-workspace-title" data-guide-hint-scope="about.links">
      <GuidePanelHelpButton scope="about.links" label="About help" />
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
        <a data-guide-hint="about.github" href="https://github.com/drobekj/organy-app" target="_blank" rel="noopener noreferrer">
          GitHub repository
        </a>
        <a data-guide-hint="about.portfolio" href="https://drobek-portfolio.vercel.app" target="_blank" rel="noopener noreferrer">
          DrSoft portfolio
        </a>
      </div>
    </section>
  );
}
