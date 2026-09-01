"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { MelodyClassDetail } from "../src/planning-lifecycle/melody-detail";
import { ServiceContextReferenceAntiphonField } from "./service-context-reference-antiphon-field";
import { DbReferenceAntiphonRecommendationClient } from "../src/application/reference-antiphon-recommendation-client";
import type { ReferenceAntiphonRecommendation } from "../src/application/reference-antiphon-recommendation";
import { getDefaultServiceLanguage, getNearestSunday } from "../src/planning-lifecycle/service-context-defaults";
import { ServiceContextReferenceTopicField } from "./service-context-reference-topic-field";
import { ReferenceMelodyEdgeEditor } from "./reference-melody-edge-editor";
import type { ReferenceMelodyClass } from "../src/application/reference-melody";

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
  getMelodyClass: (referenceSongId: string) => Promise<PreferenceResult<ReferenceMelodyClass>>;
  getMelodyEdge: (referenceSongId: string, otherReferenceSongId: string) => Promise<PreferenceResult<{ exists: boolean }>>;
  addMelodyEdge: (referenceSongId: string, otherReferenceSongId: string) => Promise<PreferenceResult<ReferenceMelodyClass>>;
  removeMelodyEdge: (referenceSongId: string, otherReferenceSongId: string) => Promise<PreferenceResult<ReferenceMelodyClass>>;
  onAntiphonRecommendationChanged?: () => void;
  onMelodyStructureChanged?: () => void;
};

