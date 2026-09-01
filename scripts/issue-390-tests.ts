import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findCompletedPlanConflicts } from "../src/application/completed-plan-conflict-preview";

const migration = readFileSync("drizzle/0022_organist_melody_protection.sql", "utf8");
const schema = readFileSync("src/db/schema/index.ts", "utf8");
const panel = readFileSync("app/non-repetition-period-panel.tsx", "utf8");
const planning = readFileSync("app/planning-lifecycle-client.tsx", "utf8");
const interactionRoute = readFileSync("app/api/interaction/route.ts", "utf8");
const planningRoute = readFileSync("app/api/planning-lifecycle/route.ts", "utf8");
const candidates = readFileSync("src/application/reference-candidate-service.ts", "utf8");
const adapters = readFileSync("src/application/planning-lifecycle/drizzle-repository-adapters.ts", "utf8");

assert.match(migration, /catalog_persons"[\s\S]*melody_protection_months"[\s\S]*DEFAULT 2 NOT NULL/);
assert.match(migration, /service_contexts"[\s\S]*melody_protection_months"[\s\S]*DEFAULT 2 NOT NULL/);
assert.match(migration, /UPDATE "service_contexts"[\s\S]*SET "melody_protection_months" = 0[\s\S]*WHERE "organist_id" IS NULL/);
assert.match(schema, /melodyProtectionMonths: integer\("melody_protection_months"\)\.notNull\(\)\.default\(2\)/);

assert.match(panel, /actor\.role !== "priest" && actor\.role !== "organist"/);
assert.match(panel, /disabled=\{actor\.role === "priest" && months < minimumMonths\}/);
assert.match(panel, /setOwnMelodyProtection/);
assert.match(panel, /getOwnMelodyProtection/);
assert.match(panel, /getOrganistMelodyProtection/);
assert.doesNotMatch(panel, /actor\.role === "admin"/);

assert.match(planning, /selectedRole === "priest" \|\| selectedRole === "organist"/);
assert.match(planning, /const \[melodyProtectionMonths, setMelodyProtectionMonths\] = useState\(0\)/);
assert.match(planning, /setMelodyProtectionMonths\(0\)/);
assert.match(planning, /melodyProtectionMonths,/);
assert.match(planning, /melodyProtectionMonths: input\.melodyProtectionMonths|melodyProtectionMonths/);
assert.match(planning, /disabled=\{selectedRole === "priest" && isEditorLocked\}/);

assert.match(interactionRoute, /melodyProtectionMonths/);
assert.match(candidates, /const effectiveMonths = Math\.max\(minimumMonths, requestedMonths\)/);
assert.match(candidates, /select melody_protection_months from catalog_persons/);
assert.doesNotMatch(candidates, /select months from melody_non_repetition_config/);

assert.match(planningRoute, /validateAndNormalizeMelodyProtectionContext/);
assert.match(planningRoute, /months < minimum/);
assert.match(planningRoute, /Selected Organist is not available/);
assert.match(adapters, /melodyProtectionMonths: context\.melodyProtectionMonths \?\? 2/);
assert.match(adapters, /melodyProtectionMonths: Number\(context\.melodyProtectionMonths \?\? 2\)/);

const melodyClasses = {
  async getClassMemberships(songIds: string[]) {
    return songIds.map((songId) => ({ songId, melodyClassId: songId === "current" || songId === "historic" ? "class-1" : songId }));
  },
};

const completed = [{
  id: "completed-1",
  sourceFinalSetId: "old",
  serviceContext: {
    serviceDate: "2026-01-01",
    serviceTime: "10:00",
    language: "czech" as const,
    priest: { displayName: "P" },
    organist: { displayName: "O" },
    melodyProtectionMonths: 2,
  },
  set: { status: "final" as const, language: "czech" as const, rows: [{ song: { songId: "historic", number: "1", language: "czech" as const } }] },
  completedAt: new Date("2026-01-01T10:00:00Z"),
}];

const basePlan = {
  status: "working" as const,
  language: "czech" as const,
  rows: [{ song: { songId: "current", number: "2", language: "czech" as const } }],
  serviceContext: {
    serviceDate: "2026-04-01",
    serviceTime: "10:00",
    language: "czech" as const,
    priest: { displayName: "P" },
    organist: { displayName: "O" },
  },
};

const shortPlan = { ...basePlan, id: "short", serviceContext: { ...basePlan.serviceContext, melodyProtectionMonths: 2 } };
const longPlan = { ...basePlan, id: "long", serviceContext: { ...basePlan.serviceContext, melodyProtectionMonths: 4 } };
const impacts = await findCompletedPlanConflicts([shortPlan, longPlan], completed, melodyClasses, 12);
assert.equal(impacts.some((impact) => impact.planId === "short"), false, "Two-month plan must not inherit a global 12-month window.");
assert.equal(impacts.some((impact) => impact.planId === "long"), true, "Four-month plan must use its own persisted window.");

console.log("Issue 390 Organist-owned Melody Protection acceptance passed.");
