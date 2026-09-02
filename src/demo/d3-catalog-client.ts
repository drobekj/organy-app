import { runPersistentMutation } from "../application/demo-safety";
import {
  getPreferenceShade,
  type CatalogCandidateQueryInput,
  type CandidateMelodyMember,
  type CandidateQueryResult,
  type ReferenceOwnPreference,
  type ReferencePreferenceAggregate,
} from "../application/interaction-contracts";
import { MemoryReferenceThematicSectionProvider } from "../application/reference-thematic-section";
import type { ReferenceMelodyClass } from "../application/reference-melody";
import type { CatalogSong } from "../application/catalog";
import type { ConcreteSongLanguage } from "../planning-lifecycle";
import { DEMO_D2_SONGS } from "./d2-planning-fixture";

type DemoReadResult<T> =
  | { success: true; value: T }
  | { success: false; error: { message: string } };

type DemoMelodyClass = {
  id: string;
  songIds: string[];
};

const DEMO_D3_MELODY_CLASSES: DemoMelodyClass[] = [
  { id: "demo-melody-a", songIds: ["demo-cz-101", "demo-pl-101"] },
  { id: "demo-melody-b", songIds: ["demo-cz-205", "demo-pl-220"] },
  { id: "demo-melody-c", songIds: ["demo-cz-420", "demo-pl-440"] },
  { id: "demo-melody-d", songIds: ["demo-cz-310"] },
  { id: "demo-melody-e", songIds: ["demo-cz-530"] },
];

const DEMO_D3_REPERTOIRE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "demo-organist": ["demo-cz-101", "demo-cz-205", "demo-cz-310", "demo-cz-420"],
  "demo-organist-petr": ["demo-pl-101", "demo-pl-220", "demo-cz-530"],
  "demo-both": ["demo-cz-101", "demo-pl-220", "demo-cz-420"],
});

const DEMO_D3_PREFERENCE_SCORE: Readonly<Record<string, number>> = Object.freeze({
  "demo-cz-101": 6,
  "demo-pl-101": 5,
  "demo-cz-205": 4,
  "demo-pl-220": 3,
  "demo-cz-310": 2,
  "demo-cz-420": 1,
  "demo-pl-440": 2,
  "demo-cz-530": 0,
});

const topicProvider = new MemoryReferenceThematicSectionProvider();

export class DemoCatalogKnowledgeClient {
  async queryCandidates(input: CatalogCandidateQueryInput): Promise<CandidateQueryResult[]> {
    const languageSongs = DEMO_D2_SONGS.filter((song) => isLanguageAllowed(song.language, input.serviceLanguage));
    const songsById = new Map(languageSongs.map((song) => [song.songId, song]));
    const repertoire = new Set(input.organistPersonId ? (DEMO_D3_REPERTOIRE[input.organistPersonId] ?? []) : []);
    const classes = DEMO_D3_MELODY_CLASSES
      .map((melodyClass) => ({
        ...melodyClass,
        members: melodyClass.songIds.map((songId) => songsById.get(songId)).filter((song): song is CatalogSong => Boolean(song)),
      }))
      .filter((melodyClass) => melodyClass.members.length > 0);

    const topic = input.referenceTopicId
      ? await topicProvider.getSectionById(input.referenceTopicId)
      : undefined;
    const antiphonClassIndex = input.referenceAntiphonId
      ? stableIndex(input.referenceAntiphonId, Math.max(classes.length, 1))
      : -1;
    const query = input.queryText?.trim().toLocaleLowerCase() ?? "";

    const candidates: CandidateQueryResult[] = [];

    for (const [classIndex, melodyClass] of classes.entries()) {
      const classAvailable = !input.organistPersonId || melodyClass.songIds.some((songId) => repertoire.has(songId));
      if (input.availabilityMode === "available" && !classAvailable) continue;
      if (input.availabilityMode === "unavailable" && (!input.organistPersonId || classAvailable)) continue;

      const representative = chooseRepresentative(melodyClass.members, repertoire);
      if (!representative) continue;

      if (query && !melodyClass.members.some((song) =>
        song.number.toLocaleLowerCase().includes(query)
        || song.title.toLocaleLowerCase().includes(query))) continue;

      const members = melodyClass.members.map((song): CandidateMelodyMember => ({
        songId: song.songId,
        language: song.language,
        number: song.number,
        title: song.title,
        repertoire: repertoire.has(song.songId),
        aggregatePreferenceScore: DEMO_D3_PREFERENCE_SCORE[song.songId] ?? 0,
      }));

      const representativeScore = DEMO_D3_PREFERENCE_SCORE[representative.songId] ?? 0;
      const antiphonMatch = classIndex === antiphonClassIndex;
      const seasonMatch = Boolean(
        topic
        && representative.language === topic.language
        && topic.ranges.some((range) => {
          const base = numericBase(representative.number);
          return base !== undefined && base >= range.from && base <= range.to;
        }),
      );
      const signal: CandidateQueryResult["signal"] = antiphonMatch ? "antiphon" : seasonMatch ? "season" : "none";

      candidates.push({
        songId: representative.songId,
        language: representative.language,
        number: representative.number,
        title: representative.title,
        equivalentNumbers: members
          .filter((member) => member.songId !== representative.songId)
          .map((member) => ({ songId: member.songId, number: member.number, repertoire: member.repertoire })),
        melodyClassId: melodyClass.id,
        melodyMembers: members,
        aggregatePreferenceScore: representativeScore,
        antiphonMatch,
        seasonMatch,
        signal,
        preferenceShade: getPreferenceShade(representativeScore),
        repertoire: repertoire.has(representative.songId),
        availability: { kind: "available" },
        suppressedByMelodyWindow: false,
        orderKey: [
          signal === "antiphon" ? 0 : signal === "season" ? 1 : 2,
          classAvailable ? 0 : 1,
          999 - representativeScore,
          representative.language,
          representative.number,
        ].join(":"),
      });
    }

    return candidates.sort((left, right) => left.orderKey.localeCompare(right.orderKey, undefined, { numeric: true }));
  }

