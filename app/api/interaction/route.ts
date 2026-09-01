import { NextResponse } from "next/server";
import type { Pool, PoolClient } from "pg";
import { getAppDbPool } from "../../../src/db/app-pool";
import { PgInteractionRepository } from "../../../src/application/db-interaction-repository";
import { InteractionService } from "../../../src/application/interaction-service";
import type { ActorIdentity } from "../../../src/application/interaction-contracts";
import { LocalActorError } from "../../../src/application/local-actor";
import { ProtectedActorError, resolveProtectedActor } from "../../../src/application/protected-actor";
import { PgReferenceRepertoireRepository, ReferenceRepertoireService } from "../../../src/application/reference-repertoire";
import { PgReferenceMelodyRepository, ReferenceMelodyService } from "../../../src/application/reference-melody";
import { PgReferenceAntiphonRecommendationRepository, ReferenceAntiphonRecommendationService } from "../../../src/application/reference-antiphon-recommendation";
import { ReferenceCandidateError, ReferenceCandidateService } from "../../../src/application/reference-candidate-service";
import { PostgresNonRepetitionPeriodService } from "../../../src/application/postgres-non-repetition-period";
import type { CatalogCandidateQueryInput, CandidateHydrationInput, CandidateQueryInput, CandidateUsage } from "../../../src/application/interaction-contracts";
import { appendAuditEvent, humanAuditActor } from "../../../src/application/audit-history";

const pgCatalog = (pool: Pick<Pool, "query">) => ({ listSongs: async () => {
  const { rows } = await pool.query("select song_id, language, number, title, active, sheet_music_url from catalog_songs order by language, number");
  return rows.map((row) => ({ songId: String(row.song_id), language: row.language as "czech" | "polish", number: String(row.number), title: String(row.title), active: Boolean(row.active), ...(row.sheet_music_url ? { sheetMusicUrl: String(row.sheet_music_url) } : {}) }));
} });

type InteractionPoolLease = { pool: Pool; release: () => Promise<void> };
type InteractionPoolLeaseFactory = (databaseUrl: string) => InteractionPoolLease;
const productionPoolLease: InteractionPoolLeaseFactory = (databaseUrl) => ({
  pool: getAppDbPool(databaseUrl),
  release: async () => undefined,
});
let acquirePoolLease = productionPoolLease;

/** Narrow acceptance seam. Production uses the warm process-level managed pool. */
export function useInteractionPoolForAcceptance(pool: Pool): () => void {
  const previous = acquirePoolLease;
  acquirePoolLease = () => ({ pool, release: async () => undefined });
  return () => { acquirePoolLease = previous; };
}

