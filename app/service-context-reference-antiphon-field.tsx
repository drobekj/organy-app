"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DbReferenceAntiphonClient, MemoryReferenceAntiphonClient } from "../src/application/reference-antiphon-client";
import type { ReferenceAntiphonProvider, ReferenceAntiphonRecord } from "../src/application/reference-antiphon-contract";
import type { RecommendedReferenceSong, ReferenceAntiphonRecommendation } from "../src/application/reference-antiphon-recommendation";
import type { ReferenceCatalogRecord } from "../src/application/reference-catalog-contract";
import { ServiceContextReferenceAntiphonUiState, type ServiceContextAntiphonSearchSnapshot } from "../src/application/service-context-reference-antiphon-ui-state";
import type { ServiceAntiphonReference, ServiceLanguage } from "../src/planning-lifecycle";
import { ReferenceSongLookupField } from "./reference-song-lookup-field";

type RecommendationResult =
  | { success: true; value: ReferenceAntiphonRecommendation }
  | { success: false; error: { message: string } };

export type AntiphonRecommendationClient = {
  get: (antiphonId: string) => Promise<RecommendationResult>;
  set?: (antiphonId: string, referenceSongId: string | null) => Promise<RecommendationResult>;
};

export type ServiceContextReferenceAntiphonFieldProps = {
  runtime: "memory" | "db";
  editable: boolean;
  contextKey: string;
  serviceLanguage: ServiceLanguage;
  selected?: ServiceAntiphonReference;
  recommendedSong?: RecommendedReferenceSong | null;
  recommendationLoading?: boolean;
  recommendationError?: string;
  recommendationClient?: AntiphonRecommendationClient;
  canEditRecommendation?: boolean;
  invalid?: boolean;
  onChange: (value: ServiceAntiphonReference | undefined) => void;
  onRecommendationChanged?: (value: ReferenceAntiphonRecommendation) => void | Promise<void>;
  clientFactory?: (runtime: "memory" | "db") => Pick<ReferenceAntiphonProvider, "list">;
};

type DetailState = {
  antiphon: ServiceAntiphonReference;
  origin: "selected" | "list";
};

type DetailViewState = {
  antiphon: ServiceAntiphonReference;
  origin: "selected" | "list";
  recommendation?: ReferenceAntiphonRecommendation;
  loading: boolean;
  saving: boolean;
  error?: string;
  editableRecommendation: boolean;
};

type ViewProps = {
  editable: boolean;
  selected?: ServiceAntiphonReference;
  invalid?: boolean;
  open: boolean;
  detail?: DetailViewState;
  dirty: boolean;
  query: string;
  snapshot: ServiceContextAntiphonSearchSnapshot;
  activeIndex: number;
  serviceLanguage?: ServiceLanguage;
  onOpen: () => void;
  onInputPointerDown?: () => void;
  onInputClick?: () => void;
  onQueryChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelect: (record: ReferenceAntiphonRecord) => void;
  onSelectNone: () => void;
  onOpenDetail: (record: ServiceAntiphonReference, origin: "selected" | "list") => void;
  onActiveIndexChange: (index: number) => void;
  onSaveRecommendation: (record: ReferenceCatalogRecord | null) => void;
};

type AntiphonNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function moveAntiphonActiveIndex(currentIndex: number, recordCount: number, key: AntiphonNavigationKey): number {
  if (recordCount <= 0) return 0;
  if (key === "Home") return 0;
  if (key === "End") return recordCount - 1;
  if (key === "ArrowDown") return Math.min(currentIndex + 1, recordCount - 1);
  return Math.max(currentIndex - 1, 0);
}

export function serviceContextLookupInputClickAction(wasOpenOnPointerDown: boolean): "open" | "close" {
  return wasOpenOnPointerDown ? "close" : "open";
}

const label = (selected?: ServiceAntiphonReference) => selected ? `${selected.displayNumber} · ${selected.title}` : "";

export function mixedServiceCandidateStyle(serviceLanguage: ServiceLanguage | undefined, language: "czech" | "polish") {
  if (serviceLanguage !== "mixed") return undefined;
  return {
    background: language === "polish"
      ? "linear-gradient(90deg, #ffffff 0%, #eef0f3 100%)"
      : "linear-gradient(90deg, #eef0f3 0%, #ffffff 100%)",
  };
}

function recordSnapshot(record: ReferenceAntiphonRecord): ServiceAntiphonReference {
  return {
    id: record.id,
    displayNumber: record.displayNumber,
    title: record.title,
    ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}),
  };
}

