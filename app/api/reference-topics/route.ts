import { NextResponse } from "next/server";
import { PostgresReferenceThematicSectionProvider } from "../../../src/application/postgres-reference-thematic-section";
import { getAppDbPool } from "../../../src/db/app-pool";

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const language = (value: unknown): value is "czech" | "polish" => value === "czech" || value === "polish";

export async function POST(request: Request) {
  if (process.env.ORGANY_RUNTIME !== "db") return NextResponse.json({ error: "Reference Topic DB runtime is not enabled." }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 500 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 }); }
  if (!object(body) || !["listSections", "getSectionById", "resolveSection"].includes(String(body.action)) || !object(body.input)) {
    return NextResponse.json({ error: "Unsupported reference Topic request." }, { status: 400 });
  }
  const input = body.input;
  if (body.action === "listSections") {
    if (Object.keys(input).length !== 1 || !language(input.language)) return NextResponse.json({ error: "Valid Topic language is required." }, { status: 400 });
  } else if (body.action === "getSectionById") {
    if (Object.keys(input).length !== 1 || typeof input.id !== "string" || !/^(?:czech|polish):[a-z0-9][a-z0-9:-]*$/.test(input.id)) return NextResponse.json({ error: "Valid Topic ID is required." }, { status: 400 });
  } else {
    if (Object.keys(input).length !== 2 || !language(input.language) || !Number.isInteger(input.canonicalSongNumber) || Number(input.canonicalSongNumber) <= 0) return NextResponse.json({ error: "Valid Topic resolution input is required." }, { status: 400 });
  }
  const pool = getAppDbPool();
  try {
    const provider = new PostgresReferenceThematicSectionProvider(pool);
    if (body.action === "listSections") return NextResponse.json(await provider.listSections(input.language as "czech" | "polish"));
    if (body.action === "getSectionById") {
      const found = await provider.getSectionById(input.id as string);
      return found ? NextResponse.json(found) : NextResponse.json({ error: "Reference Topic not found." }, { status: 404 });
    }
    const found = await provider.resolveSection(input.language as "czech" | "polish", Number(input.canonicalSongNumber));
    return found ? NextResponse.json(found) : NextResponse.json({ error: "Reference Topic not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reference Topic API failed." }, { status: 500 });
  }
}
