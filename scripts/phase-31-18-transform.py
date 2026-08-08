from pathlib import Path
import json, re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, content):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')

def replace_exact(path, old, new, count=1):
    text = read(path)
    actual = text.count(old)
    if actual != count:
        raise RuntimeError(f'{path}: expected {count} exact anchor(s), found {actual}: {old[:120]!r}')
    write(path, text.replace(old, new))

def replace_regex(path, pattern, replacement, count=1):
    text = read(path)
    next_text, actual = re.subn(pattern, replacement, text, count=count, flags=re.S)
    if actual != count:
        raise RuntimeError(f'{path}: expected {count} regex anchor(s), found {actual}: {pattern[:120]!r}')
    write(path, next_text)

# ---------------------------------------------------------------------------
# Authoritative antiphon contract/providers/synchronization
# ---------------------------------------------------------------------------
write('src/application/reference-antiphon-contract.ts', '''export type ReferenceAntiphonLanguage = "czech" | "polish";
export type ReferenceAntiphonLanguageFilter = ReferenceAntiphonLanguage | "all";

export type ReferenceAntiphonRecord = {
  id: string;
  language: ReferenceAntiphonLanguage;
  canonicalNumber: number;
  displayNumber: string;
  title: string;
  sourceUrl?: string;
};

export type ReferenceAntiphonQuery = {
  language?: ReferenceAntiphonLanguageFilter;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type ReferenceAntiphonPage = {
  records: ReferenceAntiphonRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: { all: number; czech: number; polish: number };
};

export interface ReferenceAntiphonProvider {
  list(input?: ReferenceAntiphonQuery): Promise<ReferenceAntiphonPage>;
  getById(id: string): Promise<ReferenceAntiphonRecord | undefined>;
}
''')

write('src/application/reference-antiphon.ts', '''import catalog from "../../data/catalog/catalog-czech-antiphons.json";
import type { ReferenceAntiphonPage, ReferenceAntiphonProvider, ReferenceAntiphonQuery, ReferenceAntiphonRecord } from "./reference-antiphon-contract";

const bundledCzechRecords: ReferenceAntiphonRecord[] = catalog.map((record) => ({
  id: `czech:${record.number}`,
  language: "czech",
  canonicalNumber: record.number,
  displayNumber: String(record.number),
  title: record.title,
  sourceUrl: record.url,
}));

const languageRank = (language: ReferenceAntiphonRecord["language"]) => language === "czech" ? 0 : 1;
const compareRecords = (left: ReferenceAntiphonRecord, right: ReferenceAntiphonRecord) =>
  languageRank(left.language) - languageRank(right.language)
  || left.canonicalNumber - right.canonicalNumber
  || left.id.localeCompare(right.id);

/**
 * Read-only in-memory provider. Production ships only the frozen Czech catalog;
 * explicit fixture records let bilingual behavior be proved without inventing Polish production data.
 */
export class MemoryReferenceAntiphonProvider implements ReferenceAntiphonProvider {
  constructor(private readonly sourceRecords: readonly ReferenceAntiphonRecord[] = bundledCzechRecords) {}

  async list(input: ReferenceAntiphonQuery = {}): Promise<ReferenceAntiphonPage> {
    const language = input.language ?? "all";
    const search = input.search?.trim() ?? "";
    const lowerSearch = search.toLocaleLowerCase();
    const numericSearch = /^\\d+$/.test(search);
    const filtered = this.sourceRecords
      .filter((record) => language === "all" || record.language === language)
      .filter((record) => !search || (numericSearch
        ? record.displayNumber.startsWith(search)
        : record.title.toLocaleLowerCase().includes(lowerSearch)))
      .map((record) => ({ ...record }))
      .sort(compareRecords);
    const pageSize = input.pageSize ?? 50;
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(input.page ?? 0, pageCount - 1);
    const start = page * pageSize;
    const counts = {
      all: this.sourceRecords.length,
      czech: this.sourceRecords.filter((record) => record.language === "czech").length,
      polish: this.sourceRecords.filter((record) => record.language === "polish").length,
    };
    return { records: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize, pageCount, counts };
  }

  async getById(id: string): Promise<ReferenceAntiphonRecord | undefined> {
    const found = this.sourceRecords.find((record) => record.id === id);
    return found ? { ...found } : undefined;
  }
}
''')

write('src/application/postgres-reference-antiphon.ts', '''import type { Pool } from "pg";
import type {
  ReferenceAntiphonPage,
  ReferenceAntiphonProvider,
  ReferenceAntiphonQuery,
  ReferenceAntiphonRecord,
} from "./reference-antiphon-contract";

type Row = {
  id: string;
  language: "czech" | "polish";
  canonical_number: number;
  title: string;
  source_url: string | null;
};

function mapRecord(row: Row): ReferenceAntiphonRecord {
  return {
    id: row.id,
    language: row.language,
    canonicalNumber: row.canonical_number,
    displayNumber: String(row.canonical_number),
    title: row.title,
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
  };
}

const ORDER = "case language when 'czech' then 0 else 1 end, canonical_number asc, id asc";

/** Read-only provider whose filtering, ordering, counts, and paging execute in PostgreSQL. */
export class PostgresReferenceAntiphonProvider implements ReferenceAntiphonProvider {
  constructor(private readonly pool: Pool) {}

  async list(input: ReferenceAntiphonQuery = {}): Promise<ReferenceAntiphonPage> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    if ((input.language ?? "all") !== "all") {
      values.push(input.language);
      conditions.push(`language = $${values.length}`);
    }
    const search = input.search?.trim() ?? "";
    if (search) {
      if (/^\\d+$/.test(search)) {
        values.push(`${search}%`);
        conditions.push(`canonical_number::text like $${values.length}`);
      } else {
        values.push(`%${search}%`);
        conditions.push(`title ilike $${values.length}`);
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = Number((await this.pool.query(`SELECT count(*)::int AS count FROM reference_antiphons ${where}`, values)).rows[0].count);
    const pageSize = input.pageSize ?? 50;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(input.page ?? 0, pageCount - 1);
    const pageValues = [...values, pageSize, page * pageSize];
    const rows = (await this.pool.query(
      `SELECT id, language, canonical_number, title, source_url FROM reference_antiphons ${where} ORDER BY ${ORDER} LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    )).rows as Row[];
    return { records: rows.map(mapRecord), total, page, pageSize, pageCount, counts: await this.counts() };
  }

  async getById(id: string): Promise<ReferenceAntiphonRecord | undefined> {
    const row = (await this.pool.query(
      "SELECT id, language, canonical_number, title, source_url FROM reference_antiphons WHERE id = $1",
      [id],
    )).rows[0] as Row | undefined;
    return row ? mapRecord(row) : undefined;
  }

  private async counts(): Promise<ReferenceAntiphonPage["counts"]> {
    const row = (await this.pool.query(`SELECT
      count(*)::int AS all,
      count(*) FILTER (WHERE language = 'czech')::int AS czech,
      count(*) FILTER (WHERE language = 'polish')::int AS polish
      FROM reference_antiphons`)).rows[0];
    return { all: Number(row.all), czech: Number(row.czech), polish: Number(row.polish) };
  }
}
''')

write('src/application/reference-antiphon-sync.ts', '''import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool, PoolClient } from "pg";

const PATH = "data/catalog/catalog-czech-antiphons.json";
const SHA256 = "9fe6f782ad62afa2d664fcb480a039a9b5dacf4bc193decb92a41d85023414e8";
type Raw = { number: unknown; title: unknown; url: unknown };
export type PersistedReferenceAntiphon = { id: string; language: "czech"; canonicalNumber: number; title: string; sourceUrl: string };

export async function loadAndValidateReferenceAntiphons(path = PATH): Promise<PersistedReferenceAntiphon[]> {
  const bytes = await readFile(resolve(process.cwd(), path));
  const normalized = bytes.toString("utf8").replace(/\\r\\n/g, "\\n");
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

/** Synchronize only the frozen Czech source. Future Polish knowledge is a separate data boundary and is preserved. */
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
function validSourceUrl(value: string): boolean { try { const url=new URL(value); return url.protocol==="https:" && url.origin==="https://www.evangelickykancional.cz"; } catch { return false; } }
export async function databaseReferenceAntiphonCounts(client: Pick<PoolClient,"query">) { const r=await client.query("SELECT count(*)::int total,count(*) FILTER(WHERE language='czech')::int czech,count(*) FILTER(WHERE language='polish')::int polish FROM reference_antiphons"); return {czech:Number(r.rows[0].czech),polish:Number(r.rows[0].polish),total:Number(r.rows[0].total)}; }
''')

