import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AuditEventRecord } from "../src/application/audit-history";
import { presentAuditEvent, type AuditStatePresentation } from "../src/application/audit-history-view";

function event(afterState: unknown): AuditEventRecord {
  return {
    id: 259,
    occurredAt: new Date("2026-08-27T17:00:00.000Z"),
    actorKind: "human",
    actorUserId: "user-1",
    actorDisplayName: "Jaroslav Drobek",
    actorRole: "admin",
    actorPersonId: null,
    action: "planning.working.save",
    objectKind: "planningSet",
    objectRef: "259",
    beforeState: null,
    afterState,
  };
}

function rowsText(state: AuditStatePresentation): string {
  if (state.kind !== "service") throw new Error("service state expected");
  const rows = state.fields.find((field) => field.key === "rows");
  assert.ok(rows);
  return rows.text;
}

const serviceContext = {
  serviceDate: "2026-08-30",
  serviceTime: "10:00",
  language: "czech",
  priest: { displayName: "Priest One" },
  organist: { displayName: "Organist One" },
};

const view = presentAuditEvent(event({
  id: "259",
  status: "working",
  language: "czech",
  serviceContext,
  rows: [
    { song: { number: "345", language: "czech" } },
    { note: "text-only row" },
    { song: { number: "21", language: "czech" }, note: "song row note" },
    {},
  ],
}));

assert.equal(
  rowsText(view.after),
  "rows: 345, t, 21+t, —",
  "rows must use a colon; text-only row must be t; numbered noted row must remain +t",
);

const page = readFileSync("app/admin/audit-history/page.tsx", "utf8");
const css = readFileSync("app/issue-253-audit-history.css", "utf8");

const ruleUses = page.match(/<AuditSectionRule \/>/g) ?? [];
assert.equal(ruleUses.length, 2, "exactly two separators must divide Object / after / before sectors");

const headerIndex = page.indexOf('<p className="audit-event-header">');
const firstRuleIndex = page.indexOf("<AuditSectionRule />");
const afterIndex = page.indexOf('<AuditStateLine label="after"');
const secondRuleIndex = page.indexOf("<AuditSectionRule />", firstRuleIndex + 1);
const beforeIndex = page.indexOf('<AuditStateLine label="before"');

assert.ok(
  headerIndex < firstRuleIndex
    && firstRuleIndex < afterIndex
    && afterIndex < secondRuleIndex
    && secondRuleIndex < beforeIndex,
  "separator order must be Object → rule → after → rule → before",
);

assert.match(
  css,
  /\.audit-section-rule\s*\{[\s\S]*border-top:\s*1px solid #d9e0e8/,
  "separator must be a subtle one-pixel rule",
);
assert.match(
  css,
  /\.audit-section-rule\s*\{[\s\S]*margin:\s*0\.14rem 0 0\.12rem/,
  "separator must include compact vertical breathing room",
);
assert.match(
  css,
  /\.audit-section-rule\s*\{[\s\S]*width:\s*100%/,
  "separator spans the padded audit text width, not the card edges",
);

console.log("Issue 259 Audit History polish acceptance passed.");
