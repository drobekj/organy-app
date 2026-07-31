import { NextResponse } from "next/server";
import { Pool } from "pg";
import { PgInteractionRepository } from "../../../src/application/db-interaction-repository";
import { InteractionService } from "../../../src/application/interaction-service";
import type { ActorIdentity } from "../../../src/application/interaction-contracts";
import { LocalActorError, parseLocalActorContext, PostgresLocalActorResolver } from "../../../src/application/local-actor";
import { PgReferenceRepertoireRepository, ReferenceRepertoireService } from "../../../src/application/reference-repertoire";
import { PgReferenceMelodyRepository, ReferenceMelodyService } from "../../../src/application/reference-melody";
import { PgReferenceAntiphonRecommendationRepository, ReferenceAntiphonRecommendationService } from "../../../src/application/reference-antiphon-recommendation";

const pgCatalog = (pool: Pool) => ({ listSongs: async () => {
  const { rows } = await pool.query("select song_id, language, number, title, active, sheet_music_url from catalog_songs order by language, number");
  return rows.map((row) => ({ songId: String(row.song_id), language: row.language as "czech" | "polish", number: String(row.number), title: String(row.title), active: Boolean(row.active), ...(row.sheet_music_url ? { sheetMusicUrl: String(row.sheet_music_url) } : {}) }));
} });

