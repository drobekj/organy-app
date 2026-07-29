import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const endpoint = "https://zpevnik.proscholy.cz/graphql";
const songbookId = 63;
const outputDir = process.argv[2] ?? "artifacts/czech-antiphon-acquisition";

async function graphql(query, variables = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}: ${await response.text()}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(`GraphQL error: ${JSON.stringify(body.errors)}`);
  return body;
}

const namedType = (type) => type?.name ?? namedType(type?.ofType);
const kind = (type) => type?.kind === "NON_NULL" ? kind(type.ofType) : type?.kind;
const fieldMap = (type) => new Map((type?.fields ?? []).map((field) => [field.name, field]));
const firstField = (fields, names) => names.map((name) => fields.get(name)).find(Boolean);
const scalarSelection = (field, alias) => `${alias}: ${field.name}`;

const introspection = await graphql(`query AcquisitionSchema {
  __schema {
    queryType { name }
    types {
      kind name
      fields(includeDeprecated: true) {
        name
        args { name type { kind name ofType { kind name ofType { kind name } } } }
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
    }
  }
}`);
const types = new Map(introspection.data.__schema.types.map((type) => [type.name, type]));
const queryType = types.get(introspection.data.__schema.queryType.name);
const root = firstField(fieldMap(queryType), ["songbook", "songBook"]);
if (!root) throw new Error("The structured source exposes no songbook query field.");
const rootArgument = firstField(new Map(root.args.map((arg) => [arg.name, arg])), ["id", "songbookId", "songbook_id"]);
if (!rootArgument) throw new Error("The songbook query exposes no supported id argument.");
const songbookType = types.get(namedType(root.type));
const songsField = firstField(fieldMap(songbookType), ["songs", "items", "records"]);
if (!songsField) throw new Error("The songbook type exposes no supported complete song collection.");
const songType = types.get(namedType(songsField.type));
const songs = fieldMap(songType);
const title = firstField(songs, ["title", "name"]);
const id = firstField(songs, ["id"]);
const route = firstField(songs, ["url", "publicUrl", "public_url", "path", "route", "slug"]);
const directNumber = firstField(songs, ["number", "songbookNumber", "songbook_number"]);
const pivot = firstField(songs, ["pivot", "songbookPivot", "songbook_pivot"]);
const pivotType = pivot && types.get(namedType(pivot.type));
const pivotNumber = pivotType && firstField(fieldMap(pivotType), ["number", "songNumber", "song_number"]);
if (!title || !route || (!directNumber && !pivotNumber)) {
  throw new Error(`The public structured source cannot provide required fields (title=${title?.name ?? "missing"}, route=${route?.name ?? "missing"}, number=${directNumber?.name ?? pivotNumber?.name ?? "missing"}).`);
}
const selections = [scalarSelection(title, "sourceTitle"), scalarSelection(route, "sourceRoute")];
if (id) selections.push(scalarSelection(id, "sourceId"));
if (directNumber) selections.push(scalarSelection(directNumber, "sourceNumber"));
else selections.push(`sourcePivot: ${pivot.name} { ${scalarSelection(pivotNumber, "sourceNumber")} }`);
const variableType = (() => {
  const render = (type) => type.kind === "NON_NULL" ? `${render(type.ofType)}!` : type.name;
  return render(rootArgument.type);
})();
const sourceResponse = await graphql(`query CzechAntiphonAcquisition($songbookId: ${variableType}) {
  sourceSongbook: ${root.name}(${rootArgument.name}: $songbookId) {
    sourceSongs: ${songsField.name} { ${selections.join(" ")} }
  }
}`, { songbookId });
const sourceSongs = sourceResponse.data?.sourceSongbook?.sourceSongs;
if (!Array.isArray(sourceSongs)) throw new Error("The songbook response is not a complete array.");

function exactInteger(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && String(parsed) === value) return parsed;
  }
  return null;
}
function publicUrl(song) {
  const value = String(song.sourceRoute ?? "").trim();
  let url;
  if (/^https?:\/\//i.test(value)) url = new URL(value);
  else if (value.startsWith("/")) url = new URL(value, "https://www.evangelickykancional.cz");
  else if (song.sourceId != null && value) url = new URL(`/pisen/${song.sourceId}/${value}`, "https://www.evangelickykancional.cz");
  else throw new Error(`Cannot derive a public URL from source route ${JSON.stringify(song.sourceRoute)}.`);
  if (url.protocol !== "https:" || url.origin !== "https://www.evangelickykancional.cz") throw new Error(`Wrong public URL origin: ${url.href}`);
  return url.href;
}
const ambiguousIncluded = [];
const catalog = [];
for (const song of sourceSongs) {
  const rawNumber = directNumber ? song.sourceNumber : song.sourcePivot?.sourceNumber;
  const number = exactInteger(rawNumber);
  if (number === null) {
    const numericPrefix = Number.parseInt(String(rawNumber), 10);
    if (Number.isFinite(numericPrefix) && numericPrefix >= 800) ambiguousIncluded.push(rawNumber);
    continue;
  }
  if (number < 800) continue;
  const titleValue = String(song.sourceTitle ?? "").trim();
  if (!titleValue) throw new Error(`Empty title for antiphon ${number}.`);
  catalog.push({ number, title: titleValue, url: publicUrl(song) });
}
if (ambiguousIncluded.length) throw new Error(`Ambiguous included 800+ printed source numbers: ${JSON.stringify(ambiguousIncluded)}`);
catalog.sort((a, b) => a.number - b.number);
if (!catalog.length) throw new Error("No qualifying Czech antiphons were found.");
for (let index = 1; index < catalog.length; index++) {
  if (catalog[index - 1].number === catalog[index].number) throw new Error(`Duplicate antiphon number ${catalog[index].number}.`);
}
const catalogBytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`);
const sha256 = createHash("sha256").update(catalogBytes).digest("hex");
const manifest = { endpoint, songbook_id: songbookId, source_record_count: sourceSongs.length, record_count: catalog.length, first_number: catalog[0].number, last_number: catalog.at(-1).number, sha256 };
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "catalog-czech-antiphons.json"), catalogBytes);
await writeFile(join(outputDir, "source-response.json"), `${JSON.stringify(sourceResponse, null, 2)}\n`);
await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Acquired ${catalog.length} Czech antiphons (${catalog[0].number}–${catalog.at(-1).number}), SHA-256 ${sha256}.`);
