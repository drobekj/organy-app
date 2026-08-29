"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReferenceCatalogRecord } from "../src/application/reference-catalog-contract";
import type { ReferenceMelodyClass } from "../src/application/reference-melody";
import {
  isOutsideReferenceMelodyClass,
  resolveReferenceMelodyEdgeEditorMode,
} from "../src/application/reference-melody-edge-editor";
import type { RecommendedReferenceSong } from "../src/application/reference-antiphon-recommendation";
import { ReferenceSongLookupField } from "./reference-song-lookup-field";

type EditorResult<T> =
  | { success: true; value: T }
  | { success: false; error: { message: string } };

type EdgeResult = EditorResult<{ exists: boolean }>;
type MelodyResult = EditorResult<ReferenceMelodyClass>;

export type ReferenceMelodyEdgeEditorProps = {
  getMelodyClass: (referenceSongId: string) => Promise<MelodyResult>;
  getMelodyEdge: (referenceSongId: string, otherReferenceSongId: string) => Promise<EdgeResult>;
  addMelodyEdge: (referenceSongId: string, otherReferenceSongId: string) => Promise<MelodyResult>;
  removeMelodyEdge: (referenceSongId: string, otherReferenceSongId: string) => Promise<MelodyResult>;
  onChanged: () => void | Promise<void>;
};

type SongLanguage = "czech" | "polish";

function lookupSelection(record: ReferenceCatalogRecord | null): RecommendedReferenceSong | null {
  return record ? {
    referenceSongId: record.id,
    language: record.language,
    canonicalNumber: record.canonicalNumber,
    displayNumber: record.displayNumber,
    title: record.title,
  } : null;
}

