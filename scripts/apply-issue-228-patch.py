from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}\n--- OLD ---\n{old}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


client = "app/planning-lifecycle-client.tsx"
css = "app/globals.css"
tests = "scripts/issue-224-tests.ts"

# 1) Give the compact preview label a stable, reusable formatter.
replace_once(
    client,
    "\nfunction isFuturePragueDate(serviceDate: string): boolean {",
    """
function formatConflictPreviewPlanLabel(
  impact: CompletedPlanInvalidationPreview[\"newlyImpactedPlans\"][number],
  plans: PersistedPlanningSet[],
): string {
  const plan = plans.find((candidate) => candidate.id === impact.planId);
  const status = impact.planStatus === \"final\" ? \"Final\" : \"Working\";
  return plan ? `${status} ${plan.serviceContext.serviceDate} ${plan.serviceContext.serviceTime}` : `${status} plan`;
}

function isFuturePragueDate(serviceDate: string): boolean {""",
)

# 2) Remove the warning from the page-header / above-Service-Context position.
replace_once(
    client,
    """        {isCompletedRecordOpen && completedInvalidationPreview && completedInvalidationPreview.newlyImpactedPlans.length > 0 && (
          <div className=\"error-summary completed-invalidation-warning\" role=\"alert\">
            <strong>Saving this historical correction will require confirmation because active plans would be invalidated or marked for revision.</strong>
            <ul>{completedInvalidationPreview.newlyImpactedPlans.map((impact) => <li key={impact.planId}>{impact.reason}</li>)}</ul>
          </div>
        )}

""",
    "",
)

# 3) Keep one terse Plans alert only.
replace_once(
    client,
    """            {revisionPlanCount > 0 && <p className=\"error-summary\" role=\"alert\">{revisionPlanCount} conflicting plan{revisionPlanCount === 1 ? \"\" : \"s\"} require revision. Open a red-outlined plan to see the conflicting song field{revisionPlanCount === 1 ? \"\" : \"s\"}.</p>}""",
    """            {revisionPlanCount > 0 && <p className=\"error-summary\" role=\"alert\">{revisionPlanCount} conflicting plan{revisionPlanCount === 1 ? \"\" : \"s\"} {revisionPlanCount === 1 ? \"requires\" : \"require\"} revision.</p>}""",
)

# 4) Put the revision class on the plan button itself so red replaces the normal gray border.
replace_once(
    client,
    """            {activeRecordGroups.working.length === 0 ? <p className=\"field-help\">No working plans saved yet.</p> : <ul className=\"saved-set-list\">{activeRecordGroups.working.map((set) => <li key={set.id} className={`${recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === \"active\" && lastSavedRecord.id === set.id)}${set.needsRevision ? \" needs-revision-record\" : \"\"}`}><button type=\"button\" onClick={() => loadDbSet(set.id)}>{formatPlanningSetSummary(set)}</button>{set.needsRevision && <p className=\"needs-revision-message\" role=\"alert\">{set.needsRevision.reason}</p>}</li>)}</ul>}""",
    """            {activeRecordGroups.working.length === 0 ? <p className=\"field-help\">No working plans saved yet.</p> : <ul className=\"saved-set-list\">{activeRecordGroups.working.map((set) => <li key={set.id} className={recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === \"active\" && lastSavedRecord.id === set.id)}><button type=\"button\" className={set.needsRevision ? \"needs-revision-record\" : undefined} onClick={() => loadDbSet(set.id)}>{formatPlanningSetSummary(set)}</button></li>)}</ul>}""",
)
replace_once(
    client,
    """            {activeRecordGroups.final.length === 0 ? <p className=\"field-help\">No final plans saved yet.</p> : <ul className=\"saved-set-list\">{activeRecordGroups.final.map((set) => <li key={set.id} className={`${recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === \"active\" && lastSavedRecord.id === set.id)}${set.needsRevision ? \" needs-revision-record\" : \"\"}`}><button type=\"button\" onClick={() => loadDbSet(set.id)}>{formatPlanningSetSummary(set)}</button>{set.needsRevision && <p className=\"needs-revision-message\" role=\"alert\">{set.needsRevision.reason}</p>}</li>)}</ul>}""",
    """            {activeRecordGroups.final.length === 0 ? <p className=\"field-help\">No final plans saved yet.</p> : <ul className=\"saved-set-list\">{activeRecordGroups.final.map((set) => <li key={set.id} className={recordListClassName(persistedSet?.id === set.id, lastSavedRecord?.kind === \"active\" && lastSavedRecord.id === set.id)}><button type=\"button\" className={set.needsRevision ? \"needs-revision-record\" : undefined} onClick={() => loadDbSet(set.id)}>{formatPlanningSetSummary(set)}</button></li>)}</ul>}""",
)