  async getOwnPreference(referenceSongId: string): Promise<DemoReadResult<ReferenceOwnPreference>> {
    return {
      success: true,
      value: {
        referenceSongId,
        category: "organist",
        score: Math.min(2, DEMO_D3_PREFERENCE_SCORE[referenceSongId] ?? 0),
        limit: 2,
      },
    };
  }

  async getPreferenceAggregate(referenceSongId: string): Promise<DemoReadResult<ReferencePreferenceAggregate>> {
    return {
      success: true,
      value: {
        referenceSongId,
        aggregateScore: DEMO_D3_PREFERENCE_SCORE[referenceSongId] ?? 0,
      },
    };
  }

  async getMelodyClass(referenceSongId: string): Promise<DemoReadResult<ReferenceMelodyClass>> {
    const melodyClass = DEMO_D3_MELODY_CLASSES.find((candidate) => candidate.songIds.includes(referenceSongId));
    if (!melodyClass) return { success: false, error: { message: "Synthetic melody class was not found." } };
    const members = melodyClass.songIds
      .map((songId) => DEMO_D2_SONGS.find((song) => song.songId === songId))
      .filter((song): song is CatalogSong => Boolean(song))
      .map((song, index) => ({
        referenceSongId: song.songId,
        language: song.language,
        canonicalNumber: numericBase(song.number) ?? index + 1,
        displayNumber: song.number,
        title: song.title,
      }));
    return { success: true, value: { referenceSongId, classId: melodyClass.id, members } };
  }

  async getMelodyEdge(_referenceSongId: string, _otherReferenceSongId: string): Promise<DemoReadResult<{ exists: boolean }>> {
    return { success: true, value: { exists: false } };
  }

  saveOwnPreference(_referenceSongId: string, _score: number): Promise<never> {
    return deny("catalog.preference.save");
  }

  setRepertoireMembership(
    _referenceSongId: string,
    _organistPersonId: string | undefined,
    _active: boolean,
  ): Promise<never> {
    return deny("catalog.repertoire.set");
  }

  addMelodyEdge(_referenceSongId: string, _otherReferenceSongId: string): Promise<never> {
    return deny("knowledge.melody.edge.add");
  }

  removeMelodyEdge(_referenceSongId: string, _otherReferenceSongId: string): Promise<never> {
    return deny("knowledge.melody.edge.remove");
  }
}

export const DEMO_D3_CATALOG_KNOWLEDGE = Object.freeze({
  melodyClasses: DEMO_D3_MELODY_CLASSES.map((item) => Object.freeze({ ...item, songIds: Object.freeze([...item.songIds]) })),
  repertoire: DEMO_D3_REPERTOIRE,
  preferenceScores: DEMO_D3_PREFERENCE_SCORE,
});

function deny(operation: string): Promise<never> {
  return runPersistentMutation("demo", operation, () => {
    throw new Error("Demo Catalog mutation callback must never execute.");
  });
}

function chooseRepresentative(songs: CatalogSong[], repertoire: Set<string>): CatalogSong | undefined {
  return [...songs].sort((left, right) =>
    [
      repertoire.has(left.songId) ? 0 : 1,
      languageRank(left.language),
      numberKey(left.number),
      left.songId,
    ].join(":").localeCompare([
      repertoire.has(right.songId) ? 0 : 1,
      languageRank(right.language),
      numberKey(right.number),
      right.songId,
    ].join(":")),
  )[0];
}

function isLanguageAllowed(language: ConcreteSongLanguage, serviceLanguage: CatalogCandidateQueryInput["serviceLanguage"]): boolean {
  return serviceLanguage === "mixed" || language === serviceLanguage;
}

function languageRank(language: ConcreteSongLanguage): number {
  return language === "czech" ? 0 : 1;
}

function numberKey(number: string): string {
  return number.padStart(12, "0");
}

function numericBase(number: string): number | undefined {
  const match = number.match(/^(\\d+)/);
  return match ? Number(match[1]) : undefined;
}

function stableIndex(value: string, size: number): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return size > 0 ? hash % size : 0;
}
