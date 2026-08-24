import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync("app/planning-lifecycle-client.tsx", "utf8");

assert(source.includes("const candidateAvailabilityApplies = !isCompletedRecordOpen;"), "Completed records must bypass planning candidate availability.");
assert(source.includes("if (!candidateAvailabilityApplies || selectedCandidateRows.length === 0)"), "Completed records must skip availability refreshes.");
assert(source.includes("const rowCandidateUnavailable = (row: EditableRow) => candidateAvailabilityApplies &&"), "Completed rows must not be rendered unavailable by planning filters.");
assert(source.includes("Choose a concrete active priest and organist before finalization."), "Finalization must expose one concise people prerequisite.");
assert(source.includes('persistedSet?.status === "working" && !hasConcreteFinalPeople ? ["Choose a concrete active priest and organist before finalization."]'), "The concrete-person prerequisite must be visible before Finalize is clicked.");

const finalizeStart = source.indexOf("  async function finalizeWorkingSet() {");
const finalizeEnd = source.indexOf("\n  async function reopenFinalSet()", finalizeStart);
assert(finalizeStart >= 0 && finalizeEnd > finalizeStart, "finalizeWorkingSet handler not found.");
const finalizeBody = source.slice(finalizeStart, finalizeEnd);
const saveIndex = finalizeBody.indexOf("planningLifecycleService.saveWorkingSet({");
const finalizeIndex = finalizeBody.indexOf("planningLifecycleService.finalizeWorkingSet({");
assert(saveIndex >= 0, "Finalize must persist the current editor state first.");
assert(finalizeIndex > saveIndex, "Finalize must occur only after the current editor state is persisted.");
assert(finalizeBody.includes("existingSetId: persistedSet.id"), "Finalize pre-save must update the opened Working set.");
assert(finalizeBody.includes("workingSetId: saveResult.value.id"), "Finalize must target the freshly saved Working set.");
assert(finalizeBody.includes("priest: { ...(priestId ? { id: priestId } : {}), displayName: priest }"), "Finalize pre-save must use the current priest selection.");
assert(finalizeBody.includes("organist: { ...(organistId ? { id: organistId } : {}), displayName: organist }"), "Finalize pre-save must use the current organist selection.");

const completedStart = source.indexOf("  async function saveCompletedChanges() {");
const completedEnd = source.indexOf("\n  async function deleteCompletedRecord()", completedStart);
assert(completedStart >= 0 && completedEnd > completedStart, "saveCompletedChanges handler not found.");
const completedBody = source.slice(completedStart, completedEnd);
assert(!completedBody.includes("hasCandidateAvailabilityBlock"), "Completed save must not be blocked by planning availability.");
assert(!completedBody.includes("Every candidate must be available."), "Completed save must not emit planning availability errors.");
assert(!completedBody.includes("hasValidationErrors"), "Historical-truth Completed save must not depend on Planning row validation.");
assert(source.includes('onClick={saveCompletedChanges} disabled={!hasServiceContext || hasInvalidLookupState || hasAntiphonLanguageMismatch}'), "Completed save button must bypass Planning availability and row validation.");

console.log("Issue #212 acceptance regression checks passed.");
