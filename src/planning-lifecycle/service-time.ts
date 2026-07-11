export function normalizeServiceTime(value: string): string {
  const trimmed = value.trim();
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) {
    return trimmed;
  }

  return `${match[1]}:${match[2]}`;
}

export function isValidServiceTime(value: string): boolean {
  const normalized = normalizeServiceTime(value);
  const match = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) {
    return false;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}
