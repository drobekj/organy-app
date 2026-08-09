import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool, PoolClient } from "pg";

const PATH = "data/catalog/catalog-czech-antiphons.json";
const SHA256 = "9fe6f782ad62afa2d664fcb480a039a9b5dacf4bc193decb92a41d85023414e8";
const POLISH_PATH = "data/catalog/catalog-polish-antiphons.json";
const POLISH_SHA256 = "47bb3ff692feeea98e66d118ae115b0505ba7132c9bd0848a0aa8c42fb35bab0";
type Raw = { number: unknown; title: unknown; url: unknown };
type RawPolish = { number: unknown; title: unknown };
export type PersistedReferenceAntiphon = { id: string; language: "czech"; canonicalNumber: number; title: string; sourceUrl: string };
export type PersistedPolishReferenceAntiphon = { id: string; language: "polish"; canonicalNumber: number; title: string; sourceUrl: null };
type PersistedProductionReferenceAntiphon = PersistedReferenceAntiphon | PersistedPolishReferenceAntiphon;

export async function loadAndValidateReferenceAntiphons(path = PATH): Promise<PersistedReferenceAntiphon[]> {
  const bytes = await readFile(resolve(process.cwd(), path));
  const normalized = bytes.toString("utf8").replace(/\r\n/g, "\n");
  if (createHash("sha256").update(normalized).digest("hex") !== SHA256) throw new Error("Frozen antiphon catalog SHA-256 mismatch.");
  const input: unknown = JSON.parse(normalized);
  if (!Array.isArray(input)) throw new Error("Authoritative antiphon catalog must be an array.");
  let previous = 799;
  const records = (input as Raw[]).map((raw) => {
    if (JSON.stringify(Object.keys(raw)) !== JSON.stringify(["number", "title", "url"])) throw new Error("Antiphon record keys are invalid.");
    if (!Number.isInteger(raw.number) || Number(raw.number) < 800 || Number(raw.number) > 915 || Number(raw.number) <= previous) throw new Error("Antiphon numbers must be unique, ordered integers in range 800–915.");
    if (typeof raw.title !== "string" || !raw.title || raw.title !== raw.title.trim()) throw new Error("Antiphon title is invalid.");
    if (typeof raw.url !== "string") throw new Error("Antiphon URL is invalid.");
    let url: URL; try { url = new URL(raw.url); } catch { throw new Error("Antiphon URL is invalid."); }
    if (url.protocol !== "https:" || url.origin !== "https://www.evangelickykancional.cz" || raw.url !== url.href) throw new Error("Antiphon URL origin is invalid.");
    previous = Number(raw.number);
    return { id: `czech:${raw.number}`, language: "czech" as const, canonicalNumber: Number(raw.number), title: raw.title, sourceUrl: raw.url };
  });
  if (records.length !== 116 || records[0]?.canonicalNumber !== 800 || records.at(-1)?.canonicalNumber !== 915) throw new Error("Frozen antiphon catalog count/range mismatch.");
  return records;
}

export async function loadAndValidatePolishReferenceAntiphons(path = POLISH_PATH): Promise<PersistedPolishReferenceAntiphon[]> {
  const bytes = await readFile(resolve(process.cwd(), path));
  const normalized = bytes.toString("utf8").replace(/\r\n/g, "\n");
  if (createHash("sha256").update(normalized).digest("hex") !== POLISH_SHA256) throw new Error("Frozen Polish antiphon catalog SHA-256 mismatch.");
  const input: unknown = JSON.parse(normalized);
  if (!Array.isArray(input)) throw new Error("Authoritative Polish antiphon catalog must be an array.");
  let previous = 0;
  const records = (input as RawPolish[]).map((raw) => {
    if (JSON.stringify(Object.keys(raw)) !== JSON.stringify(["number", "title"])) throw new Error("Polish antiphon record keys are invalid.");
    if (!Number.isInteger(raw.number) || Number(raw.number) < 1 || Number(raw.number) > 116 || Number(raw.number) !== previous + 1) throw new Error("Polish antiphon numbers must be ordered contiguous integers in range 1–116.");
    if (typeof raw.title !== "string" || !raw.title || raw.title !== raw.title.trim()) throw new Error("Polish antiphon title is invalid.");
    previous = Number(raw.number);
    return { id: `polish:${raw.number}`, language: "polish" as const, canonicalNumber: Number(raw.number), title: raw.title, sourceUrl: null };
  });
  if (records.length !== 116 || records[0]?.canonicalNumber !== 1 || records.at(-1)?.canonicalNumber !== 116) throw new Error("Frozen Polish antiphon catalog count/range mismatch.");
  return records;
}

