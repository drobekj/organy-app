from pathlib import Path
import json

ROOT = Path('.')

def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one replacement anchor, found {count}: {old[:120]!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')

def replace_all(path: str, old: str, new: str, minimum: int = 1) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f'{path}: expected at least {minimum} anchors, found {count}: {old[:120]!r}')
    target.write_text(text.replace(old, new), encoding='utf-8')

melody_detail = r'''import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
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
      {props.loading && <p className="candidate-list-state" role="status">Checking available replacements…</p>}
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
                <span>{member.repertoire ? "In repertoire" : "Melody known through an equivalent"}</span>
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
'''
(ROOT / 'src/planning-lifecycle/melody-detail.tsx').write_text(melody_detail, encoding='utf-8')

candidate_list = r'''import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CandidateQueryResult } from "../application/interaction-contracts";
import type { ConcreteSongLanguage, ServiceLanguage } from "./model";
import { MelodyClassDetail } from "./melody-detail";

export type CandidateListSelectedSong = {
  songId?: string;
  language: ConcreteSongLanguage;
  number: string;
  title?: string;
};

export type CandidateDetailState = {
  candidate: CandidateQueryResult;
  eligibilityCandidates: CandidateQueryResult[];
  loading: boolean;
  error?: string;
};

type CandidateComboboxProps = {
  rowId: number;
  rowLabel: string;
  open: boolean;
  value: string;
  selectedSong?: CandidateListSelectedSong;
  candidates: CandidateQueryResult[];
  loading: boolean;
  error?: string;
  prerequisiteMessage?: string;
  serviceLanguage: ServiceLanguage;
  disabled?: boolean;
  focusSongId?: string;
  detail?: CandidateDetailState;
  onOpen: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (candidate: CandidateQueryResult) => void;
  onCancel: () => void;
  onRetry: () => void;
  onOpenDetail: (candidate: CandidateQueryResult) => void;
  onBackFromDetail: () => void;
  onRetryDetail: () => void;
  onShowDetailCandidate: (songId: string) => void;
};

export function candidateIndexForKey(current: number, key: string, length: number): number {
  if (length <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowDown") return current < 0 ? 0 : Math.min(length - 1, current + 1);
  if (key === "ArrowUp") return current < 0 ? length - 1 : Math.max(0, current - 1);
  return current;
}

export function getInitialCandidateIndex(candidates: CandidateQueryResult[], currentSongId?: string, focusSongId?: string): number {
  const preferredSongId = focusSongId ?? currentSongId;
  if (preferredSongId) {
    const currentIndex = candidates.findIndex((candidate) => candidate.songId === preferredSongId);
    if (currentIndex >= 0) return currentIndex;
  }
  return candidates.length > 0 ? 0 : -1;
}

export function getCandidateEmptyMessage(queryText: string): string {
  return queryText.trim()
    ? "No candidate matches this search within the current filters."
    : "No songs satisfy the current language, repertoire, preference and melody rules.";
}

export function getUnavailableCurrentReason(selectedSong: CandidateListSelectedSong, serviceLanguage: ServiceLanguage): string {
  if (serviceLanguage !== "mixed" && selectedSong.language !== serviceLanguage) {
    return `Not available because this is a ${selectedSong.language} song in a ${serviceLanguage} service.`;
  }
  return "Not available under the current candidate filters.";
}

export function isCandidateSelectable(candidate: CandidateQueryResult): boolean {
  return candidate.availability.kind === "available";
}

export function CandidateCombobox(props: CandidateComboboxProps) {
  const listboxId = `candidate-list-${props.rowId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrolled = useRef(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blockedByPrerequisite = Boolean(props.prerequisiteMessage);
  const currentSongId = props.selectedSong?.songId;
  const currentCandidateIndex = currentSongId ? props.candidates.findIndex((candidate) => candidate.songId === currentSongId) : -1;
  const unavailableCurrent = Boolean(props.open && !props.loading && !props.error && !props.value.trim() && props.selectedSong && currentCandidateIndex < 0);
  const allOccupied = props.candidates.length > 0 && props.candidates.every((candidate) => !isCandidateSelectable(candidate));
  const activeDescendant = props.open && !blockedByPrerequisite && activeIndex >= 0 ? optionId(listboxId, props.candidates[activeIndex]?.songId) : undefined;
  const candidateIds = useMemo(() => props.candidates.map((candidate) => candidate.songId).join("|"), [props.candidates]);

  useEffect(() => {
    if (!props.open) {
      autoScrolled.current = false;
      setActiveIndex(-1);
      return;
    }
    if (blockedByPrerequisite || props.loading || props.error || props.candidates.length === 0) {
      setActiveIndex(-1);
      return;
    }
    const initial = getInitialCandidateIndex(props.candidates, currentSongId, props.focusSongId);
    setActiveIndex(initial);
    if (props.focusSongId) queueMicrotask(() => inputRef.current?.focus());
    if (!autoScrolled.current && !props.value.trim() && (props.focusSongId || currentSongId) && initial >= 0) {
      autoScrolled.current = true;
      queueMicrotask(() => scrollOptionInsideList(listRef.current, initial));
    }
  }, [props.open, props.loading, props.error, props.prerequisiteMessage, candidateIds, props.value, currentSongId, currentCandidateIndex, props.focusSongId]);

  function moveActive(key: string) {
    const next = candidateIndexForKey(activeIndex, key, props.candidates.length);
    setActiveIndex(next);
    queueMicrotask(() => scrollOptionInsideList(listRef.current, next));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!props.open) {
      if (!props.detail && (event.key === "ArrowDown" || event.key === "Enter")) {
        event.preventDefault();
        props.onOpen();
      }
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      moveActive(event.key);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      props.onCancel();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const candidate = props.candidates[activeIndex];
      if (candidate && isCandidateSelectable(candidate)) props.onSelect(candidate);
    }
  }

  return (
    <div className="candidate-combobox">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={props.open}
        aria-controls={props.open ? listboxId : undefined}
        aria-activedescendant={activeDescendant}
        value={props.value}
        onFocus={() => { if (!props.disabled && !props.open && !props.detail) props.onOpen(); }}
        onClick={() => { if (!props.disabled && !props.open && !props.detail) props.onOpen(); }}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search by number or title"
        disabled={props.disabled}
      />
      {props.detail && (
        <MelodyClassDetail
          mode="candidate"
          rowLabel={props.rowLabel}
          candidate={props.detail.candidate}
          serviceLanguage={props.serviceLanguage}
          currentSongId={props.selectedSong?.songId}
          eligibilityCandidates={props.detail.eligibilityCandidates}
          loading={props.detail.loading}
          error={props.detail.error}
          onBack={props.onBackFromDetail}
          onClose={props.onBackFromDetail}
          onRetry={props.onRetryDetail}
          onShowCandidate={props.onShowDetailCandidate}
        />
      )}
      {props.open && (
        <div
          id={listboxId}
          ref={listRef}
          className="candidate-popup candidate-listbox"
          role="listbox"
          aria-label={`Song candidates for ${props.rowLabel}`}
          aria-busy={!blockedByPrerequisite && props.loading}
        >
          {blockedByPrerequisite && (
            <div className="candidate-list-state candidate-list-prerequisite" role="status">
              <p>{props.prerequisiteMessage}</p>
              <button type="button" className="candidate-list-cancel" onClick={props.onCancel}>Cancel</button>
            </div>
          )}
          {!blockedByPrerequisite && props.loading && <p className="candidate-list-state" role="status">Loading candidates…</p>}
          {!blockedByPrerequisite && !props.loading && props.error && (
            <div className="candidate-list-state candidate-list-error" role="alert">
              <p>{props.error}</p>
              <div className="candidate-list-actions">
                <button type="button" onClick={props.onRetry}>Retry</button>
                <button type="button" onClick={props.onCancel}>Cancel</button>
              </div>
            </div>
          )}
          {!blockedByPrerequisite && !props.loading && !props.error && unavailableCurrent && props.selectedSong && (
            <div className="candidate-current-context" role="status">
              <strong>Currently selected</strong>
              <span>{props.selectedSong.number} · {props.selectedSong.title ?? "Untitled snapshot"} · {props.selectedSong.language}</span>
              <span>{getUnavailableCurrentReason(props.selectedSong, props.serviceLanguage)}</span>
            </div>
          )}
          {!blockedByPrerequisite && !props.loading && !props.error && props.candidates.length === 0 && (
            <p className="candidate-list-state" role="status">{getCandidateEmptyMessage(props.value)}</p>
          )}
          {!blockedByPrerequisite && !props.loading && !props.error && allOccupied && (
            <p className="candidate-list-state" role="status">All matching melodies are already occupied in this service.</p>
          )}
          {!blockedByPrerequisite && !props.loading && !props.error && props.candidates.map((candidate, index) => {
            const current = Boolean(currentSongId && candidate.songId === currentSongId);
            const selectable = isCandidateSelectable(candidate);
            const reason = candidate.availability.kind === "occupiedByCurrentRows"
              ? `Same melody is already used in ${joinLabels(candidate.availability.rows.map((row) => row.label))}.`
              : undefined;
            return (
              <div key={candidate.songId} className="candidate-option-row">
                <div
                  id={optionId(listboxId, candidate.songId)}
                  className={`candidate-option${index === activeIndex ? " candidate-option-active" : ""}${current ? " candidate-option-current" : ""}${selectable ? "" : " candidate-option-disabled"}`}
                  role="option"
                  aria-selected={current}
                  aria-disabled={!selectable}
                  data-song-id={candidate.songId}
                  data-candidate-option
                  onClick={() => { if (selectable) props.onSelect(candidate); }}
                >
                  <div className="candidate-option-content">
                    <span className="candidate-option-main"><strong>{candidate.number}</strong><span>{candidate.title}</span><span>{candidate.language}</span></span>
                    <span className="candidate-option-meta">{candidate.repertoire ? "In repertoire" : "Melody known through an equivalent"} · preference {candidate.aggregatePreferenceScore} · {candidate.signal}</span>
                    {candidate.melodyMembers && candidate.melodyMembers.length > 1 && <span className="candidate-option-meta">Melody class: {candidate.melodyMembers.length} songs</span>}
                    {current && <span className="candidate-current-marker">Currently selected</span>}
                    {reason && <span className="candidate-unavailable-reason">Unavailable — {reason}</span>}
                  </div>
                </div>
                <button type="button" className="candidate-inline-detail" onClick={() => props.onOpenDetail(candidate)} aria-label={`Show melody detail for ${candidate.number} ${candidate.title}`}>Detail</button>
              </div>
            );
          })}
          {!blockedByPrerequisite && !props.loading && !props.error && <button type="button" className="candidate-list-cancel" onClick={props.onCancel}>Cancel</button>}
        </div>
      )}
    </div>
  );
}

function optionId(listboxId: string, songId?: string): string | undefined {
  return songId ? `${listboxId}-option-${songId.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined;
}

function scrollOptionInsideList(container: HTMLDivElement | null, index: number): void {
  if (!container || index < 0) return;
  const option = container.querySelectorAll<HTMLElement>("[data-candidate-option]")[index];
  if (!option) return;
  const top = option.offsetTop;
  const bottom = top + option.offsetHeight;
  if (top < container.scrollTop) container.scrollTop = top;
  else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "another row";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}
'''
(ROOT / 'src/planning-lifecycle/candidate-list.tsx').write_text(candidate_list, encoding='utf-8')

