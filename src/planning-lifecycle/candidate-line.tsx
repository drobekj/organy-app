import type { ChangeEvent } from "react";
import type { CandidateQueryResult } from "../application/interaction-contracts";
import { getSelectedSongPresentation } from "./candidate-flow";

type CandidateLineProps =
  | { candidate: CandidateQueryResult; variant: "popup"; onSelect: () => void }
  | { candidate: CandidateQueryResult; variant: "selected"; note: string; readOnly?: boolean; onOpenDetail: () => void; onNoteChange?: (note: string) => void };

export function CandidateLine(props: CandidateLineProps) {
  if (props.variant === "popup") {
    return (
      <div className="candidate-card candidate-card-compact" data-candidate-line="popup">
        <button type="button" onClick={props.onSelect}><CandidateSummary candidate={props.candidate} /></button>
      </div>
    );
  }

  const presentation = getSelectedSongPresentation(props.candidate, props.note);
  const candidateLine = presentation.lines[0];
  const noteLine = presentation.lines[1];
  return (
    <div className="selected-song-card" data-candidate-line="selected">
      <div className="selected-song-summary" data-content-row="candidate">
        <strong className="sticky-song-number">{candidateLine.number}</strong>
        <span>{candidateLine.title || "Untitled snapshot"} · {candidateLine.language} · {candidateLine.signal} · preference {candidateLine.preferenceShade}{candidateLine.repertoire ? " · repertoire" : ""}</span>
        <button type="button" className="candidate-detail-button" onClick={props.onOpenDetail}>Detail</button>
      </div>
      <div className="selected-song-note-row" data-content-row="note">
        {props.readOnly ? <span>{noteLine.text.trim() ? noteLine.text : "No text note."}</span> : <input aria-label="Text note" type="text" value={noteLine.text} onChange={(event: ChangeEvent<HTMLInputElement>) => props.onNoteChange?.(event.target.value)} placeholder="Optional note without a song" />}
      </div>
    </div>
  );
}

function CandidateSummary({ candidate }: { candidate: CandidateQueryResult }) {
  return <><strong className="sticky-song-number">{candidate.number}</strong><span>{candidate.title} · {candidate.language} · {candidate.signal} · preference {candidate.preferenceShade}{candidate.repertoire ? " · repertoire" : ""}</span></>;
}
