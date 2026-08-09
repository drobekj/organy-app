"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DbReferenceAntiphonClient, MemoryReferenceAntiphonClient } from "../src/application/reference-antiphon-client";
import type { ReferenceAntiphonProvider, ReferenceAntiphonRecord } from "../src/application/reference-antiphon-contract";
import { ServiceContextReferenceAntiphonUiState, type ServiceContextAntiphonSearchSnapshot } from "../src/application/service-context-reference-antiphon-ui-state";
import type { ServiceAntiphonReference, ServiceLanguage } from "../src/planning-lifecycle";

export type ServiceContextReferenceAntiphonFieldProps = {
  runtime: "memory" | "db";
  editable: boolean;
  contextKey: string;
  serviceLanguage: ServiceLanguage;
  selected?: ServiceAntiphonReference;
  invalid?: boolean;
  onChange: (value: ServiceAntiphonReference | undefined) => void;
  clientFactory?: (runtime: "memory" | "db") => Pick<ReferenceAntiphonProvider, "list">;
};

type ViewProps = {
  editable: boolean;
  selected?: ServiceAntiphonReference;
  invalid?: boolean;
  open: boolean;
  dirty: boolean;
  query: string;
  snapshot: ServiceContextAntiphonSearchSnapshot;
  activeIndex: number;
  onOpen: () => void;
  onQueryChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelect: (record: ReferenceAntiphonRecord) => void;
  onActiveIndexChange: (index: number) => void;
  onClear: () => void;
};

type AntiphonNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function moveAntiphonActiveIndex(currentIndex: number, recordCount: number, key: AntiphonNavigationKey): number {
  if (recordCount <= 0) return 0;
  if (key === "Home") return 0;
  if (key === "End") return recordCount - 1;
  if (key === "ArrowDown") return Math.min(currentIndex + 1, recordCount - 1);
  return Math.max(currentIndex - 1, 0);
}

const label = (selected?: ServiceAntiphonReference) => selected ? `${selected.displayNumber} · ${selected.title}` : "";

export function ServiceContextReferenceAntiphonFieldView(props: ViewProps) {
  const displayValue = props.open && props.dirty ? props.query : label(props.selected);
  const confirmedInvalid = Boolean(props.invalid && !(props.open && props.dirty));
  return <>
    <div className={`service-antiphon-control${confirmedInvalid ? " service-antiphon-control-invalid" : ""}`}>
      <input
        aria-label="Antiphon"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={props.open}
        aria-controls={props.open ? "service-antiphon-listbox" : undefined}
        aria-activedescendant={props.open && props.snapshot.records[props.activeIndex] ? `service-antiphon-option-${props.snapshot.records[props.activeIndex].id.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined}
        aria-invalid={confirmedInvalid || undefined}
        readOnly={!props.editable}
        value={displayValue}
        placeholder="Select antiphon"
        onFocus={props.onOpen}
        onClick={props.onOpen}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={props.onKeyDown}
      />
      {props.selected?.sourceUrl && !(props.open && props.dirty) && <a className="service-antiphon-source" href={props.selected.sourceUrl} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>Source</a>}
      {props.selected && props.editable && <button className="service-antiphon-clear" type="button" aria-label="Clear antiphon" title="Clear antiphon" onPointerDown={(event) => event.preventDefault()} onClick={props.onClear}>×</button>}
    </div>
    {props.open && <div id="service-antiphon-listbox" className="service-antiphon-listbox" role="listbox" aria-label="Antiphon candidates">
      {props.snapshot.loading && <div className="service-antiphon-list-state" role="status">Loading…</div>}
      {props.snapshot.error && <div className="service-antiphon-list-state service-antiphon-list-error" role="alert">Antiphon lookup unavailable.</div>}
      {!props.snapshot.loading && !props.snapshot.error && props.snapshot.records.length === 0 && <div className="service-antiphon-list-state">No antiphons available.</div>}
      {props.snapshot.records.map((record, index) => <div
        id={`service-antiphon-option-${record.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
        key={record.id}
        className={`service-antiphon-option${index === props.activeIndex ? " service-antiphon-option-active" : ""}`}
        role="option"
        aria-selected={props.selected?.id === record.id}
        onPointerMove={() => props.onActiveIndexChange(index)}
        onPointerDown={(event) => { event.preventDefault(); props.onSelect(record); }}
      >
        <strong>{record.displayNumber}</strong>
        <span>{record.title}</span>
        {record.sourceUrl && <a className="service-antiphon-source" href={record.sourceUrl} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>Source</a>}
      </div>)}
    </div>}
  </>;
}