candidate_line = (ROOT / 'src/planning-lifecycle/candidate-line.tsx').read_text(encoding='utf-8')
candidate_line = candidate_line.replace(
'  | { candidate: CandidateQueryResult; variant: "selected"; note: string; readOnly?: boolean; onOpenDetail: () => void; onNoteChange?: (note: string) => void };',
'  | { candidate: CandidateQueryResult; variant: "selected"; note: string; readOnly?: boolean; detailButtonId?: string; onOpenDetail: () => void; onNoteChange?: (note: string) => void };'
)
candidate_line = candidate_line.replace(
'<button type="button" className="candidate-detail-button" onClick={props.onOpenDetail}>Detail</button>',
'<button id={props.detailButtonId} type="button" className="candidate-detail-button" onClick={props.onOpenDetail}>Detail</button>'
)
(ROOT / 'src/planning-lifecycle/candidate-line.tsx').write_text(candidate_line, encoding='utf-8')

client = 'app/planning-lifecycle-client.tsx'
replace_once(client,
'import { CandidateCombobox } from "../src/planning-lifecycle/candidate-list";',
'import { CandidateCombobox } from "../src/planning-lifecycle/candidate-list";\nimport { MelodyClassDetail } from "../src/planning-lifecycle/melody-detail";')
replace_once(client,
'''type WorkingSetSnapshot = {
  serviceDate: string;
  serviceTime: string;
  serviceLanguage: ServiceLanguage;
  priest: string;
  organist: string;
  rows: PlanningRow[];
};''',
'''type WorkingSetSnapshot = {
  serviceDate: string;
  serviceTime: string;
  serviceLanguage: ServiceLanguage;
  priest: string;
  organist: string;
  rows: PlanningRow[];
};

type PlanningExpansion =
  | { kind: "candidateList"; rowId: number; focusSongId?: string }
  | { kind: "candidateDetail"; rowId: number; songId: string; candidate: CandidateQueryResult; returnQuery: string }
  | { kind: "selectedSongDetail"; rowId: number; songId: string; candidate: CandidateQueryResult }
  | null;''')
