import { NextResponse } from "next/server";
import { CatalogService, DrizzleCatalogRepository, type CatalogPerson } from "../../../src/application/catalog";
import type { PlanningRole, ServiceLanguage } from "../../../src/planning-lifecycle";
import * as schema from "../../../src/db/schema";
import { LocalActorError } from "../../../src/application/local-actor";
import { requestedRoleFromActorEnvelope, resolveAuthenticatedActor } from "../../../src/application/authenticated-actor";

type CatalogAction = "getPerson" | "getSong" | "searchPeople" | "listPeople" | "savePerson" | "searchSongs" | "listSongs" | "setSongActive";
const roles: PlanningRole[] = ["priest", "organist", "admin", "congregationMember"];
const serviceLanguages: ServiceLanguage[] = ["czech", "polish", "mixed"];

export async function POST(request: Request) {
  if (process.env.ORGANY_RUNTIME !== "db") return invalidInput("Catalog DB runtime is not enabled.");
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: { code: "internalError", message: "DATABASE_URL is required." } }, { status: 500 });

  let body: { action?: CatalogAction; input?: unknown; actor?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: { code: "invalidInput", message: "Malformed JSON body." } }, { status: 400 }); }
  if (!body.action || !["getPerson", "getSong", "searchPeople", "listPeople", "savePerson", "searchSongs", "listSongs", "setSongActive"].includes(body.action)) return invalidInput("Unsupported catalog action.");
  const validationError = validateActionInput(body.action, body.input);
  if (validationError) return invalidInput(validationError);

  const [{ Pool }, { drizzle }] = await Promise.all([import("pg"), import("drizzle-orm/node-postgres")]);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const service = new CatalogService(new DrizzleCatalogRepository(drizzle(pool, { schema })));
    let input = body.input as Record<string, unknown>;
    if (body.action === "savePerson" || body.action === "setSongActive") {
      const actor = await resolveAuthenticatedActor(request.headers, pool, requestedRoleFromActorEnvelope(body.actor));
      input = { ...input, role: actor.role };
    }
    return NextResponse.json(await service[body.action](input as never));
  } catch (error) {
    if (error instanceof LocalActorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "invalidInput" ? 400 : 403 });
    return NextResponse.json({ error: { code: "internalError", message: error instanceof Error ? error.message : "Catalog API failed." } }, { status: 500 });
  } finally { await pool.end(); }
}

function validateActionInput(action: CatalogAction, input: unknown): string | undefined {
  if (action === "listPeople" || action === "listSongs") return undefined;
  if (!isRecord(input)) return "Input object is required.";
  if (action === "getPerson") return typeof input.id === "string" && input.id.trim() ? undefined : "Non-empty person ID is required.";
  if (action === "getSong") return typeof input.songId === "string" && input.songId.trim() ? undefined : "Non-empty song ID is required.";
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
