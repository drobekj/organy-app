"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DbReferenceAntiphonClient, MemoryReferenceAntiphonClient } from "../src/application/reference-antiphon-client";
import type { ReferenceAntiphonRecord } from "../src/application/reference-antiphon-contract";
import { DbReferenceAntiphonRecommendationClient, type ReferenceAntiphonRecommendationActor } from "../src/application/reference-antiphon-recommendation-client";
import type { ReferenceAntiphonRecommendation } from "../src/application/reference-antiphon-recommendation";
import { ReferenceAntiphonRecommendationUiState } from "../src/application/reference-antiphon-recommendation-ui-state";
import { DbReferenceCatalogClient, MemoryReferenceCatalogClient } from "../src/application/reference-catalog-client";
import type { ReferenceCatalogRecord } from "../src/application/reference-catalog-contract";

export type ReferenceAntiphonRecommendationPanelProps = { runtime: "memory" | "db"; actor: ReferenceAntiphonRecommendationActor };

export function ReferenceAntiphonRecommendationPanel({ runtime, actor }: ReferenceAntiphonRecommendationPanelProps) {
  const machine = useRef(new ReferenceAntiphonRecommendationUiState());
  const antiphons = useMemo(() => runtime === "db" ? new DbReferenceAntiphonClient() : new MemoryReferenceAntiphonClient(), [runtime]);
  const catalog = useMemo(() => runtime === "db" ? new DbReferenceCatalogClient() : new MemoryReferenceCatalogClient(), [runtime]);
  const recommendations = useMemo(() => new DbReferenceAntiphonRecommendationClient(actor), [actor.userId, actor.role]);
  const [antiphonSearch, setAntiphonSearch] = useState("");
  const [antiphonResults, setAntiphonResults] = useState<ReferenceAntiphonRecord[]>([]);
  const [selectedAntiphon, setSelectedAntiphon] = useState<ReferenceAntiphonRecord | null>(null);
  const [recommendation, setRecommendation] = useState<ReferenceAntiphonRecommendation | null>(null);
  const [songSearch, setSongSearch] = useState("");
  const [songResults, setSongResults] = useState<ReferenceCatalogRecord[]>([]);
  const [selectedSong, setSelectedSong] = useState<ReferenceCatalogRecord | null>(null);
  const [loading, setLoading] = useState<null | "antiphons" | "recommendation" | "songs" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    machine.current.contextChanged(); setAntiphonResults([]); setSelectedAntiphon(null); setRecommendation(null); setSongResults([]); setSelectedSong(null); setError(null); setSaved(false); setLoading(null);
  }, [runtime, actor.userId, actor.role]);

  useEffect(() => {
    const query = antiphonSearch.trim(); const token = machine.current.begin("antiphonSearch"); setAntiphonResults([]); setError(null);
    if (!query) return;
    setLoading("antiphons");
    void antiphons.list({ language: "all", search: query, page: 0, pageSize: 25 }).then((page) => {
      if (machine.current.complete(token, { antiphons: page.records })) setAntiphonResults(page.records);
    }).catch((cause: unknown) => { if (machine.current.isCurrent(token)) setError(cause instanceof Error ? cause.message : "Antiphon search failed."); })
      .finally(() => { if (machine.current.isCurrent(token)) setLoading(null); });
  }, [antiphonSearch, antiphons]);

  useEffect(() => {
    const token = machine.current.begin("recommendationRead"); setRecommendation(null); setError(null); setSaved(false);
    if (runtime !== "db" || !selectedAntiphon) return;
    setLoading("recommendation");
    void recommendations.get(selectedAntiphon.id).then((result) => {
      if (!machine.current.isCurrent(token)) return;
      if (result.success) { machine.current.complete(token, { recommendation: result.value }); setRecommendation(result.value); }
      else setError(result.error.message);
    }).catch((cause: unknown) => { if (machine.current.isCurrent(token)) setError(cause instanceof Error ? cause.message : "Recommendation load failed."); })
      .finally(() => { if (machine.current.isCurrent(token)) setLoading(null); });
  }, [runtime, selectedAntiphon, recommendations]);

  useEffect(() => {
    const query = songSearch.trim(); const token = machine.current.begin("songSearch"); setSongResults([]); setSelectedSong(null); machine.current.selectSong(null); setSaved(false);
    if (runtime !== "db" || actor.role !== "admin" || !selectedAntiphon || !query) return;
    setLoading("songs");
    void catalog.list({ language: "all", search: query, page: 0, pageSize: 25 }).then((page) => {
      if (machine.current.complete(token, { songs: page.records })) setSongResults(page.records);
    }).catch((cause: unknown) => { if (machine.current.isCurrent(token)) setError(cause instanceof Error ? cause.message : "Reference song search failed."); })
      .finally(() => { if (machine.current.isCurrent(token)) setLoading(null); });
  }, [runtime, actor.role, selectedAntiphon, songSearch, catalog]);

  function chooseAntiphon(record: ReferenceAntiphonRecord) { machine.current.selectAntiphon(record); setSelectedAntiphon(record); setRecommendation(null); setSongSearch(""); setSongResults([]); setSelectedSong(null); setError(null); setSaved(false); }
  function chooseSong(id: string) { const record = songResults.find((item) => item.id === id) ?? null; machine.current.selectSong(record); setSelectedSong(record); setSaved(false); }
  async function mutate(referenceSongId: string | null) {
    if (runtime !== "db" || actor.role !== "admin" || !selectedAntiphon) return;
    const token = machine.current.begin("mutation"); setLoading("saving"); setError(null); setSaved(false);
    try {
      const result = await recommendations.set(selectedAntiphon.id, referenceSongId);
      if (!machine.current.isCurrent(token)) return;
      if (result.success) { machine.current.complete(token, { recommendation: result.value }); setRecommendation(result.value); setSelectedSong(null); setSongSearch(""); setSongResults([]); setSaved(true); }
      else setError(result.error.message);
    } catch (cause) { if (machine.current.isCurrent(token)) setError(cause instanceof Error ? cause.message : "Recommendation save failed."); }
    finally { if (machine.current.isCurrent(token)) setLoading(null); }
  }

  return <section className="detail-panel" aria-label="Reference antiphon recommendation">
    <h2>Antiphon recommendation</h2>
    {runtime === "memory" ? <p className="field-help">Recommendations are available only in DB runtime.</p> : <>
      <label>Find antiphon<input aria-label="Reference antiphon search" value={antiphonSearch} onChange={(event) => setAntiphonSearch(event.target.value)} placeholder="Search by title or number" /></label>
      {loading === "antiphons" && <p role="status" className="field-help">Loading antiphons…</p>}
      {antiphonSearch.trim() && loading !== "antiphons" && antiphonResults.length === 0 && <p className="field-help">No antiphons match this search.</p>}
      <ul className="saved-set-list catalog-song-list">{antiphonResults.map((record) => <li key={record.id}><button type="button" onClick={() => chooseAntiphon(record)}>{record.displayNumber} · {record.title} ({record.language})</button></li>)}</ul>
      {selectedAntiphon && <div aria-label="Selected reference antiphon">
        <h3>{selectedAntiphon.displayNumber} · {selectedAntiphon.title}</h3>
        <p className="field-help">{selectedAntiphon.language} · canonical {selectedAntiphon.canonicalNumber} · {selectedAntiphon.id} · read-only</p>
        {loading === "recommendation" ? <p role="status" className="field-help">Loading recommendation…</p> : recommendation && (recommendation.recommendedSong ? <p>Recommended: <strong>{recommendation.recommendedSong.displayNumber} · {recommendation.recommendedSong.title}</strong> ({recommendation.recommendedSong.language})</p> : <p>No recommendation.</p>)}
        {actor.role === "admin" && recommendation && <>
          <label>Find Reference song<input aria-label="Recommended Reference song search" value={songSearch} disabled={loading === "saving"} onChange={(event) => setSongSearch(event.target.value)} /></label>
          {loading === "songs" && <p role="status" className="field-help">Loading Reference songs…</p>}
          {songSearch.trim() && loading !== "songs" && songResults.length === 0 && <p className="field-help">No Reference songs match this search.</p>}
          <select aria-label="Recommended Reference song" value={selectedSong?.id ?? ""} disabled={loading === "saving"} onChange={(event) => chooseSong(event.target.value)}><option value="">Select a Reference song</option>{songResults.map((record) => <option key={record.id} value={record.id}>{record.displayNumber} · {record.title} ({record.language})</option>)}</select>
          <button type="button" disabled={!selectedSong || loading === "saving"} onClick={() => void mutate(selectedSong!.id)}>{recommendation.recommendedSong ? "Replace" : "Set"}</button>
          {recommendation.recommendedSong && <button type="button" disabled={loading === "saving"} onClick={() => void mutate(null)}>Remove</button>}
          {loading === "saving" && <span role="status" className="field-help">Saving…</span>}
          {saved && <span role="status" className="field-help">Saved.</span>}
        </>}
      </div>}
      {error && <p role="alert" className="field-help">Recommendation unavailable: {error}</p>}
    </>}
  </section>;
}
