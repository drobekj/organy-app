import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/congregation-preferences/page.tsx", "utf8");
const standard = readFileSync("app/congregation-preferences/standard-page.tsx", "utf8");
const demoPage = readFileSync("app/congregation-preferences/demo-page.tsx", "utf8");
const demoWorkspace = readFileSync("app/congregation-preferences/demo-congregation-preference-workspace.tsx", "utf8");

assert.match(route, /resolveApplicationExperience\(\) === "demo"/);
assert.match(route, /StandardCongregationPreferencesPage/);
assert.match(standard, /PostgresCongregationPreferenceService/);
assert.match(standard, /process\.env\.ORGANY_RUNTIME !== "db"/);

assert.match(demoPage, /REFERENCE_DEMO_NICKNAME = "PresbyterDemo"/);
assert.match(demoPage, /method="get"/);
assert.match(demoPage, /name="demo" value="1"/);
assert.match(demoPage, /Reference Demo only/);
assert.match(demoPage, /Changes are presentation-only/);
assert.doesNotMatch(demoPage, /DATABASE_URL|PostgresCongregationPreferenceService|\/api\/congregation-preferences/);

assert.match(demoWorkspace, /useState<Record<string, 0 \| 1>>/);
assert.match(demoWorkspace, /togglePreference/);
assert.doesNotMatch(demoWorkspace, /fetch\s*\(|\/api\/congregation-preferences|DATABASE_URL/);

console.log("Issue 433 Demo congregation reference voter acceptance PASS");
