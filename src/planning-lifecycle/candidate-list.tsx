import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CandidateQueryResult } from "../application/interaction-contracts";
import type { ConcreteSongLanguage, ServiceLanguage } from "./model";
import { MelodyClassDetail, type MelodyClassDetailMode } from "./melody-detail";

export type CandidateListSelectedSong = {
  songId?: string;
  language: ConcreteSongLanguage;
  number: string;
  title?: string;
};

export type CandidateDetailState = {
  mode?: MelodyClassDetailMode;
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
  onEscapeDetail?: () => void;
  onActivateDetailMember?: (songId: string) => void;
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

export function isCandidateSelectable(candidate: CandidateQueryResult): boolean {
  return candidate.availability.kind === "available";
}

export function CandidateCombobox(props: CandidateComboboxProps) {
  const listboxId = `candidate-list-${props.rowId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputWasOpenOnPointerDown = useRef(false);
  const autoScrolled = useRef(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blockedByPrerequisite = Boolean(props.prerequisiteMessage);
  const currentSongId = props.selectedSong?.songId;
  const confirmedLabel = props.selectedSong
    ? `${props.selectedSong.number}${props.selectedSong.title ? ` · ${props.selectedSong.title}` : ""}`
    : "";
  const candidateQueryText = confirmedLabel && props.value === confirmedLabel ? "" : props.value;
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
    if (!autoScrolled.current && (props.focusSongId || currentSongId) && initial >= 0) {
      autoScrolled.current = true;
      queueMicrotask(() => scrollOptionInsideList(listRef.current, initial));
    }
  }, [props.open, props.loading, props.error, props.prerequisiteMessage, candidateIds, props.value, currentSongId, props.focusSongId]);

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
        onPointerDown={() => { inputWasOpenOnPointerDown.current = props.open; }}
        onFocus={(event) => {
          if (props.disabled || props.detail) return;
          if (!props.open) {
            props.onOpen();
            if (event.currentTarget.value) event.currentTarget.select();
          }
        }}
        onClick={(event) => {
          if (props.disabled || props.detail) return;
          if (inputWasOpenOnPointerDown.current) {
            props.onCancel();
            return;
          }
          if (!props.open) props.onOpen();
          if (event.currentTarget.value) event.currentTarget.select();
        }}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Song lookup"
        disabled={props.disabled}
      />
      {props.detail && (
        <MelodyClassDetail
          mode={props.detail.mode ?? "candidate"}
          rowLabel={props.rowLabel}
          candidate={props.detail.candidate}
          serviceLanguage={props.serviceLanguage}
          currentSongId={props.selectedSong?.songId}
          eligibilityCandidates={props.detail.eligibilityCandidates}
          loading={props.detail.loading}
          error={props.detail.error}
          onBack={props.onBackFromDetail}
          onClose={props.onEscapeDetail ?? props.onBackFromDetail ?? (() => undefined)}
          onRetry={props.onRetryDetail ?? (() => undefined)}
          onShowCandidate={props.onShowDetailCandidate}
          onEscape={props.onEscapeDetail}
          onActivateMember={props.onActivateDetailMember}
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
            </div>
          )}
          {!blockedByPrerequisite && props.loading && <p className="candidate-list-state" role="status">Loading candidates…</p>}
          {!blockedByPrerequisite && !props.loading && props.error && (
            <div className="candidate-list-state candidate-list-error" role="alert">
              <p>{props.error}</p>
              <div className="candidate-list-actions">
                <button type="button" onClick={props.onRetry}>Retry</button>
              </div>
            </div>
          )}
          {!blockedByPrerequisite && !props.loading && !props.error && props.candidates.length === 0 && (
            <p className="candidate-list-state" role="status">{getCandidateEmptyMessage(candidateQueryText)}</p>
          )}
          {!blockedByPrerequisite && !props.loading && !props.error && allOccupied && (
            <p className="candidate-list-state" role="status">All matching melodies are already occupied in this service.</p>
          )}
          {!blockedByPrerequisite && !props.loading && !props.error && props.candidates.map((candidate, index) => {
            const current = Boolean(currentSongId && candidate.songId === currentSongId);
            const selectable = isCandidateSelectable(candidate);
            return (
              <div
                key={candidate.songId}
                className={`candidate-option-row${current ? " candidate-option-current" : ""}`}
                style={{
                  alignItems: "center",
                  minHeight: "2.2rem",
                  padding: "0.1rem 0.15rem",
                  ...(current ? { background: "#eff6ff", border: "1px solid #84adff", borderRadius: "0.65rem" } : {}),
                }}
              >
                <div
                  id={optionId(listboxId, candidate.songId)}
                  className={`candidate-option${index === activeIndex && !current ? " candidate-option-active" : ""}${selectable ? "" : " candidate-option-disabled"}`}
                  role="option"
                  aria-selected={current}
                  aria-disabled={!selectable}
                  data-song-id={candidate.songId}
                  data-candidate-option
                  onClick={() => { if (selectable) props.onSelect(candidate); }}
                >
                  <div
                    className="candidate-option-content"
                    style={{ alignItems: "center", minHeight: "2rem", padding: "0 0.35rem", ...(current ? { background: "transparent" } : {}) }}
                  >
                    <span className="candidate-option-main" style={{ alignItems: "center", minHeight: "2rem" }}>
                      <strong>{candidate.number}</strong><span>{candidate.title}</span>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="candidate-inline-detail"
                  style={{
                    alignItems: "center",
                    alignSelf: "center",
                    borderRadius: "0.65rem",
                    display: "inline-flex",
                    height: "2rem",
                    justifyContent: "center",
                    lineHeight: 1,
                    minWidth: "4.7rem",
                    padding: "0 0.65rem",
                  }}
                  onClick={() => props.onOpenDetail?.(candidate)}
                  aria-label={`Show melody detail for ${candidate.number} ${candidate.title}`}
                >Detail</button>
              </div>
            );
          })}
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
