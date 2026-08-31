import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWhatsAppUrlForPhone, normalizeWhatsAppPhone } from "../src/planning-lifecycle/whatsapp-phone";

assert.equal(normalizeWhatsAppPhone("777 123 456"), "+420777123456");
assert.equal(normalizeWhatsAppPhone("+420 777 123 456"), "+420777123456");
assert.equal(normalizeWhatsAppPhone("00421 901 234 567"), "+421901234567");
assert.equal(normalizeWhatsAppPhone("421901234567"), "+421901234567");
assert.throws(() => normalizeWhatsAppPhone("123"), /international|country code|8 to 15/i);

const generic = "https://wa.me/?text=Final%20plan";
const addressed = buildWhatsAppUrlForPhone(generic, "+420777123456");
assert.equal(addressed, "https://wa.me/420777123456?text=Final%20plan");
assert.throws(() => buildWhatsAppUrlForPhone("https://example.test/?text=Final", "+420777123456"), /wa\.me/);

const migration = readFileSync("drizzle/0021_protected_whatsapp_phone.sql", "utf8");
assert.match(migration, /ADD COLUMN "whatsapp_phone_e164" text/);
assert.match(migration, /\^\\\+\[1-9\]\[0-9\]\{7,14\}\$/);

const page = readFileSync("app/page.tsx", "utf8");
assert.match(page, /PostgresProtectedWhatsAppPhoneService/);
assert.match(page, /getByAppUserId\(authenticatedUser\.id\)/);
assert.match(page, /<ProtectedAccountWhatsApp initialPhoneE164=\{whatsappPhone\.phoneE164\} roles=\{authenticatedUser\.roles\} \/>/);

const component = readFileSync("app/protected-account-whatsapp.tsx", "utf8");
assert.match(component, /roles\.includes\("priest"\) \|\| roles\.includes\("admin"\)/);
assert.match(component, /\.post-finalize-dialog a\[href\^="https:\/\/wa\.me\/"\]/);
assert.match(component, /if \(phoneE164\) \{[\s\S]*?window\.open\(buildWhatsAppUrlForPhone\(baseUrl, phoneE164\)/);
assert.match(component, />Open once<\/button>/);
assert.match(component, />\{pending \? "Saving…" : "Save & Open WhatsApp"\}<\/button>/);
assert.match(component, />Phone setting<\/button>/);
assert.match(component, /changePassword\.before\(slot\)/, "Phone setting is inserted immediately before Change Password");
assert.match(component, />Forget phone<\/button>/);
assert.match(component, /method: "DELETE"/);
assert.match(component, /method: "PUT"/);
assert.doesNotMatch(component, /774\s*880\s*971/);

const selfRoute = readFileSync("app/api/protected-account-whatsapp-phone/route.ts", "utf8");
assert.match(selfRoute, /getSelf\(request\.headers\)/);
assert.match(selfRoute, /setSelf\(request\.headers, body\.phone\)/);
assert.match(selfRoute, /removeSelf\(request\.headers\)/);

const service = readFileSync("src/application/protected-account-whatsapp-phone.ts", "utf8");
assert.match(service, /role === "admin" \|\| role === "priest"/);
assert.match(service, /update app_users set whatsapp_phone_e164 = \$2/);
assert.match(service, /update app_users set whatsapp_phone_e164 = null/);
assert.match(service, /removeAsAdmin/);

const adminEditor = readFileSync("app/admin/accounts/protected-account-editor.tsx", "utf8");
assert.match(adminEditor, /WhatsApp phone:/);
assert.match(adminEditor, />Remove WhatsApp phone<\/ConfirmSubmitButton>/);
assert.match(adminEditor, /Only the account owner can add or change this phone\. Admin can remove it/);
assert.doesNotMatch(adminEditor, /name="whatsappPhone/);

const adminRoute = readFileSync("app/api/protected-account-whatsapp-phone/admin-remove/route.ts", "utf8");
assert.match(adminRoute, /removeAsAdmin\(request\.headers, form\.get\("appUserId"\)\)/);

console.log("Issue 365 per-protected-account WhatsApp phone coverage passed.");