# ---------------------------------------------------------------------------
# Schema / migration / snapshot model
# ---------------------------------------------------------------------------
replace_exact('src/db/schema/index.ts', '  sourceUrl: text("source_url").notNull(),\n}, (table) => ({\n  languageCanonicalNumber: uniqueIndex("reference_antiphons_language_canonical_number_idx").on(table.language, table.canonicalNumber),\n  positiveNumber: check("reference_antiphons_number_positive", sql`${table.canonicalNumber} > 0`),\n  idMatchesNumber: check("reference_antiphons_id_matches_number", sql`${table.id} = ${table.language}::text || \'\:\' || ${table.canonicalNumber}::text`),\n  nonEmptyId: check("reference_antiphons_id_non_empty", sql`btrim(${table.id}) <> \'\'`),\n  nonEmptyTitle: check("reference_antiphons_title_non_empty", sql`btrim(${table.title}) <> \'\'`),\n  validSourceUrl: check("reference_antiphons_source_url_valid", sql`${table.sourceUrl} ~ \'^https://www\\\\.evangelickykancional\\\\.cz(?:/|$)\'`),\n}));', '  sourceUrl: text("source_url"),\n}, (table) => ({\n  languageCanonicalNumber: uniqueIndex("reference_antiphons_language_canonical_number_idx").on(table.language, table.canonicalNumber),\n  positiveNumber: check("reference_antiphons_number_positive", sql`${table.canonicalNumber} > 0`),\n  idMatchesNumber: check("reference_antiphons_id_matches_number", sql`${table.id} = ${table.language}::text || \'\:\' || ${table.canonicalNumber}::text`),\n  nonEmptyId: check("reference_antiphons_id_non_empty", sql`btrim(${table.id}) <> \'\'`),\n  nonEmptyTitle: check("reference_antiphons_title_non_empty", sql`btrim(${table.title}) <> \'\'`),\n  validSourceUrl: check("reference_antiphons_source_url_valid", sql`(\n    ${table.language} = \'czech\' and ${table.sourceUrl} is not null and ${table.sourceUrl} ~ \'^https://www\\\\.evangelickykancional\\\\.cz(?:/|$)\'\n  ) or (\n    ${table.language} = \'polish\' and (${table.sourceUrl} is null or ${table.sourceUrl} ~ \'^https://\')\n  )`),\n}));')

replace_regex('src/db/schema/index.ts', r'''    referenceAntiphonSnapshotComplete: check\(.*?    referenceAntiphonSourceUrlValid: check\(\n      "service_contexts_reference_antiphon_source_url_valid",\n      sql`.*?`,\n    \),''', '''    referenceAntiphonSnapshotComplete: check(
      "service_contexts_reference_antiphon_snapshot_complete",
      sql`(
        ${table.referenceAntiphonId} is null and
        ${table.referenceAntiphonDisplayNumber} is null and
        ${table.referenceAntiphonTitle} is null and
        ${table.referenceAntiphonSourceUrl} is null
      ) or (
        ${table.referenceAntiphonId} is not null and
        ${table.referenceAntiphonDisplayNumber} is not null and
        ${table.referenceAntiphonTitle} is not null
      )`,
    ),
    referenceAntiphonIdentity: check(
      "service_contexts_reference_antiphon_identity",
      sql`${table.referenceAntiphonId} is null or ${table.referenceAntiphonId} ~ '^(czech|polish):[1-9][0-9]*$'`,
    ),
    referenceAntiphonSnapshotNonEmpty: check(
      "service_contexts_reference_antiphon_snapshot_non_empty",
      sql`${table.referenceAntiphonId} is null or (
        btrim(${table.referenceAntiphonDisplayNumber}) <> '' and
        btrim(${table.referenceAntiphonTitle}) <> ''
      )`,
    ),
    referenceAntiphonSourceUrlValid: check(
      "service_contexts_reference_antiphon_source_url_valid",
      sql`${table.referenceAntiphonSourceUrl} is null or ${table.referenceAntiphonSourceUrl} ~ '^https://'`,
    ),''')

write('drizzle/0016_phase_31_18_bilingual_antiphons.sql', '''ALTER TABLE "reference_antiphons" ALTER COLUMN "source_url" DROP NOT NULL;
ALTER TABLE "reference_antiphons" DROP CONSTRAINT IF EXISTS "reference_antiphons_source_url_valid";
ALTER TABLE "reference_antiphons" ADD CONSTRAINT "reference_antiphons_source_url_valid" CHECK (
  ("language" = 'czech' AND "source_url" IS NOT NULL AND "source_url" ~ '^https://www\\.evangelickykancional\\.cz(?:/|$)') OR
  ("language" = 'polish' AND ("source_url" IS NULL OR "source_url" ~ '^https://'))
);

ALTER TABLE "service_contexts" DROP CONSTRAINT IF EXISTS "service_contexts_reference_antiphon_snapshot_complete";
ALTER TABLE "service_contexts" DROP CONSTRAINT IF EXISTS "service_contexts_reference_antiphon_identity";
ALTER TABLE "service_contexts" DROP CONSTRAINT IF EXISTS "service_contexts_reference_antiphon_snapshot_non_empty";
ALTER TABLE "service_contexts" DROP CONSTRAINT IF EXISTS "service_contexts_reference_antiphon_source_url_valid";

ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_snapshot_complete" CHECK (
  ("reference_antiphon_id" IS NULL AND "reference_antiphon_display_number" IS NULL AND "reference_antiphon_title" IS NULL AND "reference_antiphon_source_url" IS NULL) OR
  ("reference_antiphon_id" IS NOT NULL AND "reference_antiphon_display_number" IS NOT NULL AND "reference_antiphon_title" IS NOT NULL)
);
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_identity" CHECK (
  "reference_antiphon_id" IS NULL OR "reference_antiphon_id" ~ '^(czech|polish):[1-9][0-9]*$'
);
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_snapshot_non_empty" CHECK (
  "reference_antiphon_id" IS NULL OR (btrim("reference_antiphon_display_number") <> '' AND btrim("reference_antiphon_title") <> '')
);
ALTER TABLE "service_contexts" ADD CONSTRAINT "service_contexts_reference_antiphon_source_url_valid" CHECK (
  "reference_antiphon_source_url" IS NULL OR "reference_antiphon_source_url" ~ '^https://'
);
''')

journal_path = ROOT / 'drizzle/meta/_journal.json'
journal = json.loads(journal_path.read_text(encoding='utf-8'))
if not any(entry.get('tag') == '0016_phase_31_18_bilingual_antiphons' for entry in journal['entries']):
    journal['entries'].append({"idx": 16, "version": "7", "when": 1786200000000, "tag": "0016_phase_31_18_bilingual_antiphons", "breakpoints": True})
journal_path.write_text(json.dumps(journal, indent=2) + '\n', encoding='utf-8')

replace_exact('src/planning-lifecycle/model.ts', '''export type ServiceAntiphonReference = {
  id: string;
  displayNumber: string;
  title: string;
  sourceUrl: string;
};''', '''export type ServiceAntiphonReference = {
  id: string;
  displayNumber: string;
  title: string;
  sourceUrl?: string;
};''')
replace_exact('src/planning-lifecycle/model.ts', '  /** Optional authoritative Czech antiphon snapshot selected for this concrete service. */', '  /** Optional authoritative Czech/Polish antiphon snapshot selected for this concrete service. */')

