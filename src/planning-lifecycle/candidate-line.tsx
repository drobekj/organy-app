import type { ChangeEvent } from "react";
import type { CandidateQueryResult } from "../application/interaction-contracts";
import { getSelectedSongPresentation } from "./candidate-flow";

type CandidateLineProps =
  | { candidate: CandidateQueryResult; variant: "popup"; onSelect: () => void }
  | { candidate: CandidateQueryResult; variant: "selected"; note: string; readOnly?: boolean; detailButtonId?: string; onOpenDetail: () => void; onNoteChange?: (note: string) => void };

type CandidateNumberOption = {
  songId: string;
  number: string;
  language?: CandidateQueryResult["language"];
  repertoire: boolean;
  primary: boolean;
};

export type CandidateLineViewModel = {
  candidate: CandidateQueryResult;
  numberOptions: CandidateNumberOption[];
  tone: "positive" | "neutral" | "negative";
  backgroundClass: string;
  contentTextClass: string;
  accessibleMeaning: string;
  availabilityReason?: string;
};

export function getCandidateLineViewModel(candidate: CandidateQueryResult): CandidateLineViewModel {
  const numberOptions: CandidateNumberOption[] = [
    { songId: candidate.songId, number: candidate.number, language: candidate.language, repertoire: candidate.repertoire, primary: true },
    ...candidate.equivalentNumbers.map((item) => ({ ...item, language: referenceLanguageFromSongId(item.songId), primary: false })),
  ].sort((a, b) => `${a.primary ? 0 : a.repertoire ? 1 : 2}:${a.number}`.localeCompare(`${b.primary ? 0 : b.repertoire ? 1 : 2}:${b.number}`));
  const tone: CandidateLineViewModel["tone"] = candidate.suppressedByMelodyWindow || candidate.antiphonMatch ? "negative" : candidate.seasonMatch ? "positive" : "neutral";
  const backgroundClass = `candidate-tone-${tone} candidate-preference-${candidate.preferenceShade}`;
  const contentTextClass = `candidate-content-text candidate-text-${tone}`;
  const optionMeaning = numberOptions.map((item) => `${item.primary ? "primary" : "equivalent"} ${item.number}${item.language ? ` ${item.language}` : ""}; ${item.repertoire ? "in organist repertoire" : "not in organist repertoire"}`).join("; ");
  const availabilityReason = candidate.availability.kind === "occupiedByCurrentRows"
    ? `Same melody is already used in ${joinLabels(candidate.availability.rows.map((row) => row.label))}.`
    : undefined;
  const accessibleMeaning = `${tone === "positive" ? "green positive" : tone === "negative" ? "red negative" : "neutral"} candidate; ${optionMeaning}${availabilityReason ? `; unavailable: ${availabilityReason}` : ""}`;
  return { candidate, numberOptions, tone, backgroundClass, contentTextClass, accessibleMeaning, availabilityReason };
}

export function CandidateLine(props: CandidateLineProps) {
  const viewModel = getCandidateLineViewModel(props.candidate);
  if (props.variant === "popup") {
    return (
      <div className={`candidate-card candidate-card-compact ${viewModel.backgroundClass}`} data-candidate-line="popup" aria-label={viewModel.accessibleMeaning}>
        <button type="button" disabled={Boolean(viewModel.availabilityReason)} aria-disabled={Boolean(viewModel.availabilityReason)} onClick={() => { if (!viewModel.availabilityReason) props.onSelect(); }}><span className={viewModel.contentTextClass}><CandidateSummary viewModel={viewModel} /><span>{props.candidate.title} · {props.candidate.language} · {props.candidate.signal}</span></span></button>
        {viewModel.availabilityReason && <span className="field-help" role="status">{viewModel.availabilityReason}</span>}
      </div>
    );
  }

  const presentation = getSelectedSongPresentation(props.candidate, props.note);
  const candidateLine = presentation.lines[0];
  const noteLine = presentation.lines[1];
  return (
    <div className={`selected-song-card ${viewModel.backgroundClass}`} data-candidate-line="selected" aria-label={viewModel.accessibleMeaning}>
      <div className="selected-song-summary" data-content-row="candidate">
        <span className={viewModel.contentTextClass}><CandidateSummary viewModel={viewModel} />
        <span>{candidateLine.title || "Untitled snapshot"} · {candidateLine.language} · {candidateLine.signal}</span></span>
        <button id={props.detailButtonId} type="button" className="candidate-detail-button" onClick={props.onOpenDetail}>Detail</button>
      </div>
      <div className="selected-song-note-row" data-content-row="note">
        {props.readOnly ? <span>{noteLine.text.trim() ? noteLine.text : "No text note."}</span> : <input aria-label="Text note" type="text" value={noteLine.text} onChange={(event: ChangeEvent<HTMLInputElement>) => props.onNoteChange?.(event.target.value)} placeholder="Optional note without a song" />}
      </div>
    </div>
  );
}

function CandidateSummary({ viewModel }: { viewModel: CandidateLineViewModel }) {
  return (
    <span className="candidate-number-options">
      {viewModel.numberOptions.map((item) => (
        <span key={item.songId} className={item.primary ? "candidate-number-primary" : "candidate-number-equivalent"}>
          {!item.primary && <span>equivalent </span>}
          {item.primary ? <strong className="sticky-song-number">{item.number}</strong> : item.repertoire ? <strong>{item.number}</strong> : <span>{item.number}</span>}
          <span> · {item.language ? `${item.language} · ` : ""}{item.repertoire ? "in repertoire" : "not in repertoire"}</span>
        </span>
      ))}
    </span>
  );
}

function referenceLanguageFromSongId(songId: string): CandidateQueryResult["language"] | undefined {
  if (songId.startsWith("czech:")) return "czech";
  if (songId.startsWith("polish:")) return "polish";
  return undefined;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "another row";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}
