import type { Pool } from "pg";
import type {
  CandidateAvailability,
  CandidateHydrationInput,
  CandidateOccupyingRow,
  CandidateQueryInput,
  CandidateQueryResult,
  CandidateUsage,
} from "./interaction-contracts";
import { getCandidateSignal, getPreferenceShade, languagesForServiceShim } from "./interaction-service-utils";
import {
  compareReferenceCatalogRecords,
  displayReferenceNumber,
  normalizeReferenceNumberQuery,
  referenceNumberParts,
  type ReferenceCatalogRecord,
} from "./reference-catalog-contract";

export type ReferenceCandidateErrorCode = "invalidInput" | "notFound" | "internalError";

export class ReferenceCandidateError extends Error {
  constructor(readonly code: ReferenceCandidateErrorCode, message: string) {
    super(message);
    this.name = "ReferenceCandidateError";
  }
}

export type ReferenceCandidateSong = ReferenceCatalogRecord & {
  classId: string;
  aggregatePreferenceScore: number;
  repertoire: boolean;
};

export type ReferenceCandidateMelodyMember = {
  songId: string;
  language: "czech" | "polish";
  number: string;
  title: string;
  repertoire: boolean;
  aggregatePreferenceScore: number;
  sheetMusicUrl?: string;
};

export type ReferenceCandidateQueryResult = CandidateQueryResult & {
  melodyClassId: string;
  melodyMembers: ReferenceCandidateMelodyMember[];
};

export type ReferenceCandidateData = {
  songs: ReferenceCandidateSong[];
  melodyWindowMonths: number;
  recommendedReferenceSongId?: string;
  referenceTopic?: { language: "czech" | "polish"; ranges: { from: number; to: number }[] };
};

type TopicRangeRow = { language: "czech" | "polish"; from_number: number; to_number: number };

type CandidateRow = {
  id: string;
  language: "czech" | "polish";
  canonical_number: number;
  title: string;
  source_url: string | null;
  class_id: string | null;
  aggregate_preference_score: number | string;
  repertoire: boolean;
};

/**
 * Read-only authoritative Planning candidate boundary.
 *
 * It reads only the dedicated Reference subsystem and ignores every legacy
 * or synthetic candidate knowledge source.
 */
export class ReferenceCandidateService {
  constructor(private readonly pool: Pool) {}

  async queryCandidates(input: CandidateQueryInput): Promise<ReferenceCandidateQueryResult[]> {
    const data = await this.loadData(input.organistPersonId, input.referenceAntiphonId, input.referenceTopicId);
    return queryReferenceCandidatesFromData(data, input);
  }

  async hydrateCandidates(input: CandidateHydrationInput): Promise<CandidateQueryResult[]> {
    const data = await this.loadData(input.organistPersonId, input.referenceAntiphonId, input.referenceTopicId);
    return hydrateReferenceCandidatesFromData(data, input);
  }

