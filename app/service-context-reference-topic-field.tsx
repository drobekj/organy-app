"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DbReferenceTopicClient, MemoryReferenceTopicClient } from "../src/application/reference-topic-client";
import type { ReferenceThematicSection, ReferenceThematicSectionProvider } from "../src/application/reference-thematic-section-contract";
import { ServiceContextReferenceTopicUiState, type ServiceContextTopicSearchSnapshot } from "../src/application/service-context-reference-topic-ui-state";
import type { ServiceLanguage, ServiceTopicReference } from "../src/planning-lifecycle";
import { mixedServiceCandidateStyle, serviceContextLookupInputClickAction } from "./service-context-reference-antiphon-field";

export type ServiceContextReferenceTopicFieldProps = {
  runtime: "memory" | "db";
  editable: boolean;
  contextKey: string;
  serviceLanguage: ServiceLanguage;
  selected?: ServiceTopicReference;
  invalid?: boolean;
  guideHint?: string;
  onChange: (value: ServiceTopicReference | undefined) => void;
  clientFactory?: (runtime: "memory" | "db") => Pick<ReferenceThematicSectionProvider, "listSections">;
};

type ViewProps = {
  editable: boolean;
  selected?: ServiceTopicReference;
  invalid?: boolean;
  open: boolean;
  dirty: boolean;
  query: string;
  snapshot: ServiceContextTopicSearchSnapshot;
  activeIndex: number;
  serviceLanguage?: ServiceLanguage;
  onOpen: () => void;
  onInputPointerDown?: () => void;
  onInputClick?: () => void;
  onQueryChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelect: (record: ReferenceThematicSection) => void;
  onSelectNone: () => void;
  onActiveIndexChange: (index: number) => void;
};

type TopicNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function moveTopicActiveIndex(currentIndex: number, recordCount: number, key: TopicNavigationKey): number {
  if (recordCount <= 0) return 0;
  if (key === "Home") return 0;
  if (key === "End") return recordCount - 1;
  if (key === "ArrowDown") return Math.min(currentIndex + 1, recordCount - 1);
  return Math.max(currentIndex - 1, 0);
}

export function ServiceContextReferenceTopicFieldView(props: ViewProps) {
  const displayValue = props.open && props.dirty ? props.query : props.selected?.title ?? "";
  const confirmedInvalid = Boolean(props.invalid && !(props.open && props.dirty));
  const activeRecord = props.activeIndex > 0 ? props.snapshot.records[props.activeIndex - 1] : undefined;
  const activeDescendant = props.open
    ? props.activeIndex === 0
      ? "service-topic-option-none"
      : activeRecord
        ? optionId(activeRecord.id)
        : undefined
    : undefined;

  return <>
    <div className={`service-antiphon-control${confirmedInvalid ? " service-antiphon-control-invalid" : ""}`}>
      <input
        aria-label="Topic"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={props.open}
        aria-controls={props.open ? "service-topic-listbox" : undefined}
        aria-activedescendant={activeDescendant}
        aria-invalid={confirmedInvalid || undefined}
        readOnly={!props.editable}
        value={displayValue}
        placeholder="Select topic"
        onPointerDown={props.onInputPointerDown}
        onFocus={props.onOpen}
        onClick={props.onInputClick ?? props.onOpen}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={props.onKeyDown}
      />
    </div>
    {props.open && <div id="service-topic-listbox" className="service-antiphon-listbox" role="listbox" aria-label="Topic candidates">
      <div
        id="service-topic-option-none"
        className={`service-antiphon-option service-context-none-option${props.activeIndex === 0 ? " service-antiphon-option-active" : ""}`}
        role="option"
        aria-selected={!props.selected}
        onPointerMove={() => props.onActiveIndexChange(0)}
        onPointerDown={(event) => { event.preventDefault(); props.onSelectNone(); }}
      >
        <span>None</span>
      </div>
      {props.snapshot.loading && <div className="service-antiphon-list-state" role="status">Loading…</div>}
      {props.snapshot.error && <div className="service-antiphon-list-state service-antiphon-list-error" role="alert">Topic lookup unavailable.</div>}
      {!props.snapshot.loading && !props.snapshot.error && props.snapshot.records.length === 0 && <div className="service-antiphon-list-state">No topics available.</div>}
      {props.snapshot.records.map((record, index) => <div
        id={optionId(record.id)}
        key={record.id}
        className={`service-antiphon-option${index + 1 === props.activeIndex ? " service-antiphon-option-active" : ""}`}
        style={mixedServiceCandidateStyle(props.serviceLanguage, record.language)}
        role="option"
        aria-selected={props.selected?.id === record.id}
        onPointerMove={() => props.onActiveIndexChange(index + 1)}
        onPointerDown={(event) => { event.preventDefault(); props.onSelect(record); }}
      >
        <span>{record.title}</span>
      </div>)}
    </div>}
  </>;
}