write('src/planning-lifecycle/service-antiphon.ts', '''import type { ConcreteSongLanguage, ServiceAntiphonReference, ServiceLanguage } from "./model";

export function serviceAntiphonLanguageFromId(id: string): ConcreteSongLanguage | undefined {
  const match = /^(czech|polish):[1-9]\\d*$/.exec(id);
  return match?.[1] as ConcreteSongLanguage | undefined;
}

export function serviceAntiphonMatchesLanguage(reference: ServiceAntiphonReference, serviceLanguage: ServiceLanguage): boolean {
  const language = serviceAntiphonLanguageFromId(reference.id);
  return Boolean(language) && (serviceLanguage === "mixed" || language === serviceLanguage);
}
''')
replace_exact('src/planning-lifecycle/index.ts', 'export { isValidServiceTime, normalizeServiceTime } from "./service-time";', 'export { isValidServiceTime, normalizeServiceTime } from "./service-time";\nexport { serviceAntiphonLanguageFromId, serviceAntiphonMatchesLanguage } from "./service-antiphon";')

# ---------------------------------------------------------------------------
# Lifecycle authoritative validation + DB adapters
# ---------------------------------------------------------------------------
replace_exact('src/application/planning-lifecycle/service.ts', '  normalizeServiceTime,\n  validatePlanningSet,', '  normalizeServiceTime,\n  serviceAntiphonLanguageFromId,\n  serviceAntiphonMatchesLanguage,\n  validatePlanningSet,')
replace_regex('src/application/planning-lifecycle/service.ts', r'''  private async validateAndNormalizeReferenceAntiphon\(.*?\n  private async validateAndNormalizeCatalogReferences''', '''  private async validateAndNormalizeReferenceAntiphon(
    serviceContext: ServiceContext,
    existing?: PersistedPlanningSet | CompletedServiceRecord,
  ): Promise<PlanningServiceResult<ServiceContext>> {
    const candidate = (serviceContext as ServiceContext & { referenceAntiphon?: unknown }).referenceAntiphon;
    if (candidate === undefined) {
      return success({ ...serviceContext, referenceAntiphon: undefined });
    }

    if (!isServiceAntiphonReference(candidate)) {
      return failure({
        code: "invalidInput",
        message: "Authoritative antiphon selection is malformed.",
        issues: [{ path: "serviceContext.referenceAntiphon", message: "Select an antiphon from the authoritative catalog." }],
      });
    }

    if (!serviceAntiphonMatchesLanguage(candidate, serviceContext.language)) {
      return failure({
        code: "invalidInput",
        message: "Selected antiphon must match the service language.",
        issues: [{ path: "serviceContext.referenceAntiphon", message: "Selected antiphon must match the service language." }],
      });
    }

    const previous = existing?.serviceContext.referenceAntiphon;
    if (previous && sameServiceAntiphonReference(previous, candidate)) {
      return success({ ...serviceContext, referenceAntiphon: { ...previous } });
    }

    if (!isAcceptedReferenceAntiphonId(candidate.id)) {
      return failure({
        code: "invalidInput",
        message: "Authoritative antiphon identity is invalid.",
        issues: [{ path: "serviceContext.referenceAntiphon.id", message: "Antiphon id must be a positive Czech or Polish authoritative id." }],
      });
    }

    if (!this.referenceAntiphons) {
      return failure({ code: "invalidInput", message: "Authoritative antiphon selection is unavailable in this runtime." });
    }

    const authoritative = await this.referenceAntiphons.getById(candidate.id);
    const expectedLanguage = serviceAntiphonLanguageFromId(candidate.id);
    if (!authoritative || !expectedLanguage || authoritative.language !== expectedLanguage) {
      return failure({ code: "notFound", message: "Authoritative antiphon was not found." });
    }

    return success({ ...serviceContext, referenceAntiphon: serviceAntiphonSnapshot(authoritative) });
  }

  private async validateAndNormalizeCatalogReferences''')
replace_regex('src/application/planning-lifecycle/service.ts', r'''function isServiceAntiphonReference\(value: unknown\): value is ServiceAntiphonReference \{.*?\nfunction getRowsFromExisting''', '''function isServiceAntiphonReference(value: unknown): value is ServiceAntiphonReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.some((key) => !["displayNumber", "id", "sourceUrl", "title"].includes(key))) return false;
  if (!keys.includes("id") || !keys.includes("displayNumber") || !keys.includes("title")) return false;
  if (typeof record.id !== "string" || typeof record.displayNumber !== "string" || typeof record.title !== "string") return false;
  if (record.sourceUrl !== undefined && (typeof record.sourceUrl !== "string" || !record.sourceUrl.trim())) return false;
  return record.id.trim() === record.id && record.displayNumber.trim().length > 0 && record.title.trim().length > 0;
}

function isAcceptedReferenceAntiphonId(id: string): boolean {
  return /^(czech|polish):[1-9]\\d*$/.test(id);
}

function sameServiceAntiphonReference(left: ServiceAntiphonReference, right: ServiceAntiphonReference): boolean {
  return left.id === right.id && left.displayNumber === right.displayNumber &&
    left.title === right.title && (left.sourceUrl ?? "") === (right.sourceUrl ?? "");
}

function serviceAntiphonSnapshot(record: ReferenceAntiphonRecord): ServiceAntiphonReference {
  return { id: record.id, displayNumber: record.displayNumber, title: record.title, ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}) };
}

function getRowsFromExisting''')

replace_exact('src/application/planning-lifecycle/drizzle-repository-adapters.ts', '''    ...(context.referenceAntiphonId && context.referenceAntiphonDisplayNumber && context.referenceAntiphonTitle && context.referenceAntiphonSourceUrl
      ? { referenceAntiphon: {
          id: context.referenceAntiphonId,
          displayNumber: context.referenceAntiphonDisplayNumber,
          title: context.referenceAntiphonTitle,
          sourceUrl: context.referenceAntiphonSourceUrl,
        } }
      : {}),''', '''    ...(context.referenceAntiphonId && context.referenceAntiphonDisplayNumber && context.referenceAntiphonTitle
      ? { referenceAntiphon: {
          id: context.referenceAntiphonId,
          displayNumber: context.referenceAntiphonDisplayNumber,
          title: context.referenceAntiphonTitle,
          ...(context.referenceAntiphonSourceUrl ? { sourceUrl: context.referenceAntiphonSourceUrl } : {}),
        } }
      : {}),''')

