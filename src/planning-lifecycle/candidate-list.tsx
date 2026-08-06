import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CandidateQueryResult } from "../application/interaction-contracts";
import type { ConcreteSongLanguage, ServiceLanguage } from "./model";

export type CandidateListSelectedSong = {
  songId?: string;
  language: ConcreteSongLanguage;
  number: string;
  title?: string;
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
  serviceLanguage: ServiceLanguage;
  disabled?: boolean;
  onOpen: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (candidate: CandidateQueryResult) => void;
  onCancel: () => void;
  onRetry: () => void;
};

export function candidateIndexForKey(current: number, key: string, length: number): number {
  if (length <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowDown") return current < 0 ? 0 : Math.min(length - 1, current + 1);
  if (key === "ArrowUp") return current < 0 ? length - 1 : Math.max(0, current - 1);
  return current;
}

export function getInitialCandidateIndex(candidates: CandidateQueryResult[], currentSongId?: string): number {
  if (currentSongId) {
    const currentIndex = candidates.findIndex((candidate) => candidate.songId === currentSongId);
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
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrolled = useRef(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const currentSongId = props.selectedSong?.songId;
  const currentCandidateIndex = currentSongId ? props.candidates.findIndex((candidate) => candidate.songId === currentSongId) : -1;
  const unavailableCurrent = Boolean(props.open && !props.loading && !props.error && !props.value.trim() && props.selectedSong && currentCandidateIndex < 0);
  const allOccupied = props.candidates.length > 0 && props.candidates.every((candidate) => !isCandidateSelectable(candidate));
  const activeDescendant = props.open && activeIndex >= 0 ? optionId(listboxId, props.candidates[activeIndex]?.songId) : undefined;
  const candidateIds = useMemo(() => props.candidates.map((candidate) => candidate.songId).join("|"), [props.candidates]);

  useEffect(() => {
    if (!props.open) {
      autoScrolled.current = false;
      setActiveIndex(-1);
      return;
    }
    if (props.loading || props.error || props.candidates.length === 0) {
      setActiveIndex(-1);
      return;
    }
    const initial = getInitialCandidateIndex(props.candidates, currentSongId);
    setActiveIndex(initial);
    if (!autoScrolled.current && !props.value.trim() && currentSongId && currentCandidateIndex >= 0) {
      autoScrolled.current = true;
      queueMicrotask(() => scrollOptionInsideList(listRef.current, initial));
    }
  }, [props.open, props.loading, props.error, candidateIds, props.value, currentSongId, currentCandidateIndex]);

  function moveActive(key: string) {
    const next = candidateIndexForKey(activeIndex, key, props.candidates.length);
    setActiveIndex(next);
    queueMicrotask(() => scrollOptionInsideList(listRef.current, next));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!props.open) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
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
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={props.open}
        aria-controls={props.open ? listboxId : undefined}
        aria-activedescendant={activeDescendant}
        value={props.value}
        onFocus={() => { if (!props.disabled && !props.open) props.onOpen(); }}
        onClick={() => { if (!props.disabled && !props.open) props.onOpen(); }}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search by number or title"
        disabled={props.disabled}
      />
      {props.open && (
        <div
          id={listboxId}
          ref={listRef}
          className="candidate-popup candidate-listbox"
          role="listbox"
          aria-label={`Song candidates for ${props.rowLabel}`}
          aria-busy={props.loading}
        >
          {props.loading && <p className="candidate-list-state" role="status">Loading candidates…</p>}
          {!props.loading && props.error && (
            <div className="candidate-list-state candidate-list-error" role="alert">
              <p>{props.error}</p>
              <div className="candidate-list-actions">
                <button type="button" onClick={props.onRetry}>Retry</button>
                <button type="button" onClick={props.onCancel}>Cancel</button>
              </div>
            </div>
          )}
          {!props.loading && !props.error && unavailableCurrent && props.selectedSong && (
            <div className="candidate-current-context" role="status">
              <strong>Currently selected</strong>
              <span>{props.selectedSong.number} · {props.selectedSong.title ?? "Untitled snapshot"} · {props.selectedSong.language}</span>
              <span>{getUnavailableCurrentReason(props.selectedSong, props.serviceLanguage)}</span>
            </div>
          )}
          {!props.loading && !props.error && props.candidates.length === 0 && (
            <p className="candidate-list-state" role="status">{getCandidateEmptyMessage(props.value)}</p>
          )}
          {!props.loading && !props.error && allOccupied && (
            <p className="candidate-list-state" role="status">All matching melodies are already occupied in this service.</p>
          )}
          {!props.loading && !props.error && props.candidates.map((candidate, index) => {
            const current = Boolean(currentSongId && candidate.songId === currentSongId);
            const selectable = isCandidateSelectable(candidate);
            const reason = candidate.availability.kind === "occupiedByCurrentRows"
              ? `Same melody is already used in ${joinLabels(candidate.availability.rows.map((row) => row.label))}.`
              : undefined;
            return (
              <div
                id={optionId(listboxId, candidate.songId)}
                key={candidate.songId}
                className={`candidate-option${index === activeIndex ? " candidate-option-active" : ""}${current ? " candidate-option-current" : ""}${selectable ? "" : " candidate-option-disabled"}`}
                role="option"
                aria-selected={current}
                aria-disabled={!selectable}
                data-song-id={candidate.songId}
              >
                <button type="button" disabled={!selectable} onClick={() => { if (selectable) props.onSelect(candidate); }}>
                  <span className="candidate-option-main"><strong>{candidate.number}</strong><span>{candidate.title}</span><span>{candidate.language}</span></span>
                  <span className="candidate-option-meta">{candidate.repertoire ? "In repertoire" : "Melody known through an equivalent"} · preference {candidate.aggregatePreferenceScore} · {candidate.signal}</span>
                  {candidate.melodyMembers && candidate.melodyMembers.length > 1 && <span className="candidate-option-meta">Melody class: {candidate.melodyMembers.length} songs</span>}
                  {current && <span className="candidate-current-marker">Currently selected</span>}
                  {reason && <span className="candidate-unavailable-reason">Unavailable — {reason}</span>}
                </button>
              </div>
            );
          })}
          {!props.loading && !props.error && <button type="button" className="candidate-list-cancel" onClick={props.onCancel}>Cancel</button>}
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
  const option = container.querySelectorAll<HTMLElement>("[data-song-id]")[index];
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
