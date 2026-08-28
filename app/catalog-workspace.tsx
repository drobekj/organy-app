"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActorIdentity,
  CatalogCandidateAvailabilityMode,
  CatalogCandidateQueryInput,
  CandidateQueryResult,
  ReferenceOwnPreference,
  ReferencePreferenceAggregate,
} from "../src/application/interaction-contracts";
import type { CatalogPerson } from "../src/application/catalog";
import type { ServiceAntiphonReference, ServiceLanguage, ServiceTopicReference } from "../src/planning-lifecycle";
import { candidatesForView, type CandidateViewMode } from "../src/planning-lifecycle/candidate-view";
import { getCandidateLineViewModel } from "../src/planning-lifecycle/candidate-line";
import { ServiceContextReferenceAntiphonField } from "./service-context-reference-antiphon-field";
import { ServiceContextReferenceTopicField } from "./service-context-reference-topic-field";

type PreferenceResult<T> =
  | { success: true; value: T }
  | { success: false; error: { message: string } };

export type CatalogWorkspaceProps = {
  runtime: "memory" | "db";
  actor: ActorIdentity;
  organists: CatalogPerson[];
  queryCandidates: (input: CatalogCandidateQueryInput) => Promise<CandidateQueryResult[]>;
  getOwnPreference: (referenceSongId: string) => Promise<PreferenceResult<ReferenceOwnPreference>>;
  saveOwnPreference: (referenceSongId: string, score: number) => Promise<PreferenceResult<ReferenceOwnPreference>>;
  getPreferenceAggregate: (referenceSongId: string) => Promise<PreferenceResult<ReferencePreferenceAggregate>>;
  setRepertoireMembership: (referenceSongId: string, organistPersonId: string | undefined, active: boolean) => Promise<PreferenceResult<unknown>>;
};

