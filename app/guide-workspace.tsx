"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { PlanningRole } from "../src/planning-lifecycle";
import {
  GUIDE_LANGUAGE_CHANGED_EVENT,
  GUIDE_LANGUAGE_STORAGE_KEY,
  guideAccountContext,
  guideEnvironmentCopy,
  guideSections,
  guideUi,
  type GuideExperience,
  type GuideLanguage,
  type GuideRole,
  type LocalizedText,
} from "./guide-content";

function text(value: LocalizedText, language: GuideLanguage): string {
  return value[language];
}

function roleLabel(role: GuideRole, language: GuideLanguage): string {
  return text(guideUi[role], language);
}

export function GuideWorkspace({ activeRole, experience, demoRolePanel }: { activeRole: PlanningRole; experience: GuideExperience; demoRolePanel?: ReactNode }) {
  const [language, setLanguage] = useState<GuideLanguage>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(GUIDE_LANGUAGE_STORAGE_KEY);
    if (stored === "en" || stored === "cz") setLanguage(stored);
  }, []);

  function selectLanguage(next: GuideLanguage) {
    setLanguage(next);
    window.localStorage.setItem(GUIDE_LANGUAGE_STORAGE_KEY, next);
    window.dispatchEvent(new Event(GUIDE_LANGUAGE_CHANGED_EVENT));
  }

  const visibleSections = experience === "demo"
    ? guideSections.filter((section) => !section.standardOnly)
    : guideSections;

  return (
    <section className="guide-workspace" aria-labelledby="guide-workspace-title">
      <header className="guide-header">
        <div>
          <h2 id="guide-workspace-title">{text(guideUi.title, language)}</h2>
          <p>{text(guideUi.intro, language)}</p>
          <p className="guide-environment">
            <strong>{text(guideUi.environment, language)} · {text(guideUi[experience], language)}:</strong>{" "}
            {text(guideEnvironmentCopy[experience], language)}
          </p>
        </div>
        <div className="guide-language" role="group" aria-label={text(guideUi.language, language)}>
          <span>{text(guideUi.language, language)}</span>
          <button
            type="button"
            className={language === "en" ? "active-workspace" : undefined}
            aria-pressed={language === "en"}
            onClick={() => selectLanguage("en")}
          >
            EN
          </button>
          <button
            type="button"
            className={language === "cz" ? "active-workspace" : undefined}
            aria-pressed={language === "cz"}
            onClick={() => selectLanguage("cz")}
          >
            CZ
          </button>
        </div>
      </header>

      {experience === "demo" ? (
        demoRolePanel
      ) : (
        <section className="demo-role-simulator guide-account-context" aria-label={text(guideAccountContext.title, language)}>
          <div className="demo-role-simulator-heading">
            <strong>{text(guideAccountContext.title, language)}</strong>
            <span>{text(guideAccountContext.summary, language)}</span>
          </div>
          <ul className="guide-context-list">
            {guideAccountContext.bullets.map((bullet, index) => <li key={index}>{text(bullet, language)}</li>)}
          </ul>
        </section>
      )}

      <div className="guide-sections">
        {visibleSections.map((section) => {
          const experienceBullets = section.experience?.[experience] ?? [];
          const sectionRoles = (["admin", "priest", "organist"] as const)
            .filter((role) => (section.roles?.[role]?.length ?? 0) > 0);

          return (
            <section
              key={section.id}
              id={section.id.replaceAll(".", "-")}
              data-guide-topic={section.id}
              className="guide-section"
              aria-labelledby={`${section.id.replaceAll(".", "-")}-title`}
            >
              <h3 id={`${section.id.replaceAll(".", "-")}-title`}>{text(section.title, language)}</h3>
              <p className="guide-summary">{text(section.summary, language)}</p>

              <div className="guide-shared">
                <strong>{text(guideUi.shared, language)}</strong>
                <ul>
                  {section.bullets.map((bullet, index) => <li key={index}>{text(bullet, language)}</li>)}
                </ul>
              </div>

              {experienceBullets.length > 0 && (
                <div className="guide-experience">
                  <strong>{text(guideUi[experience], language)}</strong>
                  <ul>
                    {experienceBullets.map((bullet, index) => <li key={index}>{text(bullet, language)}</li>)}
                  </ul>
                </div>
              )}

              {sectionRoles.length > 0 && (
                <div className="guide-role-grid">
                  {sectionRoles.map((role) => {
                    const isCurrent = activeRole === role;
                    const bullets = section.roles?.[role] ?? [];
                    return (
                      <section
                        key={role}
                        className={`guide-role-card${isCurrent ? " guide-role-current" : ""}`}
                        aria-label={roleLabel(role, language)}
                      >
                        <h4>
                          {roleLabel(role, language)}
                          {isCurrent && <span className="guide-current-role"> · {text(guideUi.currentRole, language)}</span>}
                        </h4>
                        <ul>
                          {bullets.map((bullet, index) => <li key={index}>{text(bullet, language)}</li>)}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
