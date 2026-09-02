"use client";

import {
  DEMO_PRESENTATION_ROLES,
  DEMO_PRESENTATION_ROLE_COPY,
  type DemoPresentationRole,
} from "../src/demo/d4-presentation-role";

export function DemoRoleSimulator({
  role,
  onChange,
}: {
  role: DemoPresentationRole;
  onChange: (role: DemoPresentationRole) => void;
}) {
  return (
    <section className="demo-role-simulator" aria-label="Demo role simulator">
      <div className="demo-role-simulator-heading">
        <strong>Preview role</strong>
        <span>Presentation only · no sign-in or permissions are granted.</span>
      </div>
      <div className="demo-role-options" role="group" aria-label="Preview role">
        {DEMO_PRESENTATION_ROLES.map((candidate) => (
          <button
            type="button"
            key={candidate}
            aria-pressed={candidate === role}
            onClick={() => onChange(candidate)}
          >
            {DEMO_PRESENTATION_ROLE_COPY[candidate].label}
          </button>
        ))}
      </div>
      <p className="demo-role-summary" role="status">
        <strong>{DEMO_PRESENTATION_ROLE_COPY[role].label}:</strong>{" "}
        {DEMO_PRESENTATION_ROLE_COPY[role].summary}
      </p>
    </section>
  );
}