replace_once(client,
'''  const [candidateResults, setCandidateResults] = useState<Record<number, CandidateQueryResult[]>>({});
  const [openCandidateRowId, setOpenCandidateRowId] = useState<number | null>(null);
  const [candidateLoading, setCandidateLoading] = useState<Record<number, boolean>>({});''',
'''  const [candidateResults, setCandidateResults] = useState<Record<number, CandidateQueryResult[]>>({});
  const [planningExpansion, setPlanningExpansion] = useState<PlanningExpansion>(null);
  const openCandidateRowId = planningExpansion?.kind === "candidateList" ? planningExpansion.rowId : null;
  const [candidateLoading, setCandidateLoading] = useState<Record<number, boolean>>({});''')
replace_once(client,
'''  const [candidateErrors, setCandidateErrors] = useState<Record<number, string | undefined>>({});
  const [candidateRefreshGeneration, setCandidateRefreshGeneration] = useState(0);''',
'''  const [candidateErrors, setCandidateErrors] = useState<Record<number, string | undefined>>({});
  const [candidateRefreshGeneration, setCandidateRefreshGeneration] = useState(0);
  const [detailEligibilityCandidates, setDetailEligibilityCandidates] = useState<CandidateQueryResult[]>([]);
  const [detailEligibilityLoading, setDetailEligibilityLoading] = useState(false);
  const [detailEligibilityError, setDetailEligibilityError] = useState<string | undefined>();
  const detailEligibilityRequest = useRef(0);''')