  private async loadData(organistPersonId?: string, referenceAntiphonId?: string, referenceTopicId?: string): Promise<ReferenceCandidateData> {
    const songRowsPromise = this.pool.query(
      `select
         s.id,
         s.language,
         s.canonical_number,
         s.title,
         s.source_url,
         m.class_id,
         coalesce(p.aggregate_preference_score, 0)::integer as aggregate_preference_score,
         case when $1::text is null then false else (r.reference_song_id is not null) end as repertoire
       from reference_catalog_songs s
       left join reference_song_melody_memberships m on m.reference_song_id = s.id
       left join (
         select reference_song_id, sum(score)::integer as aggregate_preference_score
         from reference_song_preferences
         group by reference_song_id
       ) p on p.reference_song_id = s.id
       left join reference_organist_repertoire r
         on r.reference_song_id = s.id and r.organist_person_id = $1
       order by s.language, s.canonical_number, s.id`,
      [organistPersonId ?? null],
    ).then((result) => result.rows as CandidateRow[]);
    const windowPromise = this.pool.query("select months from melody_non_repetition_config where id = 'global'")
      .then((result) => result.rows as { months: number | string }[]);
    const recommendationPromise = referenceAntiphonId
      ? this.pool.query(
          `select r.reference_song_id
           from reference_antiphons a
           left join reference_antiphon_recommendations r on r.antiphon_id = a.id
           where a.id = $1`,
          [referenceAntiphonId],
        ).then((result) => result.rows as { reference_song_id: string | null }[])
      : Promise.resolve([] as { reference_song_id: string | null }[]);
    const topicPromise = referenceTopicId
      ? this.pool.query(
          `select s.language, r.from_number, r.to_number
           from reference_thematic_sections s
           join reference_thematic_ranges r on r.section_id = s.id
           where s.id = $1
           order by r.range_order`,
          [referenceTopicId],
        ).then((result) => result.rows as TopicRangeRow[])
      : Promise.resolve([] as TopicRangeRow[]);
    const [songRows, melodyWindowRows, recommendationRows, topicRows] = await Promise.all([songRowsPromise, windowPromise, recommendationPromise, topicPromise]);

    const songs = songRows.map((row): ReferenceCandidateSong => {
      const canonicalNumber = Number(row.canonical_number);
      const expectedId = `${row.language}:${canonicalNumber}`;
      if (row.id !== expectedId) throw new ReferenceCandidateError("internalError", "Persisted Reference candidate identity is invalid.");
      return {
        id: row.id,
        language: row.language as "czech" | "polish",
        canonicalNumber,
        displayNumber: displayReferenceNumber(canonicalNumber),
        title: String(row.title),
        ...(row.source_url ? { sourceUrl: String(row.source_url) } : {}),
        classId: row.class_id ? String(row.class_id) : `reference-melody:${row.id}`,
        aggregatePreferenceScore: Number(row.aggregate_preference_score),
        repertoire: Boolean(row.repertoire),
      };
    });

    const recommendationRow = recommendationRows[0];
    const topicLanguage = topicRows[0]?.language;
    return {
      songs,
      melodyWindowMonths: Number(melodyWindowRows[0]?.months ?? 2),
      ...(recommendationRow?.reference_song_id ? { recommendedReferenceSongId: String(recommendationRow.reference_song_id) } : {}),
      ...(topicLanguage ? { referenceTopic: { language: topicLanguage, ranges: topicRows.map((row) => ({ from: Number(row.from_number), to: Number(row.to_number) })) } } : {}),
    };
  }
}

export function queryReferenceCandidatesFromData(
  data: ReferenceCandidateData,
  input: CandidateQueryInput,
): ReferenceCandidateQueryResult[] {
  const languageSet = new Set(languagesForServiceShim(input.serviceLanguage));
  const classBySongId = new Map(data.songs.map((song) => [song.id, song.classId]));
  const membersByClass = groupSongsByClass(data.songs);
  const blockedClasses = getHardBlockedClassIds(
    classBySongId,
    input.candidateUsages ?? [],
    input.serviceDate,
    data.melodyWindowMonths,
    input.currentPlanId,
  );
  const occupancyByClass = getCurrentOccupancyByClass(classBySongId, input.candidateUsages ?? []);
  const threshold = input.preferenceThreshold ?? 0;
  const query = input.queryText?.trim() ?? "";
  const candidates: ReferenceCandidateQueryResult[] = [];

  for (const song of data.songs) {
    if (!languageSet.has(song.language)) continue;
    if (blockedClasses.has(song.classId)) continue;
    const allMembers = membersByClass.get(song.classId) ?? [song];
    if (input.organistPersonId && !allMembers.some((member) => member.repertoire)) continue;
    if (song.aggregatePreferenceScore < threshold) continue;
    if (query && !matchesReferenceCandidateSearch(song, query)) continue;

    const antiphonMatch = song.id === data.recommendedReferenceSongId;
    const occupiedRows = occupancyByClass.get(song.classId) ?? [];
    const availability: CandidateAvailability = occupiedRows.length > 0
      ? { kind: "occupiedByCurrentRows", rows: occupiedRows }
      : { kind: "available" };
    const seasonMatch = referenceTopicMatchesSong(data.referenceTopic, song);
    candidates.push(toCandidate(song, allMembers, antiphonMatch, seasonMatch, availability));
  }

  return candidates.sort(compareConcreteResults);
}

