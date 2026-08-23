import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { displayReferenceNumber } from "../src/application/reference-catalog-contract";
import {
  decodeLegacySql,
  parseLegacyPeople,
  parseLegacyRows,
  parseLegacyServices,
  type LegacyLanguage as Language,
  type LegacyPerson,
  type LegacyRow,
  type LegacyService,
} from "./legacy-history-parser";
import {
  buildLegacySongCorrections,
  correctedCanonicalNumber,
  songKey,
  type LegacySongCorrection,
} from "./legacy-history-song-resolution";

type ReferenceSong = { id: string; language: Language; canonicalNumber: number; title: string };
type PersonResolution = { id?: string; displayName: string };

const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const apply = process.argv.includes("--apply");
if (!sourceArg) throw new Error("Usage: tsx scripts/legacy-history-import.ts --source=/path/legacy.sql [--apply]");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the read-only audit and optional import.");

const sourcePath = sourceArg.slice("--source=".length);
const sqlText = decodeLegacySql(await readFile(sourcePath));
const services = parseLegacyServices(sqlText);
const rows = parseLegacyRows(sqlText);
const priests = parseLegacyPeople(sqlText, "Kazatele");
const organists = parseLegacyPeople(sqlText, "Varhanici");
assertExpectedLegacyShape(services, rows, priests, organists);

const rowsByService = groupRows(rows);
const serviceById = new Map(services.map((service) => [service.id, service]));
const serviceTimes = assignProvisionalTimes(services);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const referenceSongs = await loadReferenceSongs(pool);
  const referenceByKey = new Map(referenceSongs.map((song) => [songKey(song.language, song.canonicalNumber), song]));
  const { corrections, variantEvidence } = buildLegacySongCorrections(services, rows, new Set(referenceByKey.keys()));

  const directOccurrences = rows.filter((row) => {
    if (!row.songNumber) return false;
    const service = serviceById.get(row.serviceId);
    return Boolean(service && referenceByKey.has(songKey(service.language, row.songNumber)));
  });
  const correctedOccurrences = rows.filter((row) => {
    if (!row.songNumber) return false;
    const service = serviceById.get(row.serviceId);
    if (!service) return false;
    const corrected = correctedCanonicalNumber(service.language, row.songNumber, corrections);
    return corrected !== row.songNumber && referenceByKey.has(songKey(service.language, corrected));
  });
  const missingOccurrences = rows.filter((row) => !row.songNumber);
  const unmappedOccurrences = rows.filter((row) => {
    if (!row.songNumber) return false;
    const service = serviceById.get(row.serviceId);
    if (!service) return true;
    const corrected = correctedCanonicalNumber(service.language, row.songNumber, corrections);
    return !referenceByKey.has(songKey(service.language, corrected));
  });
  const unresolvedDistinct = [...new Set(unmappedOccurrences.map((row) => {
    const service = serviceById.get(row.serviceId)!;
    return songKey(service.language, row.songNumber!);
  }))].sort();

  const duplicateDates = [...new Set(services.map((service) => service.date).filter((date, index, all) => all.indexOf(date) !== all.lastIndexOf(date)))].sort();
  const knownPriestIds = new Set(priests.map((person) => person.id));
  const knownOrganistIds = new Set(organists.map((person) => person.id));
  const missingPriestRefs = services.filter((service) => service.priestId !== undefined && !knownPriestIds.has(service.priestId));
  const missingOrganistRefs = services.filter((service) => service.organistId !== undefined && !knownOrganistIds.has(service.organistId));

  const audit = {
    source: sourcePath,
    mode: apply ? "apply-requested" : "read-only-audit",
    services: services.length,
    rows: rows.length,
    language: {
      czech: services.filter((service) => service.language === "czech").length,
      polish: services.filter((service) => service.language === "polish").length,
    },
    people: {
      legacyPriests: priests.length,
      legacyOrganists: organists.length,
      excludedOrganists: organists.filter(isMp3Person).map((person) => person.displayName),
      anonymousPriestServices: services.filter((service) => service.priestId === undefined || !knownPriestIds.has(service.priestId)).length,
      anonymousOrganistServices: services.filter((service) => service.organistId === undefined || !knownOrganistIds.has(service.organistId) || isMp3Id(service.organistId, organists)).length,
      missingPriestRefs: missingPriestRefs.map((service) => ({ serviceId: service.id, date: service.date, priestId: service.priestId })),
      missingOrganistRefs: missingOrganistRefs.map((service) => ({ serviceId: service.id, date: service.date, organistId: service.organistId })),
    },
    songs: {
      directMappedOccurrences: directOccurrences.length,
      correctedMappedOccurrences: correctedOccurrences.length,
      noNumberOccurrences: missingOccurrences.length,
      unmappedOccurrences: unmappedOccurrences.length,
      unmappedDistinct: unresolvedDistinct,
      corrections: [...corrections.values()].sort(compareCorrections),
      variantEvidence,
    },
    duplicateDates,
    provisionalTimes: duplicateDates.map((date) => services
      .filter((service) => service.date === date)
      .sort((a, b) => a.id - b.id)
      .map((service) => ({ serviceId: service.id, time: serviceTimes.get(service.id) }))),
  };
  console.log(JSON.stringify(audit, null, 2));

  if (!apply) {
    console.log("AUDIT ONLY: no database rows were changed. Add --apply only after explicit Production approval.");
  } else {
    await applyImport(pool, services, rowsByService, priests, organists, serviceTimes, referenceByKey, corrections);
  }
} finally {
  await pool.end();
}

