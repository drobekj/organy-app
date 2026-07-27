import { NextResponse } from "next/server";
import { Pool } from "pg";
import { PgInteractionRepository } from "../../../src/application/db-interaction-repository";
import { InteractionService } from "../../../src/application/interaction-service";
import type { ActorIdentity } from "../../../src/application/interaction-contracts";
import { LocalActorError, PostgresLocalActorResolver } from "../../../src/application/local-actor";

const pgCatalog = (pool: Pool) => ({ listSongs: async () => {
  const { rows } = await pool.query("select song_id, language, number, title, active, sheet_music_url from catalog_songs order by language, number");
  return rows.map((row) => ({ songId: String(row.song_id), language: row.language as "czech" | "polish", number: String(row.number), title: String(row.title), active: Boolean(row.active), ...(row.sheet_music_url ? { sheetMusicUrl: String(row.sheet_music_url) } : {}) }));
} });

export async function POST(request: Request) {
  if (process.env.ORGANY_RUNTIME !== "db") return NextResponse.json({ error: "Interaction DB runtime is not enabled." }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL is required for interaction API." }, { status: 500 });
  const body = await request.json().catch(() => undefined) as { action?: string; input?: unknown } | undefined;
  if (!body?.action) return NextResponse.json({ error: "Interaction action is required." }, { status: 400 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const service = new InteractionService(new PgInteractionRepository(pool), pgCatalog(pool));
  try {
    const resolver = new PostgresLocalActorResolver(pool);
    switch (body.action) {
      case "listLocalActors": return NextResponse.json({ success: true, value: await resolver.listActiveUsers() });
      case "resolveActor": return NextResponse.json({ success: true, value: await resolver.resolve(request) });
      case "saveOwnPreference": { const input = asRecord(body.input); return NextResponse.json(await service.saveOwnPreference(await resolver.resolve(request), String(input.songId), Number(input.score))); }
      case "setRepertoire": { const input = asRecord(body.input); return NextResponse.json(await service.setRepertoire(await resolver.resolve(request), String(input.organistPersonId), String(input.songId), Boolean(input.active))); }
      case "setMelodyWindow": { const input = asRecord(body.input); return NextResponse.json(await service.setMelodyWindow(await resolver.resolve(request), { months: Number(input.months) })); }
      case "listKnowledge": return NextResponse.json(await service.listKnowledge());
      case "queryCandidates": return NextResponse.json(await service.queryCandidates(asRecord(body.input) as never));
      case "hydrateCandidates": return NextResponse.json(await service.hydrateCandidates(asRecord(body.input) as never));
      default: return NextResponse.json({ error: `Unsupported interaction action '${body.action}'.` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Interaction API request failed." }, { status: error instanceof LocalActorError ? 403 : 500 });
  } finally { await pool.end(); }
}
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
