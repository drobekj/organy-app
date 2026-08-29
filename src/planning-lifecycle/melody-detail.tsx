import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { CandidateMelodyMember, CandidateQueryResult } from "../application/interaction-contracts";
import { getCandidateLineViewModel } from "./candidate-line";
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
  onEscape?: () => void;
  onActivateMember?: (songId: string) => void;
  onReturnToCandidates?: (songId: string) => void;
  dismissOnOutsidePointer?: boolean;
  personalPreference?: {
    value: string;
    options: number[];
    disabled?: boolean;
    onChange: (value: string) => void;
  };
};

let selectedDetailDismissPointerTarget: EventTarget | null = null;

export function consumeSelectedDetailDismissPointer(target: EventTarget | null): boolean {
  if (!selectedDetailDismissPointerTarget || selectedDetailDismissPointerTarget !== target) return false;
  selectedDetailDismissPointerTarget = null;
  return true;
}

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
  return {
    authoritative,
    members: [...source].sort((left, right) => `${languageRank(left.language)}:${numberKey(left.number)}:${left.songId}`.localeCompare(`${languageRank(right.language)}:${numberKey(right.number)}:${right.songId}`)),
  };
}

export function openedMelodyMemberFirst(members: CandidateMelodyMember[], openedSongId: string): CandidateMelodyMember[] {
  const opened = members.find((member) => member.songId === openedSongId);
  if (!opened) return members;
  return [opened, ...members.filter((member) => member.songId !== openedSongId)];
}

export function replacementCandidateForMember(memberSongId: string, eligibilityCandidates: CandidateQueryResult[]): CandidateQueryResult | undefined {
  return eligibilityCandidates.find((candidate) => candidate.songId === memberSongId);
}

export function candidateAvailabilityReason(candidate: CandidateQueryResult | undefined): string | undefined {
  return candidate?.availability.kind === "occupiedByCurrentRows"
    ? `Same melody is already used in ${joinLabels(candidate.availability.rows.map((row) => row.label))}.`
    : undefined;
}

export function isDetailMemberActivatable(input: {
  mode: MelodyClassDetailMode;
  memberSongId: string;
  currentSongId?: string;
  languageAllowed: boolean;
  eligibility?: CandidateQueryResult;
  activationEnabled: boolean;
}): boolean {
  if (input.mode === "selected" && input.memberSongId === input.currentSongId) return true;
  return Boolean(input.activationEnabled && input.languageAllowed && input.eligibility?.availability.kind === "available");
}

export function nextDetailMemberIndex(current: number, key: string, activatable: boolean[]): number {
  const enabled = activatable.map((value, index) => value ? index : -1).filter((index) => index >= 0);
  if (enabled.length === 0) return -1;
  if (key === "Home") return enabled[0];
  if (key === "End") return enabled[enabled.length - 1];
  const position = enabled.indexOf(current);
  if (key === "ArrowDown") return position < 0 ? enabled[0] : enabled[Math.min(enabled.length - 1, position + 1)];
  if (key === "ArrowUp") return position < 0 ? enabled[enabled.length - 1] : enabled[Math.max(0, position - 1)];
  return current;
}

