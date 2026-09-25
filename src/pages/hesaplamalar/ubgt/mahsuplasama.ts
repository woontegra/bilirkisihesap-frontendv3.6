/**
 * UBGT mahsuplaşma matrisi — pure helpers (V3 UBGTMahsuplasamaModal formülü).
 */

export type UbgtMahsuplasamaMatrix = { [year: number]: { [holidayName: string]: number } };

export type UbgtMahsuplasamaTableRow = {
  period: string;
  wage?: number;
  coefficient?: number;
  dailyWage?: number;
  ubgtDays?: number;
  ubgtTotal?: number;
  startISO?: string;
  endISO?: string;
  manual?: boolean;
};

/** V3 formül: tüm yıl × tatil hücrelerinin toplamı. */
export function sumMahsuplasamaMatrix(values: UbgtMahsuplasamaMatrix): number {
  let sum = 0;
  for (const yearStr of Object.keys(values)) {
    const year = parseInt(yearStr, 10);
    const byHoliday = values[year];
    if (!byHoliday) continue;
    for (const holidayName of Object.keys(byHoliday)) {
      sum += byHoliday[holidayName] || 0;
    }
  }
  return sum;
}

export function settleAmountFromMahsupMatrix(data: UbgtMahsuplasamaMatrix): string {
  const total = sumMahsuplasamaMatrix(data);
  return total.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseTurkishDate(dateStr: string): Date | null {
  try {
    const parts = dateStr.split(".");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function addYearsFromIso(iso: string | undefined, yearSet: Set<number>) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
  const d = new Date(iso + "T12:00:00");
  if (!isNaN(d.getTime())) yearSet.add(d.getFullYear());
}

export function yearsFromMahsupTableData(tableData: UbgtMahsuplasamaTableRow[]): number[] {
  const yearSet = new Set<number>();
  for (const row of tableData) {
    addYearsFromIso(row.startISO, yearSet);
    addYearsFromIso(row.endISO, yearSet);
    const parts = row.period.split(" - ");
    if (parts.length === 2) {
      const startDate = parseTurkishDate(parts[0].trim());
      const endDate = parseTurkishDate(parts[1].trim());
      if (startDate) yearSet.add(startDate.getFullYear());
      if (endDate) yearSet.add(endDate.getFullYear());
    }
  }
  return Array.from(yearSet).sort((a, b) => a - b);
}
