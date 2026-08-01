"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DbReferenceAntiphonClient } from "../src/application/reference-antiphon-client";
import type { ReferenceAntiphonRecord } from "../src/application/reference-antiphon-contract";
import { DbReferenceAntiphonRecommendationClient, type ReferenceAntiphonRecommendationActor } from "../src/application/reference-antiphon-recommendation-client";
import { DbReferenceCatalogClient } from "../src/application/reference-catalog-client";
import type { ReferenceCatalogRecord } from "../src/application/reference-catalog-contract";
import {
  ReferenceAntiphonRecommendationUiState,
  type RecommendationUiRole,
  type RecommendationUiSnapshot,
} from "../src/application/reference-antiphon-recommendation-ui-state";

export type RecommendationPanelClients = {
  antiphons: Pick<DbReferenceAntiphonClient, "list">;
  catalog: Pick<DbReferenceCatalogClient, "list">;
  recommendations: Pick<DbReferenceAntiphonRecommendationClient, "get" | "set">;
};
export type RecommendationPanelClientFactories = {
  antiphons: () => RecommendationPanelClients["antiphons"];
  catalog: () => RecommendationPanelClients["catalog"];
  recommendations: (actor: ReferenceAntiphonRecommendationActor) => RecommendationPanelClients["recommendations"];
};
const defaultFactories: RecommendationPanelClientFactories = {
  antiphons: () => new DbReferenceAntiphonClient(),
  catalog: () => new DbReferenceCatalogClient(),
  recommendations: (actor) => new DbReferenceAntiphonRecommendationClient(actor),
};
export function createRecommendationPanelClients(runtime: "memory" | "db", actor: ReferenceAntiphonRecommendationActor, factories = defaultFactories): RecommendationPanelClients | null {
  if (runtime === "memory") return null;
  return { antiphons: factories.antiphons(), catalog: factories.catalog(), recommendations: factories.recommendations(actor) };
}

export type ReferenceAntiphonRecommendationPanelProps = {
  runtime: "memory" | "db";
  actor: ReferenceAntiphonRecommendationActor;
  clientFactories?: RecommendationPanelClientFactories;
};

type ViewProps = {
  runtime: "memory" | "db"; role: RecommendationUiRole; snapshot: RecommendationUiSnapshot;
  antiphonSearch: string; songSearch: string;
  setAntiphonSearch: (value: string) => void; setSongSearch: (value: string) => void;
  chooseAntiphon: (record: ReferenceAntiphonRecord) => void; deselectAntiphon: () => void;
  chooseSong: (record: ReferenceCatalogRecord) => void; mutate: (referenceSongId: string | null) => void;
};

