import type { AuditEventRecord } from "../application/audit-history";
import type { PlanningRole } from "../planning-lifecycle/model";

export type DemoAccountRow = {
  id: string;
  username: string;
  displayName: string;
  active: boolean;
  roles: PlanningRole[];
  linkedPerson?: string;
};

export const DEMO_D5_ACCOUNTS: readonly DemoAccountRow[] = Object.freeze([
  {
    id: "demo-account-admin",
    username: "demo.admin",
    displayName: "Demo Administrator",
    active: true,
    roles: ["admin"],
  },
  {
    id: "demo-account-priest",
    username: "demo.priest",
    displayName: "Demo Priest",
    active: true,
    roles: ["priest"],
    linkedPerson: "Demo Priest",
  },
  {
    id: "demo-account-organist",
    username: "demo.organist",
    displayName: "Demo Organist",
    active: true,
    roles: ["organist"],
    linkedPerson: "Demo Organist",
  },
  {
    id: "demo-account-multi",
    username: "demo.staff",
    displayName: "Jan Dvořák",
    active: true,
    roles: ["priest", "organist"],
    linkedPerson: "Jan Dvořák",
  },
]);

const completedService = {
  serviceContext: {
    serviceDate: "2026-08-30",
    serviceTime: "10:00",
    language: "czech",
    priest: { id: "demo-priest", displayName: "Demo Priest" },
    organist: { id: "demo-organist", displayName: "Demo Organist" },
    melodyProtectionMonths: 2,
    note: "Synthetic Sunday service.",
  },
  set: {
    status: "final",
    language: "czech",
    rows: [
      { song: { songId: "demo-cz-101", language: "czech", number: "101", title: "Demo Czech Song" } },
      { song: { songId: "demo-cz-530", language: "czech", number: "530", title: "Demo Closing Song" } },
    ],
  },
  sourceFinalSetId: "demo-final-source-audit",
  completedAt: "2026-08-30T10:45:00+02:00",
};

const workingBefore = {
  id: "demo-working-audit",
  status: "working",
  language: "czech",
  serviceContext: {
    serviceDate: "2026-09-13",
    serviceTime: "10:00",
    language: "czech",
    priest: { id: "demo-priest", displayName: "Demo Priest" },
    organist: { id: "demo-organist", displayName: "Demo Organist" },
    melodyProtectionMonths: 2,
    note: "Initial synthetic note.",
  },
  rows: [
    { song: { songId: "demo-cz-205", language: "czech", number: "205", title: "Demo Entrance Song" } },
  ],
};

const workingAfter = {
  ...workingBefore,
  serviceContext: {
    ...workingBefore.serviceContext,
    note: "Updated synthetic note.",
  },
  rows: [
    ...workingBefore.rows,
    { song: { songId: "demo-cz-420", language: "czech", number: "420", title: "Demo Communion Song" } },
  ],
};

export const DEMO_D5_AUDIT_EVENTS: readonly AuditEventRecord[] = Object.freeze([
  {
    id: 1004,
    occurredAt: new Date("2026-09-01T09:15:00+02:00"),
    actorKind: "human",
    actorUserId: "demo-priest-user",
    actorDisplayName: "Demo Priest",
    actorRole: "priest",
    actorPersonId: "demo-priest",
    action: "planning.working.save",
    objectKind: "planningSet",
    objectRef: "demo-working-audit",
    beforeState: workingBefore,
    afterState: workingAfter,
  },
  {
    id: 1003,
    occurredAt: new Date("2026-08-30T10:45:00+02:00"),
    actorKind: "human",
    actorUserId: "demo-priest-user",
    actorDisplayName: "Demo Priest",
    actorRole: "priest",
    actorPersonId: "demo-priest",
    action: "planning.final.complete",
    objectKind: "completedServiceRecord",
    objectRef: "demo-completed-1",
    beforeState: null,
    afterState: completedService,
  },
  {
    id: 1002,
    occurredAt: new Date("2026-08-29T18:20:00+02:00"),
    actorKind: "human",
    actorUserId: "demo-admin-audit-actor",
    actorDisplayName: "Demo Administrator",
    actorRole: "admin",
    actorPersonId: null,
    action: "account.role.update",
    objectKind: "protectedAccount",
    objectRef: "demo.account",
    beforeState: { roles: ["organist"] },
    afterState: { roles: ["priest", "organist"] },
  },
  {
    id: 1001,
    occurredAt: new Date("2026-08-01T03:00:00+02:00"),
    actorKind: "system",
    actorUserId: null,
    actorDisplayName: null,
    actorRole: null,
    actorPersonId: null,
    action: "maintenance.auditRetention.success",
    objectKind: "maintenance",
    objectRef: "demo-retention-run",
    beforeState: null,
    afterState: { retainedFrom: "2026-07-05", result: "success" },
  },
]);
