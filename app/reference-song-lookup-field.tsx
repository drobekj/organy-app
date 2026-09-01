"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DbReferenceCatalogClient } from "../src/application/reference-catalog-client";
import type { ReferenceCatalogRecord } from "../src/application/reference-catalog-contract";
import type { RecommendedReferenceSong } from "../src/application/reference-antiphon-recommendation";

type ReferenceSongLookupClient = Pick<DbReferenceCatalogClient, "list">;

export type ReferenceSongLookupFieldProps = {
  language: "czech" | "polish";
  selected: RecommendedReferenceSong | null;
  disabled?: boolean;
  ariaLabel?: string;
  listboxId?: string;
  getOptionClassName?: (record: ReferenceCatalogRecord) => string | undefined;
  selectedValueClassName?: string;
  guideHint?: string;
  onSelect: (record: ReferenceCatalogRecord | null) => void;
  clientFactory?: () => ReferenceSongLookupClient;
};

const defaultClientFactory = () => new DbReferenceCatalogClient();
const label = (song: RecommendedReferenceSong | null) => song ? `${song.displayNumber} · ${song.title}` : "none";

async function listAll(client: ReferenceSongLookupClient, language: "czech" | "polish", search: string): Promise<ReferenceCatalogRecord[]> {
  const first = await client.list({ language, search, page: 0, pageSize: 200 });
  if (first.pageCount <= 1) return first.records;
  const rest = await Promise.all(
    Array.from({ length: first.pageCount - 1 }, (_, index) =>
      client.list({ language, search, page: index + 1, pageSize: 200 }),
    ),
  );
  return [first, ...rest].flatMap((page) => page.records);
}

export function ReferenceSongLookupField({
  language,
  selected,
  disabled = false,
  ariaLabel = "Ref song",
  listboxId = "reference-song-listbox",
  getOptionClassName,
  selectedValueClassName,
  guideHint,
  onSelect,
  clientFactory = defaultClientFactory,
}: ReferenceSongLookupFieldProps) {
  const client = useMemo(() => clientFactory(), [clientFactory]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const inputWasOpenOnPointerDown = useRef(false);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<ReferenceCatalogRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setOpen(false);
    setDirty(false);
    setQuery("");
    setRecords([]);
    setActiveIndex(0);
    setError(undefined);
    request.current += 1;
  }, [language]);

  useEffect(() => {
    if (!open) return;
    const token = ++request.current;
    setLoading(true);
    setError(undefined);
    void listAll(client, language, dirty ? query.trim() : "").then((next) => {
      if (request.current !== token) return;
      setRecords(next);
      setActiveIndex((index) => Math.min(index, next.length));
    }).catch((cause: unknown) => {
      if (request.current !== token) return;
      setRecords([]);
      setError(cause instanceof Error ? cause.message : "Reference song lookup failed.");
    }).finally(() => {
      if (request.current === token) setLoading(false);
    });
  }, [client, language, open, dirty, query]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || wrapperRef.current?.contains(target)) return;
      setOpen(false);
      setDirty(false);
      setQuery("");
    }
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [open]);

  function openLookup() {
    if (disabled || open) return;
    setOpen(true);
    setDirty(false);
    setQuery("");
    setActiveIndex(0);
    queueMicrotask(() => wrapperRef.current?.querySelector<HTMLInputElement>("input")?.select());
  }

  function closeLookup() {
    setOpen(false);
    setDirty(false);
    setQuery("");
    setActiveIndex(0);
  }

  function choose(record: ReferenceCatalogRecord | null) {
    onSelect(record);
    closeLookup();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        closeLookup();
      }
      return;
    }
    if (!open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      openLookup();
      return;
    }
    if (!open) return;
    const optionCount = records.length + 1;
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(optionCount - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(optionCount - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(activeIndex === 0 ? null : records[activeIndex - 1] ?? null);
    }
  }

  const displayValue = open && dirty ? query : label(selected);
  return <div className="reference-song-lookup" ref={wrapperRef}>
    <div className="reference-song-control">
      <input
        aria-label={ariaLabel}
        data-guide-hint={guideHint}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        className={selected && !(open && dirty) ? selectedValueClassName : undefined}
        value={displayValue}
        onPointerDown={() => { inputWasOpenOnPointerDown.current = open; }}
        onFocus={openLookup}
        onClick={() => {
          if (disabled) return;
          if (inputWasOpenOnPointerDown.current) closeLookup();
          else openLookup();
        }}
        onChange={(event) => {
          if (!open) setOpen(true);
          setDirty(true);
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={onKeyDown}
      />
    </div>
    {open && <div id={listboxId} className="reference-song-listbox" role="listbox" aria-label={`${ariaLabel} candidates`}>
      <div
        className={`reference-song-option${activeIndex === 0 ? " reference-song-option-active" : ""}`}
        role="option"
        aria-selected={selected === null}
        onPointerMove={() => setActiveIndex(0)}
        onPointerDown={(event) => { event.preventDefault(); choose(null); }}
      >
        <strong>none</strong>
      </div>
      {loading && <div className="reference-song-list-state" role="status">Loading…</div>}
      {error && <div className="reference-song-list-state reference-song-list-error" role="alert">Reference song lookup unavailable.</div>}
      {!loading && !error && records.length === 0 && <div className="reference-song-list-state">No songs match this lookup.</div>}
      {records.map((record, index) => <div
        key={record.id}
        className={`reference-song-option${activeIndex === index + 1 ? " reference-song-option-active" : ""}${getOptionClassName?.(record) ? ` ${getOptionClassName(record)}` : ""}`}
        role="option"
        aria-selected={selected?.referenceSongId === record.id}
        onPointerMove={() => setActiveIndex(index + 1)}
        onPointerDown={(event) => { event.preventDefault(); choose(record); }}
      >
        <strong>{record.displayNumber}</strong>
        <span>{record.title}</span>
      </div>)}
    </div>}
  </div>;
}