replace_all(client, 'setOpenCandidateRowId(null);', 'setPlanningExpansion(null);', 4)
replace_all(client, 'setOpenCandidateRowId(rowId);', 'setPlanningExpansion({ kind: "candidateList", rowId });', 1)
replace_once(client,
'''  function openCandidateList(rowId: number) {
    if (!canEditRows || openCandidateRowId === rowId) return;''',
'''  function openCandidateList(rowId: number) {
    if (!canEditRows || (planningExpansion?.kind === "candidateList" && planningExpansion.rowId === rowId)) return;''')
replace_once(client,
'''    if (openCandidateRowId === id) setPlanningExpansion(null);
    else if (openCandidateRowId !== null) setCandidateRefreshGeneration((generation) => generation + 1);''',
'''    if (planningExpansion?.rowId === id) setPlanningExpansion(null);
    else if (openCandidateRowId !== null) setCandidateRefreshGeneration((generation) => generation + 1);''')

insert_anchor = '''  function openCandidateList(rowId: number) {'''
detail_functions = r'''  async function loadDetailEligibility(rowId: number) {
    const request = ++detailEligibilityRequest.current;
    setDetailEligibilityCandidates([]);
    setDetailEligibilityError(undefined);
    if (!organistId) {
      setDetailEligibilityLoading(false);
      return;
    }
    setDetailEligibilityLoading(true);
    try {
      const candidates = await interactionClient.queryCandidates({
        serviceDate,
        serviceLanguage,
        organistPersonId: organistId,
        referenceAntiphonId: referenceAntiphon?.id,
        antiphonKey: candidateAntiphonKey,
        liturgicalSeasonKey: candidateSeasonKey,
        queryText: "",
        preferenceThreshold: PHASE_30_1_PREFERENCE_THRESHOLD,
        candidateUsages: getCanonicalCandidateUsages(rowId),
        currentPlanId: persistedSet?.id,
      });
      if (request !== detailEligibilityRequest.current) return;
      setDetailEligibilityCandidates(candidates);
      setDetailEligibilityLoading(false);
    } catch (error) {
      if (request !== detailEligibilityRequest.current) return;
      setDetailEligibilityCandidates([]);
      setDetailEligibilityLoading(false);
      setDetailEligibilityError(error instanceof Error ? error.message : "Replacement eligibility could not be checked.");
    }
  }

  function resetDetailEligibility() {
    detailEligibilityRequest.current += 1;
    setDetailEligibilityCandidates([]);
    setDetailEligibilityLoading(false);
    setDetailEligibilityError(undefined);
  }

  function openCandidateDetail(rowId: number, candidate: CandidateQueryResult) {
    const row = rows.find((item) => item.id === rowId);
    setPlanningExpansion({ kind: "candidateDetail", rowId, songId: candidate.songId, candidate, returnQuery: row?.songSearch ?? "" });
    void loadDetailEligibility(rowId);
  }

  function backToCandidateList() {
    if (planningExpansion?.kind !== "candidateDetail") return;
    const { rowId, songId, returnQuery } = planningExpansion;
    setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "lookupChanged", text: returnQuery }) : row));
    setPlanningExpansion({ kind: "candidateList", rowId, focusSongId: songId });
    resetDetailEligibility();
    void queryCandidateResults(rowId, returnQuery);
  }

  function showCandidateFromDetail(songId: string) {
    if (planningExpansion?.kind !== "candidateDetail") return;
    const target = detailEligibilityCandidates.find((candidate) => candidate.songId === songId);
    if (!target) return;
    const rowId = planningExpansion.rowId;
    setRows((currentRows) => currentRows.map((row) => row.id === rowId ? planningCandidateRowReducer(row, { type: "lookupChanged", text: "" }) : row));
    setCandidateResults((current) => ({ ...current, [rowId]: detailEligibilityCandidates }));
    setPlanningExpansion({ kind: "candidateDetail", rowId, songId: target.songId, candidate: target, returnQuery: "" });
  }

  function openSelectedSongDetail(rowId: number, candidate: CandidateQueryResult) {
    lookupTracker.invalidatePrefix("song:");
    setRows((currentRows) => currentRows.map((row) => row.lookupOpen ? planningCandidateRowReducer(row, { type: "lookupCancelled" }) : row));
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
    setPlanningExpansion({ kind: "selectedSongDetail", rowId, songId: candidate.songId, candidate });
    void loadDetailEligibility(rowId);
  }

  function closeSelectedSongDetail(rowId: number) {
    setPlanningExpansion(null);
    resetDetailEligibility();
    queueMicrotask(() => document.getElementById(`selected-song-detail-button-${rowId}`)?.focus());
  }

  function replaceFromSelectedDetail(rowId: number, candidate: CandidateQueryResult) {
    if (candidate.availability.kind !== "available") {
      setDetailEligibilityError(`Same melody is already used in ${candidate.availability.rows.map((row) => row.label).join(" and ")}.`);
      return;
    }
    const currentRow = rows.find((row) => row.id === rowId);
    if (currentRow?.selectedSong?.songId === candidate.songId) {
      closeSelectedSongDetail(rowId);
      return;
    }
    lookupTracker.invalidatePrefix("song:");
    guardedEditorUpdate(() => setRows((currentRows) => currentRows.map((row) => row.id === rowId
      ? planningCandidateRowReducer(row, { type: "candidateSelected", song: candidateToSelectedSong(candidate), candidate })
      : row)));
    setPlanningExpansion(null);
    resetDetailEligibility();
    setCandidateResults({});
    setCandidateLoading({});
    setCandidateErrors({});
  }

  function retryDetailEligibility() {
    if (planningExpansion && planningExpansion.kind !== "candidateList") void loadDetailEligibility(planningExpansion.rowId);
  }

'''
replace_once(client, insert_anchor, detail_functions + insert_anchor)