export async function POST(request: Request) {
  if (process.env.ORGANY_RUNTIME !== "db") return NextResponse.json({ error: { code: "invalidInput", message: "Interaction DB runtime is not enabled." } }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: { code: "internalError", message: "DATABASE_URL is required for interaction API." } }, { status: 500 });
  const body = await request.json().catch(() => undefined) as { action?: string; input?: unknown; actor?: unknown } | undefined;
  if (!body?.action) return NextResponse.json({ error: { code: "invalidInput", message: "Interaction action is required." } }, { status: 400 });
  const lease = acquirePoolLease(process.env.DATABASE_URL);
  const pool = lease.pool;
  const service = new InteractionService(new PgInteractionRepository(pool), pgCatalog(pool));
  const referenceRepertoire = new ReferenceRepertoireService(new PgReferenceRepertoireRepository(pool));
  const referenceMelody = new ReferenceMelodyService(new PgReferenceMelodyRepository(pool));
  const referenceAntiphonRecommendation = new ReferenceAntiphonRecommendationService(new PgReferenceAntiphonRecommendationRepository(pool));
  const referenceCandidates = new ReferenceCandidateService(pool);
  const nonRepetitionPeriod = new PostgresNonRepetitionPeriodService(pool);
  try {
    const actor = await resolveProtectedActor(request.headers, pool, body.actor);
    switch (body.action) {
      case "listLocalActors": return NextResponse.json({ success: true, value: [{ id: actor.userId, displayName: actor.displayName, ...(actor.personId ? { personId: actor.personId } : {}), active: true, roles: [actor.role] }] });
      case "resolveActor": return NextResponse.json({ success: true, value: actor });
      case "saveOwnPreference": { const input = asRecord(body.input); return NextResponse.json(await auditedInteractionMutation(pool, actor, "preference.local.save", "songPreference", String(input.songId), body.input, (client) => new InteractionService(new PgInteractionRepository(client), pgCatalog(client)).saveOwnPreference(actor, String(input.songId), Number(input.score)))); }
      case "getOwnReferencePreference":
      case "getReferenceOwnPreference": { const input = referencePreferenceInput(body.input, false); return respond(await service.getReferenceOwnPreference(actor, input.referenceSongId)); }
      case "saveOwnReferencePreference":
      case "saveReferenceOwnPreference": { const input = referencePreferenceInput(body.input, true); return respond(await auditedInteractionMutation(pool, actor, "preference.reference.save", "referencePreference", input.referenceSongId, body.input, (client) => new InteractionService(new PgInteractionRepository(client), pgCatalog(client)).saveReferenceOwnPreference(actor, input.referenceSongId, input.score!))); }
      case "getReferencePreferenceAggregate": { const input = referencePreferenceInput(body.input, false); return respond(await service.getReferencePreferenceAggregate(actor, input.referenceSongId)); }
      case "getReferenceRepertoireMembership": { const input = referenceRepertoireInput(body.input, false); validateRepertoireActor(body.actor); return respond(await referenceRepertoire.get(actor, input.referenceSongId, input.organistPersonId)); }
      case "setReferenceRepertoireMembership": { const input = referenceRepertoireInput(body.input, true); validateRepertoireActor(body.actor); return respond(await auditedInteractionMutation(pool, actor, "repertoire.reference.set", "referenceRepertoire", `${input.organistPersonId ?? actor.personId ?? actor.userId}:${input.referenceSongId}`, body.input, (client) => new ReferenceRepertoireService(new PgReferenceRepertoireRepository(client)).set(actor, input.referenceSongId, input.organistPersonId, input.active!))); }
      case "getReferenceMelodyClass": { const input = referenceMelodyInput(body.input, false); validateRepertoireActor(body.actor); return respond(await referenceMelody.get(actor, input.referenceSongId)); }
      case "mergeReferenceMelodyClasses": { const input = referenceMelodyInput(body.input, true); validateRepertoireActor(body.actor); return respond(await referenceMelody.merge(actor, input.referenceSongId, input.mergeWithReferenceSongId!)); }
      case "getReferenceMelodyEdge": { const input = referenceMelodyEdgeInput(body.input); validateRepertoireActor(body.actor); return respond(await referenceMelody.hasEdge(actor, input.referenceSongId, input.otherReferenceSongId)); }
      case "addReferenceMelodyEdge": { const input = referenceMelodyEdgeInput(body.input); validateRepertoireActor(body.actor); return respond(await referenceMelody.addEdge(actor, input.referenceSongId, input.otherReferenceSongId)); }
      case "removeReferenceMelodyEdge": { const input = referenceMelodyEdgeInput(body.input); validateRepertoireActor(body.actor); return respond(await referenceMelody.removeEdge(actor, input.referenceSongId, input.otherReferenceSongId)); }
      case "getReferenceAntiphonRecommendation": { const input = referenceAntiphonRecommendationInput(body.input, false); validateRepertoireActor(body.actor); return respond(await referenceAntiphonRecommendation.get(actor, input.antiphonId)); }
      case "setReferenceAntiphonRecommendation": { const input = referenceAntiphonRecommendationInput(body.input, true); validateRepertoireActor(body.actor); return respond(await referenceAntiphonRecommendation.set(actor, input.antiphonId, input.referenceSongId!)); }
      case "setRepertoire": { const input = asRecord(body.input); return NextResponse.json(await auditedInteractionMutation(pool, actor, "repertoire.local.set", "repertoire", `${String(input.organistPersonId)}:${String(input.songId)}`, body.input, (client) => new InteractionService(new PgInteractionRepository(client), pgCatalog(client)).setRepertoire(actor, String(input.organistPersonId), String(input.songId), Boolean(input.active)))); }
      case "getMelodyWindow": { validateMelodyWindowReadInput(body.input); return respond(await nonRepetitionPeriod.get(actor)); }
      case "setMelodyWindow": { const input = melodyWindowMutationInput(body.input); return respond(await nonRepetitionPeriod.set(actor, input.months)); }
      case "listKnowledge": return NextResponse.json(await service.listKnowledge());
      case "queryCandidates": return respond({ success: true, value: await referenceCandidates.queryCandidates(referenceCandidateQueryInput(body.input)) });
      case "queryCatalogCandidates": return respond({ success: true, value: await referenceCandidates.queryCatalogCandidates(referenceCatalogCandidateQueryInput(body.input)) });
      case "hydrateCandidates": return respond({ success: true, value: await referenceCandidates.hydrateCandidates(referenceCandidateHydrationInput(body.input)) });
      default: return NextResponse.json({ error: { code: "invalidInput", message: `Unsupported interaction action '${body.action}'.` } }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof ProtectedActorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "unauthenticated" ? 401 : error.code === "invalidInput" ? 400 : 403 });
    if (error instanceof LocalActorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "invalidInput" ? 400 : 403 });
    if (error instanceof ReferenceCandidateError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "invalidInput" ? 400 : error.code === "notFound" ? 404 : 500 });
    return NextResponse.json({ error: { code: "internalError", message: error instanceof Error ? error.message : "Interaction API request failed." } }, { status: 500 });
  } finally { await lease.release(); }
}
async function auditedInteractionMutation<T>(
  pool: Pool,
  actor: ActorIdentity,
  action: string,
  objectKind: string,
  objectRef: string,
  requestDelta: unknown,
  mutate: (client: PoolClient) => Promise<{ success: true; value: T } | { success: false; error: { code: string; message: string } }>,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await mutate(client);
    if (result.success) {
      await appendAuditEvent(client, {
        actor: humanAuditActor(actor),
        action,
        objectKind,
        objectRef,
        beforeState: null,
        afterState: { request: requestDelta, result: result.value },
      });
    }
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function referencePreferenceInput(value: unknown, includeScore: boolean): { referenceSongId: string; score?: number } {
  const input = asRecord(value); const allowed = includeScore ? ["referenceSongId", "score"] : ["referenceSongId"];
  if (Object.keys(input).some((key) => !allowed.includes(key)) || typeof input.referenceSongId !== "string" || !/^(czech|polish):[1-9]\d*$/.test(input.referenceSongId)) throw new LocalActorError("invalidInput", "A valid referenceSongId is required.");
  if (includeScore && (typeof input.score !== "number" || !Number.isInteger(input.score))) throw new LocalActorError("invalidInput", "Preference score must be an integer.");
  return { referenceSongId: input.referenceSongId, ...(includeScore ? { score: input.score as number } : {}) };
}
function referenceRepertoireInput(value: unknown, includeActive: boolean): { referenceSongId: string; organistPersonId?: string; active?: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LocalActorError("invalidInput", "Repertoire input is required.");
  const input = value as Record<string, unknown>; const allowed = new Set(["referenceSongId", "organistPersonId", ...(includeActive ? ["active"] : [])]);
  if (Object.keys(input).some((key) => !allowed.has(key)) || typeof input.referenceSongId !== "string" || !/^(czech|polish):[1-9]\d*$/.test(input.referenceSongId)) throw new LocalActorError("invalidInput", "A valid referenceSongId is required.");
  if (input.organistPersonId !== undefined && (typeof input.organistPersonId !== "string" || !input.organistPersonId.trim())) throw new LocalActorError("invalidInput", "organistPersonId must be a non-empty string.");
  if (includeActive && typeof input.active !== "boolean") throw new LocalActorError("invalidInput", "active must be boolean.");
  return { referenceSongId: input.referenceSongId, ...(input.organistPersonId !== undefined ? { organistPersonId: input.organistPersonId as string } : {}), ...(includeActive ? { active: input.active as boolean } : {}) };
}
function validateRepertoireActor(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => key !== "userId" && key !== "role")) throw new LocalActorError("invalidInput", "Local actor context is malformed.");
}
function referenceMelodyInput(value: unknown, merge: boolean): { referenceSongId: string; mergeWithReferenceSongId?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LocalActorError("invalidInput", "Reference melody input is required.");
  const input = value as Record<string, unknown>; const allowed = merge ? ["referenceSongId", "mergeWithReferenceSongId"] : ["referenceSongId"];
  if (Object.keys(input).length !== allowed.length || Object.keys(input).some((key) => !allowed.includes(key))) throw new LocalActorError("invalidInput", "Reference melody input is malformed.");
  for (const key of allowed) if (typeof input[key] !== "string" || !/^(czech|polish):[1-9]\d*$/.test(input[key] as string)) throw new LocalActorError("invalidInput", `A valid ${key} is required.`);
  return { referenceSongId: input.referenceSongId as string, ...(merge ? { mergeWithReferenceSongId: input.mergeWithReferenceSongId as string } : {}) };
}
function referenceMelodyEdgeInput(value: unknown): { referenceSongId: string; otherReferenceSongId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LocalActorError("invalidInput", "Reference melody edge input is required.");
  const input = value as Record<string, unknown>;
  const allowed = ["referenceSongId", "otherReferenceSongId"];
  if (Object.keys(input).length !== allowed.length || Object.keys(input).some((key) => !allowed.includes(key))) throw new LocalActorError("invalidInput", "Reference melody edge input is malformed.");
  for (const key of allowed) if (typeof input[key] !== "string" || !/^(czech|polish):[1-9]\d*$/.test(input[key] as string)) throw new LocalActorError("invalidInput", `A valid ${key} is required.`);
  return { referenceSongId: input.referenceSongId as string, otherReferenceSongId: input.otherReferenceSongId as string };
}
function referenceAntiphonRecommendationInput(value: unknown, mutation: boolean): { antiphonId: string; referenceSongId?: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LocalActorError("invalidInput", "Reference antiphon recommendation input is required.");
  const input = value as Record<string, unknown>; const allowed = mutation ? ["antiphonId", "referenceSongId"] : ["antiphonId"];
  if (Object.keys(input).length !== allowed.length || Object.keys(input).some((key) => !allowed.includes(key)) || typeof input.antiphonId !== "string" || !/^(?:czech|polish):[1-9]\d*$/.test(input.antiphonId)) throw new LocalActorError("invalidInput", "Reference antiphon recommendation input is malformed.");
  if (mutation && input.referenceSongId !== null && (typeof input.referenceSongId !== "string" || !/^(czech|polish):[1-9]\d*$/.test(input.referenceSongId))) throw new LocalActorError("invalidInput", "referenceSongId must be a valid Reference song id or null.");
  return { antiphonId: input.antiphonId, ...(mutation ? { referenceSongId: input.referenceSongId as string | null } : {}) };
}
function validateMelodyWindowReadInput(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 0) throw new LocalActorError("invalidInput", "Melody non-repetition read input must be an empty object.");
}
function melodyWindowMutationInput(value: unknown): { months: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LocalActorError("invalidInput", "Melody non-repetition input is required.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !("months" in input) || typeof input.months !== "number" || !Number.isFinite(input.months) || !Number.isInteger(input.months) || input.months < 0 || input.months > 12) {
    throw new LocalActorError("invalidInput", "Melody Protection must be between 0 and 12 calendar months.");
  }
  return { months: input.months };
}
function respond<T>(result: { success: true; value: T } | { success: false; error: { code: string; message: string } }) { if (result.success) return NextResponse.json(result); const status = result.error.code === "invalidInput" ? 400 : result.error.code === "notFound" ? 404 : result.error.code === "conflict" ? 409 : 403; return NextResponse.json(result, { status }); }


