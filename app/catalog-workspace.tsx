"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActorIdentity,
  CatalogCandidateAvailabilityMode,
  CatalogCandidateQueryInput,
  CandidateQueryResult,
} from "../src/application/interaction-contracts";
import type { CatalogPerson } from "../src/application/catalog";
import type { ServiceAntiphonReference, ServiceLanguage, ServiceTopicReference } from "../src/planning-lifecycle";
import { candidatesForView, type CandidateViewMode } from "../src/planning-lifecycle/candidate-view";
import { getCandidateLineViewModel } from "../src/planning-lifecycle/candidate-line";
import { ServiceContextReferenceAntiphonField } from "./service-context-reference-antiphon-field";
import { ServiceContextReferenceTopicField } from "./service-context-reference-topic-field";

export type CatalogWorkspaceProps = {
  runtime: "memory" | "db";
  actor: ActorIdentity;
  organists: CatalogPerson[];
  queryCandidates: (input: CatalogCandidateQueryInput) => Promise<CandidateQueryResult[]>;
};

export function CatalogWorkspace({ runtime, actor, organists, queryCandidates }: CatalogWorkspaceProps) {
  const [language, setLanguage] = useState<ServiceLanguage>("mixed");
  const [organistPersonId, setOrganistPersonId] = useState("");
  const [antiphon, setAntiphon] = useState<ServiceAntiphonReference>();
  const [topic, setTopic] = useState<ServiceTopicReference>();
  const [availabilityMode, setAvailabilityMode] = useState<CatalogCandidateAvailabilityMode>("available");
  const [viewMode, setViewMode] = useState<CandidateViewMode>("songs");
  const [candidates, setCandidates] = useState<CandidateQueryResult[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<CandidateQueryResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef(0);

  const contextKey = `catalog:${language}:${organistPersonId}:${actor.role}`;
  const visibleCandidates = useMemo(() => candidatesForView(candidates, viewMode), [candidates, viewMode]);
  const selectedOrganist = organists.find((person) => person.id === organistPersonId);

  useEffect(() => {
    const token = ++request.current;
    setLoading(true);
    setError(undefined);
    setSelectedDetail(undefined);
    void queryCandidates({
      serviceLanguage: language,
      ...(organistPersonId ? { organistPersonId } : {}),
      ...(antiphon?.id ? { referenceAntiphonId: antiphon.id } : {}),
      ...(topic?.id ? { referenceTopicId: topic.id } : {}),
      availabilityMode,
    }).then((result) => {
      if (request.current !== token) return;
      setCandidates(result);
    }).catch((cause: unknown) => {
      if (request.current !== token) return;
      setCandidates([]);
      setError(cause instanceof Error ? cause.message : "Catalog candidates could not be loaded.");
    }).finally(() => {
      if (request.current === token) setLoading(false);
    });
  }, [language, organistPersonId, antiphon?.id, topic?.id, availabilityMode, queryCandidates]);

  return <section className="catalog-workspace" aria-label="Catalog">
    <div className="rows-header">
      <h2>Catalog</h2>
      <span className="field-help">Read-only candidate workspace</span>
    </div>

    <fieldset className="field-group catalog-context">
      <legend>Catalog context</legend>
      <div className="catalog-context-cell">
        <span className="catalog-context-label">Antiphon</span>
        <ServiceContextReferenceAntiphonField
          runtime={runtime}
          editable
          contextKey={contextKey}
          serviceLanguage={language}
          selected={antiphon}
          onChange={(value) => setAntiphon(value ? { ...value } : undefined)}
        />
      </div>
      <div className="catalog-context-cell">
        <span className="catalog-context-label">Topic</span>
        <ServiceContextReferenceTopicField
          runtime={runtime}
          editable
          contextKey={contextKey}
          serviceLanguage={language}
          selected={topic}
          onChange={(value) => setTopic(value ? { ...value } : undefined)}
        />
      </div>
      <label className="catalog-context-cell">
        <span>Organist</span>
        <select
          aria-label="Catalog organist"
          value={organistPersonId}
          onChange={(event) => {
            setOrganistPersonId(event.target.value);
            if (!event.target.value) setAvailabilityMode("available");
          }}
        >
          <option value="">Anonymous</option>
          {organists.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
        </select>
      </label>
      <label className="catalog-context-cell">
        <span>Language</span>
        <select aria-label="Catalog language" value={language} onChange={(event) => setLanguage(event.target.value as ServiceLanguage)}>
          <option value="mixed">Mixed</option>
          <option value="czech">Czech</option>
          <option value="polish">Polish</option>
        </select>
      </label>
    </fieldset>

    <div className="catalog-availability-switch" role="group" aria-label="Catalog availability">
      <button
        type="button"
        aria-pressed={availabilityMode === "available"}
        className={availabilityMode === "available" ? "active-workspace" : undefined}
        onClick={() => setAvailabilityMode("available")}
      >
        Available
      </button>
      <button
        type="button"
        aria-pressed={availabilityMode === "unavailable"}
        className={availabilityMode === "unavailable" ? "active-workspace" : undefined}
        disabled={!organistPersonId}
        title={!organistPersonId ? "Anonymous organist has no unavailable repertoire classes." : undefined}
        onClick={() => setAvailabilityMode("unavailable")}
      >
        Unavailable
      </button>
      <span className="field-help">
        {organistPersonId
          ? `${selectedOrganist?.displayName ?? "Selected organist"} · ${availabilityMode}`
          : "Anonymous · all matching classes are available"}
      </span>
    </div>

    <section className="catalog-candidate-panel" aria-label="Catalog candidates">
      <div className="catalog-candidate-header">
        <strong>Candidates</strong>
        <div className="workspace-nav catalog-view-switch" role="group" aria-label="Catalog candidate view">
          <button type="button" className={viewMode === "songs" ? "active-workspace" : undefined} aria-pressed={viewMode === "songs"} onClick={() => setViewMode("songs")}>Songs</button>
          <button type="button" className={viewMode === "melodies" ? "active-workspace" : undefined} aria-pressed={viewMode === "melodies"} onClick={() => setViewMode("melodies")}>Melodies</button>
        </div>
      </div>

      {selectedDetail && <CatalogCandidateDetail candidate={selectedDetail} onClose={() => setSelectedDetail(undefined)} />}
      {loading && <p className="catalog-candidate-state" role="status">Loading candidates…</p>}
      {error && <p className="catalog-candidate-state inline-error" role="alert">{error}</p>}
      {!loading && !error && visibleCandidates.length === 0 && <p className="catalog-candidate-state">No candidates match this Catalog context.</p>}

      {!loading && !error && visibleCandidates.length > 0 && <div className="catalog-candidate-scroll" role="list" aria-label={`${availabilityMode} ${viewMode}`}>
        {visibleCandidates.map((candidate) => <CatalogCandidateRow
          key={candidate.songId}
          candidate={candidate}
          onDetail={() => setSelectedDetail(candidate)}
        />)}
      </div>}
    </section>
  </section>;
}

function CatalogCandidateRow({ candidate, onDetail }: { candidate: CandidateQueryResult; onDetail: () => void }) {
  const view = getCandidateLineViewModel(candidate);
  return <div className={`candidate-option-row catalog-candidate-row ${view.backgroundClass}`} role="listitem" aria-label={view.accessibleMeaning}>
    <div className="catalog-candidate-summary">
      <span className={view.contentTextClass}>
        <span className="candidate-number-options">
          {view.numberOptions.map((item) => <span key={item.songId} className={item.primary ? "candidate-number-primary" : "candidate-number-equivalent"}>
            {!item.primary && <span>equivalent </span>}
            {item.primary ? <strong>{item.number}</strong> : item.repertoire ? <strong>{item.number}</strong> : <span>{item.number}</span>}
            <span> · {item.language ?? "unknown"} · {item.repertoire ? "in repertoire" : "not in repertoire"}</span>
          </span>)}
        </span>
        <span>{candidate.title} · {candidate.language} · {candidate.signal}</span>
      </span>
    </div>
    <button type="button" className="candidate-detail-button" onClick={onDetail}>Detail</button>
  </div>;
}

function CatalogCandidateDetail({ candidate, onClose }: { candidate: CandidateQueryResult; onClose: () => void }) {
  const members = candidate.melodyMembers ?? [];
  return <section className="melody-detail catalog-readonly-detail" aria-label="Catalog candidate detail">
    <div className="melody-detail-header">
      <div>
        <h3>{candidate.number} · {candidate.title}</h3>
        <p className="field-help">{candidate.language} · {candidate.songId}</p>
      </div>
      <button type="button" onClick={onClose}>Close</button>
    </div>
    <p className="field-help">
      Preference {candidate.aggregatePreferenceScore} · {candidate.repertoire ? "explicit repertoire pivot" : "not an explicit repertoire pivot"}
      {candidate.antiphonMatch ? " · antiphon reference" : ""}
      {candidate.seasonMatch ? " · topic match" : ""}
    </p>
    {candidate.sheetMusicUrl && <a href={candidate.sheetMusicUrl} target="_blank" rel="noreferrer">Source</a>}
    {members.length > 0 && <div>
      <strong>Melody class</strong>
      <ul className="melody-member-list">
        {members.map((member) => <li className="melody-member" key={member.songId}>
          <div className="melody-member-main"><span><strong>{member.number}</strong> · {member.title}</span><span>{member.language}</span></div>
          <div className="melody-member-meta"><span>{member.repertoire ? "in repertoire" : "not in repertoire"}</span><span>preference {member.aggregatePreferenceScore}</span></div>
        </li>)}
      </ul>
    </div>}
  </section>;
}