export function MelodyClassDetail(props: MelodyClassDetailProps) {
  const regionRef = useRef<HTMLElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const { authoritative, members: classMembers } = useMemo(() => melodyMembersForDetail(props.candidate), [props.candidate]);
  const members = useMemo(() => openedMelodyMemberFirst(classMembers, props.candidate.songId), [classMembers, props.candidate.songId]);
  const [openedSongId, setOpenedSongId] = useState(props.candidate.songId);
  const [activeIndex, setActiveIndex] = useState(-1);
  const classHasRepertoire = members.some((member) => member.repertoire);
  const eligibilityBySongId = useMemo(() => new Map(props.eligibilityCandidates.map((candidate) => [candidate.songId, candidate])), [props.eligibilityCandidates]);
  const activationEnabled = props.mode === "candidate"
    ? Boolean(props.onReturnToCandidates || props.onActivateMember || props.onBack || props.onShowCandidate)
    : Boolean(props.onActivateMember || props.onReplace);
  const activatable = members.map((member) => isDetailMemberActivatable({
    mode: props.mode,
    memberSongId: member.songId,
    currentSongId: props.currentSongId,
    languageAllowed: isMemberLanguageAllowed(member.language, props.serviceLanguage),
    eligibility: eligibilityBySongId.get(member.songId),
    activationEnabled,
  }));

  useEffect(() => {
    setOpenedSongId(props.candidate.songId);
  }, [props.candidate.songId]);

  useEffect(() => {
    if (props.mode !== "selected" && !props.dismissOnOutsidePointer) return;
    function dismissSelectedDetailOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || regionRef.current?.contains(target)) return;
      selectedDetailDismissPointerTarget = target;
      props.onClose();
      if (target instanceof Element && target.closest('[id^="selected-song-detail-button-"]')) {
        event.preventDefault();
        event.stopPropagation();
      }
      queueMicrotask(() => {
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.focus();
        if (selectedDetailDismissPointerTarget === target) selectedDetailDismissPointerTarget = null;
      });
    }
    document.addEventListener("pointerdown", dismissSelectedDetailOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", dismissSelectedDetailOnOutsidePointer, true);
  }, [props.mode, props.onClose, props.dismissOnOutsidePointer]);

  useEffect(() => {
    const openedIndex = members.findIndex((member, index) => member.songId === openedSongId && activatable[index]);
    const initial = openedIndex >= 0 ? openedIndex : activatable.findIndex(Boolean);
    setActiveIndex(initial);
    queueMicrotask(() => regionRef.current?.focus());
  }, [props.mode, openedSongId, props.currentSongId, props.serviceLanguage, members.map((member) => member.songId).join("|"), activatable.join("|")]);

  function escape() {
    if (props.mode === "candidate" && props.onReturnToCandidates) {
      props.onReturnToCandidates(props.candidate.songId);
      return;
    }
    if (props.onEscape) props.onEscape();
    else if (props.mode === "candidate" && props.onBack) props.onBack();
    else props.onClose();
  }

  function activateMember(index: number) {
    const member = members[index];
    if (!member) return;
    if (!activatable[index]) {
      escape();
      return;
    }
    if (props.mode === "candidate" && props.onReturnToCandidates) {
      props.onReturnToCandidates(member.songId);
      return;
    }
    if (props.onActivateMember) {
      props.onActivateMember(member.songId);
      return;
    }
    if (props.mode === "selected") {
      if (member.songId === props.currentSongId) {
        props.onClose();
        return;
      }
      const eligibility = eligibilityBySongId.get(member.songId);
      if (eligibility?.availability.kind === "available") props.onReplace?.(eligibility);
      return;
    }
    if (member.songId === props.candidate.songId) {
      props.onBack?.();
      return;
    }
    if (props.onShowCandidate && props.onBack) {
      props.onShowCandidate(member.songId);
      return;
    }
    props.onBack?.();
  }

  function moveActive(key: string) {
    const next = nextDetailMemberIndex(activeIndex, key, activatable);
    if (next < 0) return;
    setActiveIndex(next);
    const member = members[next];
    if (member) queueMicrotask(() => rowRefs.current.get(member.songId)?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      escape();
      return;
    }
    if (isNestedControl(event.target)) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      moveActive(event.key);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateMember(activeIndex);
    }
  }

  function stopRowActivation(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  return (
    <section
      ref={regionRef}
      className={`melody-detail melody-detail-${props.mode}`}
      role="region"
      tabIndex={-1}
      aria-label={`Melody detail for ${props.candidate.number} ${props.candidate.title} in ${props.rowLabel}`}
      onKeyDown={handleKeyDown}
      style={{
        background: "#f5f5f4",
        borderColor: "#d6d3d1",
        boxShadow: "0 0.8rem 2rem rgb(31 41 51 / 14%)",
        gridColumn: 1,
        ...(props.mode === "candidate" ? { gridRow: 2 } : {}),
        justifySelf: "end",
        marginTop: "0.35rem",
        position: "relative",
        transform: "translateX(calc(4.7rem + 0.45rem))",
        width: "min(82%, 46rem)",
        zIndex: 2,
      }}
    >
      {!authoritative && (
        <p className="candidate-list-state" role="status">Authoritative melody-class information is not available for this saved song.</p>
      )}
      {props.loading && <p className="candidate-list-state" role="status">Checking candidate availability…</p>}
      {props.error && <p className="candidate-list-state candidate-list-error" role="alert">{props.error}</p>}

      <ul className="melody-member-list">
        {members.map((member, index) => {
          const eligibility = eligibilityBySongId.get(member.songId);
          const viewModel = eligibility ? getCandidateLineViewModel(eligibility) : undefined;
          const languageAllowed = isMemberLanguageAllowed(member.language, props.serviceLanguage);
          const occupancyReason = candidateAvailabilityReason(eligibility);
          const isOpened = member.songId === openedSongId;
          const isCurrent = Boolean(props.currentSongId && member.songId === props.currentSongId);
          const rowActivatable = activatable[index];
          const infoOpacity = rowActivatable ? 1 : 0.58;
          const unavailableReason = !languageAllowed
            ? `Not selectable in a ${props.serviceLanguage} service.`
            : occupancyReason
              ? occupancyReason
              : !props.loading && !props.error && !eligibility && authoritative && !isCurrent
                ? "Not available under the current candidate filters."
                : undefined;
          return (
            <li
              key={member.songId}
              ref={(node) => { if (node) rowRefs.current.set(member.songId, node); else rowRefs.current.delete(member.songId); }}
              className={`melody-member${viewModel ? ` ${viewModel.backgroundClass}` : ""}${isOpened ? " melody-member-opened" : ""}${isCurrent ? " melody-member-current" : ""}${rowActivatable ? " melody-member-activatable" : " melody-member-unavailable"}${activeIndex === index && rowActivatable ? " melody-member-active" : ""}`}
              role={rowActivatable ? "button" : undefined}
              tabIndex={rowActivatable ? (activeIndex === index ? 0 : -1) : undefined}
              aria-disabled={!rowActivatable || undefined}
              aria-label={`${member.number} ${member.title}${rowActivatable ? "" : ", unavailable"}`}
              onFocus={() => { if (rowActivatable) setActiveIndex(index); }}
              onClick={() => activateMember(index)}
              data-melody-member={member.songId}
            >
              <div
                className="melody-member-summary"
                style={{ alignItems: "center", display: "grid", gap: "0.4rem", gridTemplateColumns: "minmax(0, 1fr) auto" }}
              >
                <div
                  className={`melody-member-content${rowActivatable ? "" : " melody-member-content-muted"}`}
                  style={{ display: "grid", gap: "0.35rem" }}
                >
                  <span className={`candidate-option-main${viewModel ? ` ${viewModel.contentTextClass}` : ""}`} style={{ alignItems: "center", minHeight: "2rem", opacity: infoOpacity }}><strong>{member.number}</strong><span>{member.title}</span></span>
                  {isOpened && (
                    <div className="melody-member-meta">
                      <span style={{ opacity: infoOpacity }}>{member.language}</span>
                      <span style={{ opacity: infoOpacity }}>{member.repertoire ? "In repertoire" : classHasRepertoire ? "Melody known through an equivalent" : "Not in repertoire"}</span>
                      <span style={{ opacity: infoOpacity }}>Aggregate preference {member.aggregatePreferenceScore}</span>
                      {eligibility && <span className={viewModel?.contentTextClass} style={{ opacity: infoOpacity }}>Signal {eligibility.signal}</span>}
                      {unavailableReason && <span className="candidate-unavailable-reason" style={{ opacity: infoOpacity }}>{unavailableReason}</span>}
                      {member.sheetMusicUrl ? (
                        <a
                          href={member.sheetMusicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={stopRowActivation}
                          onKeyDown={(event) => event.stopPropagation()}
                          aria-label={`Open score for ${member.number} ${member.title}`}
                        >Score</a>
                      ) : (
                        <span className="field-help melody-score-missing">Score not available</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="melody-member-actions" onClick={stopRowActivation}>
                  {member.songId === props.candidate.songId && props.personalPreference && (
                    <label className="melody-personal-preference" onClick={stopRowActivation}>
                      <span>Personal preference</span>
                      <select
                        aria-label={`Personal preference for ${member.number} ${member.title}`}
                        value={props.personalPreference.value}
                        disabled={props.personalPreference.disabled}
                        onChange={(event) => props.personalPreference?.onChange(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {props.personalPreference.value === "" && <option value="">—</option>}
                        {props.personalPreference.options.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                  )}
                  {!isOpened && (
                    <button
                      type="button"
                      className="candidate-inline-detail melody-member-detail-button"
                      style={{ alignItems: "center", borderRadius: "0.65rem", display: "inline-flex", height: "2rem", justifyContent: "center", lineHeight: 1, minWidth: "4.7rem", padding: "0 0.65rem" }}
                      aria-expanded={false}
                      onClick={(event) => {
                        stopRowActivation(event);
                        setOpenedSongId(member.songId);
                        if (rowActivatable) setActiveIndex(index);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      aria-label={`Show detail for ${member.number} ${member.title}`}
                    >Detail</button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function isNestedControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("button, a, input, select, textarea"));
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