export function CatalogWorkspace({
  runtime,
  actor,
  organists,
  queryCandidates,
  getOwnPreference,
  saveOwnPreference,
  getPreferenceAggregate,
  setRepertoireMembership,
}: CatalogWorkspaceProps) {
  const [language, setLanguage] = useState<ServiceLanguage>("mixed");
  const [organistPersonId, setOrganistPersonId] = useState(actor.role === "organist" ? (actor.personId ?? "") : "");
  const [antiphon, setAntiphon] = useState<ServiceAntiphonReference>();
  const [topic, setTopic] = useState<ServiceTopicReference>();
  const [availabilityMode, setAvailabilityMode] = useState<CatalogCandidateAvailabilityMode>("available");
  const [viewMode, setViewMode] = useState<CandidateViewMode>("songs");
  const [candidates, setCandidates] = useState<CandidateQueryResult[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<CandidateQueryResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [preferenceAggregate, setPreferenceAggregate] = useState<ReferencePreferenceAggregate>();
  const [ownPreference, setOwnPreference] = useState<ReferenceOwnPreference>();
  const [preferenceDraft, setPreferenceDraft] = useState("");
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [preferenceFeedback, setPreferenceFeedback] = useState<"idle" | "saved" | "error">("idle");
  const [preferenceError, setPreferenceError] = useState<string>();
  const [repertoireSaving, setRepertoireSaving] = useState(false);
  const [repertoireError, setRepertoireError] = useState<string>();
  const request = useRef(0);
  const preferenceRequest = useRef(0);

  const effectiveOrganistPersonId = organistPersonId;
  const contextKey = `catalog:${language}:${effectiveOrganistPersonId}:${actor.role}`;
  const visibleCandidates = useMemo(() => candidatesForView(candidates, viewMode), [candidates, viewMode]);
  const selectedOrganist = organists.find((person) => person.id === effectiveOrganistPersonId);
  const canManageRepertoire = runtime === "db" && (
    (actor.role === "organist" && Boolean(actor.personId) && actor.personId === effectiveOrganistPersonId)
    || (actor.role === "admin" && Boolean(effectiveOrganistPersonId))
  );
  const repertoireAction: "Add" | "Remove" | undefined = canManageRepertoire
    ? viewMode === "melodies" && availabilityMode === "available"
      ? "Remove"
      : viewMode === "songs" && availabilityMode === "unavailable"
        ? "Add"
        : undefined
    : undefined;

  function candidateInput(): CatalogCandidateQueryInput {
    return {
      serviceLanguage: language,
      ...(effectiveOrganistPersonId ? { organistPersonId: effectiveOrganistPersonId } : {}),
      ...(antiphon?.id ? { referenceAntiphonId: antiphon.id } : {}),
      ...(topic?.id ? { referenceTopicId: topic.id } : {}),
      availabilityMode,
    };
  }

  async function reloadCandidates(preserveDetailSongId?: string) {
    const token = ++request.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await queryCandidates(candidateInput());
      if (request.current !== token) return;
      setCandidates(result);
      if (preserveDetailSongId) setSelectedDetail(result.find((candidate) => candidate.songId === preserveDetailSongId));
    } catch (cause) {
      if (request.current !== token) return;
      setCandidates([]);
      setError(cause instanceof Error ? cause.message : "Catalog candidates could not be loaded.");
    } finally {
      if (request.current === token) setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedDetail(undefined);
    void reloadCandidates();
  }, [language, effectiveOrganistPersonId, antiphon?.id, topic?.id, availabilityMode, queryCandidates, actor.role, actor.personId]);

  useEffect(() => {
    const token = ++preferenceRequest.current;
    setPreferenceAggregate(undefined);
    setOwnPreference(undefined);
    setPreferenceDraft("");
    setPreferenceFeedback("idle");
    setPreferenceError(undefined);

    if (runtime !== "db" || !selectedDetail) return;

    void getPreferenceAggregate(selectedDetail.songId).then((result) => {
      if (preferenceRequest.current !== token) return;
      if (result.success) setPreferenceAggregate(result.value);
      else setPreferenceError(result.error.message);
    }).catch((cause: unknown) => {
      if (preferenceRequest.current === token) setPreferenceError(cause instanceof Error ? cause.message : "Aggregate preference could not be loaded.");
    });

    if (actor.role !== "admin") {
      void getOwnPreference(selectedDetail.songId).then((result) => {
        if (preferenceRequest.current !== token) return;
        if (result.success) {
          setOwnPreference(result.value);
          setPreferenceDraft(result.value.score === null ? "" : String(result.value.score));
        } else {
          setPreferenceError(result.error.message);
        }
      }).catch((cause: unknown) => {
        if (preferenceRequest.current === token) setPreferenceError(cause instanceof Error ? cause.message : "Own preference could not be loaded.");
      });
    }

    return () => {
      if (preferenceRequest.current === token) preferenceRequest.current += 1;
    };
  }, [runtime, selectedDetail?.songId, actor.userId, actor.role, getOwnPreference, getPreferenceAggregate]);

  async function savePreference() {
    if (!selectedDetail || !ownPreference) return;
    const score = Number(preferenceDraft);
    if (!Number.isInteger(score) || score < 0 || score > ownPreference.limit) return;

    const songId = selectedDetail.songId;
    const token = ++preferenceRequest.current;
    setPreferenceSaving(true);
    setPreferenceFeedback("idle");
    setPreferenceError(undefined);
    try {
      const saved = await saveOwnPreference(songId, score);
      if (preferenceRequest.current !== token) return;
      if (!saved.success) {
        setPreferenceError(saved.error.message);
        setPreferenceFeedback("error");
        return;
      }
      setOwnPreference(saved.value);
      setPreferenceDraft(String(saved.value.score));
      const aggregate = await getPreferenceAggregate(songId);
      if (preferenceRequest.current !== token) return;
      if (aggregate.success) setPreferenceAggregate(aggregate.value);
      else setPreferenceError(aggregate.error.message);
      await reloadCandidates(songId);
      if (preferenceRequest.current === token) setPreferenceFeedback("saved");
    } catch (cause) {
      if (preferenceRequest.current === token) {
        setPreferenceError(cause instanceof Error ? cause.message : "Preference could not be saved.");
        setPreferenceFeedback("error");
      }
    } finally {
      if (preferenceRequest.current === token) setPreferenceSaving(false);
    }
  }

  async function mutateRepertoire(candidate: CandidateQueryResult) {
    if (!canManageRepertoire || !repertoireAction || repertoireSaving) return;
    const adding = repertoireAction === "Add";
    setRepertoireError(undefined);
    setRepertoireSaving(true);
    try {
      const baseInput = candidateInput();
      const freshAvailable = await queryCandidates({ ...baseInput, availabilityMode: "available" });
      const freshAvailableClass = freshAvailable.filter((item) => item.melodyClassId === candidate.melodyClassId);
      const existingPivot = freshAvailableClass
        .flatMap((item) => item.melodyMembers ?? [])
        .find((member) => member.repertoire);

      if (adding) {
        if (existingPivot || freshAvailableClass.length > 0) {
          setRepertoireError("Repertoire changed before confirmation; this melody class already has a repertoire pivot.");
          await reloadCandidates();
          return;
        }
        const freshUnavailable = await queryCandidates({ ...baseInput, availabilityMode: "unavailable" });
        if (!freshUnavailable.some((item) => item.songId === candidate.songId && item.melodyClassId === candidate.melodyClassId)) {
          setRepertoireError("Catalog context changed before confirmation; the selected song is no longer unavailable.");
          await reloadCandidates();
          return;
        }
      }

      const targetSongId = adding
        ? candidate.songId
        : existingPivot?.songId ?? candidate.melodyMembers?.find((member) => member.repertoire)?.songId ?? (candidate.repertoire ? candidate.songId : undefined);

      if (!targetSongId) {
        setRepertoireError("Repertoire changed before confirmation; no removable pivot remains in this melody class.");
        await reloadCandidates();
        return;
      }

      const verb = adding ? "Add" : "Remove";
      if (!window.confirm(`${verb} ${targetSongId} ${adding ? "to" : "from"} ${selectedOrganist?.displayName ?? "this organist"} repertoire?`)) return;

      const result = await setRepertoireMembership(
        targetSongId,
        actor.role === "admin" ? effectiveOrganistPersonId : undefined,
        adding,
      );
      if (!result.success) {
        setRepertoireError(result.error.message);
        return;
      }

      setSelectedDetail(undefined);
      await reloadCandidates();
    } catch (cause) {
      setRepertoireError(cause instanceof Error ? cause.message : "Repertoire could not be updated.");
    } finally {
      setRepertoireSaving(false);
    }
  }

  return <section className="catalog-workspace" aria-label="Catalog">
    <div className="rows-header">
      <h2>Catalog</h2>
      <span className="field-help">Candidate and repertoire workspace</span>
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
          value={effectiveOrganistPersonId}
          onChange={(event) => setOrganistPersonId(event.target.value)}
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
        onClick={() => setAvailabilityMode("unavailable")}
      >
        Unavailable
      </button>
    </div>

    <section className="catalog-candidate-panel" aria-label="Catalog candidates">
      <div className="catalog-candidate-header">
        <strong>Candidates</strong>
        <div className="workspace-nav catalog-view-switch" role="group" aria-label="Catalog candidate view">
          <button type="button" className={viewMode === "songs" ? "active-workspace" : undefined} aria-pressed={viewMode === "songs"} onClick={() => setViewMode("songs")}>Songs</button>
          <button type="button" className={viewMode === "melodies" ? "active-workspace" : undefined} aria-pressed={viewMode === "melodies"} onClick={() => setViewMode("melodies")}>Melodies</button>
        </div>
      </div>

      {selectedDetail && <CatalogCandidateDetail
        candidate={selectedDetail}
        runtime={runtime}
        actor={actor}
        aggregate={preferenceAggregate}
        ownPreference={ownPreference}
        preferenceDraft={preferenceDraft}
        preferenceSaving={preferenceSaving}
        preferenceFeedback={preferenceFeedback}
        preferenceError={preferenceError}
        onPreferenceDraftChange={(value) => { setPreferenceDraft(value); setPreferenceFeedback("idle"); }}
        onSavePreference={() => void savePreference()}
        onClose={() => setSelectedDetail(undefined)}
      />}
      {loading && <p className="catalog-candidate-state" role="status">Loading candidates…</p>}
      {error && <p className="catalog-candidate-state inline-error" role="alert">{error}</p>}
      {repertoireError && <p className="catalog-candidate-state inline-error" role="alert">{repertoireError}</p>}
      {!loading && !error && visibleCandidates.length === 0 && <p className="catalog-candidate-state">No candidates match this Catalog context.</p>}

      {!loading && !error && visibleCandidates.length > 0 && <div className="catalog-candidate-scroll" role="list" aria-label={`${availabilityMode} ${viewMode}`}>
        {visibleCandidates.map((candidate) => <CatalogCandidateRow
          key={candidate.songId}
          candidate={candidate}
          repertoireAction={repertoireAction}
          repertoireSaving={repertoireSaving}
          onRepertoireAction={() => void mutateRepertoire(candidate)}
          onDetail={() => setSelectedDetail(candidate)}
        />)}
      </div>}
    </section>
  </section>;
}

