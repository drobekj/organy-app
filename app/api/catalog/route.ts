import { NextResponse } from "next/server";
import { CatalogService, DrizzleCatalogRepository } from "../../../src/application/catalog";
import * as schema from "../../../src/db/schema";

type CatalogAction = "searchPeople" | "listPeople" | "savePerson" | "searchSongs" | "listSongs" | "setSongActive";
export async function POST(request: Request) {
  if (process.env.ORGANY_RUNTIME !== "db") return NextResponse.json({ error: "Catalog DB runtime is not enabled." }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 500 });
  const body = (await request.json()) as { action?: CatalogAction; input?: unknown };
  if (!body.action || !["searchPeople", "listPeople", "savePerson", "searchSongs", "listSongs", "setSongActive"].includes(body.action)) return NextResponse.json({ error: "Unsupported catalog action." }, { status: 400 });
  const [{ Pool }, { drizzle }] = await Promise.all([import("pg"), import("drizzle-orm/node-postgres")]);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const service = new CatalogService(new DrizzleCatalogRepository(drizzle(pool, { schema })));
    return NextResponse.json(await service[body.action](body.input as never));
  } finally { await pool.end(); }
}
