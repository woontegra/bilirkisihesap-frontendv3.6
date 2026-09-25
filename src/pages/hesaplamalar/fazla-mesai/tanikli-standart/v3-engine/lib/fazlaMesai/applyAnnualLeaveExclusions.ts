/**
 * Yıllık izin / UBGT / diğer dışlamaları hesaplama tablosu satırlarına uygular.
 * Satır aralığında dışlama ile örtüşen takvim günleri toplanır; hafta düşümü satırın
 * takvim günü sayısına orantılı yapılır (UBGT gibi 1–3 günlük kesitlerde yuvarlama ile 0 hafta kalması önlenir).
 */

import type { ExcludedDay } from "../../types/exclusionStorage";
import { differenceInCalendarDays, isValid, parseISO, startOfDay } from "date-fns";
import { countAnnualLeaveCalendarDaysInWindow } from "./annualLeaveCalendarDays";

export interface RowWithExclusionFields {
  startISO: string;
  endISO: string;
  weeks: number;
  brut: number;
  katsayi: number;
  fmHours: number;
  totalDays?: number;
  excludedDays?: number;
  workedDays?: number;
  dailyNet?: number;
  rangeLabel?: string;
  [key: string]: unknown;
}

export interface ApplyAnnualLeaveExclusionsOptions {
  /** Dışlama satırı takvimini tamamen kapladığında en az bu kadar hafta bırakılır (0 ise tamamen sıfırlanabilir). */
  minWeeks?: number;
}

/** UBGT tek gün kaydında `days` > 1 ise takvim tekilliği 1 sayar; kalan bilanço günü burada eklenir. */
function ubgExtraBalanceDays(rowStart: Date, rowEnd: Date, exclusions: ExcludedDay[]): number {
  let extra = 0;
  for (const ex of exclusions) {
    if (ex.type !== "UBGT") continue;
    const s = (ex.start || "").slice(0, 10);
    const e = (ex.end || "").slice(0, 10);
    if (!s || s !== e) continue;
    const dnum = Math.floor(Number(ex.days) || 1);
    if (dnum <= 1) continue;
    const d = startOfDay(parseISO(s));
    if (!isValid(d) || d < rowStart || d > rowEnd) continue;
    extra += dnum - 1;
  }
  return extra;
}

/**
 * Satır listesine dışlama uygular (gün bazlı).
 * Örtüşen takvim günleri tekilleştirilir; UBGT tek gün `days>1` ise bilanço günü eklenir.
 * Hafta oranı düşümü yapılmaz, yalnız `totalDays/excludedDays/workedDays` alanları güncellenir.
 */
export function applyAnnualLeaveExclusions<T extends RowWithExclusionFields>(
  rows: T[],
  exclusions: ExcludedDay[] | null | undefined,
  options: ApplyAnnualLeaveExclusionsOptions = {}
): T[] {
  void options;

  if (!exclusions || exclusions.length === 0) {
    return rows;
  }

  return rows.map((row) => {
    if (!row.startISO || !row.endISO) return row;

    const rowStart = startOfDay(parseISO(row.startISO.slice(0, 10)));
    const rowEnd = startOfDay(parseISO(row.endISO.slice(0, 10)));
    if (!isValid(rowStart) || !isValid(rowEnd) || rowStart > rowEnd) return row;

    const calendarOverlapDays = countAnnualLeaveCalendarDaysInWindow(rowStart, rowEnd, exclusions);
    const ubgExtra = ubgExtraBalanceDays(rowStart, rowEnd, exclusions);
    let totalWeightedDays = calendarOverlapDays + ubgExtra;
    if (totalWeightedDays <= 0) return row;

    const rowCalendarDays = Math.max(1, differenceInCalendarDays(rowEnd, rowStart) + 1);
    totalWeightedDays = Math.min(totalWeightedDays, rowCalendarDays);

    return {
      ...row,
      totalDays: rowCalendarDays,
      excludedDays: totalWeightedDays,
      workedDays: Math.max(0, rowCalendarDays - totalWeightedDays),
    };
  });
}