# 5) Render the compact Completed warning in the normal Planning alert slot immediately above actions.
replace_once(
    client,
    """          <div className=\"form-actions\">""",
    """          {isCompletedRecordOpen && completedInvalidationPreview && completedInvalidationPreview.newlyImpactedPlans.length > 0 && (
            <p className=\"error-summary completed-invalidation-warning\" role=\"alert\">
              Historical correction conflicts with {completedInvalidationPreview.newlyImpactedPlans.length} active plan{completedInvalidationPreview.newlyImpactedPlans.length === 1 ? \"\" : \"s\"}: {completedInvalidationPreview.newlyImpactedPlans.map((impact) => formatConflictPreviewPlanLabel(impact, savedDbSets)).join(\", \")}.
            </p>
          )}

          <div className=\"form-actions\">""",
)

# 6) CSS: replace the existing gray plan-button border, not wrap it; keep inner song control gray.
replace_once(
    css,
    """.needs-revision-record {
  border: 2px solid var(--danger);
  border-radius: 0.85rem;
  padding: 0.35rem;
}
.needs-revision-record > button {
  outline: none;
}
.needs-revision-message {
  color: var(--danger);
  font-size: 0.875rem;
  font-weight: 700;
  margin: 0.35rem 0.5rem 0.25rem;
}
""",
    """.saved-set-list button.needs-revision-record {
  border-color: var(--danger);
}
""",
)
replace_once(
    css,
    """.needs-revision-row .candidate-combobox > input {
  border-color: var(--danger);
  color: #98a2b3;
}

.completed-invalidation-warning ul {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
}
""",
    """.needs-revision-row .candidate-combobox > input {
  border-color: var(--border);
  color: #98a2b3;
}
""",
)

# 7) Extend existing Issue #224 acceptance so this Production delta cannot regress.
replace_once(
    tests,
    """  assert.match(cssSource, /\\.needs-revision-row\\s*\\{[\\s\\S]*?border:\\s*2px solid var\\(--danger\\)/);
  assert.match(cssSource, /\\.history-scroll-list\\s*\\{[\\s\\S]*?overflow-y:\\s*auto/);

  const pool = new Pool({ connectionString: databaseUrl });""",
    """  assert.match(cssSource, /\\.needs-revision-row\\s*\\{[\\s\\S]*?border:\\s*2px solid var\\(--danger\\)/);
  assert.match(cssSource, /\\.history-scroll-list\\s*\\{[\\s\\S]*?overflow-y:\\s*auto/);

  const previewWarningIndex = clientSource.indexOf('className=\"error-summary completed-invalidation-warning\"');
  const serviceContextIndex = clientSource.indexOf('<legend>Service context</legend>');
  const formActionsIndex = clientSource.indexOf('<div className=\"form-actions\">');
  assert.ok(previewWarningIndex > serviceContextIndex && previewWarningIndex < formActionsIndex, "Completed conflict warning must render in the Planning alert slot above form actions");
  assert.match(clientSource, /Historical correction conflicts with/, "Completed conflict warning must use terse copy");
  assert.doesNotMatch(clientSource, /Open a red-outlined plan/, "Plans alert must not contain verbose navigation copy");
  assert.doesNotMatch(clientSource, /needs-revision-message/, "per-plan revision explanation must be removed");
  assert.match(clientSource, /className=\\{set\\.needsRevision \\? \"needs-revision-record\" : undefined\\}/, "revision styling must be applied to the existing plan button");
  assert.match(cssSource, /\\.saved-set-list button\\.needs-revision-record\\s*\\{[\\s\\S]*?border-color:\\s*var\\(--danger\\)/, "conflicting plan must replace the normal gray button border with red");
  const rowInputRule = cssSource.match(/\\.needs-revision-row \\.candidate-combobox > input\\s*\\{([\\s\\S]*?)\\}/)?.[1] ?? "";
  assert.match(rowInputRule, /border-color:\\s*var\\(--border\\)/, "inner conflicting-song control must keep the normal gray border");
  assert.doesNotMatch(rowInputRule, /border-color:\\s*var\\(--danger\\)/, "inner conflicting-song control must not receive the red row border");
  assert.match(rowInputRule, /color:\\s*#98a2b3/, "conflicting song text must remain muted");

  const pool = new Pool({ connectionString: databaseUrl });""",
)

print("Issue 228 patch applied cleanly")
