import { NextResponse } from "next/server";
import { CatalogService, DrizzleCatalogRepository, type CatalogPerson } from "../../../src/application/catalog";
import type { PlanningRole, ServiceLanguage } from "../../../src/planning-lifecycle";
import * as schema from "../../../src/db/schema";
import { ProtectedActorError, resolveProtectedActor } from "../../../src/application/protected-actor";
import { auditEventValues, humanAuditActor } from "../../../src/application/audit-history";
import { getAppDbPool } from "../../../src/db/app-pool";

type CatalogAction = "getPerson" | "getSong" | "getSongs" | "getPlanningPeople" | "getAdminCatalogSnapshot" | "searchPeople" | "listPeople" | "savePerson" | "searchSongs" | "listSongs" | "setSongActive";
const roles: PlanningRole[] = ["priest", "organist", "admin", "congregationMember"];
const serviceLanguages: ServiceLanguage[] = ["czech", "polish", "mixed"];

export async function POST(request: Request) {
  if (process.env.ORGANY_RUNTIME !== "db") return invalidInput("Catalog DB runtime is not enabled.");
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: { code: "internalError", message: "DATABASE_URL is required." } }, { status: 500 });

  let body: { action?: CatalogAction; input?: unknown; actor?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: { code: "invalidInput", message: "Malformed JSON body." } }, { status: 400 }); }
  const action = body.action;
  if (!action || !["getPerson", "getSong", "getSongs", "getPlanningPeople", "getAdminCatalogSnapshot", "searchPeople", "listPeople", "savePerson", "searchSongs", "listSongs", "setSongActive"].includes(action)) return invalidInput("Unsupported catalog action.");
  const validationError = validateActionInput(action, body.input);
  if (validationError) return invalidInput(validationError);

  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = getAppDbPool();
  try {
    const actor = await resolveProtectedActor(request.headers, pool, body.actor);
    const db = drizzle(pool, { schema });
    let input = body.input as Record<string, unknown>;
    if (action === "savePerson" || action === "setSongActive") input = { ...input, role: actor.role };
    if (action === "savePerson" || action === "setSongActive") {
      const result = await db.transaction(async (tx) => {
        const repo = new DrizzleCatalogRepository(tx);
        const service = new CatalogService(repo);
        const before = action === "savePerson"
          ? (isRecord(input.person) && typeof input.person.id === "string" ? await repo.findPersonById(input.person.id) : undefined)
          : await repo.findSongById(String(input.songId));
        const mutation = await service[action](input as never);
        if (mutation.success) {
          await tx.insert(schema.auditEvents).values(auditEventValues({
            actor: humanAuditActor(actor),
            action: action === "savePerson" ? "catalog.person.save" : "catalog.song.setActive",
            objectKind: action === "savePerson" ? "person" : "song",
            objectRef: action === "savePerson" ? (mutation.value as { id: string }).id : (mutation.value as { songId: string }).songId,
            beforeState: before ?? null,
            afterState: mutation.value,
          }));
        }
        return mutation;
      });
      return NextResponse.json(result);
    }
    const service = new CatalogService(new DrizzleCatalogRepository(db));
    if (action === "getPlanningPeople") {
      const [priests, organists] = await Promise.all([
        service.searchPeople({ role: "priest", query: "" }),
        service.searchPeople({ role: "organist", query: "" }),
      ]);
      if (!priests.success) return NextResponse.json(priests);
      if (!organists.success) return NextResponse.json(organists);
      return NextResponse.json({ success: true, value: { priests: priests.value, organists: organists.value } });
    }
    if (action === "getAdminCatalogSnapshot") {
      if (actor.role !== "admin") return NextResponse.json({ success: false, error: { code: "permissionDenied", message: "Only admin can load the management catalog." } });
      const [people, songs] = await Promise.all([service.listPeople(), service.listSongs()]);
      if (!people.success) return NextResponse.json(people);
      if (!songs.success) return NextResponse.json(songs);
      return NextResponse.json({ success: true, value: { people: people.value, songs: songs.value } });
    }
    return NextResponse.json(await service[action](input as never));
  } catch (error) {
    if (error instanceof ProtectedActorError) return protectedActorFailure(error);
    return NextResponse.json({ error: { code: "internalError", message: error instanceof Error ? error.message : "Catalog API failed." } }, { status: 500 });
  }
}

function validateActionInput(action: CatalogAction, input: unknown): string | undefined {
  if (action === "listPeople" || action === "listSongs" || action === "getPlanningPeople" || action === "getAdminCatalogSnapshot") return undefined;
  if (!isRecord(input)) return "Input object is required.";
  if (action === "getPerson") return typeof input.id === "string" && input.id.trim() ? undefined : "Non-empty person ID is required.";
  if (action === "getSong") return typeof input.songId === "string" && input.songId.trim() ? undefined : "Non-empty song ID is required.";
  if (action === "getSongs") return Array.isArray(input.songIds) && input.songIds.length <= 100 && input.songIds.every((id) => typeof id === "string" && id.trim()) ? undefined : "songIds must be an array of at most 100 non-empty IDs.";
  if (action === "searchPeople") {
    if (input.role !== "priest" && input.role !== "organist") return "Valid person lookup role is required.";
    if (input.query !== undefined && typeof input.query !== "string") return "Lookup query must be a string when provided.";
    return undefined;
  }
  if (action === "searchSongs") {
    if (!serviceLanguages.includes(input.language as ServiceLanguage)) return "Valid service language is required.";
    if (input.query !== undefined && typeof input.query !== "string") return "Lookup query must be a string when provided.";
    return undefined;
  }
  if (action === "setSongActive") {
    if (typeof input.songId !== "string" || !input.songId.trim()) return "songId is required.";
    if (typeof input.active !== "boolean") return "active boolean is required.";
    return undefined;
  }
  if (action === "savePerson") {
    const person = input.person;
    if (!isRecord(person)) return "Malformed person payload.";
    if ("id" in person && person.id !== undefined && (typeof person.id !== "string" || !person.id.trim())) return "Person id must be a non-empty string when provided.";
    if (typeof person.displayName !== "string") return "Person displayName is required.";
    for (const key of ["active", "priest", "organist"] satisfies (keyof CatalogPerson)[]) if (typeof person[key] !== "boolean") return `Person ${key} boolean is required.`;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function invalidInput(message: string) { return NextResponse.json({ error: { code: "invalidInput", message } }, { status: 400 }); }
function protectedActorFailure(error: ProtectedActorError) {
  const status = error.code === "unauthenticated" ? 401 : error.code === "invalidInput" ? 400 : 403;
  return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
}