replace_once(client,
'''                      <CandidateCombobox
                        rowId={row.id}
                        rowLabel={`Row ${index + 1}`}
                        open={openCandidateRowId === row.id}
                        value={row.songSearch}''',
'''                      <CandidateCombobox
                        rowId={row.id}
                        rowLabel={`Row ${index + 1}`}
                        open={planningExpansion?.kind === "candidateList" && planningExpansion.rowId === row.id}
                        focusSongId={planningExpansion?.kind === "candidateList" && planningExpansion.rowId === row.id ? planningExpansion.focusSongId : undefined}
                        detail={planningExpansion?.kind === "candidateDetail" && planningExpansion.rowId === row.id ? {
                          candidate: planningExpansion.candidate,
                          eligibilityCandidates: detailEligibilityCandidates,
                          loading: detailEligibilityLoading,
                          error: detailEligibilityError,
                        } : undefined}
                        value={row.songSearch}''')
replace_once(client,
'''                        onRetry={() => { void queryCandidateResults(row.id, row.songSearch); }}
                      />''',
'''                        onRetry={() => { void queryCandidateResults(row.id, row.songSearch); }}
                        onOpenDetail={(candidate) => openCandidateDetail(row.id, candidate)}
                        onBackFromDetail={backToCandidateList}
                        onRetryDetail={retryDetailEligibility}
                        onShowDetailCandidate={showCandidateFromDetail}
                      />''')
replace_once(client,
'''                          readOnly={!canEditRows}
                          onOpenDetail={() => row.selectedSong?.songId && openCatalogSongDetail(row.selectedSong.songId, row.id)}
                          onNoteChange={(note) => updateRow(row.id, { note })}''',
'''                          readOnly={!canEditRows}
                          detailButtonId={`selected-song-detail-button-${row.id}`}
                          onOpenDetail={() => openSelectedSongDetail(row.id, row.selectedCandidate ?? candidateFromSelectedSong(row.selectedSong!))}
                          onNoteChange={(note) => updateRow(row.id, { note })}''')
replace_once(client,
'''                  </div>
                  {rowIssues.length > 0 && (''',
'''                  </div>
                  {planningExpansion?.kind === "selectedSongDetail" && planningExpansion.rowId === row.id && (
                    <MelodyClassDetail
                      mode="selected"
                      rowLabel={`Row ${index + 1}`}
                      candidate={planningExpansion.candidate}
                      serviceLanguage={serviceLanguage}
                      currentSongId={row.selectedSong?.songId}
                      eligibilityCandidates={detailEligibilityCandidates}
                      loading={detailEligibilityLoading}
                      error={detailEligibilityError}
                      onClose={() => closeSelectedSongDetail(row.id)}
                      onRetry={retryDetailEligibility}
                      onReplace={canEditRows ? (candidate) => replaceFromSelectedDetail(row.id, candidate) : undefined}
                    />
                  )}
                  {rowIssues.length > 0 && (''')