const defaultClientFactory = (runtime: "memory" | "db"): Pick<ReferenceThematicSectionProvider, "listSections"> => runtime === "db" ? new DbReferenceTopicClient() : new MemoryReferenceTopicClient();

async function listAll(client: Pick<ReferenceThematicSectionProvider, "listSections">, serviceLanguage: ServiceLanguage, search: string): Promise<ReferenceThematicSection[]> {
  const languages: ("czech" | "polish")[] = serviceLanguage === "mixed" ? ["polish", "czech"] : [serviceLanguage];
  const pages = await Promise.all(languages.map((language) => client.listSections(language)));
  const records = pages.flat();
  const query = search.trim().toLocaleLowerCase();
  return query ? records.filter((record) => record.title.toLocaleLowerCase().includes(query)) : records;
}

export function ServiceContextReferenceTopicField({ runtime, editable, contextKey, serviceLanguage, selected, invalid, onChange, clientFactory = defaultClientFactory }: ServiceContextReferenceTopicFieldProps) {
  const identity = { runtimeMode: runtime, contextKey, editable, serviceLanguage } as const;
  const machineRef = useRef<ServiceContextReferenceTopicUiState | null>(null);
  if (!machineRef.current) machineRef.current = new ServiceContextReferenceTopicUiState(identity);
  const machine = machineRef.current;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputWasOpenOnPointerDown = useRef(false);
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
    if (machine.changeIdentity(identity)) { setOpen(false); setDirty(false); setQuery(""); setActiveIndex(0); }
    sync();
  }, [runtime, contextKey, editable, serviceLanguage]);

  useEffect(() => {
    if (!open || !editable) { machine.cancel(); sync(); return; }
    const token = machine.begin();
    sync();
    void listAll(client, serviceLanguage, dirty ? query : "")
      .then((records) => { if (machine.complete(token, records)) sync(); })
      .catch((cause: unknown) => { if (machine.fail(token, cause instanceof Error ? cause.message : "Topic lookup failed.")) sync(); });
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
    const count = snapshot.records.length + 1;
    if (!dirty && selected) {
      const selectedIndex = snapshot.records.findIndex((record) => record.id === selected.id);
      if (selectedIndex >= 0) { setActiveIndex(selectedIndex + 1); return; }
    }
    setActiveIndex((index) => Math.min(index, Math.max(0, count - 1)));
  }, [snapshot.records, selected?.id, dirty]);

  useEffect(() => {
    if (!open) return;
    if (activeIndex === 0) {
      document.getElementById("service-topic-option-none")?.scrollIntoView({ block: "nearest" });
      return;
    }
    const record = snapshot.records[activeIndex - 1];
    if (!record) return;
    document.getElementById(optionId(record.id))?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, snapshot.records]);

  const openLookup = () => {
    if (!editable || open) return;
    setOpen(true); setDirty(false); setQuery("");
    queueMicrotask(() => wrapperRef.current?.querySelector<HTMLInputElement>("input")?.select());
  };

  const handleInputClick = () => {
    if (!editable) return;
    if (serviceContextLookupInputClickAction(inputWasOpenOnPointerDown.current) === "close") {
      closeRestore();
      return;
    }
    if (!open) openLookup();
  };

  const select = (record: ReferenceThematicSection) => { onChange({ id: record.id, title: record.title }); closeRestore(); };
  const selectNone = () => { onChange(undefined); closeRestore(); };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { if (open) { event.preventDefault(); closeRestore(); } return; }
    if (!open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); openLookup(); return; }
    if (!open) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setActiveIndex((index) => moveTopicActiveIndex(index, snapshot.records.length + 1, event.key as TopicNavigationKey));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex === 0) {
        selectNone();
        return;
      }
      const record = snapshot.records[activeIndex - 1];
      if (record) select(record);
    }
  };

  return <div className="service-antiphon-lookup service-topic-lookup" data-guide-hint={guideHint} ref={wrapperRef}>
    <ServiceContextReferenceTopicFieldView
      editable={editable}
      selected={selected}
      invalid={invalid}
      open={open}
      dirty={dirty}
      query={query}
      snapshot={snapshot}
      activeIndex={activeIndex}
      serviceLanguage={serviceLanguage}
      onOpen={openLookup}
      onInputPointerDown={() => { inputWasOpenOnPointerDown.current = open; }}
      onInputClick={handleInputClick}
      onQueryChange={(value) => { if (!open) setOpen(true); setDirty(true); setQuery(value); setActiveIndex(0); }}
      onKeyDown={onKeyDown}
      onSelect={select}
      onSelectNone={selectNone}
      onActiveIndexChange={setActiveIndex}
    />
  </div>;
}

function optionId(id: string): string { return `service-topic-option-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`; }