export function ReferenceAntiphonRecommendationPanelView(props: ViewProps) {
  const { runtime, role, snapshot: s } = props;
  if (runtime === "memory") return <section className="detail-panel" aria-label="Reference antiphon recommendation"><h2>Antiphon recommendation</h2><p className="field-help">Antiphon recommendations are available only in DB runtime.</p></section>;
  const selected = s.selectedAntiphon;
  const read = s.requests.recommendationRead;
  const mutation = s.requests.mutation;
  const currentSong = s.recommendation?.recommendedSong ?? null;
  const sameSong = Boolean(currentSong && s.selectedSong?.id === currentSong.referenceSongId);
  const mutationDisabled = mutation.loading;
  return <section className="detail-panel" aria-label="Reference antiphon recommendation">
    <h2>Antiphon recommendation</h2>
    <label>Find antiphon<input aria-label="Reference antiphon search" value={props.antiphonSearch} onChange={(event) => props.setAntiphonSearch(event.target.value)} placeholder="Search by title or number" /></label>
    {s.requests.antiphonSearch.loading && <p role="status" className="field-help">Loading antiphons…</p>}
    {s.requests.antiphonSearch.error && <p role="alert" className="field-help">Antiphon search unavailable: {s.requests.antiphonSearch.error}</p>}
    {props.antiphonSearch.trim() && !s.requests.antiphonSearch.loading && !s.requests.antiphonSearch.error && s.antiphons.length === 0 && <p className="field-help">No antiphons match this search.</p>}
    <ul className="saved-set-list catalog-song-list">{s.antiphons.map((record) => <li key={record.id}><button type="button" onClick={() => props.chooseAntiphon(record)}>{record.displayNumber} · {record.title}</button></li>)}</ul>
    {!selected ? <p>No antiphon selected</p> : <div aria-label="Selected reference antiphon">
      <h3>{selected.displayNumber} · {selected.title}</h3>
      <button type="button" onClick={props.deselectAntiphon}>Clear antiphon selection</button>
      {(read.loading || (!s.recommendation && !read.error)) && <p role="status" className="field-help">Loading recommendation…</p>}
      {read.error && <p role="alert" className="field-help">Recommendation unavailable: {read.error}</p>}
      {s.recommendation && !currentSong && <p>No recommended song</p>}
      {currentSong && <div aria-label="Recommended Reference song">
        <p><strong>{currentSong.displayNumber} · {currentSong.title}</strong></p>
        <dl><dt>language</dt><dd>{currentSong.language}</dd><dt>canonicalNumber</dt><dd>{currentSong.canonicalNumber}</dd><dt>referenceSongId</dt><dd>{currentSong.referenceSongId}</dd></dl>
      </div>}
      {role === "admin" && s.recommendation && <div aria-label="Manage antiphon recommendation">
        <label>Find Reference song<input aria-label="Recommended Reference song search" value={props.songSearch} disabled={mutationDisabled} onChange={(event) => props.setSongSearch(event.target.value)} /></label>
        {s.requests.songSearch.loading && <p role="status" className="field-help">Loading Reference songs…</p>}
        {s.requests.songSearch.error && <p role="alert" className="field-help">Reference song search unavailable: {s.requests.songSearch.error}</p>}
        {props.songSearch.trim() && !s.requests.songSearch.loading && !s.requests.songSearch.error && s.songs.length === 0 && <p className="field-help">No Reference songs match this search.</p>}
        <ul className="saved-set-list catalog-song-list">{s.songs.map((record) => <li key={record.id}><button type="button" disabled={mutationDisabled} onClick={() => props.chooseSong(record)}>{record.displayNumber} · {record.title} ({record.language})</button></li>)}</ul>
        {s.selectedSong && <p>Selected target: <strong>{s.selectedSong.displayNumber} · {s.selectedSong.title}</strong></p>}
        {!currentSong
          ? <button type="button" disabled={!s.selectedSong || mutationDisabled} onClick={() => props.mutate(s.selectedSong!.id)}>Set recommendation</button>
          : <><button type="button" disabled={!s.selectedSong || sameSong || mutationDisabled} onClick={() => props.mutate(s.selectedSong!.id)}>Replace recommendation</button><button type="button" disabled={mutationDisabled} onClick={() => props.mutate(null)}>Remove recommendation</button></>}
        {mutation.loading && <span role="status" className="field-help">Saving…</span>}
        {mutation.error && <p role="alert" className="field-help">{mutation.error}</p>}
        {s.saved && <span role="status" className="field-help">Saved.</span>}
      </div>}
    </div>}
  </section>;
}

