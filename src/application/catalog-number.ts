export function decodeCatalogNumberForDisplay(number: number | string): string {
  const value = typeof number === "number" ? String(number) : number.trim();
  if (!/^\d{4}$/.test(value)) return value;
  const encoded = Number(value);
  for (const divisor of [1, 10, 100]) {
    const variant = Math.floor((encoded % (divisor * 10)) / divisor);
    const base = Math.floor(encoded / (divisor * 10));
    if (variant >= 1 && variant <= 9 && base >= 1 && base <= 999 && base * divisor * 10 + variant * divisor === encoded) return `${base}/${variant}`;
  }
  return value;
}

export function encodeCatalogNumberForStorage(number: number | string): string {
  const value = typeof number === "number" ? String(number) : number.trim();
  const slash = /^(\d{1,3})\/(\d)$/.exec(value);
  if (!slash) return value;
  const base = Number(slash[1]);
  const variant = Number(slash[2]);
  if (base < 1 || base > 999 || variant < 1 || variant > 9) return value;
  const factor = base < 10 ? 100 : base < 100 ? 10 : 1;
  return String(base * factor * 10 + variant * factor);
}

export function normalizeCatalogSearchQuery(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [""];
  const encoded = encodeCatalogNumberForStorage(trimmed);
  return encoded === trimmed ? [trimmed] : [trimmed, encoded];
}
