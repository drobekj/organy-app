import { normalizeServiceTime } from "./service-time";
import type { CompletedServiceRecord, CompletedServiceRecordId, PlanningSetId } from "../application/planning-lifecycle/ports";
import type { PlanningRole } from "./model";

export type PersistedRecordReference =
  | { kind: "active"; id: PlanningSetId }
  | { kind: "completed"; id: CompletedServiceRecordId };

export type DraftPeopleDefaults = Pick<CompletedServiceRecord["serviceContext"], "priest" | "organist">;

export function getNewestCompletedRecord(records: CompletedServiceRecord[]): CompletedServiceRecord | undefined {
  return [...records].sort((a, b) => {
    const serviceDate = b.serviceContext.serviceDate.localeCompare(a.serviceContext.serviceDate);
    if (serviceDate !== 0) return serviceDate;
    const serviceTime = normalizeServiceTime(b.serviceContext.serviceTime).localeCompare(normalizeServiceTime(a.serviceContext.serviceTime));
    if (serviceTime !== 0) return serviceTime;
    const completedAt = new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
    if (completedAt !== 0) return completedAt;
    return compareRecordIds(b.id, a.id);
  })[0];
}

export function getDraftPeopleDefaults(records: CompletedServiceRecord[]): DraftPeopleDefaults {
  const newest = getNewestCompletedRecord(records);
  return {
    priest: newest?.serviceContext.priest ?? { displayName: "" },
    organist: newest?.serviceContext.organist ?? { displayName: "" },
  };
}

export function canMutatePlanningEditor(input: {
  isFinalSetOpen: boolean;
  isCompletedRecordOpen: boolean;
  isCompletedAdminEditMode: boolean;
  selectedRole: PlanningRole;
}): boolean {
  if (input.isFinalSetOpen) return false;
  if (!input.isCompletedRecordOpen) return true;
  return input.isCompletedAdminEditMode && input.selectedRole === "admin";
}

export function recordListClassName(isOpen: boolean, isLastSaved: boolean): string | undefined {
  if (isOpen) return "selected-record";
  if (isLastSaved) return "last-saved-record";
  return undefined;
}

function compareRecordIds(left: string, right: string): number {
  const leftNumber = Number.parseInt(left.replace(/\D/g, ""), 10);
  const rightNumber = Number.parseInt(right.replace(/\D/g, ""), 10);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}
