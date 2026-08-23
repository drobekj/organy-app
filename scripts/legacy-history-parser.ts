export type LegacyLanguage = "czech" | "polish";
export type LegacyService = { id: number; date: string; language: LegacyLanguage; priestId?: number; organistId?: number };
export type LegacyRow = { id: number; serviceId: number; songNumber: number | null; meaning?: string };
export type LegacyPerson = { id: number; displayName: string };

export function decodeLegacySql(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  if (buffer.includes(0)) return buffer.toString("utf16le").replace(/^\ufeff/, "");
  return buffer.toString("utf8").replace(/^\ufeff/, "");
}

export function parseLegacyServices(text: string): LegacyService[] {
  return tableTuples(text, "Bohosluzby").map((f) => ({
    id: requiredNumber(f[0], "Bohosluzby.Id"),
    date: sqlDate(f[1]),
    language: parseLanguage(f[2]),
    ...(sqlNumber(f[3]) !== undefined ? { priestId: sqlNumber(f[3]) } : {}),
    ...(sqlNumber(f[4]) !== undefined ? { organistId: sqlNumber(f[4]) } : {}),
  }));
}

export function parseLegacyRows(text: string): LegacyRow[] {
  return tableTuples(text, "BohosluzbyPisne").map((f) => ({
    id: requiredNumber(f[0], "BohosluzbyPisne.Id"),
    serviceId: requiredNumber(f[1], "BohosluzbyPisne.BohosluzbaId"),
    songNumber: nullableRequiredNumber(f[2], "BohosluzbyPisne.PisenId"),
    ...(sqlString(f[3]) ? { meaning: sqlString(f[3]) } : {}),
  }));
}

export function parseLegacyPeople(text: string, table: "Kazatele" | "Varhanici"): LegacyPerson[] {
  return tableTuples(text, table).map((f) => {
    const first = sqlString(f[1])?.trim() ?? "";
    const last = sqlString(f[2])?.trim() ?? "";
    return { id: requiredNumber(f[0], `${table}.Id`), displayName: [first, last].filter(Boolean).join(" ") };
  }).filter((person) => person.displayName.length > 0);
}

export function tableTuples(text: string, table: string): string[][] {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^INSERT\\s+\\[dbo\\]\\.\\[${escaped}\\][^\\r\\n]*?VALUES\\s*\\((.*)\\)\\s*$`, "gmi");
  const rows = [...text.matchAll(pattern)].map((match) => splitSqlTuple(match[1]));
  if (rows.length === 0) throw new Error(`Legacy table ${table} INSERT rows were not found.`);
  return rows;
}

export function splitSqlTuple(raw: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  let depth = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "'" && quoted && raw[i + 1] === "'") { current += "''"; i += 1; continue; }
    if (ch === "'") { quoted = !quoted; current += ch; continue; }
    if (!quoted && ch === "(") depth += 1;
    if (!quoted && ch === ")") depth -= 1;
    if (ch === "," && !quoted && depth === 0) { fields.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}

export function sqlString(value: string | undefined): string | undefined {
  if (!value || /^NULL$/i.test(value)) return undefined;
  const cast = value.match(/^CAST\(N?'([\s\S]*)'\s+AS\s+DateTime\)$/i);
  if (cast) return cast[1].replace(/''/g, "'");
  const match = value.match(/^N?'([\s\S]*)'$/);
  return match ? match[1].replace(/''/g, "'") : value;
}

export function sqlNumber(value: string | undefined): number | undefined {
  if (!value || /^NULL$/i.test(value)) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function requiredNumber(value: string | undefined, label: string): number {
  const parsed = sqlNumber(value);
  if (parsed === undefined) throw new Error(`${label} is not numeric.`);
  return parsed;
}

function nullableRequiredNumber(value: string | undefined, label: string): number | null {
  if (value && /^NULL$/i.test(value)) return null;
  return requiredNumber(value, label);
}

function sqlDate(value: string | undefined): string {
  const string = sqlString(value) ?? "";
  const match = string.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error(`Unsupported legacy date ${value ?? ""}`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseLanguage(value: string | undefined): LegacyLanguage {
  const normalized = (sqlString(value) ?? "").toLocaleLowerCase("cs-CZ");
  if (normalized.includes("pol")) return "polish";
  if (normalized.includes("ces") || normalized.includes("čes")) return "czech";
  throw new Error(`Unsupported legacy service language ${value ?? ""}`);
}