export function ReferenceAntiphonRecommendationPanel({ runtime, actor, clientFactories = defaultFactories }: ReferenceAntiphonRecommendationPanelProps) {
  const role = actor.role as RecommendationUiRole;
  const machineRef = useRef<ReferenceAntiphonRecommendationUiState | null>(null);
  if (!machineRef.current) machineRef.current = new ReferenceAntiphonRecommendationUiState({ runtimeMode: runtime, userId: actor.userId, role, selectedAntiphonId: null });
  const machine = machineRef.current;
  const [snapshot, setSnapshot] = useState(() => machine.snapshot());
  const [antiphonSearch, setAntiphonSearch] = useState("");
  const [songSearch, setSongSearch] = useState("");
  const clients = useMemo(() => createRecommendationPanelClients(runtime, actor, clientFactories), [runtime, actor.userId, actor.role, clientFactories]);
  const sync = () => setSnapshot(machine.snapshot());

  useEffect(() => { machine.changeRuntimeActor(runtime, actor.userId, role); if (runtime === "memory") { setAntiphonSearch(""); setSongSearch(""); } sync(); }, [runtime, actor.userId, actor.role]);
  useEffect(() => {
    if (!clients) return;
    const query = antiphonSearch.trim();
    if (!query) { machine.cancel("antiphonSearch", { antiphons: [] }); sync(); return; }
    const token = machine.begin("antiphonSearch"); sync();
    void clients.antiphons.list({ language: "all", search: query, page: 0, pageSize: 25 }).then((page) => { if (machine.complete(token, { antiphons: page.records })) sync(); }).catch((cause: unknown) => { if (machine.fail(token, cause instanceof Error ? cause.message : "Antiphon search failed.")) sync(); });
  }, [clients, antiphonSearch]);
  useEffect(() => {
    const selected = snapshot.selectedAntiphon;
    if (!clients || !selected) return;
    const token = machine.begin("recommendationRead"); sync();
    void clients.recommendations.get(selected.id).then((result) => {
      if (result.success ? machine.complete(token, { recommendation: result.value }) : machine.fail(token, result.error.message)) sync();
    }).catch((cause: unknown) => { if (machine.fail(token, cause instanceof Error ? cause.message : "Recommendation load failed.")) sync(); });
  }, [clients, snapshot.selectedAntiphon?.id, actor.userId, actor.role]);
  useEffect(() => {
    if (!clients || role !== "admin" || !snapshot.selectedAntiphon) return;
    const query = songSearch.trim();
    if (!query) { machine.cancel("songSearch", { songs: [] }); sync(); return; }
    const token = machine.begin("songSearch"); sync();
    void clients.catalog.list({ language: "all", search: query, page: 0, pageSize: 25 }).then((page) => { if (machine.complete(token, { songs: page.records })) sync(); }).catch((cause: unknown) => { if (machine.fail(token, cause instanceof Error ? cause.message : "Reference song search failed.")) sync(); });
  }, [clients, role, snapshot.selectedAntiphon?.id, songSearch]);

  const chooseAntiphon = (record: ReferenceAntiphonRecord) => { machine.selectAntiphon(record); setSongSearch(""); sync(); };
  const deselectAntiphon = () => { machine.selectAntiphon(null); setSongSearch(""); sync(); };
  const chooseSong = (record: ReferenceCatalogRecord) => { machine.selectSong(record); sync(); };
  const mutate = async (referenceSongId: string | null) => {
    const selected = machine.snapshot().selectedAntiphon;
    if (!clients || role !== "admin" || !selected) return;
    const token = machine.begin("mutation"); sync();
    try {
      const result = await clients.recommendations.set(selected.id, referenceSongId);
      if (result.success) { if (machine.mutationSucceeded(token, result.value)) { setSongSearch(""); sync(); } }
      else if (machine.fail(token, result.error.message)) sync();
    } catch (cause) { if (machine.fail(token, cause instanceof Error ? cause.message : "Recommendation save failed.")) sync(); }
  };

  return <ReferenceAntiphonRecommendationPanelView runtime={runtime} role={role} snapshot={snapshot} antiphonSearch={antiphonSearch} songSearch={songSearch} setAntiphonSearch={setAntiphonSearch} setSongSearch={setSongSearch} chooseAntiphon={chooseAntiphon} deselectAntiphon={deselectAntiphon} chooseSong={chooseSong} mutate={(id) => void mutate(id)} />;
}