export function CatalogWorkspace({
  runtime,
  actor,
  organists,
  queryCandidates,
  getOwnPreference,
  saveOwnPreference,
  setRepertoireMembership,
  getMelodyClass,
  getMelodyEdge,
  addMelodyEdge,
  removeMelodyEdge,
  onAntiphonRecommendationChanged,
  onMelodyStructureChanged,
}: CatalogWorkspaceProps) {
  const [language, setLanguage] = useState<ServiceLanguage>(() => getDefaultServiceLanguage(getNearestSunday(new Date())));
  const [organistPersonId, setOrganistPersonId] = useState(() => actor.role === "organist" ? (actor.personId ?? "") : "");
  const [antiphon, setAntiphon] = useState<ServiceAntiphonReference>();
  const [topic, setTopic] = useState<ServiceTopicReference>();
  const [availabilityMode, setAvailabilityMode] = useState<CatalogCandidateAvailabilityMode>("available");
  const [viewMode, setViewMode] = useState<CandidateViewMode>("songs");
  const [candidates, setCandidates] = useState<CandidateQueryResult[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<CandidateQueryResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [ownPreference, setOwnPreference] = useState<ReferenceOwnPreference>();
  const [preferenceDraft, setPreferenceDraft] = useState("");
  const [preferenceError, setPreferenceError] = useState<string>();
  const [repertoireSaving, setRepertoireSaving] = useState(false);
  const [repertoireError, setRepertoireError] = useState<string>();
  const [antiphonRecommendation, setAntiphonRecommendation] = useState<ReferenceAntiphonRecommendation>();
  const [antiphonRecommendationLoading, setAntiphonRecommendationLoading] = useState(false);
  const [antiphonRecommendationError, setAntiphonRecommendationError] = useState<string>();
  const request = useRef(0);
  const preferenceRequest = useRef(0);
  const recommendationRequest = useRef(0);

  const contextKey = `catalog:${language}:${organistPersonId}:${actor.role}`;
  const visibleCandidates = useMemo(() => candidatesForView(candidates, viewMode), [candidates, viewMode]);
  const selectedOrganist = organists.find((person) => person.id === organistPersonId);
  const recommendationClient = useMemo(
    () => runtime === "db" ? new DbReferenceAntiphonRecommendationClient({ userId: actor.userId, role: actor.role }) : null,
    [runtime, actor.userId, actor.role],
  );
  const canManageRepertoire = runtime === "db" && Boolean(organistPersonId) && (
    actor.role === "admin"
    || (actor.role === "organist" && actor.personId === organistPersonId)
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
      ...(organistPersonId ? { organistPersonId } : {}),
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
  }, [language, organistPersonId, antiphon?.id, topic?.id, availabilityMode, queryCandidates]);

  useEffect(() => {
    const token = ++recommendationRequest.current;
    setAntiphonRecommendation(undefined);
    setAntiphonRecommendationError(undefined);
    setAntiphonRecommendationLoading(false);
    if (!recommendationClient || !antiphon) return;

    setAntiphonRecommendationLoading(true);
    void recommendationClient.get(antiphon.id).then((result) => {
      if (recommendationRequest.current !== token) return;
      if (result.success) setAntiphonRecommendation(result.value);
      else setAntiphonRecommendationError(result.error.message);
    }).catch((cause: unknown) => {
      if (recommendationRequest.current === token) setAntiphonRecommendationError(cause instanceof Error ? cause.message : "Antiphon Reference song could not be loaded.");
    }).finally(() => {
      if (recommendationRequest.current === token) setAntiphonRecommendationLoading(false);
    });

    return () => {
      if (recommendationRequest.current === token) recommendationRequest.current += 1;
    };
  }, [recommendationClient, antiphon?.id]);

  useEffect(() => {
    const token = ++preferenceRequest.current;
    setOwnPreference(undefined);
    setPreferenceDraft("");
    setPreferenceError(undefined);

    if (
      runtime !== "db"
      || !selectedDetail
      || (actor.role !== "organist" && actor.role !== "priest")
    ) return;

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

    return () => {
      if (preferenceRequest.current === token) preferenceRequest.current += 1;
    };
  }, [runtime, selectedDetail?.songId, actor.userId, actor.role, getOwnPreference]);

  async function persistPreferenceOnDetailExit(
    candidate: CandidateQueryResult | undefined,
    preference: ReferenceOwnPreference | undefined,
    draft: string,
  ) {
    if (runtime !== "db" || !candidate || !preference) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    const score = Number(trimmed);
    if (!Number.isInteger(score) || score < 0 || score > preference.limit || preference.score === score) return;

    try {
      const saved = await saveOwnPreference(candidate.songId, score);
      if (!saved.success) {
        setPreferenceError(saved.error.message);
        return;
      }
      await reloadCandidates();
    } catch (cause) {
      setPreferenceError(cause instanceof Error ? cause.message : "Preference could not be saved.");
    }
  }

  function leaveDetail() {
    const candidate = selectedDetail;
    const preference = ownPreference;
    const draft = preferenceDraft;
    setSelectedDetail(undefined);
    setOwnPreference(undefined);
    setPreferenceDraft("");
    if (candidate && preference) void persistPreferenceOnDetailExit(candidate, preference, draft);
  }

  function showDetailCandidate(songId: string) {
    const next = candidates.find((item) => item.songId === songId);
    if (!next || next.songId === selectedDetail?.songId) return;
    const candidate = selectedDetail;
    const preference = ownPreference;
    const draft = preferenceDraft;
    setSelectedDetail(next);
    setOwnPreference(undefined);
    setPreferenceDraft("");
    if (candidate && preference) void persistPreferenceOnDetailExit(candidate, preference, draft);
  }

  async function mutateRepertoire(candidate: CandidateQueryResult, action: "Add" | "Remove") {
    if (!canManageRepertoire || repertoireSaving) return;
    const adding = action === "Add";
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
        actor.role === "admin" ? organistPersonId : undefined,
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
    <fieldset className="field-group catalog-context">
      <legend data-guide-hint="catalog.context">Catalog context</legend>
      <div className="catalog-organist-language-row">
        <label className="catalog-context-cell">
          <span>Organist</span>
          <select
            aria-label="Catalog organist"
            value={organistPersonId}
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
      </div>
      <div className="service-antiphon-topic-row catalog-antiphon-topic-row">
        <div className="catalog-context-cell">
          <span className="catalog-context-label">Antiphon</span>
          <ServiceContextReferenceAntiphonField
            runtime={runtime}
            editable
            contextKey={contextKey}
            serviceLanguage={language}
            selected={antiphon}
            recommendedSong={antiphonRecommendation?.recommendedSong}
            recommendationLoading={antiphonRecommendationLoading}
            recommendationError={antiphonRecommendationError}
            recommendationClient={recommendationClient ?? undefined}
            canEditRecommendation={runtime === "db" && actor.role === "admin"}
            onRecommendationChanged={async (value) => {
              if (antiphon?.id === value.antiphonId) {
                recommendationRequest.current += 1;
                setAntiphonRecommendation(value);
                setAntiphonRecommendationLoading(false);
                setAntiphonRecommendationError(undefined);
                await reloadCandidates();
              }
              onAntiphonRecommendationChanged?.();
            }}
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
      </div>
    </fieldset>

    <fieldset className="field-group catalog-candidate-panel" aria-label="Catalog candidates">
      <legend data-guide-hint="catalog.candidates">Candidates</legend>
      <div className="catalog-candidate-header">
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
        <div className="workspace-nav catalog-view-switch" role="group" aria-label="Catalog candidate view">
          <button type="button" className={viewMode === "songs" ? "active-workspace" : undefined} aria-pressed={viewMode === "songs"} onClick={() => setViewMode("songs")}>Songs</button>
          <button type="button" className={viewMode === "melodies" ? "active-workspace" : undefined} aria-pressed={viewMode === "melodies"} onClick={() => setViewMode("melodies")}>Melodies</button>
        </div>
      </div>

      {loading && <p className="catalog-candidate-state" role="status">Loading candidates…</p>}
      {error && <p className="catalog-candidate-state inline-error" role="alert">{error}</p>}
      {repertoireError && <p className="catalog-candidate-state inline-error" role="alert">{repertoireError}</p>}
      {preferenceError && <p className="catalog-candidate-state inline-error" role="alert">Preference unavailable: {preferenceError}</p>}
      {!loading && !error && visibleCandidates.length === 0 && <p className="catalog-candidate-state">No candidates match this Catalog context.</p>}

      {!loading && !error && visibleCandidates.length > 0 && <div className="catalog-candidate-scroll" role="list" aria-label={`${availabilityMode} ${viewMode}`}>
        {visibleCandidates.map((candidate) => <CatalogCandidateRow
          key={candidate.songId}
          candidate={candidate}
          repertoireAction={repertoireAction}
          repertoireSaving={repertoireSaving}
          onRepertoireAction={(action) => void mutateRepertoire(candidate, action)}
          onDetail={() => setSelectedDetail(candidate)}
          detail={selectedDetail?.songId === candidate.songId ? (
            <MelodyClassDetail
              mode="candidate"
              rowLabel="Catalog"
              candidate={selectedDetail}
              serviceLanguage={language}
              eligibilityCandidates={candidates}
              loading={loading}
              error={error}
              dismissOnOutsidePointer
              personalPreference={ownPreference ? {
                value: preferenceDraft,
                options: Array.from({ length: ownPreference.limit + 1 }, (_, value) => value),
                onChange: (value) => setPreferenceDraft(value),
              } : undefined}
              onBack={leaveDetail}
              onClose={leaveDetail}
              onRetry={() => void reloadCandidates(selectedDetail.songId)}
              onShowCandidate={showDetailCandidate}
              onEscape={leaveDetail}
            />
          ) : undefined}
        />)}
      </div>}
    </fieldset>

    {runtime === "db" && actor.role === "admin" && <ReferenceMelodyEdgeEditor
      getMelodyClass={getMelodyClass}
      getMelodyEdge={getMelodyEdge}
      addMelodyEdge={addMelodyEdge}
      removeMelodyEdge={removeMelodyEdge}
      onChanged={async () => {
        setSelectedDetail(undefined);
        await reloadCandidates();
        onMelodyStructureChanged?.();
      }}
    />}

  </section>;
}

function CatalogCandidateRow({
  candidate,
  repertoireAction,
  repertoireSaving,
  onRepertoireAction,
  onDetail,
  detail,
}: {
  candidate: CandidateQueryResult;
  repertoireAction?: "Add" | "Remove";
  repertoireSaving: boolean;
  onRepertoireAction: (action: "Add" | "Remove") => void;
  onDetail: () => void;
  detail?: ReactNode;
}) {
  const view = getCandidateLineViewModel(candidate);
  return <div className={`candidate-option-row catalog-candidate-row ${view.backgroundClass}`} role="listitem" aria-label={view.accessibleMeaning}>
    <div className="catalog-candidate-summary">
      <span className={`candidate-option-main ${view.contentTextClass}`}>
        <strong>{candidate.number}</strong><span>{candidate.title}</span>
      </span>
    </div>
    <div className="catalog-candidate-actions">
      {repertoireAction && <button type="button" disabled={repertoireSaving} onClick={() => onRepertoireAction(repertoireAction)}>{repertoireAction}</button>}
      <button
        type="button"
        className="candidate-inline-detail"
        style={{ alignItems: "center", alignSelf: "center", borderRadius: "0.65rem", display: "inline-flex", height: "2rem", justifyContent: "center", lineHeight: 1, minWidth: "4.7rem", padding: "0 0.65rem" }}
        onClick={onDetail}
        aria-label={`Show melody detail for ${candidate.number} ${candidate.title}`}
      >Detail</button>
    </div>
    {detail}
  </div>;
}

