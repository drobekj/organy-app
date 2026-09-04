import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const productionPage = readFileSync("app/congregation-preferences/page.tsx", "utf8");
const proxy = readFileSync("proxy.ts", "utf8");
const demoPage = readFileSync("app/demo-congregation-preferences/page.tsx", "utf8");
const demoWorkspace = readFileSync("app/demo-congregation-preferences/demo-congregation-preference-workspace.tsx", "utf8");

assert.match(productionPage, /PostgresCongregationPreferenceService/);
assert.match(productionPage, /process\.env\.ORGANY_RUNTIME !== "db"/);
assert.match(productionPage, /action="\/api\/congregation-preferences" method="post"/);
assert.doesNotMatch(productionPage, /PresbyterDemo|demo-congregation-preferences/);

assert.match(proxy, /ORGANY_EXPERIENCE !== "demo"/);
assert.match(proxy, /destination\.pathname = "\/demo-congregation-preferences"/);
assert.match(proxy, /matcher: "\/congregation-preferences"/);

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
