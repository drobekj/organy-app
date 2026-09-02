import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDE_LANGUAGE_STORAGE_KEY, guideSections, guideUi } from "../app/guide-content";

assert.equal(GUIDE_LANGUAGE_STORAGE_KEY, "organy-guide-language");
assert.deepEqual(
  guideSections.map((section) => section.id),
  ["guide.about", "guide.planning", "guide.plans", "guide.history", "guide.catalog", "guide.development", "guide.guide"],
  "Guide must follow the main navigation order with stable topic IDs",
);
assert.equal(new Set(guideSections.map((section) => section.id)).size, guideSections.length, "Guide topic IDs must be unique");

for (const section of guideSections) {
  for (const language of ["en", "cz"] as const) {
    assert.ok(section.title[language].trim(), `${section.id} must have a ${language} title`);
    assert.ok(section.summary[language].trim(), `${section.id} must have a ${language} summary`);
    assert.ok(section.bullets.every((bullet) => bullet[language].trim()), `${section.id} must have complete ${language} shared copy`);
    if (section.roles) {
      assert.ok(section.roles.priest.every((bullet) => bullet[language].trim()), `${section.id} Priest copy must be complete in ${language}`);
      assert.ok(section.roles.organist.every((bullet) => bullet[language].trim()), `${section.id} Organist copy must be complete in ${language}`);
    }
  }
}

assert.equal(guideUi.title.en, "Practical guide");
assert.equal(guideUi.title.cz, "Praktický průvodce");

const planning = guideSections.find((section) => section.id === "guide.planning");
assert.ok(planning?.roles, "Planning must contain parallel Priest/Organist guidance");
assert.match(planning.roles.priest.map((item) => item.en).join(" "), /finalize/i);
assert.match(planning.roles.organist.map((item) => item.en).join(" "), /Cannot finalize/i);

const catalog = guideSections.find((section) => section.id === "guide.catalog");
assert.ok(catalog?.roles, "Catalog must contain parallel Priest/Organist guidance");
assert.match(catalog.roles.priest.map((item) => item.en).join(" "), /0–3/);
assert.match(catalog.roles.organist.map((item) => item.en).join(" "), /0–2/);
const catalogEnglish = catalog.bullets.map((item) => item.en).join(" ");
const catalogCzech = catalog.bullets.map((item) => item.cz).join(" ");
assert.match(catalogEnglish, /without a protected account/i);
assert.match(catalogEnglish, /no password\/email/i);
assert.match(catalogEnglish, /choose 0 or 1/i);
assert.match(catalogCzech, /bez protected account/i);
assert.match(catalogCzech, /bez hesla\/e-mailu/i);
assert.match(catalogCzech, /0 nebo 1/i);

const component = readFileSync("app/guide-workspace.tsx", "utf8");
assert.match(component, /localStorage\.getItem\(GUIDE_LANGUAGE_STORAGE_KEY\)/);
assert.match(component, /localStorage\.setItem\(GUIDE_LANGUAGE_STORAGE_KEY, next\)/);
assert.match(component, />\s*EN\s*</);
assert.match(component, />\s*CZ\s*</);
assert.match(component, /data-guide-topic=/);
assert.match(component, /guide-role-grid/);

const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
assert.match(client, /const presentationRole = isDemoExperience \? demoPresentationRole : selectedRole/);
assert.match(client, /<GuideWorkspace activeRole=\{presentationRole\} \/>/);

const css = readFileSync("app/workspace-shell.css", "utf8");
assert.match(css, /\.guide-role-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
assert.match(css, /@media \(max-width: 700px\) \{[\s\S]*?\.guide-role-grid \{[\s\S]*?grid-template-columns: 1fr;/);
assert.match(css, /\.workspace-copyright \{[\s\S]*?border-top: 1px solid var\(--border\);[\s\S]*?margin-top: calc\(0\.65rem \+ var\(--workspace-nav-half-button-height\)\);/);

console.log("Issue 375 bilingual role-aware Guide acceptance passed.");