export function hydrateReferenceCandidatesFromData(
  data: ReferenceCandidateData,
  input: CandidateHydrationInput,
): CandidateQueryResult[] {
  const songsById = new Map(data.songs.map((song) => [song.id, song]));
  const membersByClass = groupSongsByClass(data.songs);

  return input.songs.map((reference) => {
    const stored = reference.songId ? songsById.get(reference.songId) : undefined;
    if (!stored) return historicalCandidate(reference);
    const antiphonMatch = stored.id === data.recommendedReferenceSongId;
    const allMembers = membersByClass.get(stored.classId) ?? [stored];
    const seasonMatch = referenceTopicMatchesSong(data.referenceTopic, stored);
    return {
      ...toCandidate(stored, allMembers, antiphonMatch, seasonMatch),
      number: reference.number,
      title: reference.title ?? stored.title,
      orderKey: concreteOrderKey(stored),
    };
  });
}

function toCandidate(
  song: ReferenceCandidateSong,
  allMembers: ReferenceCandidateSong[],
  antiphonMatch: boolean,
  seasonMatch: boolean,
  availability: CandidateAvailability = { kind: "available" },
): ReferenceCandidateQueryResult {
  const melodyMembers = orderMelodyMembers(song, allMembers).map(toMelodyMember);
  const equivalentNumbers = melodyMembers
    .filter((member) => member.songId !== song.id)
    .map((member) => ({ songId: member.songId, number: member.number, repertoire: member.repertoire }));
  const signal = getCandidateSignal({ antiphonMatch, seasonMatch });
  return {
    songId: song.id,
    language: song.language,
    number: song.displayNumber,
    title: song.title,
    equivalentNumbers,
    melodyClassId: song.classId,
    melodyMembers,
    aggregatePreferenceScore: song.aggregatePreferenceScore,
    antiphonMatch,
    seasonMatch,
    signal,
    preferenceShade: getPreferenceShade(song.aggregatePreferenceScore),
    repertoire: song.repertoire,
    availability,
    suppressedByMelodyWindow: false,
    ...(song.sourceUrl ? { sheetMusicUrl: song.sourceUrl } : {}),
    orderKey: concreteOrderKey(song),
  };
}

function toMelodyMember(song: ReferenceCandidateSong): ReferenceCandidateMelodyMember {
  return {
    songId: song.id,
    language: song.language,
    number: song.displayNumber,
    title: song.title,
    repertoire: song.repertoire,
    aggregatePreferenceScore: song.aggregatePreferenceScore,
    ...(song.sourceUrl ? { sheetMusicUrl: song.sourceUrl } : {}),
  };
}

function historicalCandidate(reference: CandidateHydrationInput["songs"][number]): CandidateQueryResult {
  const songId = reference.songId ?? `historical:${reference.language}:${reference.number}`;
  return {
    songId,
    language: reference.language,
    number: reference.number,
    title: reference.title ?? "Untitled snapshot",
    equivalentNumbers: [],
    aggregatePreferenceScore: 0,
    antiphonMatch: false,
    seasonMatch: false,
    signal: "none",
    preferenceShade: "none",
    repertoire: false,
    availability: { kind: "available" },
    suppressedByMelodyWindow: false,
    orderKey: `rehydrated:${reference.language}:${reference.number}:${songId}`,
  };
}

function referenceTopicMatchesSong(topic: ReferenceCandidateData["referenceTopic"], song: ReferenceCandidateSong): boolean {
  if (!topic || topic.language !== song.language) return false;
  const baseNumber = referenceNumberParts(song.canonicalNumber).base;
  return topic.ranges.some((range) => baseNumber >= range.from && baseNumber <= range.to);
}

