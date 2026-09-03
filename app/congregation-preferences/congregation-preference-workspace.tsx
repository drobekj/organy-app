"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CongregationOwnPreferenceEntry } from "../../src/application/congregation-preference-voter";
import type { ReferenceCatalogRecord } from "../../src/application/reference-catalog-contract";

type CongregationLanguage = "mixed" | "czech" | "polish";

export function CongregationPreferenceWorkspace({
  records,
  preferences,
}: {
  records: ReferenceCatalogRecord[];
  preferences: CongregationOwnPreferenceEntry[];
}) {
  const [language, setLanguage] = useState<CongregationLanguage>("czech");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string>();
  const [scores, setScores] = useState<Record<string, 0 | 1>>(() =>
    Object.fromEntries(preferences.map((entry) => [entry.referenceSongId, entry.score])),
  );
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string>();
  const listRef = useRef<HTMLDivElement>(null);

  const visibleRecords = useMemo(
    () => records.filter((record) => language === "mixed" || record.language === language),
    [records, language],
  );

  useEffect(() => {
    const next = query.trim() ? findMatch(visibleRecords, query) : undefined;
    setActiveId(next?.id);
    requestAnimationFrame(() => {
      if (next) scrollRecordIntoView(next.id);
      else if (listRef.current) listRef.current.scrollTop = 0;
    });
  }, [language]);

  function changeQuery(value: string) {
    setQuery(value);
    const next = value.trim() ? findMatch(visibleRecords, value) : undefined;
    setActiveId(next?.id);
    if (next) requestAnimationFrame(() => scrollRecordIntoView(next.id));
  }

  function moveCursor(delta: -1 | 1) {
    if (visibleRecords.length === 0) return;
    const currentIndex = activeId ? visibleRecords.findIndex((record) => record.id === activeId) : -1;
    const matched = query.trim() ? findMatch(visibleRecords, query) : undefined;
    const fallback = matched ? visibleRecords.findIndex((record) => record.id === matched.id) : 0;
    const baseIndex = currentIndex >= 0 ? currentIndex : Math.max(0, fallback);
    const nextIndex = Math.min(visibleRecords.length - 1, Math.max(0, baseIndex + delta));
    const next = visibleRecords[nextIndex];
    setActiveId(next.id);
    requestAnimationFrame(() => scrollRecordIntoView(next.id));
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveCursor(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveCursor(-1);
    } else if (event.key === "Home") {
      if (visibleRecords[0]) {
        event.preventDefault();
        setActiveId(visibleRecords[0].id);
        requestAnimationFrame(() => scrollRecordIntoView(visibleRecords[0].id));
      }
    } else if (event.key === "End") {
      const last = visibleRecords.at(-1);
      if (last) {
        event.preventDefault();
        setActiveId(last.id);
        requestAnimationFrame(() => scrollRecordIntoView(last.id));
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setActiveId(undefined);
      if (listRef.current) listRef.current.scrollTop = 0;
    }
  }

  async function togglePreference(referenceSongId: string) {
    if (savingIds.has(referenceSongId)) return;

    const before = scores[referenceSongId] ?? 0;
    const next: 0 | 1 = before === 1 ? 0 : 1;
    setError(undefined);
    setScores((current) => ({ ...current, [referenceSongId]: next }));
    setSavingIds((current) => new Set(current).add(referenceSongId));

    try {
      const response = await fetch("/api/congregation-preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "saveOwnPreference",
          referenceSongId,
          score: next,
        }),
      });
      const payload = await response.json().catch(() => undefined) as
        | { preference?: CongregationOwnPreferenceEntry; error?: { message?: string } }
        | undefined;
      if (!response.ok || !payload?.preference) {
        throw new Error(payload?.error?.message ?? "Preference could not be saved.");
      }
      setScores((current) => ({ ...current, [referenceSongId]: payload.preference!.score }));
    } catch (cause) {
      setScores((current) => ({ ...current, [referenceSongId]: before }));
      setError(cause instanceof Error ? cause.message : "Preference could not be saved.");
    } finally {
      setSavingIds((current) => {
        const nextSaving = new Set(current);
        nextSaving.delete(referenceSongId);
        return nextSaving;
      });
    }
  }

  function scrollRecordIntoView(referenceSongId: string) {
    document.getElementById(rowDomId(referenceSongId))?.scrollIntoView({ block: "nearest" });
  }

  return (
    <section className="congregation-preference-workspace" aria-label="Congregation song preferences">
      <div className="congregation-language-row">
        <fieldset className="melody-protection-panel congregation-language-panel" aria-label="Language">
          <legend>Language</legend>
          <label className="melody-protection-control">
            <span className="sr-only">Congregation catalog language</span>
            <select
              aria-label="Congregation catalog language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as CongregationLanguage)}
            >
              <option value="czech">Czech</option>
              <option value="polish">Polish</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
        </fieldset>
      </div>

      <fieldset className="field-group congregation-find-song-panel" aria-label="Find Song">
        <legend>Find Song</legend>

        <div className="congregation-song-lookup">
          <input
            type="text"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Number or song title"
            aria-label="Find song by number or title"
            aria-controls="congregation-song-list"
            aria-autocomplete="list"
          />
        </div>

        {error && <p className="auth-error congregation-preference-error" role="alert">{error}</p>}

        <div
          ref={listRef}
          id="congregation-song-list"
          className="congregation-song-scroll"
          role="list"
          aria-label={language + " congregation songs"}
        >
          {visibleRecords.map((record) => {
            const selected = (scores[record.id] ?? 0) === 1;
            const active = activeId === record.id;
            const saving = savingIds.has(record.id);
            return (
              <div
                key={record.id}
                id={rowDomId(record.id)}
                className={[
                  "congregation-song-row",
                  selected ? "congregation-song-row-selected" : "",
                  active ? "congregation-song-row-active" : "",
                ].filter(Boolean).join(" ")}
                role="listitem"
              >
                <div className="congregation-song-main">
                  <strong>{record.displayNumber}</strong>
                  <span className="congregation-song-title">{record.title}</span>
                  {record.sourceUrl && (
                    <a
                      className="congregation-song-source"
                      href={record.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Source
                    </a>
                  )}
                </div>

                <button
                  type="button"
                  className="workspace-toggle-switch congregation-preference-toggle"
                  role="switch"
                  aria-checked={selected}
                  aria-label={(selected ? "Remove" : "Add") + " preference for " + record.displayNumber + " " + record.title}
                  aria-busy={saving}
                  disabled={saving}
                  onClick={() => void togglePreference(record.id)}
                >
                  <span className="workspace-toggle-thumb" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}

function rowDomId(referenceSongId: string): string {
  return "congregation-song-" + referenceSongId.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function findMatch(records: ReferenceCatalogRecord[], rawQuery: string): ReferenceCatalogRecord | undefined {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return undefined;

  const looksLikeNumber = /^[0-9/]+$/.test(query);
  if (looksLikeNumber) {
    return records.find((record) => record.displayNumber.toLocaleLowerCase().startsWith(query));
  }

  return records.find((record) => record.title.toLocaleLowerCase().includes(query));
}