# Memory candidate projections: complete members for query and hydration.
service = 'src/application/interaction-service.ts'
replace_once(service,
'''    const equivalentNumbers = allClassSongIds
      .filter((songId) => songId !== primary.song.songId)
      .map((songId) => ({ songId, number: songsById.get(songId)?.number ?? songId, repertoire: repertoire.has(songId) }))
      .sort((a, b) => `${a.repertoire ? 0 : 1}:${a.number}`.localeCompare(`${b.repertoire ? 0 : 1}:${b.number}`));

    candidates.push({''',
'''    const equivalentNumbers = allClassSongIds
      .filter((songId) => songId !== primary.song.songId)
      .map((songId) => ({ songId, number: songsById.get(songId)?.number ?? songId, repertoire: repertoire.has(songId) }))
      .sort((a, b) => `${a.repertoire ? 0 : 1}:${a.number}`.localeCompare(`${b.repertoire ? 0 : 1}:${b.number}`));
    const melodyMembers = buildMemoryMelodyMembers(primary.song, allClassSongIds, songsById, preferences, repertoire);

    candidates.push({''')
replace_once(service,
'''      title: primary.song.title,
      equivalentNumbers,
      aggregatePreferenceScore:''',
'''      title: primary.song.title,
      equivalentNumbers,
      melodyClassId: classId,
      melodyMembers,
      aggregatePreferenceScore:''')
replace_once(service,
'''      title: storedSong.title,
      equivalentNumbers,
      aggregatePreferenceScore,''',
'''      title: storedSong.title,
      equivalentNumbers,
      melodyClassId: melody?.id ?? `song:${storedSong.songId}`,
      melodyMembers: buildMemoryMelodyMembers(storedSong, classSongIds, songsById, preferences, repertoire),
      aggregatePreferenceScore,''')
replace_once(service,
'''function ok<T>(value: T): InteractionResult<T> { return { success: true, value }; }''',
'''function buildMemoryMelodyMembers(primary: CatalogSong, classSongIds: string[], songsById: Map<string, CatalogSong>, preferences: SongPreference[], repertoire: Set<string>) {
  const members = classSongIds
    .map((songId) => songsById.get(songId))
    .filter((song): song is CatalogSong => Boolean(song?.active));
  const ordered = [primary, ...members.filter((song) => song.songId !== primary.songId).sort((left, right) => `${left.language}:${left.number}:${left.songId}`.localeCompare(`${right.language}:${right.number}:${right.songId}`))];
  return ordered.map((song) => ({
    songId: song.songId,
    language: song.language,
    number: song.number,
    title: song.title,
    repertoire: repertoire.has(song.songId),
    aggregatePreferenceScore: preferences.filter((preference) => preference.songId === song.songId).reduce((sum, preference) => sum + preference.score, 0),
    ...(song.sheetMusicUrl ? { sheetMusicUrl: song.sheetMusicUrl } : {}),
  }));
}

function ok<T>(value: T): InteractionResult<T> { return { success: true, value }; }''')

# Contract and knowledge history.
contract = r'''# Phase 31.17 — inline melody-class detail and equivalent navigation

Approved by the user on 2026-08-06. Baseline: `fb23295fba224d0ccbc645b77358d5e51c2f19ff`.

## Contract

- one local Planning expansion: candidate list, candidate detail, selected-song detail, or none;
- complete authoritative melody-class members with concrete opened song first;
- safe score links remain available for informational members;
- candidate detail navigates to an equivalent candidate without selecting it;
- selected-song detail replaces only through a fresh hard-filtered eligibility snapshot;
- replacement preserves note and updates local occupancy;
- language-disabled, occupied and hard-filtered members remain explanatory and unselectable;
- historical fallback never invents a melody class;
- memory demo projects only data it actually owns;
- no theme UI, schema, migration or Planning persistence change.

## Acceptance

Focused Phase 31.17 tests, all prior phase gates, typecheck, complete tests and production build must pass. One real browser HUMAN checkpoint is required before Ready for review.
'''
(ROOT / 'docs/phase-31-17-contract.md').write_text(contract, encoding='utf-8')
replace_once('docs/candidate-selection-knowledge-transfer.md',
'- Phase 31.16 is authorized by issue #137 and implements the single-open concrete candidate-list UI.',
'- Phase 31.16, concrete candidate-list UI and organist repertoire prerequisite, is merged on `main` as commit `fb23295fba224d0ccbc645b77358d5e51c2f19ff`.\n- Phase 31.17 is authorized by issue #139 and implements inline melody-class detail and equivalent navigation.')
replace_once('docs/candidate-selection-knowledge-transfer.md',
'''### Phase 31.16 — concrete candidate-list UI

Current phase:''',
'''### Phase 31.16 — concrete candidate-list UI

Completed and merged:''')

# Focused acceptance.
tests = r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import type { CandidateQueryResult } from "../src/application/interaction-contracts";
import { queryCandidatesFromData, hydrateCandidatesFromData } from "../src/application/interaction-service";
import { CandidateCombobox } from "../src/planning-lifecycle/candidate-list";
import { MelodyClassDetail, isMemberLanguageAllowed, melodyMembersForDetail, replacementCandidateForMember } from "../src/planning-lifecycle/melody-detail";

