import type { ConcreteSongLanguage, ServiceLanguage } from "./model";

export type RowLanguage = "" | ConcreteSongLanguage;

export type RowLanguageState = {
  songLanguage: RowLanguage;
  songNumber?: string;
  note?: string;
  languageTouched?: boolean;
};

export function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getNearestSunday(fromDate: Date): Date {
  const nearestSunday = new Date(fromDate);
  nearestSunday.setHours(0, 0, 0, 0);
  const daysUntilSunday = (7 - nearestSunday.getDay()) % 7;
  nearestSunday.setDate(nearestSunday.getDate() + daysUntilSunday);
  return nearestSunday;
}

export function isSecondSunday(date: Date): boolean {
  return date.getDay() === 0 && date.getDate() >= 8 && date.getDate() <= 14;
}

export function getDefaultServiceLanguage(serviceDate: Date): ServiceLanguage {
  return isSecondSunday(serviceDate) ? "polish" : "czech";
}

export function getDefaultRowLanguage(serviceLanguage: ServiceLanguage): RowLanguage {
  if (serviceLanguage === "mixed") {
    return "";
  }
  return serviceLanguage;
}

export function isUntouchedEmptyRow(row: RowLanguageState): boolean {
  return !row.languageTouched && !row.songNumber?.trim() && !row.note?.trim();
}

export function propagateServiceLanguageToRows<TRow extends RowLanguageState>(
  rows: TRow[],
  serviceLanguage: ServiceLanguage,
): TRow[] {
  const defaultRowLanguage = getDefaultRowLanguage(serviceLanguage);
  return rows.map((row) => (isUntouchedEmptyRow(row) ? { ...row, songLanguage: defaultRowLanguage } : row));
}

export function getLanguageDeviationRowNumbers(rows: RowLanguageState[], serviceLanguage: ServiceLanguage): number[] {
  if (serviceLanguage === "mixed") {
    return [];
  }

  return rows.flatMap((row, index) => (row.songLanguage !== serviceLanguage ? [index + 1] : []));
}

export function shouldBlockSaveForLanguageDeviation(
  rows: RowLanguageState[],
  serviceLanguage: ServiceLanguage,
  confirmed: boolean,
): boolean {
  return getLanguageDeviationRowNumbers(rows, serviceLanguage).length > 0 && !confirmed;
}
