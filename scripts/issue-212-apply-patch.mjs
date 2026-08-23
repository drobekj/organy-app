import { readFileSync, writeFileSync } from "node:fs";

const path = "app/planning-lifecycle-client.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(label, from, to) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label}: source block not found`);
  if (source.indexOf(from, first + 1) >= 0) throw new Error(`${label}: source block is not unique`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce("availability gating", `  const candidateAvailabilityCurrent = selectedCandidateAvailability.key === candidateAvailabilityKey;
  const hasUnavailableCandidates = selectedCandidateRows.some((selected) => {
    if (serviceLanguage !== "mixed" && selected.language !== serviceLanguage) return true;
    return candidateAvailabilityCurrent && selectedCandidateAvailability.byRow[selected.rowId] === "unavailable";
  });
  const hasCandidateAvailabilityError = candidateAvailabilityCurrent && selectedCandidateRows.some((selected) => selectedCandidateAvailability.byRow[selected.rowId] === "error");
  const candidateAvailabilityPending = selectedCandidateRows.length > 0 && !candidateAvailabilityCurrent;
  const hasCandidateAvailabilityBlock = candidateAvailabilityPending || hasUnavailableCandidates || hasCandidateAvailabilityError;
  const rowCandidateUnavailable = (row: EditableRow) => Boolean(row.selectedSong?.songId) && (
    (serviceLanguage !== "mixed" && row.selectedSong!.language !== serviceLanguage)
    || (candidateAvailabilityCurrent && selectedCandidateAvailability.byRow[row.id] === "unavailable")
  );`, `  const candidateAvailabilityCurrent = selectedCandidateAvailability.key === candidateAvailabilityKey;
  const candidateAvailabilityApplies = !isCompletedRecordOpen;
  const hasUnavailableCandidates = candidateAvailabilityApplies && selectedCandidateRows.some((selected) => {
    if (serviceLanguage !== "mixed" && selected.language !== serviceLanguage) return true;
    return candidateAvailabilityCurrent && selectedCandidateAvailability.byRow[selected.rowId] === "unavailable";
  });
  const hasCandidateAvailabilityError = candidateAvailabilityApplies && candidateAvailabilityCurrent && selectedCandidateRows.some((selected) => selectedCandidateAvailability.byRow[selected.rowId] === "error");
  const candidateAvailabilityPending = candidateAvailabilityApplies && selectedCandidateRows.length > 0 && !candidateAvailabilityCurrent;
  const hasCandidateAvailabilityBlock = candidateAvailabilityPending || hasUnavailableCandidates || hasCandidateAvailabilityError;
  const rowCandidateUnavailable = (row: EditableRow) => candidateAvailabilityApplies && Boolean(row.selectedSong?.songId) && (
    (serviceLanguage !== "mixed" && row.selectedSong!.language !== serviceLanguage)
    || (candidateAvailabilityCurrent && selectedCandidateAvailability.byRow[row.id] === "unavailable")
  );`);

replaceOnce("pre-click final people message", `    ...(!organist.trim() ? ["Organist is required."] : []),
    ...(hasAntiphonLanguageMismatch ? ["Selected antiphon must match the service language."] : []),`, `    ...(!organist.trim() ? ["Organist is required."] : []),
    ...(!isCompletedRecordOpen && persistedSet?.status === "working" && !hasConcreteFinalPeople ? ["Choose a concrete active priest and organist before finalization."] : []),
    ...(hasAntiphonLanguageMismatch ? ["Selected antiphon must match the service language."] : []),`);

replaceOnce("skip completed availability refresh", `    if (selectedCandidateRows.length === 0) {`, `    if (!candidateAvailabilityApplies || selectedCandidateRows.length === 0) {`);
replaceOnce("availability effect dependency", `  }, [candidateAvailabilityKey, interactionClient]);`, `  }, [candidateAvailabilityKey, interactionClient, candidateAvailabilityApplies]);`);

const finalizeStart = source.indexOf("  async function finalizeWorkingSet() {");
const finalizeEnd = source.indexOf("\n  async function reopenFinalSet()", finalizeStart);
if (finalizeStart < 0 || finalizeEnd < 0) throw new Error("finalizeWorkingSet block not found");
const finalizeReplacement = `  async function finalizeWorkingSet() {
    if (isCompletedRecordOpen || !persistedSet || persistedSet.status !== "working") return;
    if (!hasConcreteFinalPeople) {
      setServiceError({ code: "invalidInput", message: "Choose a concrete active priest and organist before finalization." });
      setSaveState("errors");
      return;
    }
    if (!hasServiceContext) {
      setServiceError({ code: "invalidInput", message: "Complete the service context before finalization." });
      setSaveState("errors");
      return;
    }
    if (hasInvalidLookupState) {
      setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before finalization." });
      setSaveState("errors");
      return;
    }
    if (hasAntiphonLanguageMismatch) {
      setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." });
      setSaveState("errors");
      return;
    }
    if (hasTopicLanguageMismatch) {
      setServiceError({ code: "invalidInput", message: "Selected topic must match the service language." });
      setSaveState("errors");
      return;
    }
    if (hasCandidateAvailabilityBlock) {
      setServiceError({ code: "invalidInput", message: hasUnavailableCandidates ? "Every candidate must be available." : hasCandidateAvailabilityError ? "Candidate availability could not be checked." : "Candidate availability is being checked." });
      setSaveState("errors");
      return;
    }
    if (hasMelodyCollisions) {
      setServiceError({ code: "invalidInput", message: melodyFinalizationReason ?? "Cannot finalize: the same melody is used more than once." });
      setSaveState("errors");
      return;
    }

    const languageDeviationConfirmation = confirmLanguageDeviationSave(planningRows, serviceLanguage, window.confirm);
    if (languageDeviationConfirmation.cancelled) {
      setServiceError({ code: "invalidInput", message: "Finalization cancelled. Rows " + languageDeviationConfirmation.deviationRows.join(", ") + " do not match the " + serviceLanguage + " service language." });
      setSaveState("errors");
      return;
    }

    const saveResult = await planningLifecycleService.saveWorkingSet({
      role: selectedRole,
      ...({ localActorUserId: activeActor.userId } as Record<string, string>),
      existingSetId: persistedSet.id,
      serviceContext: {
        serviceDate,
        serviceTime: normalizeServiceTime(serviceTime),
        language: serviceLanguage,
        priest: { ...(priestId ? { id: priestId } : {}), displayName: priest },
        organist: { ...(organistId ? { id: organistId } : {}), displayName: organist },
        ...(serviceNote.trim() ? { note: serviceNote.trim() } : {}),
        ...(referenceAntiphon ? { referenceAntiphon: { ...referenceAntiphon } } : {}),
        ...(referenceTopic ? { referenceTopic: { ...referenceTopic } } : {}),
        ...(candidateAntiphonKey.trim() ? { antiphonKey: candidateAntiphonKey.trim() } : {}),
        ...(candidateSeasonKey.trim() ? { liturgicalSeasonKey: candidateSeasonKey.trim() } : {}),
      },
      set: { status: "working", language: serviceLanguage, rows: planningRows },
      allowLanguageDeviations: languageDeviationConfirmation.allowLanguageDeviations || undefined,
    });
    if (!saveResult.success) {
      setServiceError(saveResult.error);
      setSaveState("errors");
      return;
    }

    const result = await planningLifecycleService.finalizeWorkingSet({
      role: selectedRole,
      ...({ localActorUserId: activeActor.userId } as Record<string, string>),
      workingSetId: saveResult.value.id,
    });
    if (!result.success) {
      const peopleIssue = result.error.issues?.some((issue) => issue.path === "priest" || issue.path === "organist");
      setServiceError(peopleIssue ? { code: result.error.code, message: "Choose a concrete active priest and organist before finalization." } : result.error);
      setSaveState("errors");
      return;
    }

    setServiceError(null);
    setLastSavedRecord({ kind: "active", id: result.value.id });
    setSaveState("finalized");
    const refreshed = await refreshDbSets();
    startNewDraftAfterSuccess(refreshed.draftPeopleDefaults);
    setWorkspace(getWorkspaceAfterFinalize());
  }
`;
source = source.slice(0, finalizeStart) + finalizeReplacement + source.slice(finalizeEnd);

replaceOnce("completed availability guard", `    if (hasCandidateAvailabilityBlock) { setServiceError({ code: "invalidInput", message: hasUnavailableCandidates ? "Every candidate must be available." : hasCandidateAvailabilityError ? "Candidate availability could not be checked." : "Candidate availability is being checked." }); setSaveState("errors"); return; }

    const languageDeviationConfirmation`, `    const languageDeviationConfirmation`);

replaceOnce("completed save button", `onClick={saveCompletedChanges} disabled={!hasServiceContext || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock || hasAntiphonLanguageMismatch}`, `onClick={saveCompletedChanges} disabled={!hasServiceContext || hasValidationErrors || hasInvalidLookupState || hasAntiphonLanguageMismatch}`);
replaceOnce("finalize context button", `disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || !hasConcreteFinalPeople || hasValidationErrors`, `disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || !hasConcreteFinalPeople || !hasServiceContext || hasValidationErrors`);

writeFileSync(path, source);
console.log("Issue #212 source patch applied.");