export function ReferenceMelodyEdgeEditor({
  getMelodyClass,
  getMelodyEdge,
  addMelodyEdge,
  removeMelodyEdge,
  onChanged,
}: ReferenceMelodyEdgeEditorProps) {
  const [firstLanguage, setFirstLanguage] = useState<SongLanguage>("czech");
  const [secondLanguage, setSecondLanguage] = useState<SongLanguage>("czech");
  const [firstSong, setFirstSong] = useState<ReferenceCatalogRecord | null>(null);
  const [secondSong, setSecondSong] = useState<ReferenceCatalogRecord | null>(null);
  const [firstClass, setFirstClass] = useState<ReferenceMelodyClass>();
  const [secondClass, setSecondClass] = useState<ReferenceMelodyClass>();
  const [edgeExists, setEdgeExists] = useState<boolean>();
  const [firstClassLoading, setFirstClassLoading] = useState(false);
  const [secondClassLoading, setSecondClassLoading] = useState(false);
  const [edgeLoading, setEdgeLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstClassError, setFirstClassError] = useState<string>();
  const [secondClassError, setSecondClassError] = useState<string>();
  const [edgeError, setEdgeError] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const firstClassRequest = useRef(0);
  const secondClassRequest = useRef(0);
  const edgeRequest = useRef(0);

  const firstClassMemberIds = useMemo(
    () => firstClass ? new Set(firstClass.members.map((member) => member.referenceSongId)) : undefined,
    [firstClass],
  );
  const secondClassMemberIds = useMemo(
    () => secondClass ? new Set(secondClass.members.map((member) => member.referenceSongId)) : undefined,
    [secondClass],
  );
  const classLoading = firstClassLoading || secondClassLoading;
  const classError = firstClassError ?? secondClassError;

  useEffect(() => {
    const token = ++firstClassRequest.current;
    setFirstClass(undefined);
    setFirstClassError(undefined);
    setFirstClassLoading(false);
    if (!firstSong) return;

    setFirstClassLoading(true);
    void getMelodyClass(firstSong.id).then((result) => {
      if (firstClassRequest.current !== token) return;
      if (result.success) setFirstClass(result.value);
      else setFirstClassError(result.error.message);
    }).catch((cause: unknown) => {
      if (firstClassRequest.current === token) {
        setFirstClassError(cause instanceof Error ? cause.message : "Melody class could not be loaded.");
      }
    }).finally(() => {
      if (firstClassRequest.current === token) setFirstClassLoading(false);
    });
  }, [firstSong?.id]);

  useEffect(() => {
    const token = ++secondClassRequest.current;
    setSecondClass(undefined);
    setSecondClassError(undefined);
    setSecondClassLoading(false);
    if (!secondSong) return;

    setSecondClassLoading(true);
    void getMelodyClass(secondSong.id).then((result) => {
      if (secondClassRequest.current !== token) return;
      if (result.success) setSecondClass(result.value);
      else setSecondClassError(result.error.message);
    }).catch((cause: unknown) => {
      if (secondClassRequest.current === token) {
        setSecondClassError(cause instanceof Error ? cause.message : "Melody class could not be loaded.");
      }
    }).finally(() => {
      if (secondClassRequest.current === token) setSecondClassLoading(false);
    });
  }, [secondSong?.id]);

  useEffect(() => {
    const token = ++edgeRequest.current;
    setEdgeExists(undefined);
    setEdgeError(undefined);
    setMutationError(undefined);
    setEdgeLoading(false);

    if (!firstSong || !secondSong || firstSong.id === secondSong.id) return;

    setEdgeLoading(true);
    void getMelodyEdge(firstSong.id, secondSong.id).then((result) => {
      if (edgeRequest.current !== token) return;
      if (result.success) setEdgeExists(result.value.exists);
      else setEdgeError(result.error.message);
    }).catch((cause: unknown) => {
      if (edgeRequest.current === token) {
        setEdgeError(cause instanceof Error ? cause.message : "Melody edge state could not be loaded.");
      }
    }).finally(() => {
      if (edgeRequest.current === token) setEdgeLoading(false);
    });
  }, [firstSong?.id, secondSong?.id]);

  const mode = resolveReferenceMelodyEdgeEditorMode(firstSong?.id, secondSong?.id, edgeExists);

  async function refreshEditorState() {
    if (!firstSong || !secondSong || firstSong.id === secondSong.id) return;
    const [nextFirstClass, nextSecondClass, nextEdge] = await Promise.all([
      getMelodyClass(firstSong.id),
      getMelodyClass(secondSong.id),
      getMelodyEdge(firstSong.id, secondSong.id),
    ]);
    if (nextFirstClass.success) {
      setFirstClass(nextFirstClass.value);
      setFirstClassError(undefined);
    } else {
      setFirstClassError(nextFirstClass.error.message);
    }
    if (nextSecondClass.success) {
      setSecondClass(nextSecondClass.value);
      setSecondClassError(undefined);
    } else {
      setSecondClassError(nextSecondClass.error.message);
    }
    if (nextEdge.success) {
      setEdgeExists(nextEdge.value.exists);
      setEdgeError(undefined);
    } else {
      setEdgeExists(undefined);
      setEdgeError(nextEdge.error.message);
    }
  }

  async function mutate(action: "add" | "remove") {
    if (!firstSong || !secondSong || saving || mode !== action) return;
    setSaving(true);
    setMutationError(undefined);
    try {
      const result = action === "add"
        ? await addMelodyEdge(firstSong.id, secondSong.id)
        : await removeMelodyEdge(firstSong.id, secondSong.id);
      if (!result.success) {
        setMutationError(result.error.message);
        return;
      }
      await Promise.all([refreshEditorState(), onChanged()]);
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : "Melody edge could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  return <fieldset className="field-group catalog-melody-edge-editor" aria-label="Melody edge editor">
    <legend>Melody edges</legend>

    <div className="catalog-melody-edge-language-row">
      <select
        aria-label="First song language"
        value={firstLanguage}
        onChange={(event) => {
          setFirstLanguage(event.target.value as SongLanguage);
          setFirstSong(null);
        }}
      >
        <option value="czech">Czech</option>
        <option value="polish">Polish</option>
      </select>
      <select
        aria-label="Second song language"
        value={secondLanguage}
        onChange={(event) => {
          setSecondLanguage(event.target.value as SongLanguage);
          setSecondSong(null);
        }}
      >
        <option value="czech">Czech</option>
        <option value="polish">Polish</option>
      </select>
    </div>

    <div className="catalog-melody-edge-song-row">
      <MelodyEdgeSongLookup
        side="first"
        language={firstLanguage}
        selected={firstSong}
        optionClassName={(record) => isOutsideReferenceMelodyClass(record.id, secondSong?.id, secondClassMemberIds)
          ? "reference-song-option-outside-melody"
          : undefined}
        onSelect={setFirstSong}
      />
      <MelodyEdgeSongLookup
        side="second"
        language={secondLanguage}
        selected={secondSong}
        optionClassName={(record) => isOutsideReferenceMelodyClass(record.id, firstSong?.id, firstClassMemberIds)
          ? "reference-song-option-outside-melody"
          : undefined}
        onSelect={setSecondSong}
      />
    </div>

    <div className="catalog-melody-edge-actions" aria-label="Melody edge actions">
      <button
        type="button"
        disabled={saving || edgeLoading || mode !== "add"}
        onClick={() => void mutate("add")}
      >Add</button>
      <button
        type="button"
        disabled={saving || edgeLoading || mode !== "remove"}
        onClick={() => void mutate("remove")}
      >Remove</button>
    </div>

    {mode === "self" && <p className="catalog-candidate-state inline-error" role="alert">A melody edge cannot connect a song to itself.</p>}
    {(classLoading || edgeLoading) && <p className="catalog-candidate-state" role="status">Checking melody structure…</p>}
    {classError && <p className="catalog-candidate-state inline-error" role="alert">{classError}</p>}
    {edgeError && <p className="catalog-candidate-state inline-error" role="alert">{edgeError}</p>}
    {mutationError && <p className="catalog-candidate-state inline-error" role="alert">{mutationError}</p>}
  </fieldset>;
}

function MelodyEdgeSongLookup({
  side,
  language,
  selected,
  optionClassName,
  onSelect,
}: {
  side: "first" | "second";
  language: SongLanguage;
  selected: ReferenceCatalogRecord | null;
  optionClassName?: (record: ReferenceCatalogRecord) => string | undefined;
  onSelect: (record: ReferenceCatalogRecord | null) => void;
}) {
  const label = side === "first" ? "First song" : "Second song";
  return <ReferenceSongLookupField
    language={language}
    selected={lookupSelection(selected)}
    ariaLabel={label}
    listboxId={`melody-edge-${side}-song-listbox`}
    getOptionClassName={optionClassName}
    selectedValueClassName="melody-edge-selected-value"
    onSelect={onSelect}
  />;
}
