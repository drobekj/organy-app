import type { ChangeEvent } from "react";
import type { CandidateQueryResult } from "../application/interaction-contracts";
import { getSelectedSongPresentation } from "./candidate-flow";

type CandidateLineProps =
  | { candidate: CandidateQueryResult; variant: "popup"; onSelect: () => void }
  | { candidate: CandidateQueryResult; variant: "selected"; note: string; readOnly?: boolean; onOpenDetail: () => void; onNoteChange?: (note: string) => void };

export type CandidateLineViewModel = {
  candidate: CandidateQueryResult;
  numberOptions: { songId: string; number: string; repertoire: boolean; primary: boolean }[];
  tone: "positive" | "neutral" | "negative";
  backgroundClass: string;
  accessibleMeaning: string;
};

export function getCandidateLineViewModel(candidate: CandidateQueryResult): CandidateLineViewModel {
  const numberOptions = [
    { songId: candidate.songId, number: candidate.number, repertoire: candidate.repertoire, primary: true },
    ...candidate.equivalentNumbers.map((item) => ({ ...item, primary: false })),
  ].sort((a, b) => `${a.repertoire ? 0 : 1}:${a.primary ? 0 : 1}:${a.number}`.localeCompare(`${b.repertoire ? 0 : 1}:${b.primary ? 0 : 1}:${b.number}`));
  const tone: CandidateLineViewModel["tone"] = candidate.suppressedByMelodyWindow ? "negative" : candidate.signal !== "none" || candidate.repertoire || candidate.aggregatePreferenceScore > 0 ? "positive" : "neutral";
  const backgroundClass = `candidate-tone-${tone} candidate-preference-${candidate.preferenceShade}`;
  const accessibleMeaning = `${tone === "positive" ? "green positive" : tone === "negative" ? "red negative" : "neutral"} candidate; preference ${candidate.preferenceShade}; ${candidate.repertoire ? "in organist repertoire" : "not in organist repertoire"}`;
  return { candidate, numberOptions, tone, backgroundClass, accessibleMeaning };
}

export function CandidateLine(props: CandidateLineProps) {
  const viewModel = getCandidateLineViewModel(props.candidate);
  if (props.variant === "popup") {
    return (
      <div className={`candidate-card candidate-card-compact ${viewModel.backgroundClass}`} data-candidate-line="popup" aria-label={viewModel.accessibleMeaning}>
        <button type="button" onClick={props.onSelect}><CandidateSummary viewModel={viewModel} /><span>{props.candidate.title} · {props.candidate.language} · {props.candidate.signal} · preference {props.candidate.preferenceShade}</span></button>
      </div>
    );
  }

  const presentation = getSelectedSongPresentation(props.candidate, props.note);
  const candidateLine = presentation.lines[0];
  const noteLine = presentation.lines[1];
  return (
    <div className={`selected-song-card ${viewModel.backgroundClass}`} data-candidate-line="selected" aria-label={viewModel.accessibleMeaning}>
      <div className="selected-song-summary" data-content-row="candidate">
        <CandidateSummary viewModel={viewModel} />
        <span>{candidateLine.title || "Untitled snapshot"} · {candidateLine.language} · {candidateLine.signal} · preference {candidateLine.preferenceShade}</span>
        <button type="button" className="candidate-detail-button" onClick={props.onOpenDetail}>Detail</button>
      </div>
      <div className="selected-song-note-row" data-content-row="note">
        {props.readOnly ? <span>{noteLine.text.trim() ? noteLine.text : "No text note."}</span> : <input aria-label="Text note" type="text" value={noteLine.text} onChange={(event: ChangeEvent<HTMLInputElement>) => props.onNoteChange?.(event.target.value)} placeholder="Optional note without a song" />}
      </div>
    </div>
  );
}

function CandidateSummary({ viewModel }: { viewModel: CandidateLineViewModel }) {
  return <span className="candidate-number-options">{viewModel.numberOptions.map((item) => item.repertoire ? <strong key={item.songId} className="sticky-song-number">{item.number}</strong> : <span key={item.songId}>{item.number}</span>)}</span>;
}
