import type {
  CompletedServiceRecord,
  PersistedPlanningPlan,
  PlanningPlanId,
} from "../src/application/planning-lifecycle";
import { recordListClassName } from "../src/planning-lifecycle/ui-session";
import {
  formatCompletedRecordSummary,
  formatPlanningSetSummary,
  type PersistedRecordReference,
} from "../src/planning-lifecycle/workspace";

function RecordListSummary({ summary }: { summary: string }) {
  const rowsMarker = " · rows:";
  const rowsIndex = summary.indexOf(rowsMarker);
  if (rowsIndex < 0) return <>{summary}</>;

  return (
    <>
      {summary.slice(0, rowsIndex)}
      <span className="record-summary-rows">{summary.slice(rowsIndex + 3)}</span>
    </>
  );
}

type PlansRecordWorkspaceProps = {
  revisionPlanCount: number;
  workingPlans: PersistedPlanningPlan[];
  finalPlans: PersistedPlanningPlan[];
  openedPlanId?: PlanningPlanId;
  lastSavedRecord: PersistedRecordReference | null;
  onStartNew: () => void | Promise<void>;
  onLoadPlan: (id: PlanningPlanId) => void | Promise<void>;
};

export function PlansRecordWorkspace({
  revisionPlanCount,
  workingPlans,
  finalPlans,
  openedPlanId,
  lastSavedRecord,
  onStartNew,
  onLoadPlan,
}: PlansRecordWorkspaceProps) {
  return (
    <section className="db-workspace" aria-label="Plans">
      {revisionPlanCount > 0 && (
        <p className="error-summary" role="alert">
          {revisionPlanCount} conflicting plan{revisionPlanCount === 1 ? "" : "s"}{" "}
          {revisionPlanCount === 1 ? "requires" : "require"} revision.
        </p>
      )}
      <div className="rows-header">
        <h2>Working plans</h2>
        <button type="button" onClick={onStartNew}>Start new set</button>
      </div>
      {workingPlans.length === 0 ? (
        <p className="field-help">No working plans saved yet.</p>
      ) : (
        <ul className="saved-set-list">
          {workingPlans.map((plan) => (
            <li
              key={plan.id}
              className={recordListClassName(
                openedPlanId === plan.id,
                lastSavedRecord?.kind === "active" && lastSavedRecord.id === plan.id,
              )}
            >
              <button
                type="button"
                className={plan.needsRevision ? "needs-revision-record" : undefined}
                onClick={() => onLoadPlan(plan.id)}
              >
                <RecordListSummary summary={formatPlanningSetSummary(plan)} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2>Final plans</h2>
      {finalPlans.length === 0 ? (
        <p className="field-help">No final plans saved yet.</p>
      ) : (
        <ul className="saved-set-list">
          {finalPlans.map((plan) => (
            <li
              key={plan.id}
              className={recordListClassName(
                openedPlanId === plan.id,
                lastSavedRecord?.kind === "active" && lastSavedRecord.id === plan.id,
              )}
            >
              <button
                type="button"
                className={plan.needsRevision ? "needs-revision-record" : undefined}
                onClick={() => onLoadPlan(plan.id)}
              >
                <RecordListSummary summary={formatPlanningSetSummary(plan)} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type HistoryRecordWorkspaceProps = {
  historyConflictCount: number;
  records: CompletedServiceRecord[];
  openedRecordId?: CompletedServiceRecord["id"];
  lastSavedRecord: PersistedRecordReference | null;
  onLoadRecord: (id: CompletedServiceRecord["id"]) => void | Promise<void>;
};

export function HistoryRecordWorkspace({
  historyConflictCount,
  records,
  openedRecordId,
  lastSavedRecord,
  onLoadRecord,
}: HistoryRecordWorkspaceProps) {
  return (
    <section className="db-workspace" aria-label="Completed history">
      <div><h2>Completed history</h2></div>
      {historyConflictCount > 0 && (
        <p className="error-summary" role="alert">
          {historyConflictCount} completed service{historyConflictCount === 1 ? "" : "s"} conflict
          {historyConflictCount === 1 ? "s" : ""} with active plans.
        </p>
      )}
      {records.length === 0 ? (
        <p className="field-help">No completed service records saved yet.</p>
      ) : (
        <ul className="saved-set-list history-scroll-list">
          {records.map((record) => (
            <li
              key={record.id}
              className={recordListClassName(
                openedRecordId === record.id,
                lastSavedRecord?.kind === "completed" && lastSavedRecord.id === record.id,
              )}
            >
              <button
                type="button"
                className={record.conflictState ? "needs-revision-record" : undefined}
                onClick={() => onLoadRecord(record.id)}
              >
                <RecordListSummary summary={formatCompletedRecordSummary(record)} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
