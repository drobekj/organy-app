import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeWhatsAppPhone } from "../src/application/whatsapp-phone";
import { buildFinalPlanWhatsAppUrl } from "../src/planning-lifecycle/whatsapp-finalization";
import type { PersistedPlanningSet } from "../src/application/planning-lifecycle/ports";

assert.equal(normalizeWhatsAppPhone("774 880 971"), "+420774880971");
assert.equal(normalizeWhatsAppPhone("+421 905 123 456"), "+421905123456");
assert.equal(normalizeWhatsAppPhone("00420 601 234 567"), "+420601234567");
assert.throws(() => normalizeWhatsAppPhone("12345"), /international|9-digit Czech/);
assert.throws(() => normalizeWhatsAppPhone(""), /required/);

const plan: PersistedPlanningSet = {
  id: "whatsapp-phone-plan",
  status: "final",
  language: "czech",
  serviceContext: {
    serviceDate: "2026-09-06",
    serviceTime: "10:00",
    language: "czech",
    priest: { id: "priest-1", displayName: "Priest" },
    organist: { id: "organist-1", displayName: "Organist" },
  },
  rows: [],
};
const url = buildFinalPlanWhatsAppUrl(plan, "+420774880971");
assert.match(url, /^https:\/\/wa\.me\/420774880971\?text=/);
assert.doesNotMatch(url, /wa\.me\/\?text=/);

const handoff = readFileSync("app/post-finalize-whatsapp-handoff.tsx", "utf8");
assert.match(handoff, /GET[\s\S]*\/api\/account\/whatsapp-phone/);
assert.match(handoff, /PUT[\s\S]*\/api\/account\/whatsapp-phone/);
assert.match(handoff, /Save this number to my protected Account and use it automatically next time/);
assert.match(handoff, /useState\(false\).*rememberPhone|rememberPhone.*useState\(false\)/s);
assert.match(handoff, /User → Phone Setting/);
assert.match(handoff, /buildFinalPlanWhatsAppUrl\(plan, phone\)/);
assert.match(handoff, /Open WhatsApp/);

const setting = readFileSync("app/protected-whatsapp-phone-setting.tsx", "utf8");
assert.match(setting, />Phone Setting<\/button>/);
assert.match(setting, /method: "PUT"/);
assert.match(setting, /method: "DELETE"/);
assert.match(setting, /Forget Phone/);
assert.match(setting, /if \(!phone \|\| !canOwnWhatsAppPhone\(roles\)\) return null/);

const controls = readFileSync("app/protected-account-controls.tsx", "utf8");
const phoneSettingIndex = controls.indexOf("<ProtectedWhatsAppPhoneSetting");
const passwordIndex = controls.indexOf(">Change Password</button>");
assert.ok(phoneSettingIndex >= 0 && passwordIndex > phoneSettingIndex, "Phone Setting must sit directly before Change Password");

const editor = readFileSync("app/admin/accounts/protected-account-editor.tsx", "utf8");
assert.match(editor, /WhatsApp phone:/);
assert.match(editor, /name="action" value="removeWhatsappPhone"/);
assert.match(editor, /Only the account owner can add or change this phone/);
assert.doesNotMatch(editor, /name="whatsappPhone"/);

const ownApi = readFileSync("app/api/account/whatsapp-phone/route.ts", "utf8");
assert.match(ownApi, /resolveProtectedUser/);
assert.match(ownApi, /body\.phone/);
assert.doesNotMatch(ownApi, /appUserId/);

const adminApi = readFileSync("app/api/protected-accounts/route.ts", "utf8");
assert.match(adminApi, /action === "removeWhatsappPhone"/);
assert.doesNotMatch(adminApi, /action === "setWhatsappPhone"/);

const schema = readFileSync("src/db/schema/index.ts", "utf8");
assert.match(schema, /whatsappPhoneE164: text\("whatsapp_phone_e164"\)/);
assert.match(schema, /whatsappPhoneConfirmedAt: timestamp\("whatsapp_phone_confirmed_at"/);
const migration = readFileSync("drizzle/0021_protected_whatsapp_phone.sql", "utf8");
assert.match(migration, /protected_account_whatsapp_phone_state_valid/);
assert.match(migration, /\^\\\+\[1-9\]\[0-9\]\{7,14\}\$/);

const service = readFileSync("src/application/protected-whatsapp-phone.ts", "utf8");
assert.match(service, /beforeState: \{ configured:/);
assert.match(service, /afterState: \{ configured:/);
assert.doesNotMatch(service, /beforeState: \{[^}]*phoneE164/);
assert.doesNotMatch(service, /afterState: \{[^}]*phoneE164/);

const combined = [handoff, setting, controls, editor, ownApi, adminApi, service].join("\n");
assert.ok(!combined.includes("774880971"), "The historical fixed test number must not be embedded in application UI or API code.");

console.log("Protected Account WhatsApp phone acceptance passed.");
