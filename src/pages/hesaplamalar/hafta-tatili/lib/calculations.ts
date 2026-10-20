/**
 * Hafta Tatili Alacağı — V3 `calculations.ts` yerel kopyası.
 * Başka hesaplama modülünden import yok.
 */

import { countAnnualLeaveCalendarDaysInWindow, ubgExtraBalanceDaysInWindow } from "./annualLeaveCalendarDays";
import { formatDateTR } from "./money";
import type { ExcludedDay } from "./types";
import { nationalDays } from "./data/national-days";
import { officialHolidays } from "./data/official-holidays";
import { generalHolidays } from "./data/general-holidays";
import { religiousHolidays } from "./data/religious-holidays";

export type HolidayType = "national" | "official" | "general" | "religious";

export interface StaticHoliday {
  id: string;
  name: string;
  days: number;
}

interface Holiday {
  date: string;
  day: string;
  name: string;
  type: HolidayType;
}

export const STATIC_HOLIDAYS: Record<HolidayType, StaticHoliday[]> = {
  national: [
    { id: "28-ekim", name: "28 Ekim", days: 0.5 },
    { id: "29-ekim", name: "29 Ekim", days: 1 },
  ],
  official: [
    { id: "23-nisan", name: "23 Nisan", days: 1 },
    { id: "19-mayis", name: "19 Mayıs", days: 1 },
    { id: "30-agustos", name: "30 Ağustos", days: 1 },
  ],
  general: [
    { id: "1-ocak", name: "Yılbaşı", days: 1 },
    { id: "1-mayis", name: "1 Mayıs", days: 1 },
    { id: "15-temmuz", name: "15 Temmuz", days: 1 },
  ],
  religious: [
    { id: "ramazan-arife", name: "Ramazan Arife", days: 0.5 },
    { id: "ramazan-1", name: "Ramazan 1. Gün", days: 1 },
    { id: "ramazan-2", name: "Ramazan 2. Gün", days: 1 },
    { id: "ramazan-3", name: "Ramazan 3. Gün", days: 1 },
    { id: "kurban-arife", name: "Kurban Arife", days: 0.5 },
    { id: "kurban-1", name: "Kurban 1. Gün", days: 1 },
    { id: "kurban-2", name: "Kurban 2. Gün", days: 1 },
    { id: "kurban-3", name: "Kurban 3. Gün", days: 1 },
    { id: "kurban-4", name: "Kurban 4. Gün", days: 1 },
  ],
};

export const ALL_STATIC_HOLIDAYS: StaticHoliday[] = [
  ...STATIC_HOLIDAYS.national,
  ...STATIC_HOLIDAYS.official,
  ...STATIC_HOLIDAYS.general,
  ...STATIC_HOLIDAYS.religious,
];

export interface MinWageEntry {
  start: string;
  end: string;
  wage: number;
}

export const MIN_WAGE_TABLE: MinWageEntry[] = [
  { start: "2005-01-01", end: "2005-12-31", wage: 488.7 },
  { start: "2006-01-01", end: "2006-12-31", wage: 531.0 },
  { start: "2007-01-01", end: "2007-06-30", wage: 562.5 },
  { start: "2007-07-01", end: "2007-12-31", wage: 585.0 },
  { start: "2008-01-01", end: "2008-06-30", wage: 608.4 },
  { start: "2008-07-01", end: "2008-12-31", wage: 638.7 },
  { start: "2009-01-01", end: "2009-06-30", wage: 693.0 },
  { start: "2009-07-01", end: "2009-12-31", wage: 693.0 },
  { start: "2010-01-01", end: "2010-06-30", wage: 729.0 },
  { start: "2010-07-01", end: "2010-12-31", wage: 760.5 },
  { start: "2011-01-01", end: "2011-06-30", wage: 796.5 },
  { start: "2011-07-01", end: "2011-12-31", wage: 837.0 },
  { start: "2012-01-01", end: "2012-06-30", wage: 886.5 },
  { start: "2012-07-01", end: "2012-12-31", wage: 940.5 },
  { start: "2013-01-01", end: "2013-06-30", wage: 978.6 },
  { start: "2013-07-01", end: "2013-12-31", wage: 1021.5 },
  { start: "2014-01-01", end: "2014-06-30", wage: 1071.0 },
  { start: "2014-07-01", end: "2014-12-31", wage: 1134.0 },
  { start: "2015-01-01", end: "2015-06-30", wage: 1201.5 },
  { start: "2015-07-01", end: "2015-12-31", wage: 1273.5 },
  { start: "2016-01-01", end: "2016-12-31", wage: 1647.0 },
  { start: "2017-01-01", end: "2017-12-31", wage: 1777.5 },
  { start: "2018-01-01", end: "2018-12-31", wage: 2029.5 },
  { start: "2019-01-01", end: "2019-12-31", wage: 2558.4 },
  { start: "2020-01-01", end: "2020-12-31", wage: 2943.0 },
  { start: "2021-01-01", end: "2021-12-31", wage: 3577.5 },
  { start: "2022-01-01", end: "2022-06-30", wage: 5004.0 },
  { start: "2022-07-01", end: "2022-12-31", wage: 6471.0 },
  { start: "2023-01-01", end: "2023-06-30", wage: 10008.0 },
  { start: "2023-07-01", end: "2023-12-31", wage: 13414.5 },
  { start: "2024-01-01", end: "2024-12-31", wage: 20002.5 },
  { start: "2025-01-01", end: "2025-12-31", wage: 26005.5 },
  { start: "2026-01-01", end: "2026-12-31", wage: 33030.0 },
];

