"use client";

import type { ChangeEvent } from "react";
import type { CongregationPreferenceAdminLanguage } from "../../../src/application/congregation-preference-admin";

export function PreferenceLanguageFilter({ language }: { language: CongregationPreferenceAdminLanguage }) {
  function changeLanguage(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value === "polish" ? "polish" : "czech";
    window.location.assign(`/admin/preferences?language=${next}`);
  }

  return (
    <fieldset className="melody-protection-panel preference-language-panel" aria-label="Language">
      <legend>Language</legend>
      <label className="melody-protection-control">
        <span className="sr-only">Preference language</span>
        <select aria-label="Preference language" value={language} onChange={changeLanguage}>
          <option value="czech">czech</option>
          <option value="polish">polish</option>
        </select>
      </label>
    </fieldset>
  );
}
