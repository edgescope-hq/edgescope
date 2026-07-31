export function parseDateKey(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
    ? undefined
    : date;
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function initialCalendarStartYear({
  earliestTradeYear,
  selectedYear,
  currentYear,
}: {
  earliestTradeYear?: number;
  selectedYear?: number;
  currentYear: number;
}): number {
  const earliest = Number.isInteger(earliestTradeYear) ? earliestTradeYear! - 2 : currentYear - 2;
  return Math.min(earliest, selectedYear ?? currentYear);
}

export function boundedCalendarYears(startYear: number, currentYear: number): number[] {
  const safeStart = Math.min(startYear, currentYear);
  return Array.from({ length: currentYear - safeStart + 1 }, (_, index) => safeStart + index);
}