function CatalogCandidateRow({
  candidate,
  repertoireAction,
  repertoireSaving,
  onRepertoireAction,
  onDetail,
}: {
  candidate: CandidateQueryResult;
  repertoireAction?: "Add" | "Remove";
  repertoireSaving: boolean;
  onRepertoireAction: () => void;
  onDetail: () => void;
}) {
  const viewModel = getCandidateLineViewModel(candidate);
  return <div
    className={`candidate-option-row catalog-candidate-row ${viewModel.backgroundClass}`}
    role="listitem"
    aria-label={viewModel.accessibleMeaning}
    style={{ alignItems: "center", minHeight: "2.2rem", padding: "0.1rem 0.15rem" }}
  >
    <div className="candidate-option">
      <div
        className="candidate-option-content"
        style={{ alignItems: "center", minHeight: "2rem", padding: "0 0.35rem" }}
      >
        <span className={`candidate-option-main ${viewModel.contentTextClass}`} style={{ alignItems: "center", minHeight: "2rem" }}>
          <strong>{candidate.number}</strong><span>{candidate.title}</span>
        </span>
      </div>
    </div>
    {repertoireAction && <button type="button" disabled={repertoireSaving} onClick={onRepertoireAction}>{repertoireAction}</button>}
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
      onClick={onDetail}
      aria-label={`Show melody detail for ${candidate.number} ${candidate.title}`}
    >Detail</button>
  </div>;
}

