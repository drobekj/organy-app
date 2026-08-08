import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CandidateQueryResult } from "../application/interaction-contracts";
import type { ConcreteSongLanguage, ServiceLanguage } from "./model";
import { consumeSelectedDetailDismissPointer, MelodyClassDetail, type MelodyClassDetailMode } from "./melody-detail";

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

const planningOverlayCss = `
.row-icon-palette { top: 0 !important; transform: translateY(calc(-100% + 0.26rem)); }
.row-icon-palette .row-icon-button {
  font-size: 1rem;
  font-weight: 900;
  height: 1.72rem;
  line-height: 1;
  min-width: 1.72rem;
  padding: 0;
  width: 1.72rem;
}
.row-icon-palette .row-icon-button:not(.row-icon-remove) {
  -webkit-text-stroke: 0.35px currentColor;
  text-shadow: 0.25px 0 currentColor, -0.25px 0 currentColor;
}
.row-card .candidate-combobox { position: relative; }
.row-card .candidate-combobox > .candidate-listbox,
.row-card .candidate-combobox > .melody-detail-candidate {
  position: absolute !important;
  top: calc(100% + 0.35rem);
  margin-top: 0 !important;
}
.row-card .candidate-combobox > .candidate-listbox {
  right: calc(-4.7rem - 0.45rem);
  width: 100%;
  max-width: none !important;
  min-width: 0 !important;
  max-height: min(32rem, 70vh);
  overflow-y: auto;
  direction: rtl;
  z-index: 40;
}
.row-card .candidate-combobox > .candidate-listbox > * { direction: ltr; }
.row-card .candidate-combobox > .melody-detail-candidate {
  right: 0;
  max-height: min(32rem, 70vh);
  overflow-y: auto;
  direction: rtl;
  z-index: 50 !important;
}
.row-card .candidate-combobox > .melody-detail-candidate > * { direction: ltr; }
.row-card > .melody-detail-selected {
  position: absolute !important;
  grid-column: 1 / -1 !important;
  grid-row: 2 !important;
  top: -0.2rem;
  right: 0;
  margin-top: 0 !important;
  transform: none !important;
  width: min(calc(82% - 4.223rem), 46rem) !important;
  max-height: min(32rem, 70vh);
  overflow-y: auto;
  direction: rtl;
  z-index: 50 !important;
}
.row-card > .melody-detail-selected > * { direction: ltr; }
.row-card:has(> .melody-detail-selected) .song-field-detail {
  color: var(--muted);
  cursor: default;
  opacity: 0.55;
  pointer-events: none;
}
`;

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
  const suppressOpenOnPointerDown = useRef(false);
  const autoScrolled = useRef(false);
  const pendingFullCandidateDismiss = useRef(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [detailReturnSongId, setDetailReturnSongId] = useState<string | undefined>();
  const [detailReturnCandidates, setDetailReturnCandidates] = useState<CandidateQueryResult[] | undefined>();
  const [suppressCandidateOverlay, setSuppressCandidateOverlay] = useState(false);
  const blockedByPrerequisite = Boolean(props.prerequisiteMessage);
  const currentSongId = props.selectedSong?.songId;
  const confirmedLabel = props.selectedSong
    ? `${props.selectedSong.number}${props.selectedSong.title ? ` · ${props.selectedSong.title}` : ""}`
    : "";
  const candidateQueryText = confirmedLabel && props.value === confirmedLabel ? "" : props.value;
  const visibleCandidates = detailReturnCandidates ?? props.candidates;
  const visibleLoading = detailReturnCandidates ? false : props.loading;
  const visibleError = detailReturnCandidates ? undefined : props.error;
  const allOccupied = visibleCandidates.length > 0 && visibleCandidates.every((candidate) => !isCandidateSelectable(candidate));
  const detailMode = props.detail?.mode ?? "candidate";
  const candidateDetailOpen = Boolean(props.detail && detailMode === "candidate");
  const candidateListVisible = !suppressCandidateOverlay && (props.open || candidateDetailOpen);
  const activeDescendant = props.open && !blockedByPrerequisite && activeIndex >= 0 ? optionId(listboxId, visibleCandidates[activeIndex]?.songId) : undefined;
  const candidateIds = useMemo(() => visibleCandidates.map((candidate) => candidate.songId).join("|"), [visibleCandidates]);
  const effectiveFocusSongId = detailReturnSongId ?? props.focusSongId;

  useEffect(() => {
    if (!props.open && !candidateDetailOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (candidateDetailOpen) {
        const detailRegion = rootRef.current?.querySelector<HTMLElement>(".melody-detail-candidate");
        if (listRef.current?.contains(target) || detailRegion?.contains(target)) return;
        if (target instanceof Element && target.closest<HTMLElement>('[id^="selected-song-detail-button-"]')) {
          if (props.onBackFromDetail) props.onBackFromDetail();
          else props.onCancel();
          return;
        }
        pendingFullCandidateDismiss.current = true;
        setSuppressCandidateOverlay(true);
        if (props.onBackFromDetail) props.onBackFromDetail();
        else {
          pendingFullCandidateDismiss.current = false;
          setSuppressCandidateOverlay(false);
          props.onCancel();
        }
        return;
      }
      if (rootRef.current && !rootRef.current.contains(target)) props.onCancel();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [props.open, candidateDetailOpen, props.onBackFromDetail, props.onCancel]);

  useEffect(() => {
    if (!pendingFullCandidateDismiss.current || props.detail) return;
    pendingFullCandidateDismiss.current = false;
    if (props.open) props.onCancel();
    setSuppressCandidateOverlay(false);
  }, [props.detail, props.open, props.onCancel]);

  useEffect(() => {
    if (!props.open) {
      autoScrolled.current = false;
      setActiveIndex(-1);
      setDetailReturnSongId(undefined);
      setDetailReturnCandidates(undefined);
      return;
    }
    if (blockedByPrerequisite || visibleLoading || visibleError || visibleCandidates.length === 0) {
      setActiveIndex(-1);
      return;
    }
    const initial = getInitialCandidateIndex(visibleCandidates, currentSongId, effectiveFocusSongId);
    setActiveIndex(initial);
    if (effectiveFocusSongId) queueMicrotask(() => inputRef.current?.focus());
    if (!autoScrolled.current && (effectiveFocusSongId || currentSongId) && initial >= 0) {
      autoScrolled.current = true;
      queueMicrotask(() => scrollOptionInsideList(listRef.current, initial));
    }
  }, [props.open, visibleLoading, visibleError, props.prerequisiteMessage, candidateIds, props.value, currentSongId, effectiveFocusSongId, visibleCandidates]);

  function moveActive(key: string) {
    const next = candidateIndexForKey(activeIndex, key, visibleCandidates.length);
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
      const candidate = detailReturnCandidates ? visibleCandidates[activeIndex] : props.candidates[activeIndex];
      if (candidate && isCandidateSelectable(candidate)) props.onSelect(candidate);
    }
  }

  function captureDetailReturn(songId: string) {
    const detailCandidates = props.detail?.eligibilityCandidates ?? [];
    const openedCandidate = props.detail?.candidate;
    const snapshot = openedCandidate && openedCandidate.songId === songId && !detailCandidates.some((candidate) => candidate.songId === songId)
      ? [openedCandidate, ...detailCandidates]
      : [...detailCandidates];
    autoScrolled.current = false;
    setDetailReturnSongId(songId);
    setDetailReturnCandidates(snapshot);
    props.onOpen();
  }

  function returnToVisibleCandidate(candidate: CandidateQueryResult, index: number) {
    autoScrolled.current = false;
    setActiveIndex(index);
    setDetailReturnSongId(candidate.songId);
    setDetailReturnCandidates([...visibleCandidates]);
    props.onOpen();
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
      <style>{planningOverlayCss}</style>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Song lookup"
        aria-autocomplete="list"
        aria-expanded={candidateListVisible}
        aria-controls={candidateListVisible ? listboxId : undefined}
        aria-activedescendant={activeDescendant}
        value={props.value}
        onPointerDown={(event) => {
          suppressOpenOnPointerDown.current = consumeSelectedDetailDismissPointer(event.target);
          inputWasOpenOnPointerDown.current = suppressOpenOnPointerDown.current ? false : props.open;
        }}
        onFocus={(event) => {
          if (props.disabled || props.detail || suppressOpenOnPointerDown.current) return;
          if (!props.open) {
            props.onOpen();
            if (event.currentTarget.value) event.currentTarget.select();
          }
        }}
        onClick={(event) => {
          if (suppressOpenOnPointerDown.current) {
            suppressOpenOnPointerDown.current = false;
            return;
          }
          if (props.disabled || props.detail) return;
          if (inputWasOpenOnPointerDown.current) {
            props.onCancel();
            return;
          }
          if (!props.open) props.onOpen();
          if (event.currentTarget.value) event.currentTarget.select();
        }}
        onChange={(event) => {
          setDetailReturnSongId(undefined);
          setDetailReturnCandidates(undefined);
          props.onQueryChange(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Song lookup"
        disabled={props.disabled}
      />
      {props.detail && !suppressCandidateOverlay && (
        <MelodyClassDetail
          mode={detailMode}
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
          onReturnToCandidates={captureDetailReturn}
        />
      )}
      {candidateListVisible && (
        <div
          id={listboxId}
          ref={listRef}
          className="candidate-popup candidate-listbox"
          role="listbox"
          aria-label={`Song candidates for ${props.rowLabel}`}
          aria-busy={!blockedByPrerequisite && visibleLoading}
        >
          {blockedByPrerequisite && (
            <div className="candidate-list-state candidate-list-prerequisite" role="status">
              <p>{props.prerequisiteMessage}</p>
            </div>
          )}
          {!blockedByPrerequisite && visibleLoading && <p className="candidate-list-state" role="status">Loading candidates…</p>}
          {!blockedByPrerequisite && !visibleLoading && visibleError && (
            <div className="candidate-list-state candidate-list-error" role="alert">
              <p>{visibleError}</p>
              <div className="candidate-list-actions">
                <button type="button" onClick={props.onRetry}>Retry</button>
              </div>
            </div>
          )}
          {!blockedByPrerequisite && !visibleLoading && !visibleError && visibleCandidates.length === 0 && (
            <p className="candidate-list-state" role="status">{getCandidateEmptyMessage(candidateQueryText)}</p>
          )}
          {!blockedByPrerequisite && !visibleLoading && !visibleError && allOccupied && (
            <p className="candidate-list-state" role="status">All matching melodies are already occupied in this service.</p>
          )}
          {!blockedByPrerequisite && !visibleLoading && !visibleError && visibleCandidates.map((candidate, index) => {
            const current = Boolean(currentSongId && candidate.songId === currentSongId);
            const selectable = isCandidateSelectable(candidate);
            return (
              <div
                key={candidate.songId}
                className={`candidate-option-row${current ? " candidate-option-current" : ""}${index === activeIndex && !current ? " candidate-option-active" : ""}`}
                style={{
                  alignItems: "center",
                  minHeight: "2.2rem",
                  padding: "0.1rem 0.15rem",
                  ...(current ? { background: "#eff6ff", border: "1px solid #84adff", borderRadius: "0.65rem" } : {}),
                }}
              >
                <div
                  id={optionId(listboxId, candidate.songId)}
                  className={`candidate-option${selectable ? "" : " candidate-option-disabled"}`}
                  role="option"
                  aria-selected={current}
                  aria-disabled={!selectable}
                  data-song-id={candidate.songId}
                  data-candidate-option
                  onClick={() => {
                    if (candidateDetailOpen) {
                      returnToVisibleCandidate(candidate, index);
                      return;
                    }
                    if (selectable) props.onSelect(candidate);
                  }}
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
  const containerRect = container.getBoundingClientRect();
  const optionRect = option.getBoundingClientRect();
  if (optionRect.top < containerRect.top) container.scrollTop -= containerRect.top - optionRect.top;
  else if (optionRect.bottom > containerRect.bottom) container.scrollTop += optionRect.bottom - containerRect.bottom;
}