# ---------------------------------------------------------------------------
# Recommendation language boundary + API IDs
# ---------------------------------------------------------------------------
write('src/application/reference-antiphon-recommendation.ts', '''import type { Pool, PoolClient } from "pg";
import type { ActorIdentity } from "./interaction-contracts";
import type { InteractionResult } from "./interaction-service";
import { displayReferenceNumber } from "./reference-catalog-contract";

export type RecommendedReferenceSong = {
  referenceSongId: string;
  language: "czech" | "polish";
  canonicalNumber: number;
  displayNumber: string;
  title: string;
};
export type ReferenceAntiphonRecommendation = { antiphonId: string; recommendedSong: RecommendedReferenceSong | null };
type SetResult =
  | { kind: "ok"; value: ReferenceAntiphonRecommendation }
  | { kind: "antiphonNotFound" }
  | { kind: "songNotFound" }
  | { kind: "languageMismatch" };

export interface ReferenceAntiphonRecommendationRepository {
  get(antiphonId: string): Promise<ReferenceAntiphonRecommendation | undefined>;
  set(antiphonId: string, referenceSongId: string | null): Promise<SetResult>;
}

const joinedReadSql = `select a.id antiphon_id, s.id reference_song_id, s.language, s.canonical_number, s.title
  from reference_antiphons a
  left join reference_antiphon_recommendations r on r.antiphon_id=a.id
  left join reference_catalog_songs s on s.id=r.reference_song_id
  where a.id=$1`;

export class PgReferenceAntiphonRecommendationRepository implements ReferenceAntiphonRecommendationRepository {
  constructor(private readonly pool: Pool) {}
  async get(antiphonId: string) { return joinedRead(this.pool, antiphonId); }
  async set(antiphonId: string, referenceSongId: string | null): Promise<SetResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const antiphon = (await client.query("select language from reference_antiphons where id=$1 for update", [antiphonId])).rows[0] as { language: "czech" | "polish" } | undefined;
      if (!antiphon) {
        await client.query("rollback");
        return { kind: "antiphonNotFound" };
      }
      let song: { language: "czech" | "polish" } | undefined;
      if (referenceSongId !== null) {
        song = (await client.query("select language from reference_catalog_songs where id=$1 for update", [referenceSongId])).rows[0] as { language: "czech" | "polish" } | undefined;
        if (!song) {
          await client.query("rollback");
          return { kind: "songNotFound" };
        }
        if (song.language !== antiphon.language) {
          await client.query("rollback");
          return { kind: "languageMismatch" };
        }
      }
      if (referenceSongId === null) {
        await client.query("delete from reference_antiphon_recommendations where antiphon_id=$1", [antiphonId]);
      } else {
        await client.query(`insert into reference_antiphon_recommendations(antiphon_id,reference_song_id,updated_at) values($1,$2,now())
          on conflict(antiphon_id) do update set reference_song_id=excluded.reference_song_id,updated_at=now()`, [antiphonId, referenceSongId]);
      }
      const value = await joinedRead(client, antiphonId);
      await client.query("commit");
      return { kind: "ok", value: value! };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}

async function joinedRead(db: Pick<Pool, "query"> | Pick<PoolClient, "query">, antiphonId: string): Promise<ReferenceAntiphonRecommendation | undefined> {
  const row = (await db.query(joinedReadSql, [antiphonId])).rows[0];
  if (!row) return undefined;
  return {
    antiphonId: String(row.antiphon_id),
    recommendedSong: row.reference_song_id ? {
      referenceSongId: String(row.reference_song_id),
      language: row.language as "czech" | "polish",
      canonicalNumber: Number(row.canonical_number),
      displayNumber: displayReferenceNumber(Number(row.canonical_number)),
      title: String(row.title),
    } : null,
  };
}

export class ReferenceAntiphonRecommendationService {
  constructor(private readonly repo: ReferenceAntiphonRecommendationRepository) {}
  async get(actor: ActorIdentity, antiphonId: string): Promise<InteractionResult<ReferenceAntiphonRecommendation>> {
    if (!actor.role) return fail("permissionDenied", "An assigned role is required.");
    const value = await this.repo.get(antiphonId);
    return value ? ok(value) : fail("notFound", "Reference antiphon was not found.");
  }
  async set(actor: ActorIdentity, antiphonId: string, referenceSongId: string | null): Promise<InteractionResult<ReferenceAntiphonRecommendation>> {
    if (actor.role !== "admin") return fail("permissionDenied", "Only admin may manage antiphon recommendations.");
    const result = await this.repo.set(antiphonId, referenceSongId);
    if (result.kind === "antiphonNotFound") return fail("notFound", "Reference antiphon was not found.");
    if (result.kind === "songNotFound") return fail("notFound", "Reference catalog record was not found.");
    if (result.kind === "languageMismatch") return fail("invalidInput", "Recommended song must match the antiphon language.");
    return ok(result.value);
  }
}
const ok = <T>(value: T): InteractionResult<T> => ({ success: true, value });
const fail = <T>(code: "permissionDenied" | "notFound" | "invalidInput", message: string): InteractionResult<T> => ({ success: false, error: { code, message } });
''')

replace_exact('app/api/interaction/route.ts', '!/^czech:(?:8\\d\\d|9(?:0\\d|1[0-5]))$/.test(input.antiphonId)', '!/^(?:czech|polish):[1-9]\\d*$/.test(input.antiphonId)')
replace_exact('app/api/interaction/route.ts', 'const REFERENCE_ANTIPHON_ID = /^czech:(?:8\\d\\d|9(?:0\\d|1[0-5]))$/;', 'const REFERENCE_ANTIPHON_ID = /^(?:czech|polish):[1-9]\\d*$/;')
replace_exact('app/api/interaction/route.ts', 'referenceAntiphonId must be an authoritative Czech antiphon id.', 'referenceAntiphonId must be an authoritative Czech or Polish antiphon id.')
replace_exact('app/api/reference-antiphons/route.ts', '!/^czech:(?:8\\d\\d|9(?:0\\d|1[0-5]))$/.test(input.id)', '!/^(?:czech|polish):[1-9]\\d*$/.test(input.id)')

# ---------------------------------------------------------------------------
# Compact lookup state + component
# ---------------------------------------------------------------------------
write('src/application/service-context-reference-antiphon-ui-state.ts', '''import type { ReferenceAntiphonRecord } from "./reference-antiphon-contract";
import type { ServiceLanguage } from "../planning-lifecycle";

export type ServiceContextAntiphonSearchIdentity = {
  runtimeMode: "memory" | "db";
  contextKey: string;
  editable: boolean;
  serviceLanguage: ServiceLanguage;
};

export type ServiceContextAntiphonSearchToken = { context: number; generation: number };
export type ServiceContextAntiphonSearchSnapshot = {
  identity: ServiceContextAntiphonSearchIdentity;
  context: number;
  generation: number;
  loading: boolean;
  error: string | null;
  records: ReferenceAntiphonRecord[];
};

export class ServiceContextReferenceAntiphonUiState {
  private state: ServiceContextAntiphonSearchSnapshot;
  constructor(identity: ServiceContextAntiphonSearchIdentity) {
    this.state = { identity: { ...identity }, context: 0, generation: 0, loading: false, error: null, records: [] };
  }
  snapshot(): ServiceContextAntiphonSearchSnapshot { return { ...this.state, identity: { ...this.state.identity }, records: [...this.state.records] }; }
  changeIdentity(identity: ServiceContextAntiphonSearchIdentity): boolean {
    if (identity.runtimeMode === this.state.identity.runtimeMode && identity.contextKey === this.state.identity.contextKey && identity.editable === this.state.identity.editable && identity.serviceLanguage === this.state.identity.serviceLanguage) return false;
    this.state = { identity: { ...identity }, context: this.state.context + 1, generation: this.state.generation + 1, loading: false, error: null, records: [] };
    return true;
  }
  begin(): ServiceContextAntiphonSearchToken { const generation = this.state.generation + 1; this.state = { ...this.state, generation, loading: true, error: null, records: [] }; return { context: this.state.context, generation }; }
  cancel(): void { this.state = { ...this.state, generation: this.state.generation + 1, loading: false, error: null, records: [] }; }
  isCurrent(token: ServiceContextAntiphonSearchToken): boolean { return token.context === this.state.context && token.generation === this.state.generation; }
  complete(token: ServiceContextAntiphonSearchToken, records: ReferenceAntiphonRecord[]): boolean { if (!this.isCurrent(token)) return false; this.state = { ...this.state, loading: false, error: null, records: [...records] }; return true; }
  fail(token: ServiceContextAntiphonSearchToken, message: string): boolean { if (!this.isCurrent(token)) return false; this.state = { ...this.state, loading: false, error: message, records: [] }; return true; }
}
''')