type CatalogCandidateDetailProps = {
  candidate: CandidateQueryResult;
  runtime: "memory" | "db";
  actor: ActorIdentity;
  aggregate?: ReferencePreferenceAggregate;
  ownPreference?: ReferenceOwnPreference;
  preferenceDraft: string;
  preferenceSaving: boolean;
  preferenceFeedback: "idle" | "saved" | "error";
  preferenceError?: string;
  onPreferenceDraftChange: (value: string) => void;
  onSavePreference: () => void;
  onClose: () => void;
};

function CatalogCandidateDetail({
  candidate,
  runtime,
  actor,
  aggregate,
  ownPreference,
  preferenceDraft,
  preferenceSaving,
  preferenceFeedback,
  preferenceError,
  onPreferenceDraftChange,
  onSavePreference,
  onClose,
}: CatalogCandidateDetailProps) {
  const members = candidate.melodyMembers ?? [];
  const validDraft = ownPreference
    ? Number.isInteger(Number(preferenceDraft))
      && preferenceDraft.trim() !== ""
      && Number(preferenceDraft) >= 0
      && Number(preferenceDraft) <= ownPreference.limit
    : false;

  return <section className="melody-detail catalog-readonly-detail" aria-label="Catalog candidate detail">
    <div className="melody-detail-header">
      <div>
        <h3>{candidate.number} · {candidate.title}</h3>
        <p className="field-help">{candidate.language} · {candidate.songId}</p>
      </div>
      <button type="button" onClick={onClose}>Close</button>
    </div>

    {runtime === "db" && <p className="field-help" aria-label="Reference preference aggregate">
      Aggregate preference: <strong>{aggregate?.aggregateScore ?? candidate.aggregatePreferenceScore}</strong>
    </p>}

    {runtime === "db" && actor.role !== "admin" && ownPreference && <div aria-label="My reference preference">
      <p className="field-help">
        My current: <strong>{ownPreference.score === null ? "not set" : ownPreference.score}</strong>
        {" "}· Profile: {ownPreference.category} · Allowed range: 0–{ownPreference.limit}
      </p>
      <label>
        Draft value
        <input
          aria-label="Reference preference draft value"
          type="number"
          min={0}
          max={ownPreference.limit}
          step={1}
          value={preferenceDraft}
          disabled={preferenceSaving}
          onChange={(event) => onPreferenceDraftChange(event.target.value)}
        />
      </label>
      <button type="button" disabled={preferenceSaving || !validDraft} onClick={onSavePreference}>Save preference</button>
      {preferenceSaving && <span className="field-help" role="status">Saving…</span>}
      {preferenceFeedback === "saved" && <span className="field-help" role="status">Saved.</span>}
    </div>}

    {runtime === "db" && preferenceError && <p className="field-help" role="alert">Preference unavailable: {preferenceError}</p>}

    <p className="field-help">
      {candidate.repertoire ? "Explicit repertoire pivot" : "Not an explicit repertoire pivot"}
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