const available: CandidateQueryResult = {
  songId: "czech:29", language: "czech", number: "29", title: "Czech song", equivalentNumbers: [{ songId: "polish:38", number: "38", repertoire: true }],
  melodyClassId: "class-a",
  melodyMembers: [
    { songId: "czech:29", language: "czech", number: "29", title: "Czech song", repertoire: false, aggregatePreferenceScore: 3, sheetMusicUrl: "https://example.test/cz29.pdf" },
    { songId: "polish:38", language: "polish", number: "38", title: "Polish song", repertoire: true, aggregatePreferenceScore: 2, sheetMusicUrl: "https://example.test/pl38.pdf" },
  ],
  aggregatePreferenceScore: 3, antiphonMatch: false, seasonMatch: false, signal: "none", preferenceShade: "medium", repertoire: false,
  availability: { kind: "available" }, suppressedByMelodyWindow: false, orderKey: "0:29",
};
const polishCandidate: CandidateQueryResult = { ...available, songId: "polish:38", language: "polish", number: "38", title: "Polish song", aggregatePreferenceScore: 2, repertoire: true, orderKey: "1:38" };
const occupied: CandidateQueryResult = { ...available, availability: { kind: "occupiedByCurrentRows", rows: [{ rowId: 2, label: "Row 2" }] } };

assert.equal(isMemberLanguageAllowed("polish", "czech"), false);
assert.equal(isMemberLanguageAllowed("polish", "mixed"), true);
assert.equal(melodyMembersForDetail(polishCandidate).members[0]?.songId, "polish:38");
assert.equal(replacementCandidateForMember("polish:38", [polishCandidate])?.songId, "polish:38");

const candidateDetail = renderToStaticMarkup(<MelodyClassDetail mode="candidate" rowLabel="Row 1" candidate={available} serviceLanguage="mixed" eligibilityCandidates={[available, polishCandidate]} loading={false} onBack={() => undefined} onClose={() => undefined} onRetry={() => undefined} onShowCandidate={() => undefined} />);
assert.match(candidateDetail, /Complete melody-class context/);
assert.match(candidateDetail, /Show this candidate/);
assert.match(candidateDetail, /target="_blank"/);
assert.match(candidateDetail, /rel="noopener noreferrer"/);
assert.match(candidateDetail, /Open score for 38 Polish song/);

const selectedDetail = renderToStaticMarkup(<MelodyClassDetail mode="selected" rowLabel="Row 1" candidate={available} serviceLanguage="mixed" currentSongId="czech:29" eligibilityCandidates={[available, polishCandidate]} loading={false} onClose={() => undefined} onRetry={() => undefined} onReplace={() => undefined} />);
assert.match(selectedDetail, /Currently selected/);
assert.match(selectedDetail, /Replace with this song/);

const languageDisabled = renderToStaticMarkup(<MelodyClassDetail mode="selected" rowLabel="Row 1" candidate={available} serviceLanguage="czech" currentSongId="czech:29" eligibilityCandidates={[available, polishCandidate]} loading={false} onClose={() => undefined} onRetry={() => undefined} onReplace={() => undefined} />);
assert.match(languageDisabled, /Not selectable in a czech service/);
assert.doesNotMatch(languageDisabled, /Replace with this song/);

const historical = renderToStaticMarkup(<MelodyClassDetail mode="selected" rowLabel="Row 1" candidate={{ ...available, songId: "historical:czech:999", number: "999", title: "Saved snapshot", melodyClassId: undefined, melodyMembers: undefined, equivalentNumbers: [] }} serviceLanguage="czech" currentSongId="historical:czech:999" eligibilityCandidates={[]} loading={false} onClose={() => undefined} onRetry={() => undefined} />);
assert.match(historical, /Authoritative melody-class information is not available/);

const occupiedList = renderToStaticMarkup(<CandidateCombobox rowId={1} rowLabel="Row 1" open value="" candidates={[occupied]} loading={false} serviceLanguage="czech" onOpen={() => undefined} onQueryChange={() => undefined} onSelect={() => undefined} onCancel={() => undefined} onRetry={() => undefined} onOpenDetail={() => undefined} onBackFromDetail={() => undefined} onRetryDetail={() => undefined} onShowDetailCandidate={() => undefined} />);
assert.match(occupiedList, /aria-disabled="true"/);
assert.match(occupiedList, /Show melody detail for 29 Czech song/);
assert.match(occupiedList, /Same melody is already used in Row 2/);

