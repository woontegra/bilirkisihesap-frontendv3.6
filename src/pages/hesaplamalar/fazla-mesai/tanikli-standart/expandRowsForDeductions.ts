/**
 * V3 `expandTanikliRowsForDeductions` — UBGT / yıllık izin 7 günlük pencere yolu.
 * Rapor / Diğer / Puantaj-Bordro hesabı etkilemez (yalnızca kayıt); legacy split yok.
 */

import { getAsgariUcretByDate } from "./asgariUcret";
import type { ExclusionItem, PeriodRow, SevenDayMode } from "./model";
import { countWeeksBySevenDaySteps } from "./preserveWeeks";
import { normalizeFmDeductionDays, parseFmDate } from "../shared/deductionCore";

type NormalizedDay = { dateISO: string; dayWeight: number; kind: "UBGT" | "YILLIK_IZIN" };

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLocalDay(iso: string): Date | null {
  return parseFmDate(iso);
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return startOfLocalDay(next);
}

function isWorkDay(d: Date, weeklyOff: number | null): boolean {
  if (weeklyOff == null) return true;
  return d.getDay() !== weeklyOff;
}

function countWorkDaysInInclusiveRange(start: Date, end: Date, weeklyOff: number | null): number {
  let n = 0;
  let cur = new Date(start);
  while (cur <= end) {
    if (isWorkDay(cur, weeklyOff)) n += 1;
    cur = addDays(cur, 1);
  }
  return n;
}

function formatDayUnits(n: number): string {
  if (Math.abs(n - 0.5) < 1e-6) return "0,5";
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return String(n).replace(".", ",");
}

function formatWindowCaption(deductions: NormalizedDay[]): string {
  if (deductions.length === 0) return "";
  const ubgtUnits = deductions.filter((d) => d.kind === "UBGT").reduce((s, d) => s + d.dayWeight, 0);
  const izinUnits = deductions.filter((d) => d.kind === "YILLIK_IZIN").reduce((s, d) => s + d.dayWeight, 0);
  const parts: string[] = [];
  if (ubgtUnits > 0) parts.push(`${formatDayUnits(ubgtUnits)} gün UBGT`);
  if (izinUnits > 0) parts.push(`${formatDayUnits(izinUnits)} gün yıllık izin`);
  if (parts.length === 0) return "";
  if (parts.length === 1) return `(${parts[0]} düşülmüştür)`;
  return `(${parts.join(" + ")} düşülmüştür)`;
}

type DeductionWindow = {
  startISO: string;
  endISO: string;
  deductions: NormalizedDay[];
  totalDeductionDayUnits: number;
  caption: string;
};

function buildSevenDayWindows(normalizedDays: NormalizedDay[], periodEnd: Date): DeductionWindow[] {
  if (normalizedDays.length === 0) return [];
  const sorted = [...normalizedDays].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const windows: DeductionWindow[] = [];
  let i = 0;
  while (i < sorted.length) {
    const firstDay = parseLocalDay(sorted[i].dateISO);
    if (!firstDay) {
      i++;
      continue;
    }
    const windowEnd = addDays(firstDay, 6);
    const group: NormalizedDay[] = [];
    while (i < sorted.length) {
      const d = parseLocalDay(sorted[i].dateISO);
      if (!d || d > windowEnd) break;
      group.push(sorted[i]);
      i++;
    }
    const clippedEnd = windowEnd > periodEnd ? periodEnd : windowEnd;
    windows.push({
      startISO: toISODate(firstDay),
      endISO: toISODate(clippedEnd),
      deductions: group,
      totalDeductionDayUnits: group.reduce((s, d) => s + d.dayWeight, 0),
      caption: formatWindowCaption(group),
    });
  }
  return windows;
}

function enrichRowsWithoutDeductions(rows: PeriodRow[], weeklyOffDay: number | null): PeriodRow[] {
  return rows.map((row) => {
    const a = parseLocalDay(row.startISO || "");
    const b = parseLocalDay(row.endISO || "");
    const seg = a && b && a <= b ? countWorkDaysInInclusiveRange(a, b, weeklyOffDay) : 0;
    const Wpre =
      a && b && a <= b
        ? Math.max(0, Math.floor(Number(row.weeks) || 0)) || countWeeksBySevenDaySteps(a, b)
        : Math.max(0, Math.floor(Number(row.weeks) || 0));
    return {
      ...row,
      segmentWorkDays: seg,
      excludedDays: 0,
      isExclusionBlock: false,
      prePreserveWeeks: Wpre,
    };
  });
}

const WEEKLY_LIMIT = 45;