function parseDayMonth(s: string): { day: number; month: number } | null {
  if (!s) return null;
  const parts = s.split(".");
  if (parts.length !== 2) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { day, month };
}

function createSeasonalDateRange(
  dmStart: { day: number; month: number },
  dmEnd: { day: number; month: number },
  year: number,
): { start: string; end: string } | null {
  try {
    const s = new Date(year, dmStart.month - 1, dmStart.day);
    const e = new Date(year, dmEnd.month - 1, dmEnd.day);
    if (s.getDate() !== dmStart.day || e.getDate() !== dmEnd.day) return null;
    return { start: s.toISOString().split("T")[0], end: e.toISOString().split("T")[0] };
  } catch {
    return null;
  }
}

export function parseIsoDateLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function getExcludedDaysInPeriod(
  periodStart: string,
  periodEnd: string,
  excludedDays: ExcludedDay[] = [],
  ignoredWeekday?: number | null,
): number {
  if (excludedDays.length === 0) return 0;
  const ps = parseIsoDateLocal(periodStart);
  const pe = parseIsoDateLocal(periodEnd);
  if (!ps || !pe) return 0;
  const calendar = countAnnualLeaveCalendarDaysInWindow(ps, pe, excludedDays, ignoredWeekday ?? null);
  const ubgExtra = ubgExtraBalanceDaysInWindow(ps, pe, excludedDays);
  return calendar + ubgExtra;
}

export function calculateWeekCount(
  periodStart: string,
  periodEnd: string,
  excludedDays: ExcludedDay[] = [],
  ignoredWeekday?: number | null,
): number {
  const s = parseIsoDateLocal(periodStart);
  const e = parseIsoDateLocal(periodEnd);
  if (!s || !e) return 0;
  const totalDays = Math.ceil((e.getTime() - s.getTime()) / 86400000) + 1;
  const excluded = getExcludedDaysInPeriod(periodStart, periodEnd, excludedDays, ignoredWeekday ?? null);
  return Math.round(Math.max(0, totalDays - excluded) / 7);
}

/** Kullanım oranı sonrası hafta sayısını daima tam haftaya yukarı yuvarlar (34.5→35; 39→39). */
function ceilWeekCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  // Tam sayılarda floating-point sapmasını bozmamak için epsilon
  return Math.ceil(value - 1e-9);
}

export function adjustWeekCountForSeasonalUsage(
  originalWeekCount: number,
  periodStart: string,
  periodEnd: string,
  seasonalStartDayMonth: string,
  seasonalEndDayMonth: string,
  gunSayisi: number,
): number {
  const oran = gunSayisi === 4 ? 1.0 : gunSayisi === 3 ? 0.75 : gunSayisi === 2 ? 0.5 : 0.25;

  if (!seasonalStartDayMonth || !seasonalEndDayMonth) {
    if (oran === 1.0) return originalWeekCount;
    return ceilWeekCount(originalWeekCount * oran);
  }

  const dmStart = parseDayMonth(seasonalStartDayMonth);
  const dmEnd = parseDayMonth(seasonalEndDayMonth);
  if (!dmStart || !dmEnd) {
    if (oran === 1.0) return originalWeekCount;
    return ceilWeekCount(originalWeekCount * oran);
  }

  const ps = new Date(periodStart);
  const pe = new Date(periodEnd);
  let totalOverlapDays = 0;

  for (let year = ps.getFullYear(); year <= pe.getFullYear(); year++) {
    const sr = createSeasonalDateRange(dmStart, dmEnd, year);
    if (!sr) continue;
    const ss = new Date(sr.start);
    const se = new Date(sr.end);
    const os = new Date(Math.max(ps.getTime(), ss.getTime()));
    const oe = new Date(Math.min(pe.getTime(), se.getTime()));
    if (os > oe) continue;
    totalOverlapDays += Math.floor((oe.getTime() - os.getTime()) / 86400000) + 1;
  }

  return ceilWeekCount((totalOverlapDays / 7) * oran);
}