function antiphonOptionId(record: ReferenceAntiphonRecord): string {
  return `service-antiphon-option-${record.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function detailLanguage(antiphon: ServiceAntiphonReference): "czech" | "polish" {
  return antiphon.id.startsWith("polish:") ? "polish" : "czech";
}

export function ServiceContextReferenceAntiphonFieldView(props: ViewProps) {
  const displayValue = props.open && props.dirty ? props.query : label(props.selected);
  const confirmedInvalid = Boolean(props.invalid && !(props.open && props.dirty));
  const activeRecord = props.activeIndex > 0 ? props.snapshot.records[props.activeIndex - 1] : undefined;
  const activeDescendant = props.open
    ? props.activeIndex === 0
      ? "service-antiphon-option-none"
      : activeRecord
        ? antiphonOptionId(activeRecord)
        : undefined
    : undefined;
  const showSelectedDetailButton = Boolean(props.selected && !(props.open && props.dirty));

  return <>
    <div className={`service-antiphon-control${confirmedInvalid ? " service-antiphon-control-invalid" : ""}`}>
      <input
        aria-label="Antiphon"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={props.open}
        aria-controls={props.open ? "service-antiphon-listbox" : undefined}
        aria-activedescendant={activeDescendant}
        aria-invalid={confirmedInvalid || undefined}
        readOnly={!props.editable}
        value={displayValue}
        placeholder="Select antiphon"
        onPointerDown={props.onInputPointerDown}
        onFocus={props.onOpen}
        onClick={props.onInputClick ?? props.onOpen}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={props.onKeyDown}
      />
      {showSelectedDetailButton && <button
        type="button"
        className="candidate-inline-detail service-antiphon-detail-button"
        aria-expanded={props.detail?.origin === "selected" && props.detail.antiphon.id === props.selected?.id}
        aria-label={`Show antiphon detail for ${props.selected!.displayNumber} ${props.selected!.title}`}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => props.onOpenDetail(props.selected!, "selected")}
      >Detail</button>}
    </div>

    {props.open && <div id="service-antiphon-listbox" className="service-antiphon-listbox" role="listbox" aria-label="Antiphon candidates">
      <div
        id="service-antiphon-option-none"
        className={`service-antiphon-option service-context-none-option${props.activeIndex === 0 ? " service-antiphon-option-active" : ""}`}
        role="option"
        aria-selected={!props.selected}
        onPointerMove={() => props.onActiveIndexChange(0)}
        onPointerDown={(event) => { event.preventDefault(); props.onSelectNone(); }}
      >
        <span>None</span>
      </div>
      {props.snapshot.loading && <div className="service-antiphon-list-state" role="status">Loading…</div>}
      {props.snapshot.error && <div className="service-antiphon-list-state service-antiphon-list-error" role="alert">Antiphon lookup unavailable.</div>}
      {!props.snapshot.loading && !props.snapshot.error && props.snapshot.records.length === 0 && <div className="service-antiphon-list-state">No antiphons available.</div>}
      {props.snapshot.records.map((record, index) => <div
        id={antiphonOptionId(record)}
        key={record.id}
        className={`service-antiphon-option${index + 1 === props.activeIndex ? " service-antiphon-option-active" : ""}`}
        style={mixedServiceCandidateStyle(props.serviceLanguage, record.language)}
        role="option"
        aria-selected={props.selected?.id === record.id}
        onPointerMove={() => props.onActiveIndexChange(index + 1)}
        onPointerDown={(event) => { event.preventDefault(); props.onSelect(record); }}
      >
        <strong>{record.displayNumber}</strong>
        <span>{record.title}</span>
        <button
          type="button"
          className="candidate-inline-detail service-antiphon-detail-button"
          aria-expanded={props.detail?.origin === "list" && props.detail.antiphon.id === record.id}
          aria-label={`Show antiphon detail for ${record.displayNumber} ${record.title}`}
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onClick={(event) => {
            event.stopPropagation();
            props.onOpenDetail(recordSnapshot(record), "list");
          }}
        >Detail</button>
      </div>)}
    </div>}

    {props.detail && <section className="service-antiphon-detail" role="dialog" aria-label={`Antiphon detail for ${props.detail.antiphon.displayNumber} ${props.detail.antiphon.title}`}>
      <div className="service-antiphon-detail-row service-antiphon-detail-main-row">
        <strong>{props.detail.antiphon.displayNumber}</strong>
        <span className="service-antiphon-detail-title">{props.detail.antiphon.title}</span>
        {props.detail.antiphon.sourceUrl && <a className="service-antiphon-source" href={props.detail.antiphon.sourceUrl} target="_blank" rel="noreferrer">Source</a>}
      </div>
      <div className="service-antiphon-detail-row service-antiphon-detail-reference-row">
        {props.detail.loading ? <span className="field-help">Loading…</span> : props.detail.editableRecommendation && props.detail.recommendation ? (
          <ReferenceSongLookupField
            language={detailLanguage(props.detail.antiphon)}
            selected={props.detail.recommendation.recommendedSong}
            disabled={props.detail.saving}
            onSelect={props.onSaveRecommendation}
          />
        ) : props.detail.error ? <span className="field-help inline-error">{props.detail.error}</span> : props.detail.recommendation?.recommendedSong ? <>
          <strong>{props.detail.recommendation.recommendedSong.displayNumber}</strong>
          <span>{props.detail.recommendation.recommendedSong.title}</span>
        </> : <span className="field-help">none</span>}
      </div>
    </section>}
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

export function ServiceContextReferenceAntiphonField({
  runtime,
  editable,
  contextKey,
  serviceLanguage,
  selected,
  recommendedSong,
  recommendationLoading,
  recommendationError,
  recommendationClient,
  canEditRecommendation,
  invalid,
  onChange,
  onRecommendationChanged,
  clientFactory = defaultClientFactory,
}: ServiceContextReferenceAntiphonFieldProps) {
  const identity = { runtimeMode: runtime, contextKey, editable, serviceLanguage } as const;
  const machineRef = useRef<ServiceContextReferenceAntiphonUiState | null>(null);
  if (!machineRef.current) machineRef.current = new ServiceContextReferenceAntiphonUiState(identity);
  const machine = machineRef.current;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputWasOpenOnPointerDown = useRef(false);
  const detailRequest = useRef(0);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<DetailState>();
  const [detailRecommendation, setDetailRecommendation] = useState<ReferenceAntiphonRecommendation>();
  const [detailRecommendationLoading, setDetailRecommendationLoading] = useState(false);
  const [detailRecommendationSaving, setDetailRecommendationSaving] = useState(false);
  const [detailRecommendationError, setDetailRecommendationError] = useState<string>();
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

  const closeDetail = () => {
    detailRequest.current += 1;
    setDetail(undefined);
    setDetailRecommendation(undefined);
    setDetailRecommendationLoading(false);
    setDetailRecommendationSaving(false);
    setDetailRecommendationError(undefined);
  };

  useEffect(() => {
    if (machine.changeIdentity(identity)) {
      setOpen(false); closeDetail(); setDirty(false); setQuery(""); setActiveIndex(0);
    }
    sync();
  }, [runtime, contextKey, editable, serviceLanguage]);

  useEffect(() => {
    if (detail?.origin === "selected" && detail.antiphon.id !== selected?.id) closeDetail();
  }, [selected?.id, detail?.origin, detail?.antiphon.id]);

  useEffect(() => {
    if (!open || !editable) { machine.cancel(); sync(); return; }
    const token = machine.begin();
    sync();
    void listAll(client, serviceLanguage, dirty ? query.trim() : "")
      .then((records) => { if (machine.complete(token, records)) sync(); })
      .catch((cause: unknown) => { if (machine.fail(token, cause instanceof Error ? cause.message : "Antiphon lookup failed.")) sync(); });
  }, [client, open, editable, serviceLanguage, dirty, query, contextKey]);

  useEffect(() => {
    if (!detail) return;
    const token = ++detailRequest.current;
    const sameAsSelected = detail.antiphon.id === selected?.id;
    setDetailRecommendationError(sameAsSelected ? recommendationError : undefined);
    setDetailRecommendationLoading(Boolean(sameAsSelected && recommendationLoading));
    setDetailRecommendation({
      antiphonId: detail.antiphon.id,
      recommendedSong: sameAsSelected ? (recommendedSong ?? null) : null,
    });

    if (!recommendationClient) return;
    setDetailRecommendationLoading(true);
    void recommendationClient.get(detail.antiphon.id).then((result) => {
      if (detailRequest.current !== token) return;
      if (result.success) {
        setDetailRecommendation(result.value);
        setDetailRecommendationError(undefined);
      } else {
        setDetailRecommendationError(result.error.message);
      }
    }).catch((cause: unknown) => {
      if (detailRequest.current === token) setDetailRecommendationError(cause instanceof Error ? cause.message : "Antiphon Reference song could not be loaded.");
    }).finally(() => {
      if (detailRequest.current === token) setDetailRecommendationLoading(false);
    });

    return () => {
      if (detailRequest.current === token) detailRequest.current += 1;
    };
  }, [detail?.antiphon.id, recommendationClient]);

  useEffect(() => {
    if (!open && !detail) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const wrapper = wrapperRef.current;
      if (detail && target) {
        const detailRegion = wrapper?.querySelector<HTMLElement>(".service-antiphon-detail");
        if (detailRegion?.contains(target)) return;
        if (target instanceof Element && target.closest(".service-antiphon-detail-button")) return;
        closeDetail();
        if (wrapper?.contains(target)) return;
      }
      if (open && target && !wrapper?.contains(target)) closeRestore();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (detail) {
        event.preventDefault();
        event.stopPropagation();
        const returnToList = detail.origin === "list";
        closeDetail();
        if (returnToList) return;
      }
      if (open) {
        event.preventDefault();
        closeRestore();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, detail?.origin, detail?.antiphon.id]);

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
      document.getElementById("service-antiphon-option-none")?.scrollIntoView({ block: "nearest" });
      return;
    }
    const record = snapshot.records[activeIndex - 1];
    if (!record) return;
    document.getElementById(antiphonOptionId(record))?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, snapshot.records]);

  const openLookup = () => {
    if (!editable || open) return;
    closeDetail();
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

  const select = (record: ReferenceAntiphonRecord) => {
    onChange(recordSnapshot(record));
    closeDetail();
    closeRestore();
  };

  const selectNone = () => {
    onChange(undefined);
    closeDetail();
    closeRestore();
  };

  const openDetail = (antiphon: ServiceAntiphonReference, origin: "selected" | "list") => {
    if (origin === "selected") {
      if (detail?.origin === "selected" && detail.antiphon.id === antiphon.id) {
        closeDetail();
        return;
      }
      closeRestore();
    }
    setDetail({ antiphon: { ...antiphon }, origin });
  };

  const saveRecommendation = async (record: ReferenceCatalogRecord | null) => {
    if (!detail || !canEditRecommendation || !recommendationClient?.set || detailRecommendationSaving) return;
    const detailId = detail.antiphon.id;
    const token = ++detailRequest.current;
    setDetailRecommendationSaving(true);
    setDetailRecommendationError(undefined);
    try {
      const result = await recommendationClient.set(detailId, record?.id ?? null);
      if (detailRequest.current !== token) return;
      if (!result.success) {
        setDetailRecommendationError(result.error.message);
        return;
      }
      setDetailRecommendation(result.value);
      await onRecommendationChanged?.(result.value);
    } catch (cause) {
      if (detailRequest.current === token) setDetailRecommendationError(cause instanceof Error ? cause.message : "Antiphon Reference song could not be saved.");
    } finally {
      if (detailRequest.current === token) setDetailRecommendationSaving(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (detail) {
        event.preventDefault();
        closeDetail();
        return;
      }
      if (open) { event.preventDefault(); closeRestore(); }
      return;
    }
    if (!open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); openLookup(); return; }
    if (!open) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setActiveIndex((index) => moveAntiphonActiveIndex(index, snapshot.records.length + 1, event.key as AntiphonNavigationKey));
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

  return <div className="service-antiphon-lookup" ref={wrapperRef}>
    <ServiceContextReferenceAntiphonFieldView
      editable={editable}
      selected={selected}
      invalid={invalid}
      open={open}
      detail={detail ? {
        antiphon: detail.antiphon,
        origin: detail.origin,
        recommendation: detailRecommendation,
        loading: detailRecommendationLoading,
        saving: detailRecommendationSaving,
        error: detailRecommendationError,
        editableRecommendation: Boolean(canEditRecommendation && recommendationClient?.set),
      } : undefined}
      dirty={dirty}
      query={query}
      snapshot={snapshot}
      activeIndex={activeIndex}
      serviceLanguage={serviceLanguage}
      onOpen={openLookup}
      onInputPointerDown={() => { inputWasOpenOnPointerDown.current = open; }}
      onInputClick={handleInputClick}
      onQueryChange={(value) => { if (!open) setOpen(true); closeDetail(); setDirty(true); setQuery(value); setActiveIndex(0); }}
      onKeyDown={onKeyDown}
      onSelect={select}
      onSelectNone={selectNone}
      onOpenDetail={openDetail}
      onActiveIndexChange={setActiveIndex}
      onSaveRecommendation={(record) => { void saveRecommendation(record); }}
    />
  </div>;
}