const songs = [
  { songId: "demo-cz", language: "czech" as const, number: "101", title: "Demo Czech", active: true, sheetMusicUrl: "https://example.test/demo-cz.pdf" },
  { songId: "demo-pl", language: "polish" as const, number: "101", title: "Demo Polish", active: true },
];
const preferences = [{ profileId: "p", songId: "demo-cz", score: 3 }];
const knowledge = { antiphons: [], seasons: [], melodyClasses: [{ id: "demo-class", label: "Demo", songIds: ["demo-cz", "demo-pl"], synthetic: true }], melodyWindow: { months: 2 } };
const memoryCandidates = queryCandidatesFromData(songs, preferences, new Set(["demo-cz"]), knowledge, { serviceDate: "2026-08-09", serviceLanguage: "mixed", organistPersonId: "demo-organist", preferenceThreshold: 0 });
assert.equal(memoryCandidates[0]?.melodyClassId, "demo-class");
assert.deepEqual(memoryCandidates[0]?.melodyMembers?.map((member) => member.songId), [memoryCandidates[0]?.songId, memoryCandidates[0]?.songId === "demo-cz" ? "demo-pl" : "demo-cz"]);
const hydrated = hydrateCandidatesFromData(songs, preferences, new Set(["demo-cz"]), knowledge, { songs: [{ songId: "demo-pl", language: "polish", number: "101", title: "Stored Polish" }], organistPersonId: "demo-organist" });
assert.deepEqual(hydrated[0]?.melodyMembers?.map((member) => member.songId), ["demo-pl", "demo-cz"]);

const clientSource = await readFile("app/planning-lifecycle-client.tsx", "utf8");
assert.match(clientSource, /type PlanningExpansion/);
assert.match(clientSource, /kind: "candidateDetail"/);
assert.match(clientSource, /kind: "selectedSongDetail"/);
assert.match(clientSource, /openSelectedSongDetail/);
assert.match(clientSource, /replaceFromSelectedDetail/);
assert.match(clientSource, /detailButtonId={`selected-song-detail-button-/);
assert.doesNotMatch(clientSource, /onOpenDetail=\{\(\) => row\.selectedSong\?\.songId && openCatalogSongDetail/);

console.log("Phase 31.17 inline melody-class detail and equivalent navigation: PASS");
'''
(ROOT / 'scripts/phase-31-17-tests.tsx').write_text(tests, encoding='utf-8')

local = (ROOT / 'scripts/verify-phase-31-16-local.ts').read_text(encoding='utf-8')
local = local.replace('31-16', '31-17').replace('concrete candidate-list UI and single-open interaction', 'inline melody-class detail and equivalent navigation')
(ROOT / 'scripts/verify-phase-31-17-local.ts').write_text(local, encoding='utf-8')

# Package scripts.
package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
package['scripts']['test:phase-31-17'] = 'tsx scripts/phase-31-17-tests.tsx'
package['scripts']['verify:phase-31-17'] = 'npm run test:phase-31-17 && npm run verify:phase-31-16'
package['scripts']['verify:phase-31-17:local'] = 'tsx scripts/verify-phase-31-17-local.ts'
package_path.write_text(json.dumps(package, indent=2) + '\n', encoding='utf-8')

# CSS.
css_path = ROOT / 'app/globals.css'
css = css_path.read_text(encoding='utf-8')
css += r'''

.candidate-option-row {
  align-items: stretch;
  border-bottom: 1px solid var(--border);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.4rem;
  padding: 0.2rem 0;
}

.candidate-option-row .candidate-option {
  border-bottom: 0;
}

.candidate-inline-detail {
  align-self: center;
}

.melody-detail {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  display: grid;
  gap: 0.75rem;
  margin-top: 0.35rem;
  max-height: 28rem;
  overflow: auto;
  padding: 0.75rem;
}

.melody-detail:focus {
  outline: 3px solid #84adff;
  outline-offset: 2px;
}

.melody-detail-header,
.melody-member-main,
.melody-member-meta,
.melody-member-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: space-between;
}

.melody-detail-header h3,
.melody-detail-header p,
.melody-member p {
  margin: 0;
}

.melody-member-list {
  display: grid;
  gap: 0.55rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.melody-member {
  border: 1px solid var(--border);
  border-radius: 0.65rem;
  display: grid;
  gap: 0.45rem;
  padding: 0.65rem;
}

.melody-member-opened {
  border-color: #84adff;
}

.melody-member-current {
  background: #eff6ff;
}

.melody-member-meta {
  color: var(--muted);
  font-size: 0.82rem;
  justify-content: flex-start;
}
'''
css_path.write_text(css, encoding='utf-8')

# CI focused step.
ci = '.github/workflows/ci.yml'
replace_once(ci,
'''      - name: Upload Phase 31.16 log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: phase-31-16-log
          path: phase-31-16.log
          if-no-files-found: ignore
      - name: Database migration''',
'''      - name: Upload Phase 31.16 log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: phase-31-16-log
          path: phase-31-16.log
          if-no-files-found: ignore
      - name: Phase 31.17 inline melody-class detail and equivalent navigation
        run: |
          set -o pipefail
          npm run verify:phase-31-17 2>&1 | tee phase-31-17.log
      - name: Upload Phase 31.17 log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: phase-31-17-log
          path: phase-31-17.log
          if-no-files-found: ignore
      - name: Database migration''')

print('Phase 31.17 transformation complete.')
