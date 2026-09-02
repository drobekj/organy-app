import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDE_LANGUAGE_STORAGE_KEY, guideAccountContext, guideEnvironmentCopy, guideSections, guideUi } from "../app/guide-content";

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
    for (const role of ["admin", "priest", "organist"] as const) {
      const bullets = section.roles?.[role] ?? [];
      assert.ok(bullets.every((bullet) => bullet[language].trim()), `${section.id} ${role} copy must be complete in ${language}`);
    }
    for (const experience of ["standard", "demo"] as const) {
      const bullets = section.experience?.[experience] ?? [];
      assert.ok(bullets.every((bullet) => bullet[language].trim()), `${section.id} ${experience} copy must be complete in ${language}`);
    }
  }
}

assert.equal(guideUi.title.en, "Practical guide");
assert.equal(guideUi.title.cz, "Praktický průvodce");
assert.match(guideEnvironmentCopy.standard.en, /protected signed-in session/i);
assert.match(guideEnvironmentCopy.demo.en, /synthetic in-memory data/i);
assert.match(guideEnvironmentCopy.demo.en, /Preview role/i);
assert.match(guideEnvironmentCopy.demo.en, /Reset Demo/i);
assert.equal(guideAccountContext.title.en, "User & Role");
assert.match(guideAccountContext.summary.en, /top-right corner/i);
assert.match(guideAccountContext.bullets.map((item) => item.en).join(" "), /Sign Role/);
assert.match(guideAccountContext.bullets.map((item) => item.en).join(" "), /Manage Accounts/);

const planning = guideSections.find((section) => section.id === "guide.planning");
assert.ok(planning?.roles, "Planning must contain role-aware guidance");
assert.match((planning.roles.admin ?? []).map((item) => item.en).join(" "), /session override/i);
assert.match((planning.roles.priest ?? []).map((item) => item.en).join(" "), /finalize/i);
assert.match((planning.roles.priest ?? []).map((item) => item.en).join(" "), /Anonymous Organist/i);
assert.match((planning.roles.organist ?? []).map((item) => item.en).join(" "), /Cannot finalize/i);
assert.match((planning.roles.organist ?? []).map((item) => item.en).join(" "), /default is 2 months/i);

const catalog = guideSections.find((section) => section.id === "guide.catalog");
assert.ok(catalog?.roles, "Catalog must contain role-aware guidance");
assert.match((catalog.roles.priest ?? []).map((item) => item.en).join(" "), /0–3/);
assert.match((catalog.roles.organist ?? []).map((item) => item.en).join(" "), /0–2/);
const catalogProductionEnglish = (catalog.experience?.standard ?? []).map((item) => item.en).join(" ");
const catalogProductionCzech = (catalog.experience?.standard ?? []).map((item) => item.cz).join(" ");
assert.match(catalogProductionEnglish, /without a protected account/i);
assert.match(catalogProductionEnglish, /unverified nickname/i);
assert.match(catalogProductionEnglish, /0 or 1/i);
assert.match(catalogProductionCzech, /bez protected account/i);
assert.match(catalogProductionCzech, /neověřenou přezdívkou/i);
assert.match(catalogProductionCzech, /0 nebo 1/i);
assert.match((catalog.experience?.demo ?? []).map((item) => item.en).join(" "), /read-only/i);

const development = guideSections.find((section) => section.id === "guide.development");
assert.equal(development?.standardOnly, true, "Development Guide section must be hidden from Demo.");

const component = readFileSync("app/guide-workspace.tsx", "utf8");
assert.match(component, /localStorage\.getItem\(GUIDE_LANGUAGE_STORAGE_KEY\)/);
assert.match(component, /localStorage\.setItem\(GUIDE_LANGUAGE_STORAGE_KEY, next\)/);
assert.match(component, />\s*EN\s*</);
assert.match(component, />\s*CZ\s*</);
assert.match(component, /data-guide-topic=/);
assert.match(component, /guide-role-grid/);
assert.match(component, /\["admin", "priest", "organist"\]/);
assert.match(component, /experience === "demo"[\s\S]*?!section\.standardOnly/);

const client = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
assert.match(client, /const presentationRole = isDemoExperience \? demoPresentationRole : selectedRole/);
assert.match(client, /<GuideWorkspace[\s\S]*?activeRole=\{presentationRole\}[\s\S]*?experience=\{isDemoExperience \? "demo" : "standard"\}[\s\S]*?demoRolePanel=/);

const css = readFileSync("app/workspace-shell.css", "utf8");
assert.match(css, /\.guide-role-grid \{[\s\S]*?grid-template-columns: repeat\(auto-fit, minmax\(14rem, 1fr\)\);/);
assert.match(css, /@media \(max-width: 700px\) \{[\s\S]*?\.guide-role-grid \{[\s\S]*?grid-template-columns: 1fr;/);
assert.match(css, /\.workspace-copyright \{[\s\S]*?border-top: 1px solid var\(--border\);[\s\S]*?margin-top: calc\(0\.65rem \+ var\(--workspace-nav-half-button-height\)\);/);

console.log("Issue 375 bilingual role-aware Guide evolved acceptance passed.");