/** V3 calculateFm.rule — uzun dönemde haftalık FM sabiti; düşüm satırında günlük formül. */
export function calculateFm(row: PeriodRow): PeriodRow {
  const dailyNetDirect = Number(row.dailyNet);
  const hg = Math.max(1, Math.min(7, Math.floor(Number(row.annualLeaveHg) || 6)));
  const baselineFm = Math.max(0, Number(row.fmHours) || 0);
  const dailyNet =
    Number.isFinite(dailyNetDirect) && dailyNetDirect > 0
      ? dailyNetDirect
      : hg > 0
        ? (baselineFm + WEEKLY_LIMIT) / hg
        : 0;
  const seg = Math.max(0, Math.floor(Number(row.segmentWorkDays) || 0));
  const excl = Math.max(0, Number(row.excludedDays) || 0);
  const a = parseLocalDay(row.startISO || "");
  const b = parseLocalDay(row.endISO || "");
  const span =
    a && b && b >= a ? Math.floor((b.getTime() - a.getTime()) / 86400000) + 1 : 0;
  const isBlockRow = row.isExclusionBlock === true;
  const hasExclusionDeduction = excl > 0 || isBlockRow;
  const workedDays = isBlockRow ? Math.max(0, hg - excl) : Math.max(0, seg - excl);
  const raw = dailyNet * workedDays - WEEKLY_LIMIT;
  const keepWeeklyFm = !hasExclusionDeduction && span > 7;
  const fmHours = keepWeeklyFm ? baselineFm : Math.max(0, raw);
  return {
    ...row,
    excludedDays: excl,
    fmHours,
  };
}

export function expandRowsForDeductions(params: {
  rows: PeriodRow[];
  exclusions: ExclusionItem[];
  weeklyOffDay: number | null;
}): PeriodRow[] {
  const { rows, exclusions, weeklyOffDay } = params;
  if (!rows.length) return rows;
  if (!exclusions?.length) return enrichRowsWithoutDeductions(rows, weeklyOffDay);

  const allNormalized = normalizeFmDeductionDays(exclusions, weeklyOffDay);
  if (allNormalized.length === 0) return enrichRowsWithoutDeductions(rows, weeklyOffDay);

  const out: PeriodRow[] = [];

  rows.forEach((row, rowIdx) => {
    const startISO = row.startISO;
    const endISO = row.endISO;
    const w0 = row.weeks ?? 0;
    if (!startISO || !endISO || w0 <= 0) {
      out.push(row);
      return;
    }

    const periodStart = parseLocalDay(startISO);
    const periodEnd = parseLocalDay(endISO);
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      out.push(...enrichRowsWithoutDeductions([row], weeklyOffDay));
      return;
    }

    const daysInPeriod = allNormalized.filter((d) => {
      const dd = parseLocalDay(d.dateISO);
      return dd && dd >= periodStart && dd <= periodEnd;
    });

    if (daysInPeriod.length === 0) {
      out.push(...enrichRowsWithoutDeductions([row], weeklyOffDay));
      return;
    }

    const windows = buildSevenDayWindows(daysInPeriod, periodEnd);
    if (windows.length === 0) {
      out.push(...enrichRowsWithoutDeductions([row], weeklyOffDay));
      return;
    }

    const originalWeeks = Math.max(0, Math.floor(Number(row.originalWeekCount ?? w0) || 0));
    const baseWeeks = Math.max(0, originalWeeks - windows.length);

    if (baseWeeks > 0) {
      const segMain = countWorkDaysInInclusiveRange(periodStart, periodEnd, weeklyOffDay);
      out.push({
        ...row,
        id: `auto-base-${rowIdx}-${startISO}-${endISO}`,
        startISO,
        endISO,
        weeks: baseWeeks,
        originalWeekCount: originalWeeks,
        segmentWorkDays: segMain,
        excludedDays: 0,
        isExclusionBlock: false,
        prePreserveWeeks: baseWeeks,
        note: undefined,
        isDeductionRow: false,
      });
    }

    windows.forEach((win, winIdx) => {
      const b0 = parseLocalDay(win.startISO);
      const b1 = parseLocalDay(win.endISO);
      const seg = b0 && b1 && b0 <= b1 ? countWorkDaysInInclusiveRange(b0, b1, weeklyOffDay) : 0;
      const brut = getAsgariUcretByDate(win.startISO) ?? row.brut;
      out.push({
        ...row,
        id: `auto-ded-${rowIdx}-${winIdx}-${win.startISO}-${win.endISO}`,
        startISO: win.startISO,
        endISO: win.endISO,
        weeks: 1,
        originalWeekCount: 1,
        brut,
        segmentWorkDays: seg,
        excludedDays: win.totalDeductionDayUnits,
        note: win.caption || undefined,
        isExclusionBlock: true,
        isDeductionRow: true,
        prePreserveWeeks: 1,
      });
    });
  });

  return out.length > 0 ? out : rows;
}

export type { SevenDayMode };
