import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import type { CandidateMelodyMember, CandidateQueryResult } from "../application/interaction-contracts";
import type { ServiceLanguage } from "./model";

export type MelodyClassDetailMode = "candidate" | "selected";

export type MelodyClassDetailProps = {
  mode: MelodyClassDetailMode;
  rowLabel: string;
  candidate: CandidateQueryResult;
  serviceLanguage: ServiceLanguage;
  currentSongId?: string;
  eligibilityCandidates: CandidateQueryResult[];
  loading: boolean;
  error?: string;
  onBack?: () => void;
  onClose: () => void;
  onRetry: () => void;
  onShowCandidate?: (songId: string) => void;
  onReplace?: (candidate: CandidateQueryResult) => void;
};

export function isMemberLanguageAllowed(language: CandidateMelodyMember["language"], serviceLanguage: ServiceLanguage): boolean {
  return serviceLanguage === "mixed" || language === serviceLanguage;
}

export function melodyMembersForDetail(candidate: CandidateQueryResult): { authoritative: boolean; members: CandidateMelodyMember[] } {
  const authoritative = Boolean(candidate.melodyClassId && candidate.melodyMembers?.length);
  const source = authoritative
    ? candidate.melodyMembers!
    : [{
        songId: candidate.songId,
        language: candidate.language,
        number: candidate.number,
        title: candidate.title,
        repertoire: candidate.repertoire,
        aggregatePreferenceScore: candidate.aggregatePreferenceScore,
        ...(candidate.sheetMusicUrl ? { sheetMusicUrl: candidate.sheetMusicUrl } : {}),
      }];
  const opened = source.find((member) => member.songId === candidate.songId);
  const remainder = source
    .filter((member) => member.songId !== candidate.songId)
    .sort((left, right) => `${languageRank(left.language)}:${numberKey(left.number)}:${left.songId}`.localeCompare(`${languageRank(right.language)}:${numberKey(right.number)}:${right.songId}`));
  return { authoritative, members: opened ? [opened, ...remainder] : remainder };
}

export function replacementCandidateForMember(memberSongId: string, eligibilityCandidates: CandidateQueryResult[]): CandidateQueryResult | undefined {
  return eligibilityCandidates.find((candidate) => candidate.songId === memberSongId);
}

export function candidateAvailabilityReason(candidate: CandidateQueryResult | undefined): string | undefined {
  return candidate?.availability.kind === "occupiedByCurrentRows"
    ? `Same melody is already used in ${joinLabels(candidate.availability.rows.map((row) => row.label))}.`
    : undefined;
}

export function MelodyClassDetail(props: MelodyClassDetailProps) {
  const regionRef = useRef<HTMLElement>(null);
  const { authoritative, members } = useMemo(() => melodyMembersForDetail(props.candidate), [props.candidate]);
  const classHasRepertoire = members.some((member) => member.repertoire);

  useEffect(() => {
    regionRef.current?.focus();
  }, [props.mode, props.candidate.songId]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (props.mode === "candidate" && props.onBack) props.onBack();
    else props.onClose();
  }

  return (
    <section
      ref={regionRef}
      className="melody-detail"
      role="region"
      tabIndex={-1}
      aria-label={`Melody detail for ${props.candidate.number} ${props.candidate.title} in ${props.rowLabel}`}
      onKeyDown={handleKeyDown}
    >
      <div className="melody-detail-header">
        <div>
          <h3>{props.candidate.number} · {props.candidate.title}</h3>
          <p className="field-help">Complete melody-class context</p>
        </div>
        {props.mode === "candidate" && props.onBack
          ? <button type="button" onClick={props.onBack}>Back to candidates</button>
          : <button type="button" onClick={props.onClose}>Close</button>}
      </div>

      {!authoritative && (
        <p className="candidate-list-state" role="status">Authoritative melody-class information is not available for this saved song.</p>
      )}
      {props.loading && <p className="candidate-list-state" role="status">{props.mode === "selected" ? "Checking available replacements…" : "Checking candidate availability…"}</p>}
      {props.error && (
        <div className="candidate-list-state candidate-list-error" role="alert">
          <p>{props.error}</p>
          <div className="candidate-list-actions">
            <button type="button" onClick={props.onRetry}>Retry</button>
            <button type="button" onClick={props.onClose}>Close</button>
          </div>
        </div>
      )}

      <ul className="melody-member-list">
        {members.map((member) => {
          const eligibility = replacementCandidateForMember(member.songId, props.eligibilityCandidates);
          const languageAllowed = isMemberLanguageAllowed(member.language, props.serviceLanguage);
          const occupancyReason = candidateAvailabilityReason(eligibility);
          const isOpened = member.songId === props.candidate.songId;
          const isCurrent = Boolean(props.currentSongId && member.songId === props.currentSongId);
          const selectable = Boolean(languageAllowed && eligibility && eligibility.availability.kind === "available");
          const canShow = props.mode === "candidate" && !isOpened && Boolean(eligibility) && Boolean(props.onShowCandidate);
          const canReplace = props.mode === "selected" && !isCurrent && selectable && Boolean(props.onReplace);
          const unavailableReason = !languageAllowed
            ? `Not selectable in a ${props.serviceLanguage} service.`
            : occupancyReason
              ? occupancyReason
              : !props.loading && !props.error && !eligibility && authoritative
                ? "Not available under the current candidate filters."
                : undefined;
          return (
            <li key={member.songId} className={`melody-member${isOpened ? " melody-member-opened" : ""}${isCurrent ? " melody-member-current" : ""}`}>
              <div className="melody-member-main">
                <strong>{member.number} · {member.title}</strong>
                <span>{member.language}</span>
              </div>
              <div className="melody-member-meta">
                <span>{member.repertoire ? "In repertoire" : classHasRepertoire ? "Melody known through an equivalent" : "Not in repertoire"}</span>
                <span>Aggregate preference {member.aggregatePreferenceScore}</span>
                {isOpened && <span className="candidate-current-marker">This song</span>}
                {isCurrent && <span className="candidate-current-marker">Currently selected</span>}
              </div>
              <div className="melody-member-actions">
                {member.sheetMusicUrl
                  ? <a href={member.sheetMusicUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open score for ${member.number} ${member.title}`}>Open score</a>
                  : <span className="field-help">Score not available</span>}
                {canShow && <button type="button" onClick={() => props.onShowCandidate?.(member.songId)}>Show this candidate</button>}
                {canReplace && eligibility && <button type="button" onClick={() => props.onReplace?.(eligibility)}>Replace with this song</button>}
              </div>
              {unavailableReason && <p className="candidate-unavailable-reason">{unavailableReason}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function languageRank(language: CandidateMelodyMember["language"]): number {
  return language === "czech" ? 0 : 1;
}

function numberKey(number: string): string {
  const match = number.match(/^(\d+)(?:\/(\d+))?$/);
  if (!match) return number;
  return `${String(Number(match[1])).padStart(8, "0")}:${String(Number(match[2] ?? 0)).padStart(3, "0")}`;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "another row";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}
