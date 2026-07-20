import { NextResponse } from "next/server";
import { Pool } from "pg";
import { PgInteractionRepository } from "../../../src/application/db-interaction-repository";
import { InteractionService } from "../../../src/application/interaction-service";
import type { ActorIdentity } from "../../../src/application/interaction-contracts";

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;
const pgCatalog = { listSongs: async () => {
  if (!pool) return [];
  const { rows } = await pool.query("select song_id, language, number, title, active, sheet_music_url from catalog_songs order by language, number");
  return rows.map((row) => ({ songId: String(row.song_id), language: row.language as "czech" | "polish", number: String(row.number), title: String(row.title), active: Boolean(row.active), ...(row.sheet_music_url ? { sheetMusicUrl: String(row.sheet_music_url) } : {}) }));
} };

export async function POST(request: Request) {
  if (!pool) return NextResponse.json({ error: "DATABASE_URL is required for interaction API." }, { status: 500 });
  const body = await request.json().catch(() => undefined) as { action?: string; input?: unknown } | undefined;
  if (!body?.action) return NextResponse.json({ error: "Interaction action is required." }, { status: 400 });
  const service = new InteractionService(new PgInteractionRepository(pool), pgCatalog);
  try {
    switch (body.action) {
      case "resolveActor": return NextResponse.json(await service.resolveActor(asRecord(body.input).userId as string, asRecord(body.input).role as ActorIdentity["role"] | undefined));
      case "saveOwnPreference": { const input = asRecord(body.input); return NextResponse.json(await service.saveOwnPreference(input.actor as ActorIdentity, String(input.songId), Number(input.score))); }
      case "setRepertoire": { const input = asRecord(body.input); return NextResponse.json(await service.setRepertoire(input.actor as ActorIdentity, String(input.organistPersonId), String(input.songId), Boolean(input.active))); }
      case "setMelodyWindow": { const input = asRecord(body.input); return NextResponse.json(await service.setMelodyWindow(input.actor as ActorIdentity, { months: Number(input.months) })); }
      case "listKnowledge": return NextResponse.json(await service.listKnowledge());
      case "queryCandidates": return NextResponse.json(await service.queryCandidates(asRecord(body.input) as never));
      case "hydrateCandidates": return NextResponse.json(await service.hydrateCandidates(asRecord(body.input) as never));
      default: return NextResponse.json({ error: `Unsupported interaction action '${body.action}'.` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Interaction API request failed." }, { status: 500 });
  }
}
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