write('app/service-context-reference-antiphon-field.tsx', '''"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DbReferenceAntiphonClient, MemoryReferenceAntiphonClient } from "../src/application/reference-antiphon-client";
import type { ReferenceAntiphonProvider, ReferenceAntiphonRecord } from "../src/application/reference-antiphon-contract";
import { ServiceContextReferenceAntiphonUiState, type ServiceContextAntiphonSearchSnapshot } from "../src/application/service-context-reference-antiphon-ui-state";
import type { ServiceAntiphonReference, ServiceLanguage } from "../src/planning-lifecycle";

export type ServiceContextReferenceAntiphonFieldProps = {
  runtime: "memory" | "db";
  editable: boolean;
  contextKey: string;
  serviceLanguage: ServiceLanguage;
  selected?: ServiceAntiphonReference;
  invalid?: boolean;
  onChange: (value: ServiceAntiphonReference | undefined) => void;
  clientFactory?: (runtime: "memory" | "db") => Pick<ReferenceAntiphonProvider, "list">;
};

type ViewProps = {
  editable: boolean;
  selected?: ServiceAntiphonReference;
  invalid?: boolean;
  open: boolean;
  dirty: boolean;
  query: string;
  snapshot: ServiceContextAntiphonSearchSnapshot;
  activeIndex: number;
  onOpen: () => void;
  onQueryChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelect: (record: ReferenceAntiphonRecord) => void;
  onActiveIndexChange: (index: number) => void;
  onClear: () => void;
};

const label = (selected?: ServiceAntiphonReference) => selected ? `${selected.displayNumber} · ${selected.title}` : "";

export function ServiceContextReferenceAntiphonFieldView(props: ViewProps) {
  const displayValue = props.open && props.dirty ? props.query : label(props.selected);
  const confirmedInvalid = Boolean(props.invalid && !(props.open && props.dirty));
  return <>
    <div className={`service-antiphon-control${confirmedInvalid ? " service-antiphon-control-invalid" : ""}`}>
      <input
        aria-label="Antiphon"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={props.open}
        aria-controls={props.open ? "service-antiphon-listbox" : undefined}
        aria-activedescendant={props.open && props.snapshot.records[props.activeIndex] ? `service-antiphon-option-${props.snapshot.records[props.activeIndex].id.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined}
        aria-invalid={confirmedInvalid || undefined}
        readOnly={!props.editable}
        value={displayValue}
        placeholder="Select antiphon"
        onFocus={props.onOpen}
        onClick={props.onOpen}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={props.onKeyDown}
      />
      {props.selected?.sourceUrl && !(props.open && props.dirty) && <a className="service-antiphon-source" href={props.selected.sourceUrl} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>Source</a>}
      {props.selected && props.editable && <button className="service-antiphon-clear" type="button" aria-label="Clear antiphon" title="Clear antiphon" onPointerDown={(event) => event.preventDefault()} onClick={props.onClear}>×</button>}
    </div>
    {props.open && <div id="service-antiphon-listbox" className="service-antiphon-listbox" role="listbox" aria-label="Antiphon candidates">
      {props.snapshot.loading && <div className="service-antiphon-list-state" role="status">Loading…</div>}
      {props.snapshot.error && <div className="service-antiphon-list-state service-antiphon-list-error" role="alert">Antiphon lookup unavailable.</div>}
      {!props.snapshot.loading && !props.snapshot.error && props.snapshot.records.length === 0 && <div className="service-antiphon-list-state">No antiphons available.</div>}
      {props.snapshot.records.map((record, index) => <div
        id={`service-antiphon-option-${record.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
        key={record.id}
        className={`service-antiphon-option${index === props.activeIndex ? " service-antiphon-option-active" : ""}`}
        role="option"
        aria-selected={props.selected?.id === record.id}
        onMouseEnter={() => props.onActiveIndexChange(index)}
        onPointerDown={(event) => { event.preventDefault(); props.onSelect(record); }}
      >
        <strong>{record.displayNumber}</strong>
        <span>{record.title}</span>
        {record.sourceUrl && <a className="service-antiphon-source" href={record.sourceUrl} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>Source</a>}
      </div>)}
    </div>}
  </>;
}

const defaultClientFactory = (runtime: "memory" | "db"): Pick<ReferenceAntiphonProvider, "list"> => runtime === "db" ? new DbReferenceAntiphonClient() : new MemoryReferenceAntiphonClient();

async function listAll(client: Pick<ReferenceAntiphonProvider, "list">, serviceLanguage: ServiceLanguage, search: string): Promise<ReferenceAntiphonRecord[]> {
  const language = serviceLanguage === "mixed" ? "all" : serviceLanguage;
  const first = await client.list({ language, search, page: 0, pageSize: 200 });
  if (first.pageCount <= 1) return first.records;
  const rest = await Promise.all(Array.from({ length: first.pageCount - 1 }, (_, index) => client.list({ language, search, page: index + 1, pageSize: 200 })));
  return [first, ...rest].flatMap((page) => page.records);
}

export function ServiceContextReferenceAntiphonField({ runtime, editable, contextKey, serviceLanguage, selected, invalid, onChange, clientFactory = defaultClientFactory }: ServiceContextReferenceAntiphonFieldProps) {
  const identity = { runtimeMode: runtime, contextKey, editable, serviceLanguage } as const;
  const machineRef = useRef<ServiceContextReferenceAntiphonUiState | null>(null);
  if (!machineRef.current) machineRef.current = new ServiceContextReferenceAntiphonUiState(identity);
  const machine = machineRef.current;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [snapshot, setSnapshot] = useState(() => machine.snapshot());
  const client = useMemo(() => clientFactory(runtime), [runtime, clientFactory]);
  const sync = () => setSnapshot(machine.snapshot());

  const closeRestore = () => {
    machine.cancel();
    sync();
    setOpen(false);
    setDirty(false);
    setQuery("");
    setActiveIndex(0);
  };

  useEffect(() => {
    if (machine.changeIdentity(identity)) {
      setOpen(false); setDirty(false); setQuery(""); setActiveIndex(0);
    }
    sync();
  }, [runtime, contextKey, editable, serviceLanguage]);

  useEffect(() => {
    if (!open || !editable) { machine.cancel(); sync(); return; }
    const token = machine.begin();
    sync();
    void listAll(client, serviceLanguage, dirty ? query.trim() : "")
      .then((records) => { if (machine.complete(token, records)) sync(); })
      .catch((cause: unknown) => { if (machine.fail(token, cause instanceof Error ? cause.message : "Antiphon lookup failed.")) sync(); });
  }, [client, open, editable, serviceLanguage, dirty, query, contextKey]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && wrapperRef.current?.contains(target)) return;
      closeRestore();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!snapshot.records.length) { setActiveIndex(0); return; }
    if (!dirty && selected) {
      const selectedIndex = snapshot.records.findIndex((record) => record.id === selected.id);
      if (selectedIndex >= 0) { setActiveIndex(selectedIndex); return; }
    }
    setActiveIndex((index) => Math.min(index, snapshot.records.length - 1));
  }, [snapshot.records, selected?.id, dirty]);

  useEffect(() => {
    if (!open) return;
    const record = snapshot.records[activeIndex];
    if (!record) return;
    document.getElementById(`service-antiphon-option-${record.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, snapshot.records]);

  const openLookup = () => {
    if (!editable || open) return;
    setOpen(true); setDirty(false); setQuery("");
    queueMicrotask(() => inputRef.current?.select());
  };
  const select = (record: ReferenceAntiphonRecord) => {
    onChange({ id: record.id, displayNumber: record.displayNumber, title: record.title, ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}) });
    closeRestore();
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { if (open) { event.preventDefault(); closeRestore(); } return; }
    if (!open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); openLookup(); return; }
    if (!open) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => snapshot.records.length ? (index + 1) % snapshot.records.length : 0); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => snapshot.records.length ? (index - 1 + snapshot.records.length) % snapshot.records.length : 0); }
    else if (event.key === "Home") { event.preventDefault(); setActiveIndex(0); }
    else if (event.key === "End") { event.preventDefault(); setActiveIndex(Math.max(0, snapshot.records.length - 1)); }
    else if (event.key === "Enter") { const record = snapshot.records[activeIndex]; if (record) { event.preventDefault(); select(record); } }
  };

  return <div className="service-antiphon-lookup" ref={wrapperRef}>
    <div ref={inputRef as never} style={{ display: "contents" }} />
    <ServiceContextReferenceAntiphonFieldView
      editable={editable} selected={selected} invalid={invalid} open={open} dirty={dirty} query={query} snapshot={snapshot} activeIndex={activeIndex}
      onOpen={openLookup}
      onQueryChange={(value) => { if (!open) setOpen(true); setDirty(true); setQuery(value); setActiveIndex(0); }}
      onKeyDown={onKeyDown}
      onSelect={select}
      onActiveIndexChange={setActiveIndex}
      onClear={() => { onChange(undefined); closeRestore(); }}
    />
  </div>;
}
''')

# Fix ref attachment cleanly: View owns input, so expose autofocus selection with DOM query rather than invalid div ref.
replace_exact('app/service-context-reference-antiphon-field.tsx', '  const inputRef = useRef<HTMLInputElement | null>(null);\n', '')
replace_exact('app/service-context-reference-antiphon-field.tsx', '    queueMicrotask(() => inputRef.current?.select());', '    queueMicrotask(() => wrapperRef.current?.querySelector<HTMLInputElement>("input")?.select());')
replace_exact('app/service-context-reference-antiphon-field.tsx', '  return <div className="service-antiphon-lookup" ref={wrapperRef}>\n    <div ref={inputRef as never} style={{ display: "contents" }} />\n    <ServiceContextReferenceAntiphonFieldView', '  return <div className="service-antiphon-lookup" ref={wrapperRef}>\n    <ServiceContextReferenceAntiphonFieldView')