export function generateHaftaTatiliPeriods(
  workerStart: string,
  workerEnd: string,
): Array<{ start: string; end: string; wage: number }> {
  if (!workerStart || !workerEnd) return [];
  const ws = new Date(workerStart);
  const we = new Date(workerEnd);
  const periods: Array<{ start: string; end: string; wage: number }> = [];

  MIN_WAGE_TABLE.forEach((wp) => {
    const wps = new Date(wp.start);
    const wpe = new Date(wp.end);
    const effStart = ws > wps ? ws : wps;
    const effEnd = we < wpe ? we : wpe;
    if (effStart <= effEnd) {
      periods.push({
        start: effStart.toISOString().split("T")[0],
        end: effEnd.toISOString().split("T")[0],
        wage: wp.wage,
      });
    }
  });
  return periods;
}

export function getHaftaTatiliDaysForPeriod(
  periodStart: string,
  periodEnd: string,
  selectedHolidayIds: string[],
  excludedDays: ExcludedDay[] = [],
): number {
  const allIds = ALL_STATIC_HOLIDAYS.map((h) => h.id);
  const effectiveIds = selectedHolidayIds.length === 0 ? allIds : selectedHolidayIds;
  if (effectiveIds.length === 0) return 0;

  const ps = new Date(periodStart);
  const pe = new Date(periodEnd);
  const startYear = ps.getFullYear();
  const endYear = pe.getFullYear();

  const allHolidays: Holiday[] = [
    ...(nationalDays as Holiday[]),
    ...(officialHolidays as Holiday[]),
    ...(generalHolidays as Holiday[]),
    ...(religiousHolidays as Holiday[]),
  ];

  const FIXED_DATES: Record<string, { month: number; day: number }> = {
    "28-ekim": { month: 9, day: 28 },
    "29-ekim": { month: 9, day: 29 },
    "23-nisan": { month: 3, day: 23 },
    "19-mayis": { month: 4, day: 19 },
    "30-agustos": { month: 7, day: 30 },
    "1-ocak": { month: 0, day: 1 },
    "1-mayis": { month: 4, day: 1 },
    "15-temmuz": { month: 6, day: 15 },
  };

  let total = 0;

  effectiveIds.forEach((sid) => {
    const staticH = ALL_STATIC_HOLIDAYS.find((h) => h.id === sid);
    if (!staticH) return;

    const isReligious = STATIC_HOLIDAYS.religious.some((h) => h.id === sid);

    for (let year = startYear; year <= endYear; year++) {
      let holidayDate: Date | null = null;

      if (!isReligious && FIXED_DATES[sid]) {
        const { month, day } = FIXED_DATES[sid];
        holidayDate = new Date(year, month, day);
      } else if (isReligious) {
        const hName = staticH.name.toLowerCase();
        const isRamazan = hName.includes("ramazan");
        const isKurban = hName.includes("kurban");
        const isArife = hName.includes("arife");
        const match = allHolidays.find((h) => {
          if (new Date(h.date).getFullYear() !== year) return false;
          if (h.type !== "religious") return false;
          const hn = h.name.toLowerCase();
          if (isRamazan && !hn.includes("ramazan")) return false;
          if (isKurban && !hn.includes("kurban")) return false;
          if (isArife && !hn.includes("arife")) return false;
          if (!isArife && hn.includes("arife")) return false;
          if (!isArife) {
            if (sid === "ramazan-1" && !hn.includes("1. gün")) return false;
            if (sid === "ramazan-2" && !hn.includes("2. gün")) return false;
            if (sid === "ramazan-3" && !hn.includes("3. gün")) return false;
            if (sid === "kurban-1" && !hn.includes("1. gün")) return false;
            if (sid === "kurban-2" && !hn.includes("2. gün")) return false;
            if (sid === "kurban-3" && !hn.includes("3. gün")) return false;
            if (sid === "kurban-4" && !hn.includes("4. gün")) return false;
          }
          return true;
        });
        if (match) holidayDate = new Date(match.date);
      }

      if (holidayDate && holidayDate >= ps && holidayDate <= pe) {
        total += staticH.days;
      }
    }
  });

  const excluded = getExcludedDaysInPeriod(periodStart, periodEnd, excludedDays);
  return Math.max(0, total - excluded);
}

export function formatPeriodLabel(startISO: string, endISO: string): string {
  return `${formatDateTR(startISO)} - ${formatDateTR(endISO)}`;
}

export { formatDateTR };
