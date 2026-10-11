import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { formatPlanExportText } from "../src/planning-lifecycle/plan-export";

const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const preview = readFileSync("app/plan-export-preview.tsx", "utf8");
const guide = readFileSync("app/guide-content.ts", "utf8");
const guideHints = readFileSync("app/guide-control-hints.ts", "utf8");
const controls = readFileSync("app/protected-account-controls.tsx", "utf8");
const adminEditor = readFileSync("app/admin/accounts/protected-account-editor.tsx", "utf8");
const adminRoute = readFileSync("app/api/protected-accounts/route.ts", "utf8");
const schema = readFileSync("src/db/schema/index.ts", "utf8");
const migration = readFileSync("drizzle/0021_protected_whatsapp_phone.sql", "utf8");

const workingText = formatPlanExportText({
  status: "working",
  serviceContext: {
    serviceDate: "2026-10-18",
    serviceTime: "09:00",
    language: "mixed",
    priest: { displayName: "Priest" },
    organist: { displayName: "Organist" },
    note: "Coordination note",
    referenceAntiphon: { id: "a", displayNumber: "7", title: "Antiphon" },
    referenceTopic: { id: "t", title: "Topic" },
  },
  rows: [
    { song: { number: "123", language: "czech", title: "Song A" }, note: "Entrance" },
    { note: "Choir" },
  ],
});
assert.equal(
  workingText,
  [
    "Working plan",
    "Date: 2026-10-18",
    "Time: 09:00",
    "Language: mixed",
    "Priest: Priest",
    "Organist: Organist",
    "Antiphon: 7 Antiphon",
    "Topic: Topic",
    "Note: Coordination note",
    "",
    "Songs:",
    "1. 123 Song A — Entrance",
    "2. — — Choir",
  ].join("\n"),
);

assert.match(planning, /function currentWorkingExportPlan\(\): PlanExportSource/);
for (const currentField of ["serviceDate", "serviceTime: normalizeServiceTime(serviceTime)", "language: serviceLanguage", "displayName: priest", "displayName: organist", "serviceNote.trim()", "referenceAntiphon", "referenceTopic", "rows: planningRows"]) {
  assert.ok(planning.includes(currentField), `Working export must use current editor state: ${currentField}`);
}
assert.equal((planning.match(/>\s*Export preview\s*<\/button>/g) ?? []).length, 2, "Working and Final action rows each need Export preview");
assert.match(planning, /Delete saved plan[\s\S]*?Export preview/);
assert.match(planning, /Delete Saved Plan[\s\S]*?Export preview/);
assert.match(planning, /setExportPreviewPlan\(result\.value\)/);
assert.match(planning, /<PlanExportPreview[\s\S]*?plan=\{exportPreviewPlan\}/);

assert.match(preview, /<pre className="plan-export-text">\{text\}<\/pre>/);
assert.match(preview, /<rect x="8" y="8" width="11" height="11" rx="2\.25" \/>/);
assert.match(preview, /<rect x="5" y="5" width="11" height="11" rx="2\.25" \/>/);
assert.match(preview, /navigator\.clipboard\?\.writeText/);
assert.match(preview, /Copy failed/);
assert.match(preview, /Copied/);
assert.match(preview, /event\.key === "Escape"/);
assert.match(preview, /event\.target === event\.currentTarget/);

assert.match(guideHints, /"planning\.lifecycle\.export"/);
assert.match(guide, /Export preview is available for Working and Final plans/);
assert.doesNotMatch(guide, /WhatsApp|Phone Setting/);
assert.doesNotMatch(controls, /WhatsApp|Phone Setting/);
assert.doesNotMatch(adminEditor, /WhatsApp|whatsappPhone|removeWhatsappPhone/);
assert.doesNotMatch(adminRoute, /removeWhatsappPhone|WhatsApp phone/);

for (const retired of [
  "app/post-finalize-whatsapp-handoff.tsx",
  "app/protected-whatsapp-phone-setting.tsx",
  "app/api/account/whatsapp-phone/route.ts",
  "src/planning-lifecycle/whatsapp-finalization.ts",
  "src/application/whatsapp-phone.ts",
  "src/application/protected-whatsapp-phone.ts",
]) {
  assert.equal(existsSync(retired), false, `Retired product-facing WhatsApp file must stay absent: ${retired}`);
}

assert.match(schema, /whatsappPhoneE164: text\("whatsapp_phone_e164"\)/);
assert.match(schema, /protected_account_whatsapp_phone_state_valid/);
assert.match(migration, /whatsapp_phone_e164/);
assert.match(migration, /protected_account_whatsapp_phone_state_valid/);

console.log("Issue #464 channel-neutral plan Export preview acceptance: PASS");
