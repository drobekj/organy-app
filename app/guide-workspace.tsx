"use client";

import { useEffect, useState } from "react";
import type { PlanningRole } from "../src/planning-lifecycle";
import {
  GUIDE_HINTS_CHANGED_EVENT,
  GUIDE_HINTS_STORAGE_KEY,
  GUIDE_LANGUAGE_CHANGED_EVENT,
  GUIDE_LANGUAGE_STORAGE_KEY,
  guideSections,
  guideUi,
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

export function GuideWorkspace({ activeRole }: { activeRole: PlanningRole }) {
  const [language, setLanguage] = useState<GuideLanguage>("en");
  const [hintsEnabled, setHintsEnabled] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(GUIDE_LANGUAGE_STORAGE_KEY);
    if (stored === "en" || stored === "cz") setLanguage(stored);
    setHintsEnabled(window.localStorage.getItem(GUIDE_HINTS_STORAGE_KEY) === "on");
  }, []);

  function selectLanguage(next: GuideLanguage) {
    setLanguage(next);
    window.localStorage.setItem(GUIDE_LANGUAGE_STORAGE_KEY, next);
    window.dispatchEvent(new Event(GUIDE_LANGUAGE_CHANGED_EVENT));
  }

  function selectHints(enabled: boolean) {
    setHintsEnabled(enabled);
    window.localStorage.setItem(GUIDE_HINTS_STORAGE_KEY, enabled ? "on" : "off");
    window.dispatchEvent(new Event(GUIDE_HINTS_CHANGED_EVENT));
  }

  return (
    <section className="guide-workspace" aria-labelledby="guide-workspace-title">
      <header className="guide-header">
        <div>
          <h2 id="guide-workspace-title">{text(guideUi.title, language)}</h2>
          <p>{text(guideUi.intro, language)}</p>
        </div>
        <div className="guide-controls">
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
          <div className="guide-language" role="group" aria-label={language === "cz" ? "Našeptávač Guide" : "Guide hints"}>
            <span>{language === "cz" ? "Našeptávač" : "Guide hints"}</span>
            <button
              type="button"
              className={!hintsEnabled ? "active-workspace" : undefined}
              aria-pressed={!hintsEnabled}
              onClick={() => selectHints(false)}
            >
              {language === "cz" ? "Vyp" : "Off"}
            </button>
            <button
              type="button"
              className={hintsEnabled ? "active-workspace" : undefined}
              aria-pressed={hintsEnabled}
              onClick={() => selectHints(true)}
            >
              {language === "cz" ? "Zap" : "On"}
            </button>
          </div>
        </div>
      </header>

      <div className="guide-sections">
        {guideSections.map((section) => (
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

            {section.roles && (
              <div className="guide-role-grid">
                {(["priest", "organist"] as const).map((role) => {
                  const isCurrent = activeRole === role;
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
                        {section.roles![role].map((bullet, index) => <li key={index}>{text(bullet, language)}</li>)}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
