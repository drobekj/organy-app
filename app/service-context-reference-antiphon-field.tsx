"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DbReferenceAntiphonClient } from "../src/application/reference-antiphon-client";
import type { ReferenceAntiphonRecord } from "../src/application/reference-antiphon-contract";
import {
  ServiceContextReferenceAntiphonUiState,
  type ServiceContextAntiphonSearchSnapshot,
} from "../src/application/service-context-reference-antiphon-ui-state";
import type { ServiceAntiphonReference } from "../src/planning-lifecycle";

export type ServiceContextReferenceAntiphonFieldProps = {
  runtime: "memory" | "db";
  editable: boolean;
  contextKey: string;
  selected?: ServiceAntiphonReference;
  onChange: (value: ServiceAntiphonReference | undefined) => void;
  clientFactory?: () => Pick<DbReferenceAntiphonClient, "list">;
};

type ViewProps = {
  runtime: "memory" | "db";
  editable: boolean;
  selected?: ServiceAntiphonReference;
  query: string;
  snapshot: ServiceContextAntiphonSearchSnapshot;
  onQueryChange: (value: string) => void;
  onSelect: (record: ReferenceAntiphonRecord) => void;
  onRemove: () => void;
};

export function ServiceContextReferenceAntiphonFieldView(props: ViewProps) {
  const selectedView = props.selected ? (
    <div aria-label="Selected authoritative antiphon">
      <strong>{props.selected.displayNumber} · {props.selected.title}</strong>{" "}
      <a href={props.selected.sourceUrl} target="_blank" rel="noreferrer">Source</a>
    </div>
  ) : <p>No antiphon selected</p>;

  if (props.runtime === "memory") {
    return <section className="detail-panel" aria-label="Service Context antiphon">
      <h3>Antiphon</h3>
      {selectedView}
      {!props.selected && <p className="field-help">Authoritative antiphon selection is available only in DB runtime.</p>}
    </section>;
  }

  return <section className="detail-panel" aria-label="Service Context antiphon">
    <h3>Antiphon</h3>
    {selectedView}
    {props.editable && <>
      <label>
        Find antiphon
        <input
          aria-label="Service Context antiphon search"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="Search by exact number or title"
        />
      </label>
      {props.snapshot.loading && <p role="status" className="field-help">Loading antiphons…</p>}
      {props.snapshot.error && <p role="alert" className="field-help">Antiphon search unavailable: {props.snapshot.error}</p>}
      {props.query.trim() && !props.snapshot.loading && !props.snapshot.error && props.snapshot.records.length === 0 && <p className="field-help">No antiphons match this search.</p>}
      <ul className="saved-set-list catalog-song-list">
        {props.snapshot.records.map((record) => <li key={record.id}>
          <button type="button" onClick={() => props.onSelect(record)}>{record.displayNumber} · {record.title}</button>
        </li>)}
      </ul>
      {props.selected && <button type="button" onClick={props.onRemove}>Remove antiphon</button>}
    </>}
  </section>;
}

const defaultClientFactory = () => new DbReferenceAntiphonClient();

export function ServiceContextReferenceAntiphonField({
  runtime,
  editable,
  contextKey,
  selected,
  onChange,
  clientFactory = defaultClientFactory,
}: ServiceContextReferenceAntiphonFieldProps) {
  const identity = { runtimeMode: runtime, contextKey, editable } as const;
  const machineRef = useRef<ServiceContextReferenceAntiphonUiState | null>(null);
  if (!machineRef.current) machineRef.current = new ServiceContextReferenceAntiphonUiState(identity);
  const machine = machineRef.current;
  const [query, setQuery] = useState("");
  const [snapshot, setSnapshot] = useState(() => machine.snapshot());
  const client = useMemo(() => runtime === "db" ? clientFactory() : null, [runtime, clientFactory]);
  const sync = () => setSnapshot(machine.snapshot());

  useEffect(() => {
    if (machine.changeIdentity(identity)) setQuery("");
    sync();
  }, [runtime, contextKey, editable]);

  useEffect(() => {
    if (!client || !editable) {
      machine.cancel();
      sync();
      return;
    }
    const search = query.trim();
    if (!search) {
      machine.cancel();
      sync();
      return;
    }
    const token = machine.begin();
    sync();
    void client.list({ language: "czech", search, page: 0, pageSize: 25 })
      .then((page) => { if (machine.complete(token, page.records)) sync(); })
      .catch((cause: unknown) => {
        if (machine.fail(token, cause instanceof Error ? cause.message : "Antiphon search failed.")) sync();
      });
  }, [client, editable, query, contextKey]);

  const select = (record: ReferenceAntiphonRecord) => {
    machine.cancel();
    setQuery("");
    sync();
    onChange({ id: record.id, displayNumber: record.displayNumber, title: record.title, sourceUrl: record.sourceUrl });
  };
  const remove = () => {
    machine.cancel();
    setQuery("");
    sync();
    onChange(undefined);
  };

  return <ServiceContextReferenceAntiphonFieldView
    runtime={runtime}
    editable={editable}
    selected={selected}
    query={query}
    snapshot={snapshot}
    onQueryChange={setQuery}
    onSelect={select}
    onRemove={remove}
  />;
}