# ---------------------------------------------------------------------------
# Planning client integration
# ---------------------------------------------------------------------------
replace_exact('app/planning-lifecycle-client.tsx', 'import { canPerformPlanningAction, findMelodyCollisions, isValidServiceTime, melodyCollisionSummary, normalizeServiceTime, validatePlanningRow } from "../src/planning-lifecycle";', 'import { canPerformPlanningAction, findMelodyCollisions, isValidServiceTime, melodyCollisionSummary, normalizeServiceTime, serviceAntiphonMatchesLanguage, validatePlanningRow } from "../src/planning-lifecycle";')
replace_exact('app/planning-lifecycle-client.tsx', '  const isFinalSetOpen = persistedSet?.status === "final";', '  const hasAntiphonLanguageMismatch = Boolean(referenceAntiphon && !serviceAntiphonMatchesLanguage(referenceAntiphon, serviceLanguage));\n  const isFinalSetOpen = persistedSet?.status === "final";')
replace_exact('app/planning-lifecycle-client.tsx', '    ...(!organistId ? ["Organist must be selected from lookup."] : []),\n    ...(hasEmptyRowValidation', '    ...(!organistId ? ["Organist must be selected from lookup."] : []),\n    ...(hasAntiphonLanguageMismatch ? ["Selected antiphon must match the service language."] : []),\n    ...(hasEmptyRowValidation')
replace_exact('app/planning-lifecycle-client.tsx', '    if (hasInvalidLookupState) { setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving." }); setSaveState("errors"); return; }\n    if (hasCandidateAvailabilityBlock)', '    if (hasInvalidLookupState) { setServiceError({ code: "invalidInput", message: workspaceLeaveState.reason ?? "Select a candidate or cancel the active lookup before saving." }); setSaveState("errors"); return; }\n    if (hasAntiphonLanguageMismatch) { setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." }); setSaveState("errors"); return; }\n    if (hasCandidateAvailabilityBlock)', 1)
replace_exact('app/planning-lifecycle-client.tsx', '    if (hasMelodyCollisions) {', '    if (hasAntiphonLanguageMismatch) {\n      setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." });\n      setSaveState("errors");\n      return;\n    }\n    if (hasMelodyCollisions) {', 1)
replace_exact('app/planning-lifecycle-client.tsx', '    if (!completedRecord || selectedRole !== "admin") return;\n    if (hasCandidateAvailabilityBlock)', '    if (!completedRecord || selectedRole !== "admin") return;\n    if (hasAntiphonLanguageMismatch) { setServiceError({ code: "invalidInput", message: "Selected antiphon must match the service language." }); setSaveState("errors"); return; }\n    if (hasCandidateAvailabilityBlock)')
replace_exact('app/planning-lifecycle-client.tsx', '''            <ServiceContextReferenceAntiphonField
              runtime={runtimeMode}
              editable={!isEditorLocked}
              contextKey={serviceContextRecordKey}
              selected={referenceAntiphon}
              onChange={(value) => { lookupTracker.invalidatePrefix("song:"); guardedEditorUpdate(() => setReferenceAntiphon(value ? { ...value } : undefined)); }}
            />
            <label>
              Candidate antiphon key
              <input type="text" disabled={isEditorLocked} value={candidateAntiphonKey} onChange={(event) => guardedEditorUpdate(() => setCandidateAntiphonKey(event.target.value))} placeholder="Optional synthetic/demo antiphon key" />
              <span className="field-help">Legacy synthetic/demo candidate signal; it is not populated from the authoritative Antiphon selection.</span>
            </label>''', '''            <ServiceContextReferenceAntiphonField
              runtime={runtimeMode}
              editable={!isEditorLocked}
              contextKey={serviceContextRecordKey}
              serviceLanguage={serviceLanguage}
              selected={referenceAntiphon}
              invalid={hasAntiphonLanguageMismatch}
              onChange={(value) => { lookupTracker.invalidatePrefix("song:"); guardedEditorUpdate(() => setReferenceAntiphon(value ? { ...value } : undefined)); }}
            />''')
replace_exact('app/planning-lifecycle-client.tsx', 'disabled={!canSaveWorkingSet || !hasServiceContext || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock}', 'disabled={!canSaveWorkingSet || !hasServiceContext || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock || hasAntiphonLanguageMismatch}')
replace_exact('app/planning-lifecycle-client.tsx', 'disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock || hasMelodyCollisions}', 'disabled={!canFinalizeSet || !persistedSet || persistedSet.status !== "working" || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock || hasMelodyCollisions || hasAntiphonLanguageMismatch}')
replace_exact('app/planning-lifecycle-client.tsx', 'disabled={!hasServiceContext || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock}', 'disabled={!hasServiceContext || hasValidationErrors || hasInvalidLookupState || hasCandidateAvailabilityBlock || hasAntiphonLanguageMismatch}')

# ---------------------------------------------------------------------------
# Styling
# ---------------------------------------------------------------------------
css = read('app/globals.css')
css += '''

/* Phase 31.18: compact optional Service Context Antiphon lookup. */
.service-antiphon-lookup {
  align-self: end;
  min-width: 0;
  position: relative;
}

.service-antiphon-control {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.65rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  min-width: 0;
}

.service-antiphon-control:focus-within {
  outline: 2px solid #84adff;
  outline-offset: 1px;
}

.service-antiphon-control input {
  border: 0;
  min-width: 0;
  outline: 0;
}

.service-antiphon-control input::placeholder,
.service-antiphon-control-invalid input {
  color: var(--muted);
  opacity: 1;
}

.service-antiphon-source {
  color: #175cd3;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.45rem 0.55rem;
  white-space: nowrap;
}

.service-antiphon-clear {
  border: 0;
  border-radius: 0.35rem;
  color: var(--muted);
  line-height: 1;
  margin-right: 0.25rem;
  padding: 0.35rem 0.45rem;
}

.service-antiphon-listbox {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  box-shadow: 0 0.75rem 1.5rem rgb(31 41 51 / 12%);
  direction: rtl;
  left: 0;
  margin-top: 0.35rem;
  max-height: min(32rem, 70vh);
  overflow-y: auto;
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 60;
}

.service-antiphon-listbox > * {
  direction: ltr;
}

.service-antiphon-option {
  align-items: center;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  display: grid;
  gap: 0.5rem;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 2.5rem;
  padding: 0.35rem 0.45rem;
  scroll-margin-block: 0.35rem;
}

.service-antiphon-option:last-child {
  border-bottom: 0;
}

.service-antiphon-option-active {
  border-radius: 0.55rem;
  outline: 3px solid #84adff;
  outline-offset: -3px;
}

.service-antiphon-option[aria-selected="true"] {
  background: #eff6ff;
}

.service-antiphon-list-state {
  color: var(--muted);
  padding: 0.65rem 0.75rem;
}

.service-antiphon-list-error {
  color: var(--danger);
}
'''
write('app/globals.css', css)

# ---------------------------------------------------------------------------
# Superseded legacy gate expectations
# ---------------------------------------------------------------------------
replace_exact('scripts/verify-phase-31-9.ts', "assert.ok(columns.rows.every(r=>r.is_nullable==='NO'));", "assert.ok(columns.rows.filter(r=>r.column_name!=='source_url').every(r=>r.is_nullable==='NO'));assert.equal(columns.rows.find(r=>r.column_name==='source_url')?.is_nullable,'YES');")
replace_exact('scripts/verify-phase-31-9.ts', 'assert.equal((await invoke("getById",{id:"czech:999"})).status,400);', 'assert.equal((await invoke("getById",{id:"czech:999"})).status,404);')

