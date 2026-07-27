import { NextResponse } from "next/server";
import { PostgresReferenceCatalogProvider } from "../../../src/application/postgres-reference-catalog";
import type { ReferenceCatalogQuery } from "../../../src/application/reference-catalog-contract";

type ReferenceAction = "list" | "getById";

export async function POST(request: Request) {
  if (process.env.ORGANY_RUNTIME !== "db") return NextResponse.json({ error: "Reference catalog DB runtime is not enabled." }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL is required for reference catalog DB runtime." }, { status: 500 });

  let body: { action?: unknown; input?: unknown };
  try { body = await request.json() as { action?: unknown; input?: unknown }; }
  catch { return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 }); }
  if (body.action !== "list" && body.action !== "getById") return NextResponse.json({ error: "Unsupported reference catalog action." }, { status: 400 });
  const error = validateInput(body.action, body.input);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  try {
    const provider = new PostgresReferenceCatalogProvider(pool);
    if (body.action === "list") return NextResponse.json(await provider.list(body.input as ReferenceCatalogQuery));
    const record = await provider.getById((body.input as { id: string }).id);
    return record ? NextResponse.json(record) : NextResponse.json({ error: "Reference catalog record not found." }, { status: 404 });
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Reference catalog API failed." }, { status: 500 });
  } finally { await pool.end(); }
}

function validateInput(action: ReferenceAction, input: unknown): string | undefined {
  if (!isRecord(input)) return "Input object is required.";
  if (action === "getById") {
    if (Object.keys(input).some((key) => key !== "id")) return "Unsupported getById input field.";
    return typeof input.id === "string" && /^(czech|polish):[1-9]\d*$/.test(input.id) ? undefined : "Valid stable reference ID is required.";
  }
  const allowed = new Set(["language", "search", "page", "pageSize"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return "Unsupported list input field.";
  if (input.language !== undefined && !["all", "czech", "polish"].includes(input.language as string)) return "Valid reference language is required.";
  if (input.search !== undefined && (typeof input.search !== "string" || input.search.length > 200)) return "Search must be a string of at most 200 characters.";
  if (input.page !== undefined && (!Number.isInteger(input.page) || (input.page as number) < 0)) return "Page must be a non-negative integer.";
  if (input.pageSize !== undefined && (!Number.isInteger(input.pageSize) || (input.pageSize as number) < 1 || (input.pageSize as number) > 200)) return "Page size must be an integer from 1 to 200.";
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