const defaultClientFactory = (runtime: "memory" | "db"): Pick<ReferenceAntiphonProvider, "list"> => runtime === "db" ? new DbReferenceAntiphonClient() : new MemoryReferenceAntiphonClient();

async function listAll(client: Pick<ReferenceAntiphonProvider, "list">, serviceLanguage: ServiceLanguage, search: string): Promise<ReferenceAntiphonRecord[]> {
  const language = serviceLanguage === "mixed" ? "all" : serviceLanguage;
  const first = await client.list({ language, search, page: 0, pageSize: 200 });
  if (first.pageCount <= 1) return first.records;
  const rest = await Promise.all(Array.from({ length: first.pageCount - 1 }, (_, index) => client.list({ language, search, page: index + 1, pageSize: 200 })));
  return [first, ...rest].flatMap((page) => page.records);
}

export function ServiceContextReferenceAntiphonField({ runtime, editable, contextKey, serviceLanguage, selected, invalid, onChange, clientFactory = defaultClientFactory }: ServiceContextReferenceAntiphonFieldProps) {
  const identity = { runtimeMode: runtime, contextKey, editable, serviceLanguage } as const;
  const machineRef = useRef<ServiceContextReferenceAntiphonUiState | null>(null);
  if (!machineRef.current) machineRef.current = new ServiceContextReferenceAntiphonUiState(identity);
  const machine = machineRef.current;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [snapshot, setSnapshot] = useState(() => machine.snapshot());
  const client = useMemo(() => clientFactory(runtime), [runtime, clientFactory]);
  const sync = () => setSnapshot(machine.snapshot());

  const closeRestore = () => {
    machine.cancel();
    sync();
    setOpen(false);
    setDirty(false);
    setQuery("");
    setActiveIndex(0);
  };

  useEffect(() => {
    if (machine.changeIdentity(identity)) {
      setOpen(false); setDirty(false); setQuery(""); setActiveIndex(0);
    }
    sync();
  }, [runtime, contextKey, editable, serviceLanguage]);

  useEffect(() => {
    if (!open || !editable) { machine.cancel(); sync(); return; }
    const token = machine.begin();
    sync();
    void listAll(client, serviceLanguage, dirty ? query.trim() : "")
      .then((records) => { if (machine.complete(token, records)) sync(); })
      .catch((cause: unknown) => { if (machine.fail(token, cause instanceof Error ? cause.message : "Antiphon lookup failed.")) sync(); });
  }, [client, open, editable, serviceLanguage, dirty, query, contextKey]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && wrapperRef.current?.contains(target)) return;
      closeRestore();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!snapshot.records.length) { setActiveIndex(0); return; }
    if (!dirty && selected) {
      const selectedIndex = snapshot.records.findIndex((record) => record.id === selected.id);
      if (selectedIndex >= 0) { setActiveIndex(selectedIndex); return; }
    }
    setActiveIndex((index) => Math.min(index, snapshot.records.length - 1));
  }, [snapshot.records, selected?.id, dirty]);

  useEffect(() => {
    if (!open) return;
    const record = snapshot.records[activeIndex];
    if (!record) return;
    document.getElementById(`service-antiphon-option-${record.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, snapshot.records]);

  const openLookup = () => {
    if (!editable || open) return;
    setOpen(true); setDirty(false); setQuery("");
    queueMicrotask(() => wrapperRef.current?.querySelector<HTMLInputElement>("input")?.select());
  };
  const select = (record: ReferenceAntiphonRecord) => {
    onChange({ id: record.id, displayNumber: record.displayNumber, title: record.title, ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}) });
    closeRestore();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { if (open) { event.preventDefault(); closeRestore(); } return; }
    if (!open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); openLookup(); return; }
    if (!open) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setActiveIndex((index) => moveAntiphonActiveIndex(index, snapshot.records.length, event.key as AntiphonNavigationKey));
    } else if (event.key === "Enter") { const record = snapshot.records[activeIndex]; if (record) { event.preventDefault(); select(record); } }
  };

  return <div className="service-antiphon-lookup" ref={wrapperRef}>
    <ServiceContextReferenceAntiphonFieldView
      editable={editable} selected={selected} invalid={invalid} open={open} dirty={dirty} query={query} snapshot={snapshot} activeIndex={activeIndex}
      onOpen={openLookup}
      onQueryChange={(value) => { if (!open) setOpen(true); setDirty(true); setQuery(value); setActiveIndex(0); }}
      onKeyDown={onKeyDown}
      onSelect={select}
      onActiveIndexChange={setActiveIndex}
      onClear={() => { onChange(undefined); closeRestore(); }}
    />
  </div>;
}