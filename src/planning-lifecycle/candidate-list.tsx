import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
  onOpenDetail?: (candidate: CandidateQueryResult) => void;
  onBackFromDetail?: () => void;
  onRetryDetail?: () => void;
  onShowDetailCandidate?: (songId: string) => void;
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
  const rootRef = useRef<HTMLDivElement>(null);
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
    if (!props.open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && rootRef.current && !rootRef.current.contains(target)) props.onCancel();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [props.open, props.onCancel]);

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
    <div
      ref={rootRef}
      className="candidate-combobox"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (props.open && next instanceof Node && !event.currentTarget.contains(next)) props.onCancel();
      }}
    >
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Song lookup"
        aria-autocomplete="list"
        aria-expanded={props.open}
        aria-controls={props.open ? listboxId : undefined}
        aria-activedescendant={activeDescendant}
        value={props.value}
        onFocus={() => { if (!props.disabled && !props.open && !props.detail) props.onOpen(); }}
        onClick={() => { if (!props.disabled && !props.open && !props.detail) props.onOpen(); }}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Song lookup"
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
          onBack={() => props.onBackFromDetail?.()}
          onClose={() => props.onBackFromDetail?.()}
          onRetry={() => props.onRetryDetail?.()}
          onShowCandidate={(songId) => props.onShowDetailCandidate?.(songId)}
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
                <button type="button" className="candidate-inline-detail" onClick={() => props.onOpenDetail?.(candidate)} aria-label={`Show melody detail for ${candidate.number} ${candidate.title}`}>Detail</button>
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