function groupSongsByClass(songs: ReferenceCandidateSong[]): Map<string, ReferenceCandidateSong[]> {
  const groups = new Map<string, ReferenceCandidateSong[]>();
  for (const song of songs) groups.set(song.classId, [...(groups.get(song.classId) ?? []), song]);
  return groups;
}

function orderMelodyMembers(primary: ReferenceCandidateSong, members: ReferenceCandidateSong[]): ReferenceCandidateSong[] {
  return [
    primary,
    ...members.filter((member) => member.id !== primary.id).sort(compareReferenceCatalogRecords),
  ];
}

function compareConcreteResults(left: ReferenceCandidateQueryResult, right: ReferenceCandidateQueryResult): number {
  return left.orderKey.localeCompare(right.orderKey);
}

function concreteOrderKey(song: ReferenceCandidateSong): string {
  const parts = referenceNumberParts(song.canonicalNumber);
  return `${languageRank(song.language)}:${String(parts.base).padStart(8, "0")}:${String(parts.variant).padStart(3, "0")}:${song.id}`;
}

function languageRank(language: "czech" | "polish"): number {
  return language === "czech" ? 0 : 1;
}

function matchesReferenceCandidateSearch(song: ReferenceCandidateSong, query: string): boolean {
  const trimmed = query.trim();
  const lower = trimmed.toLocaleLowerCase();
  if (song.title.toLocaleLowerCase().includes(lower)) return true;
  if (song.displayNumber.toLocaleLowerCase().includes(lower)) return true;
  if (song.displayNumber === trimmed || String(song.canonicalNumber) === trimmed) return true;
  if (/^[1-9]\d{3,}$/.test(trimmed)) return song.canonicalNumber === Number(trimmed);
  const family = trimmed.match(/^([1-9]\d*)\/?$/);
  if (family) {
    const parts = referenceNumberParts(song.canonicalNumber);
    return parts.base === Number(family[1]) && (!trimmed.endsWith("/") || parts.variant > 0);
  }
  const normalized = normalizeReferenceNumberQuery(trimmed);
  return normalized !== undefined && normalized === song.canonicalNumber;
}

function getHardBlockedClassIds(
  classBySongId: Map<string, string>,
  usages: CandidateUsage[],
  serviceDate: string,
  months: number,
  currentPlanId?: string,
): Set<string> {
  const target = Date.parse(`${serviceDate}T00:00:00Z`);
  const blocked = new Set<string>();
  for (const usage of usages) {
    if (usage.source === "current") continue;
    if (currentPlanId && usage.planId === currentPlanId) continue;
    const usedAt = Date.parse(`${usage.serviceDate}T00:00:00Z`);
    if (!Number.isFinite(usedAt) || !isWithinCalendarMonths(target, usedAt, months)) continue;
    const classId = classBySongId.get(usage.songId);
    if (classId) blocked.add(classId);
  }
  return blocked;
}

function getCurrentOccupancyByClass(
  classBySongId: Map<string, string>,
  usages: CandidateUsage[],
): Map<string, CandidateOccupyingRow[]> {
  const occupancy = new Map<string, CandidateOccupyingRow[]>();
  for (const usage of usages) {
    if (usage.source !== "current" || usage.rowId === undefined || !usage.rowLabel?.trim()) continue;
    const classId = classBySongId.get(usage.songId);
    if (!classId) continue;
    const rows = occupancy.get(classId) ?? [];
    if (!rows.some((row) => row.rowId === usage.rowId)) rows.push({ rowId: usage.rowId, label: usage.rowLabel.trim() });
    occupancy.set(classId, rows);
  }
  for (const rows of occupancy.values()) rows.sort((left, right) => left.rowId - right.rowId || left.label.localeCompare(right.label));
  return occupancy;
}

function isWithinCalendarMonths(target: number, usedAt: number, months: number): boolean {
  return usedAt >= addMonthsUtc(target, -months) && usedAt <= addMonthsUtc(target, months);
}

function addMonthsUtc(value: number, months: number): number {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate());
}