replace_exact('scripts/verify-phase-31-10a.ts', '''  const replacement = await client.set("czech:858", "polish:1");
  assert.equal(replacement.success && replacement.value.recommendedSong?.referenceSongId, "polish:1");''', '''  const replacement = await client.set("czech:858", "polish:1");
  assert.deepEqual(replacement, { success: false, error: { code: "invalidInput", message: "Recommended song must match the antiphon language." } });
  assert.equal((await client.get("czech:858")).success, true);''')
replace_exact('scripts/verify-phase-31-10a.ts', 'const differentAntiphons = await Promise.all([repository.set("czech:860", "czech:1"), repository.set("czech:861", "polish:1")]);', 'const differentAntiphons = await Promise.all([repository.set("czech:860", "czech:1"), repository.set("czech:861", "czech:2")]);')
replace_exact('scripts/verify-phase-31-10a.ts', '''  for (const antiphonId of ["czech:799", "czech:916", "czech:999", "polish:800", "bad"]) {
    assert.equal((await invoke("getReferenceAntiphonRecommendation", { antiphonId })).status, 400);
  }''', '''  for (const antiphonId of ["czech:0", "polish:0", "bad"]) assert.equal((await invoke("getReferenceAntiphonRecommendation", { antiphonId })).status, 400);
  for (const antiphonId of ["czech:799", "czech:916", "czech:999", "polish:800"]) assert.equal((await invoke("getReferenceAntiphonRecommendation", { antiphonId })).status, 404);''')

replace_exact('scripts/verify-phase-31-11.ts', '''    forged("czech:799"),
    forged("czech:916"),
    forged("polish:800"),''', '''    forged("czech:0"),
    forged("polish:0"),''')

write('scripts/phase-31-11-tests.tsx', '''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceContextReferenceAntiphonFieldView } from "../app/service-context-reference-antiphon-field";
import { ServiceContextReferenceAntiphonUiState, type ServiceContextAntiphonSearchIdentity } from "../src/application/service-context-reference-antiphon-ui-state";
import type { ReferenceAntiphonRecord } from "../src/application/reference-antiphon-contract";
import type { ServiceAntiphonReference } from "../src/planning-lifecycle";

const identity: ServiceContextAntiphonSearchIdentity = { runtimeMode: "db", contextKey: "new:1", editable: true, serviceLanguage: "czech" };
const record = (number: number): ReferenceAntiphonRecord => ({ id: `czech:${number}`, language: "czech", canonicalNumber: number, displayNumber: String(number), title: `Antiphon ${number}`, sourceUrl: `https://www.evangelickykancional.cz/pisen/${number}/antiphon-${number}` });
const snapshot = (number: number): ServiceAntiphonReference => { const value=record(number); return { id:value.id,displayNumber:value.displayNumber,title:value.title,sourceUrl:value.sourceUrl }; };
const noops = { onOpen:()=>undefined,onQueryChange:(_:string)=>undefined,onKeyDown:()=>undefined,onSelect:(_:ReferenceAntiphonRecord)=>undefined,onActiveIndexChange:(_:number)=>undefined,onClear:()=>undefined };

function staleResponseCoverage() {
  const state = new ServiceContextReferenceAntiphonUiState(identity); const older=state.begin(),newer=state.begin(); assert.equal(state.complete(older,[record(800)]),false);assert.equal(state.complete(newer,[record(801)]),true);
  const language=state.begin();state.changeIdentity({...identity,serviceLanguage:"polish"});assert.equal(state.complete(language,[record(802)]),false);assert.deepEqual(state.snapshot().records,[]);
  const context=state.begin();state.changeIdentity({...identity,contextKey:"set:2"});assert.equal(state.complete(context,[record(803)]),false);
}
function renderCoverage() {
  const state=new ServiceContextReferenceAntiphonUiState(identity);
  const empty=renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView editable selected={undefined} open={false} dirty={false} query="" snapshot={state.snapshot()} activeIndex={0} {...noops}/>);assert.match(empty,/placeholder="Select antiphon"/);assert.doesNotMatch(empty,/Find antiphon|No antiphon selected|Remove antiphon|<h3>/);
  state.complete(state.begin(),[record(800)]);
  const open=renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView editable selected={undefined} open dirty={false} query="" snapshot={state.snapshot()} activeIndex={0} {...noops}/>);assert.match(open,/role="listbox"/);assert.match(open,/800/);assert.match(open,/Source/);
  const selected=renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView editable selected={snapshot(800)} open={false} dirty={false} query="" snapshot={state.snapshot()} activeIndex={0} {...noops}/>);assert.match(selected,/value="800 · Antiphon 800"/);assert.match(selected,/Clear antiphon/);
}
async function staticCoverage(){const [planning,model,migration]=await Promise.all([readFile("app/planning-lifecycle-client.tsx","utf8"),readFile("src/planning-lifecycle/model.ts","utf8"),readFile("drizzle/0016_phase_31_18_bilingual_antiphons.sql","utf8")]);assert.equal((planning.match(/<ServiceContextReferenceAntiphonField/g)??[]).length,1);assert.doesNotMatch(planning,/>Candidate antiphon key</);assert.match(model,/sourceUrl\?: string/);assert.match(migration,/\(czech\|polish\)/);}
async function main(){staleResponseCoverage();renderCoverage();await staticCoverage();console.log("Phase 31.11 behavioral and render integration tests: PASS");}
void main().catch((error)=>{console.error(error);process.exitCode=1;});
''')

# ---------------------------------------------------------------------------
# Phase 31.18 focused acceptance
# ---------------------------------------------------------------------------
write('scripts/phase-31-18-tests.tsx', '''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryReferenceAntiphonProvider } from "../src/application/reference-antiphon";
import type { ReferenceAntiphonRecord } from "../src/application/reference-antiphon-contract";
import { ServiceContextReferenceAntiphonFieldView } from "../app/service-context-reference-antiphon-field";
import { ServiceContextReferenceAntiphonUiState } from "../src/application/service-context-reference-antiphon-ui-state";
import { serviceAntiphonMatchesLanguage } from "../src/planning-lifecycle";

const fixtures: ReferenceAntiphonRecord[] = [
  { id:"polish:2",language:"polish",canonicalNumber:2,displayNumber:"2",title:"Polska druga" },
  { id:"czech:801",language:"czech",canonicalNumber:801,displayNumber:"801",title:"Česká druhá",sourceUrl:"https://www.evangelickykancional.cz/czech-801" },
  { id:"polish:1",language:"polish",canonicalNumber:1,displayNumber:"1",title:"Polska pierwsza" },
  { id:"czech:800",language:"czech",canonicalNumber:800,displayNumber:"800",title:"Česká první",sourceUrl:"https://www.evangelickykancional.cz/czech-800" },
];
async function providerCoverage(){const provider=new MemoryReferenceAntiphonProvider(fixtures);assert.deepEqual((await provider.list({language:"all",pageSize:20})).records.map(r=>r.id),["czech:800","czech:801","polish:1","polish:2"]);assert.deepEqual((await provider.list({language:"polish"})).records.map(r=>r.id),["polish:1","polish:2"]);assert.deepEqual((await provider.list({search:"80"})).records.map(r=>r.id),["czech:800","czech:801"]);assert.deepEqual((await provider.list({search:"PIERWS"})).records.map(r=>r.id),["polish:1"]);}
function languageCoverage(){const c={id:"czech:800",displayNumber:"800",title:"C"};const p={id:"polish:1",displayNumber:"1",title:"P"};assert.equal(serviceAntiphonMatchesLanguage(c,"czech"),true);assert.equal(serviceAntiphonMatchesLanguage(c,"polish"),false);assert.equal(serviceAntiphonMatchesLanguage(c,"mixed"),true);assert.equal(serviceAntiphonMatchesLanguage(p,"polish"),true);}
function renderCoverage(){const machine=new ServiceContextReferenceAntiphonUiState({runtimeMode:"memory",contextKey:"new",editable:true,serviceLanguage:"mixed"});machine.complete(machine.begin(),fixtures);const noops={onOpen:()=>undefined,onQueryChange:(_:string)=>undefined,onKeyDown:()=>undefined,onSelect:(_:ReferenceAntiphonRecord)=>undefined,onActiveIndexChange:(_:number)=>undefined,onClear:()=>undefined};const html=renderToStaticMarkup(<ServiceContextReferenceAntiphonFieldView editable selected={{id:"polish:1",displayNumber:"1",title:"Polska pierwsza"}} invalid open dirty={false} query="" snapshot={machine.snapshot()} activeIndex={2} {...noops}/>);assert.match(html,/aria-invalid="true"/);assert.match(html,/Polska pierwsza/);assert.doesNotMatch(html,/href=/);assert.match(html,/service-antiphon-option-active/);}
async function staticCoverage(){const [component,planning,css,contract,sync,candidate]=await Promise.all([readFile("app/service-context-reference-antiphon-field.tsx","utf8"),readFile("app/planning-lifecycle-client.tsx","utf8"),readFile("app/globals.css","utf8"),readFile("src/application/reference-antiphon-contract.ts","utf8"),readFile("src/application/reference-antiphon-sync.ts","utf8"),readFile("src/application/reference-candidate-service.ts","utf8")]);assert.match(component,/ArrowDown/);assert.match(component,/ArrowUp/);assert.match(component,/Home/);assert.match(component,/End/);assert.match(component,/Enter/);assert.match(component,/Escape/);assert.match(component,/onPointerDown=.*stopPropagation/);assert.match(component,/MemoryReferenceAntiphonClient/);assert.doesNotMatch(component,/Find antiphon|No antiphon selected|Remove antiphon|<h3>/);assert.doesNotMatch(planning,/>Candidate antiphon key</);assert.match(planning,/Selected antiphon must match the service language\./);assert.match(planning,/hasAntiphonLanguageMismatch/);assert.match(css,/service-antiphon-listbox[\s\S]*direction: rtl/);assert.match(css,/max-height: min\(32rem, 70vh\)/);assert.match(contract,/sourceUrl\?: string/);assert.match(sync,/a\.language='czech'/);assert.match(candidate,/song\.id === data\.recommendedReferenceSongId/);}
async function main(){await providerCoverage();languageCoverage();renderCoverage();await staticCoverage();console.log("Phase 31.18 bilingual-ready Service Context Antiphon lookup static/behavioral: PASS");}
void main().catch((error)=>{console.error(error);process.exitCode=1;});
''')