const REFERENCE_ANTIPHON_ID = /^(?:czech|polish):[1-9]\d*$/;
const REFERENCE_TOPIC_ID = /^(?:czech|polish):[a-z0-9][a-z0-9:-]*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function referenceCatalogCandidateQueryInput(value: unknown): CatalogCandidateQueryInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LocalActorError("invalidInput", "Catalog candidate query input is required.");
  const input = value as Record<string, unknown>;
  const allowed = new Set(["serviceLanguage", "organistPersonId", "referenceAntiphonId", "referenceTopicId", "queryText", "availabilityMode"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new LocalActorError("invalidInput", "Catalog candidate query input contains unsupported fields.");
  if (input.serviceLanguage !== "czech" && input.serviceLanguage !== "polish" && input.serviceLanguage !== "mixed") throw new LocalActorError("invalidInput", "A valid serviceLanguage is required.");
  if (input.organistPersonId !== undefined && (typeof input.organistPersonId !== "string" || !input.organistPersonId.trim())) throw new LocalActorError("invalidInput", "organistPersonId must be a non-empty string when provided.");
  if (input.referenceAntiphonId !== undefined && (typeof input.referenceAntiphonId !== "string" || !REFERENCE_ANTIPHON_ID.test(input.referenceAntiphonId))) throw new LocalActorError("invalidInput", "referenceAntiphonId is invalid.");
  if (input.referenceTopicId !== undefined && (typeof input.referenceTopicId !== "string" || !REFERENCE_TOPIC_ID.test(input.referenceTopicId))) throw new LocalActorError("invalidInput", "referenceTopicId is invalid.");
  if (input.queryText !== undefined && typeof input.queryText !== "string") throw new LocalActorError("invalidInput", "queryText must be a string when provided.");
  if (input.availabilityMode !== "available" && input.availabilityMode !== "unavailable") throw new LocalActorError("invalidInput", "availabilityMode must be available or unavailable.");
  return {
    serviceLanguage: input.serviceLanguage,
    ...(input.organistPersonId ? { organistPersonId: input.organistPersonId } : {}),
    ...(input.referenceAntiphonId ? { referenceAntiphonId: input.referenceAntiphonId } : {}),
    ...(input.referenceTopicId ? { referenceTopicId: input.referenceTopicId } : {}),
    ...(input.queryText !== undefined ? { queryText: input.queryText } : {}),
    availabilityMode: input.availabilityMode,
  };
}

export function referenceCandidateQueryInput(value: unknown): CandidateQueryInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LocalActorError("invalidInput", "Candidate query input is required.");
  const input = value as Record<string, unknown>;
  const allowed = new Set(["serviceDate", "serviceLanguage", "organistPersonId", "melodyProtectionMonths", "referenceAntiphonId", "referenceTopicId", "antiphonKey", "liturgicalSeasonKey", "queryText", "preferenceThreshold", "currentPlanId", "candidateUsages", "historicalTruth"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new LocalActorError("invalidInput", "Candidate query input contains unsupported fields.");
  if (typeof input.serviceDate !== "string" || !isValidIsoDate(input.serviceDate)) throw new LocalActorError("invalidInput", "A valid serviceDate is required.");
  if (input.serviceLanguage !== "czech" && input.serviceLanguage !== "polish" && input.serviceLanguage !== "mixed") throw new LocalActorError("invalidInput", "A valid serviceLanguage is required.");
  validateOptionalNonEmptyString(input, "organistPersonId");
  if (input.melodyProtectionMonths !== undefined && (typeof input.melodyProtectionMonths !== "number" || !Number.isInteger(input.melodyProtectionMonths) || input.melodyProtectionMonths < 0 || input.melodyProtectionMonths > 12)) throw new LocalActorError("invalidInput", "Melody Protection must be between 0 and 12 calendar months.");
  validateOptionalString(input, "antiphonKey");
  validateOptionalString(input, "liturgicalSeasonKey");
  validateOptionalString(input, "queryText");
  validateOptionalNonEmptyString(input, "currentPlanId");
  if (input.referenceAntiphonId !== undefined && (typeof input.referenceAntiphonId !== "string" || !REFERENCE_ANTIPHON_ID.test(input.referenceAntiphonId))) throw new LocalActorError("invalidInput", "referenceAntiphonId must be an authoritative Czech or Polish antiphon id.");
  if (input.referenceTopicId !== undefined && (typeof input.referenceTopicId !== "string" || !REFERENCE_TOPIC_ID.test(input.referenceTopicId))) throw new LocalActorError("invalidInput", "referenceTopicId must be an authoritative Czech or Polish Topic id.");
  if (input.preferenceThreshold !== undefined && (typeof input.preferenceThreshold !== "number" || !Number.isFinite(input.preferenceThreshold))) throw new LocalActorError("invalidInput", "preferenceThreshold must be a finite number.");
  if (input.historicalTruth !== undefined && typeof input.historicalTruth !== "boolean") throw new LocalActorError("invalidInput", "historicalTruth must be boolean.");
  const candidateUsages = parseCandidateUsages(input.candidateUsages);
  return {
    serviceDate: input.serviceDate,
    serviceLanguage: input.serviceLanguage,
    ...(input.organistPersonId !== undefined ? { organistPersonId: input.organistPersonId as string } : {}),
    ...(input.melodyProtectionMonths !== undefined ? { melodyProtectionMonths: input.melodyProtectionMonths as number } : {}),
    ...(input.referenceAntiphonId !== undefined ? { referenceAntiphonId: input.referenceAntiphonId as string } : {}),
    ...(input.referenceTopicId !== undefined ? { referenceTopicId: input.referenceTopicId as string } : {}),
    ...(input.antiphonKey !== undefined ? { antiphonKey: input.antiphonKey as string } : {}),
    ...(input.liturgicalSeasonKey !== undefined ? { liturgicalSeasonKey: input.liturgicalSeasonKey as string } : {}),
    ...(input.queryText !== undefined ? { queryText: input.queryText as string } : {}),
    ...(input.preferenceThreshold !== undefined ? { preferenceThreshold: input.preferenceThreshold as number } : {}),
    ...(input.currentPlanId !== undefined ? { currentPlanId: input.currentPlanId as string } : {}),
    candidateUsages,
    ...(input.historicalTruth === true ? { historicalTruth: true } : {}),
  };
}

export function referenceCandidateHydrationInput(value: unknown): CandidateHydrationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LocalActorError("invalidInput", "Candidate hydration input is required.");
  const input = value as Record<string, unknown>;
  const allowed = new Set(["songs", "organistPersonId", "referenceAntiphonId", "referenceTopicId", "antiphonKey", "liturgicalSeasonKey"]);
  if (Object.keys(input).some((key) => !allowed.has(key)) || !Array.isArray(input.songs)) throw new LocalActorError("invalidInput", "Candidate hydration input is malformed.");
  validateOptionalNonEmptyString(input, "organistPersonId");
  validateOptionalString(input, "antiphonKey");
  validateOptionalString(input, "liturgicalSeasonKey");
  if (input.referenceAntiphonId !== undefined && (typeof input.referenceAntiphonId !== "string" || !REFERENCE_ANTIPHON_ID.test(input.referenceAntiphonId))) throw new LocalActorError("invalidInput", "referenceAntiphonId must be an authoritative Czech or Polish antiphon id.");
  if (input.referenceTopicId !== undefined && (typeof input.referenceTopicId !== "string" || !REFERENCE_TOPIC_ID.test(input.referenceTopicId))) throw new LocalActorError("invalidInput", "referenceTopicId must be an authoritative Czech or Polish Topic id.");
  const songs = input.songs.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new LocalActorError("invalidInput", `Candidate hydration song ${index + 1} is malformed.`);
    const song = value as Record<string, unknown>; const songKeys = new Set(["songId", "language", "number", "title"]);
    if (Object.keys(song).some((key) => !songKeys.has(key)) || (song.language !== "czech" && song.language !== "polish") || typeof song.number !== "string" || !song.number.trim()) throw new LocalActorError("invalidInput", `Candidate hydration song ${index + 1} is malformed.`);
    if (song.songId !== undefined && (typeof song.songId !== "string" || !song.songId.trim())) throw new LocalActorError("invalidInput", `Candidate hydration song ${index + 1} has an invalid songId.`);
    if (song.title !== undefined && typeof song.title !== "string") throw new LocalActorError("invalidInput", `Candidate hydration song ${index + 1} has an invalid title.`);
    return { ...(song.songId !== undefined ? { songId: song.songId as string } : {}), language: song.language as "czech" | "polish", number: song.number, ...(song.title !== undefined ? { title: song.title as string } : {}) };
  });
  return {
    songs,
    ...(input.organistPersonId !== undefined ? { organistPersonId: input.organistPersonId as string } : {}),
    ...(input.referenceAntiphonId !== undefined ? { referenceAntiphonId: input.referenceAntiphonId as string } : {}),
    ...(input.referenceTopicId !== undefined ? { referenceTopicId: input.referenceTopicId as string } : {}),
    ...(input.antiphonKey !== undefined ? { antiphonKey: input.antiphonKey as string } : {}),
    ...(input.liturgicalSeasonKey !== undefined ? { liturgicalSeasonKey: input.liturgicalSeasonKey as string } : {}),
  };
}