async function applyImport(
  pool: Pool,
  services: LegacyService[],
  rowsByService: Map<number, LegacyRow[]>,
  priests: LegacyPerson[],
  organists: LegacyPerson[],
  serviceTimes: Map<number, string>,
  referenceByKey: Map<string, ReferenceSong>,
  corrections: ReadonlyMap<string, LegacySongCorrection>,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('organy-legacy-history-import'))");
    const personMap = await upsertLegacyPeople(client, priests, organists);
    let inserted = 0;
    let skipped = 0;
    for (const service of [...services].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
      const marker = `legacy:Bohosluzby:${service.id}`;
      if ((await client.query("select 1 from service_contexts where name = $1 limit 1", [marker])).rows[0]) { skipped += 1; continue; }
      const priest = resolvePriest(service, priests, personMap);
      const organist = resolveOrganist(service, organists, personMap);
      const time = serviceTimes.get(service.id)!;
      const [context] = (await client.query(
        `insert into service_contexts
           (name, service_language, service_date, service_time, priest_id, priest_display_name, organist_id, organist_display_name, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now()) returning id`,
        [marker, service.language, service.date, time, priest.id ?? null, priest.displayName, organist.id ?? null, organist.displayName],
      )).rows;
      const [completed] = (await client.query(
        "insert into completed_services (service_context_id, service_set_id, completed_at, created_at, updated_at) values ($1, null, $2, now(), now()) returning id",
        [context.id, `${service.date}T12:00:00Z`],
      )).rows;
      const serviceRows = (rowsByService.get(service.id) ?? []).sort(compareLegacyRows);
      for (const [index, row] of serviceRows.entries()) {
        const snapshot = songSnapshot(service.language, row, referenceByKey, corrections);
        await client.query(
          `insert into completed_service_rows
             (completed_service_id, position, song_id, song_language, song_number, song_title, note, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
          [completed.id, index + 1, snapshot.songId ?? null, snapshot.language ?? null, snapshot.number ?? null, snapshot.title ?? null, snapshot.note ?? null],
        );
      }
      inserted += 1;
    }
    await client.query("commit");
    console.log(JSON.stringify({ applied: true, insertedServices: inserted, skippedExisting: skipped }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function assertExpectedLegacyShape(services: LegacyService[], rows: LegacyRow[], priests: LegacyPerson[], organists: LegacyPerson[]) {
  const expected = { services: 202, rows: 808, priests: 11, organists: 4 };
  const actual = { services: services.length, rows: rows.length, priests: priests.length, organists: organists.length };
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
    if (actual[key] !== expected[key]) throw new Error(`Legacy source shape mismatch: expected ${key}=${expected[key]}, got ${actual[key]}.`);
  }
}

function groupRows(rows: LegacyRow[]) {
  const map = new Map<number, LegacyRow[]>();
  for (const row of rows) map.set(row.serviceId, [...(map.get(row.serviceId) ?? []), row]);
  return map;
}

function compareLegacyRows(a: LegacyRow, b: LegacyRow) {
  const pa = positionFromMeaning(a.meaning);
  const pb = positionFromMeaning(b.meaning);
  if (pa !== undefined && pb !== undefined && pa !== pb) return pa - pb;
  return a.id - b.id;
}
function positionFromMeaning(value?: string) { const match = value?.match(/^(\d+)\s*\./); return match ? Number(match[1]) : undefined; }

function compareCorrections(a: LegacySongCorrection, b: LegacySongCorrection) {
  return a.language.localeCompare(b.language) || a.legacyNumber - b.legacyNumber;
}

function assignProvisionalTimes(services: LegacyService[]) {
  const byDate = new Map<string, LegacyService[]>();
  for (const service of services) byDate.set(service.date, [...(byDate.get(service.date) ?? []), service]);
  const result = new Map<number, string>();
  for (const group of byDate.values()) {
    group.sort((a, b) => a.id - b.id).forEach((service, index) => result.set(service.id, `${String(10 + index).padStart(2, "0")}:00`));
  }
  return result;
}

async function loadReferenceSongs(pool: Pool): Promise<ReferenceSong[]> {
  const result = await pool.query("select id, language::text language, canonical_number, title from reference_catalog_songs order by language, canonical_number");
  return result.rows.map((row) => ({ id: String(row.id), language: String(row.language) as Language, canonicalNumber: Number(row.canonical_number), title: String(row.title) }));
}

function songSnapshot(
  language: Language,
  row: LegacyRow,
  referenceByKey: Map<string, ReferenceSong>,
  corrections: ReadonlyMap<string, LegacySongCorrection>,
) {
  if (!row.songNumber) return { note: "Legacy source has no song number." };
  const canonicalNumber = correctedCanonicalNumber(language, row.songNumber, corrections);
  const reference = referenceByKey.get(songKey(language, canonicalNumber));
  if (reference) return { songId: reference.id, language, number: displayReferenceNumber(reference.canonicalNumber), title: reference.title };
  return { songId: `legacy:${language}:${row.songNumber}`, language, number: String(row.songNumber), title: `Legacy song ${row.songNumber} (unmapped)` };
}

function isMp3Person(person: LegacyPerson) { return person.displayName.toLocaleLowerCase().includes("mp3"); }
function isMp3Id(id: number | undefined, organists: LegacyPerson[]) {
  return id !== undefined && isMp3Person(organists.find((person) => person.id === id) ?? { id, displayName: "" });
}

async function upsertLegacyPeople(client: PoolClient, priests: LegacyPerson[], organists: LegacyPerson[]) {
  const map = new Map<string, string>();
  for (const [role, people] of [["priest", priests], ["organist", organists]] as const) {
    for (const person of people) {
      if (role === "organist" && isMp3Person(person)) continue;
      const existingByName = await client.query("select id from catalog_persons where lower(display_name) = lower($1) order by active desc limit 1", [person.displayName]);
      const personId = existingByName.rows[0] ? String(existingByName.rows[0].id) : `legacy-${role}:${person.id}`;
      if (existingByName.rows[0]) {
        await client.query(`update catalog_persons set active = true, ${role} = true, updated_at = now() where id = $1`, [personId]);
      } else {
        await client.query(
          "insert into catalog_persons (id, display_name, active, priest, organist, created_at, updated_at) values ($1, $2, true, $3, $4, now(), now())",
          [personId, person.displayName, role === "priest", role === "organist"],
        );
      }
      map.set(`${role}:${person.id}`, personId);
    }
  }
  return map;
}

function resolvePriest(service: LegacyService, people: LegacyPerson[], map: Map<string, string>): PersonResolution {
  if (service.priestId === undefined) return { displayName: "Anonymous" };
  const person = people.find((candidate) => candidate.id === service.priestId);
  if (!person) return { displayName: "Anonymous" };
  return { id: map.get(`priest:${person.id}`), displayName: person.displayName };
}
function resolveOrganist(service: LegacyService, people: LegacyPerson[], map: Map<string, string>): PersonResolution {
  if (service.organistId === undefined) return { displayName: "Anonymous" };
  const person = people.find((candidate) => candidate.id === service.organistId);
  if (!person || isMp3Person(person)) return { displayName: "Anonymous" };
  return { id: map.get(`organist:${person.id}`), displayName: person.displayName };
}