write('scripts/verify-phase-31-18.ts', '''import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { PostgresReferenceAntiphonProvider } from "../src/application/postgres-reference-antiphon";
import { PgReferenceAntiphonRecommendationRepository } from "../src/application/reference-antiphon-recommendation";
import { synchronizeReferenceAntiphons } from "../src/application/reference-antiphon-sync";
import { synchronizeReferenceCatalog } from "../src/application/reference-catalog-sync";
import { createDatabaseSql,createNpmInvocation,deriveControlUrl,deriveDatabaseUrl,dropDatabaseSql,generateE1DatabaseName,parseGuardDatabaseUrl,withCleanup } from "./engineering-e1-core";
const PASS="Phase 31.18 bilingual-ready Service Context Antiphon lookup: PASS";
const run=(name:string,url:string)=>new Promise<void>((resolve,reject)=>{const c=createNpmInvocation(process.execPath,process.env.npm_execpath,["run",name]);const p=spawn(c.command,c.args,{env:{...process.env,DATABASE_URL:url},stdio:"inherit"});p.on("error",reject);p.on("close",n=>n===0?resolve():reject(new Error(`${name} failed`)));});
async function main(){if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required for Phase 31.18 verification.");const guard=parseGuardDatabaseUrl(process.env.DATABASE_URL),control=new Pool({connectionString:deriveControlUrl(guard)}),name=generateE1DatabaseName(),url=deriveDatabaseUrl(guard,name);await control.query(createDatabaseSql(name));try{await withCleanup(async()=>{await run("db:migrate",url);await run("db:migrate",url);const pool=new Pool({connectionString:url});try{
 const sourceColumn=(await pool.query("select is_nullable from information_schema.columns where table_schema='public' and table_name='reference_antiphons' and column_name='source_url'")).rows[0];assert.equal(sourceColumn.is_nullable,"YES");
 await pool.query("insert into reference_antiphons(id,language,canonical_number,title,source_url) values('polish:1','polish',1,'Polska pierwsza',null)");
 await assert.rejects(()=>pool.query("insert into reference_antiphons(id,language,canonical_number,title,source_url) values('czech:999','czech',999,'Bad Czech',null)"));
 await assert.rejects(()=>pool.query("insert into reference_antiphons(id,language,canonical_number,title,source_url) values('polish:2','polish',2,'Bad Polish','http://bad')"));
 const counts=await synchronizeReferenceAntiphons(pool);assert.deepEqual(counts,{czech:116,polish:1,total:117});assert.equal(Number((await pool.query("select count(*) n from reference_antiphons where id='polish:1'")).rows[0].n),1,"Czech sync deleted Polish fixture");
 const provider=new PostgresReferenceAntiphonProvider(pool),all=await provider.list({language:"all",pageSize:200});assert.equal(all.records[0].id,"czech:800");assert.equal(all.records.at(-1)?.id,"polish:1");assert.deepEqual((await provider.list({language:"polish"})).records.map(r=>r.id),["polish:1"]);assert.deepEqual((await provider.list({search:"80",pageSize:200})).records.slice(0,2).map(r=>r.id),["czech:800","czech:801"]);
 await synchronizeReferenceCatalog(pool);const repo=new PgReferenceAntiphonRecommendationRepository(pool);assert.equal((await repo.set("czech:800","czech:1")).kind,"ok");assert.equal((await repo.set("czech:800","polish:1")).kind,"languageMismatch");assert.equal((await repo.get("czech:800"))?.recommendedSong?.referenceSongId,"czech:1");assert.equal((await repo.set("polish:1","polish:1")).kind,"ok");assert.equal((await repo.set("polish:1","czech:1")).kind,"languageMismatch");assert.equal((await repo.get("polish:1"))?.recommendedSong?.referenceSongId,"polish:1");
 await pool.query(`insert into service_contexts(service_date,service_time,service_language,priest_display_name,organist_display_name,reference_antiphon_id,reference_antiphon_display_number,reference_antiphon_title,reference_antiphon_source_url) values('2026-08-09','10:00','polish','P','O','polish:1','1','Polska pierwsza',null)`);const snapshot=(await pool.query("select reference_antiphon_id,reference_antiphon_display_number,reference_antiphon_title,reference_antiphon_source_url from service_contexts order by id desc limit 1")).rows[0];assert.deepEqual(snapshot,{reference_antiphon_id:'polish:1',reference_antiphon_display_number:'1',reference_antiphon_title:'Polska pierwsza',reference_antiphon_source_url:null});
 }finally{await pool.end();}},async()=>{const [terminate,drop]=dropDatabaseSql(name);await control.query(terminate,[name]);await control.query(drop);});console.log(PASS);}finally{await control.end();}}
void main().catch((error)=>{console.error("Phase 31.18 bilingual-ready Service Context Antiphon lookup: FAIL");console.error(error);process.exitCode=1;});
''')

# package scripts
package_path=ROOT/'package.json'; package=json.loads(package_path.read_text(encoding='utf-8'));scripts=package['scripts'];new_scripts={};
for key,value in scripts.items():
    new_scripts[key]=value
    if key=='verify:phase-31-17:local':
        new_scripts['test:phase-31-18']='tsx scripts/phase-31-18-tests.tsx'
        new_scripts['verify:phase-31-18']='tsx scripts/verify-phase-31-18.ts && npm run test:phase-31-18'
package['scripts']=new_scripts;package_path.write_text(json.dumps(package,indent=2)+"\n",encoding='utf-8')

# CI focused step/artifact
ci='''      - name: Phase 31.18 bilingual-ready Service Context Antiphon lookup
        run: |
          set -o pipefail
          npm run verify:phase-31-18 2>&1 | tee phase-31-18.log
      - name: Upload Phase 31.18 log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: phase-31-18-log
          path: phase-31-18.log
          if-no-files-found: ignore
'''
replace_exact('.github/workflows/ci.yml', '      - name: Database migration\n', ci+'      - name: Database migration\n')

print('Phase 31.18 transformation applied.')