export async function POST(request: Request) {
  if (process.env.ORGANY_RUNTIME !== "db") return NextResponse.json({ error: { code: "invalidInput", message: "Interaction DB runtime is not enabled." } }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: { code: "internalError", message: "DATABASE_URL is required for interaction API." } }, { status: 500 });
  const body = await request.json().catch(() => undefined) as { action?: string; input?: unknown; actor?: unknown } | undefined;
  if (!body?.action) return NextResponse.json({ error: { code: "invalidInput", message: "Interaction action is required." } }, { status: 400 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const service = new InteractionService(new PgInteractionRepository(pool), pgCatalog(pool));
  const referenceRepertoire = new ReferenceRepertoireService(new PgReferenceRepertoireRepository(pool));
  const referenceMelody = new ReferenceMelodyService(new PgReferenceMelodyRepository(pool));
  const referenceRecommendations = new ReferenceAntiphonRecommendationService(new PgReferenceAntiphonRecommendationRepository(pool));
  try {
    const resolver = new PostgresLocalActorResolver(pool);
    switch (body.action) {
      case "listLocalActors": return NextResponse.json({ success: true, value: await resolver.listActiveUsers() });
      case "resolveActor": return NextResponse.json({ success: true, value: await resolver.resolve(parseLocalActorContext(body.actor)) });
      case "saveOwnPreference": { const input = asRecord(body.input); return NextResponse.json(await service.saveOwnPreference(await resolver.resolve(parseLocalActorContext(body.actor)), String(input.songId), Number(input.score))); }
      case "getOwnReferencePreference":
      case "getReferenceOwnPreference": { const input = referencePreferenceInput(body.input, false); return respond(await service.getReferenceOwnPreference(await resolver.resolve(parseLocalActorContext(body.actor)), input.referenceSongId)); }
      case "saveOwnReferencePreference":
      case "saveReferenceOwnPreference": { const input = referencePreferenceInput(body.input, true); return respond(await service.saveReferenceOwnPreference(await resolver.resolve(parseLocalActorContext(body.actor)), input.referenceSongId, input.score!)); }
      case "getReferencePreferenceAggregate": { const input = referencePreferenceInput(body.input, false); return respond(await service.getReferencePreferenceAggregate(await resolver.resolve(parseLocalActorContext(body.actor)), input.referenceSongId)); }
      case "getReferenceRepertoireMembership": { const input = referenceRepertoireInput(body.input, false); validateRepertoireActor(body.actor); return respond(await referenceRepertoire.get(await resolver.resolve(parseLocalActorContext(body.actor)), input.referenceSongId, input.organistPersonId)); }
      case "setReferenceRepertoireMembership": { const input = referenceRepertoireInput(body.input, true); validateRepertoireActor(body.actor); return respond(await referenceRepertoire.set(await resolver.resolve(parseLocalActorContext(body.actor)), input.referenceSongId, input.organistPersonId, input.active!)); }
      case "getReferenceMelodyClass": { const input = referenceMelodyInput(body.input, false); validateRepertoireActor(body.actor); return respond(await referenceMelody.get(await resolver.resolve(parseLocalActorContext(body.actor)), input.referenceSongId)); }
      case "mergeReferenceMelodyClasses": { const input = referenceMelodyInput(body.input, true); validateRepertoireActor(body.actor); return respond(await referenceMelody.merge(await resolver.resolve(parseLocalActorContext(body.actor)), input.referenceSongId, input.mergeWithReferenceSongId!)); }
      case "getReferenceAntiphonRecommendation": { const input = recommendationGetInput(body.input); validateRepertoireActor(body.actor); return respond(await referenceRecommendations.get(await resolver.resolve(parseLocalActorContext(body.actor)), input.antiphonId)); }
      case "setReferenceAntiphonRecommendation": { const input = recommendationSetInput(body.input); validateRepertoireActor(body.actor); return respond(await referenceRecommendations.set(await resolver.resolve(parseLocalActorContext(body.actor)), input.antiphonId, input.referenceSongId)); }
      case "setRepertoire": { const input = asRecord(body.input); return NextResponse.json(await service.setRepertoire(await resolver.resolve(parseLocalActorContext(body.actor)), String(input.organistPersonId), String(input.songId), Boolean(input.active))); }
      case "setMelodyWindow": { const input = asRecord(body.input); return NextResponse.json(await service.setMelodyWindow(await resolver.resolve(parseLocalActorContext(body.actor)), { months: Number(input.months) })); }
      case "listKnowledge": return NextResponse.json(await service.listKnowledge());
      case "queryCandidates": return NextResponse.json(await service.queryCandidates(asRecord(body.input) as never));
      case "hydrateCandidates": return NextResponse.json(await service.hydrateCandidates(asRecord(body.input) as never));
      default: return NextResponse.json({ error: { code: "invalidInput", message: `Unsupported interaction action '${body.action}'.` } }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof LocalActorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "invalidInput" ? 400 : 403 });
    return NextResponse.json({ error: { code: "internalError", message: error instanceof Error ? error.message : "Interaction API request failed." } }, { status: 500 });
  } finally { await pool.end(); }
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
function respond<T>(result: { success: true; value: T } | { success: false; error: { code: string; message: string } }) { if (result.success) return NextResponse.json(result); const status = result.error.code === "invalidInput" ? 400 : result.error.code === "notFound" ? 404 : 403; return NextResponse.json(result, { status }); }
function recommendationGetInput(value: unknown) { const input=asRecord(value); if(Object.keys(input).length!==1||!validAntiphonId(input.antiphonId)) throw new LocalActorError("invalidInput","A valid antiphonId is required."); return {antiphonId:input.antiphonId}; }
function recommendationSetInput(value: unknown) { const input=asRecord(value); if(Object.keys(input).length!==2||!validAntiphonId(input.antiphonId)||(input.referenceSongId!==null&&(typeof input.referenceSongId!=="string"||!/^(czech|polish):[1-9]\d*$/.test(input.referenceSongId)))) throw new LocalActorError("invalidInput","Valid antiphonId and referenceSongId are required."); return {antiphonId:input.antiphonId,referenceSongId:input.referenceSongId as string|null}; }

function validAntiphonId(value:unknown):value is string{return typeof value==="string"&&(/^(?:czech:(?:8\d\d|9(?:0\d|1[0-5]))|polish:[1-9]\d*)$/).test(value);}