function parseCandidateUsages(value: unknown): CandidateUsage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new LocalActorError("invalidInput", "candidateUsages must be an array.");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new LocalActorError("invalidInput", `candidateUsages[${index}] is malformed.`);
    const usage = item as Record<string, unknown>; const allowed = new Set(["songId", "serviceDate", "source", "planId", "rowId", "rowLabel"]);
    if (Object.keys(usage).some((key) => !allowed.has(key)) || typeof usage.songId !== "string" || !usage.songId.trim() || typeof usage.serviceDate !== "string" || !isValidIsoDate(usage.serviceDate) || !["completed", "working", "final", "current"].includes(String(usage.source))) throw new LocalActorError("invalidInput", `candidateUsages[${index}] is malformed.`);
    if (usage.planId !== undefined && (typeof usage.planId !== "string" || !usage.planId.trim())) throw new LocalActorError("invalidInput", `candidateUsages[${index}].planId is invalid.`);
    if (usage.rowId !== undefined && (typeof usage.rowId !== "number" || !Number.isInteger(usage.rowId) || usage.rowId <= 0)) throw new LocalActorError("invalidInput", `candidateUsages[${index}].rowId is invalid.`);
    if (usage.rowLabel !== undefined && (typeof usage.rowLabel !== "string" || !usage.rowLabel.trim())) throw new LocalActorError("invalidInput", `candidateUsages[${index}].rowLabel is invalid.`);
    if (usage.source === "current" && (usage.rowId === undefined || usage.rowLabel === undefined)) throw new LocalActorError("invalidInput", `candidateUsages[${index}] current usage requires rowId and rowLabel.`);
    if (usage.source !== "current" && (usage.rowId !== undefined || usage.rowLabel !== undefined)) throw new LocalActorError("invalidInput", `candidateUsages[${index}] non-current usage cannot include row context.`);
    return { songId: usage.songId, serviceDate: usage.serviceDate, source: usage.source as CandidateUsage["source"], ...(usage.planId !== undefined ? { planId: usage.planId as string } : {}), ...(usage.rowId !== undefined ? { rowId: usage.rowId as number, rowLabel: (usage.rowLabel as string).trim() } : {}) };
  });
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateOptionalString(input: Record<string, unknown>, key: string): void {
  if (input[key] !== undefined && typeof input[key] !== "string") throw new LocalActorError("invalidInput", `${key} must be a string.`);
}
function validateOptionalNonEmptyString(input: Record<string, unknown>, key: string): void {
  if (input[key] !== undefined && (typeof input[key] !== "string" || !(input[key] as string).trim())) throw new LocalActorError("invalidInput", `${key} must be a non-empty string.`);
}