/** Synchronize only the frozen Czech source. Polish knowledge is deliberately preserved for Phase 31.9/31.18 regression compatibility. */
export async function synchronizeReferenceAntiphons(pool: Pool, options: { records?: PersistedReferenceAntiphon[]; failBeforeCommit?: boolean } = {}) {
  const records = options.records ?? await loadAndValidateReferenceAntiphons();
  if (records.length !== 116 || records.some((record, index) => record.id !== `czech:${record.canonicalNumber}` || record.language !== "czech" || record.canonicalNumber !== 800 + index || !record.title || record.title !== record.title.trim() || !validSourceUrl(record.sourceUrl))) throw new Error("Incoming reference antiphons are invalid.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE incoming_reference_antiphons (LIKE reference_antiphons INCLUDING DEFAULTS) ON COMMIT DROP");
    const values: unknown[] = []; const tuples = records.map((r) => { const n=values.length; values.push(r.id,r.language,r.canonicalNumber,r.title,r.sourceUrl); return `($${n+1},$${n+2},$${n+3},$${n+4},$${n+5})`; });
    if (tuples.length) await client.query(`INSERT INTO incoming_reference_antiphons(id,language,canonical_number,title,source_url) VALUES ${tuples.join(",")}`, values);
    await client.query("INSERT INTO reference_antiphons SELECT * FROM incoming_reference_antiphons ON CONFLICT(id) DO UPDATE SET language=excluded.language,canonical_number=excluded.canonical_number,title=excluded.title,source_url=excluded.source_url");
    await client.query("DELETE FROM reference_antiphons a WHERE a.language='czech' AND NOT EXISTS (SELECT 1 FROM incoming_reference_antiphons i WHERE i.id=a.id)");
    if (options.failBeforeCommit) throw new Error("Injected antiphon synchronization failure.");
    const counts=await databaseReferenceAntiphonCounts(client); if (counts.czech!==116 || counts.total!==116+counts.polish) throw new Error("Synchronized antiphon counts are invalid.");
    await client.query("COMMIT"); return counts;
  } catch(error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; } finally { client.release(); }
}

export async function synchronizeProductionReferenceAntiphons(pool: Pool, options: { czechRecords?: PersistedReferenceAntiphon[]; polishRecords?: PersistedPolishReferenceAntiphon[]; failBeforeCommit?: boolean } = {}) {
  const czechRecords = options.czechRecords ?? await loadAndValidateReferenceAntiphons();
  const polishRecords = options.polishRecords ?? await loadAndValidatePolishReferenceAntiphons();
  validateProductionRecords(czechRecords, polishRecords);
  const records: PersistedProductionReferenceAntiphon[] = [...czechRecords, ...polishRecords];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE incoming_production_reference_antiphons (LIKE reference_antiphons INCLUDING DEFAULTS) ON COMMIT DROP");
    const values: unknown[] = [];
    const tuples = records.map((record) => {
      const offset = values.length;
      values.push(record.id, record.language, record.canonicalNumber, record.title, record.sourceUrl);
      return `($${offset+1},$${offset+2},$${offset+3},$${offset+4},$${offset+5})`;
    });
    await client.query(`INSERT INTO incoming_production_reference_antiphons(id,language,canonical_number,title,source_url) VALUES ${tuples.join(",")}`, values);
    await client.query("INSERT INTO reference_antiphons SELECT * FROM incoming_production_reference_antiphons ON CONFLICT(id) DO UPDATE SET language=excluded.language,canonical_number=excluded.canonical_number,title=excluded.title,source_url=excluded.source_url");
    await client.query("DELETE FROM reference_antiphons a WHERE a.language IN ('czech','polish') AND NOT EXISTS (SELECT 1 FROM incoming_production_reference_antiphons i WHERE i.id=a.id)");
    if (options.failBeforeCommit) throw new Error("Injected production antiphon synchronization failure.");
    const counts = await databaseReferenceAntiphonCounts(client);
    if (counts.czech !== 116 || counts.polish !== 116 || counts.total !== 232) throw new Error("Synchronized production antiphon counts are invalid.");
    await client.query("COMMIT");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function validateProductionRecords(czechRecords: PersistedReferenceAntiphon[], polishRecords: PersistedPolishReferenceAntiphon[]) {
  if (czechRecords.length !== 116 || czechRecords.some((record, index) => record.id !== `czech:${800 + index}` || record.language !== "czech" || record.canonicalNumber !== 800 + index || !record.title || record.title !== record.title.trim() || !validSourceUrl(record.sourceUrl))) throw new Error("Incoming Czech production antiphons are invalid.");
  if (polishRecords.length !== 116 || polishRecords.some((record, index) => record.id !== `polish:${index + 1}` || record.language !== "polish" || record.canonicalNumber !== index + 1 || !record.title || record.title !== record.title.trim() || record.sourceUrl !== null)) throw new Error("Incoming Polish production antiphons are invalid.");
}

function validSourceUrl(value: string): boolean { try { const url=new URL(value); return url.protocol==="https:" && url.origin==="https://www.evangelickykancional.cz"; } catch { return false; } }
export async function databaseReferenceAntiphonCounts(client: Pick<PoolClient,"query">) { const r=await client.query("SELECT count(*)::int total,count(*) FILTER(WHERE language='czech')::int czech,count(*) FILTER(WHERE language='polish')::int polish FROM reference_antiphons"); return {czech:Number(r.rows[0].czech),polish:Number(r.rows[0].polish),total:Number(r.rows[0].total)}; }
