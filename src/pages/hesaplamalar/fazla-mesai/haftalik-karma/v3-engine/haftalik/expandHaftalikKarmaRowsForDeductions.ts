/**
 * Haftalık Karma — UBGT / yıllık izin düşüm satırı köprüsü.
 * Düşüm günleri 7 günlük pencerelere yerleştirilir; her pencere 1 hafta düşüme karşılık gelir.
 * FM/tutar: sayfa pipeline (calculateFm, calculateWeeklyKarmaDeductionFmHours, preserveWeeks, calculateRowMoney).
 */

import { addDays } from "date-fns";
import type { ExcludedDay } from "../types/exclusionStorage";
import type { FazlaMesaiRowBase } from "../lib/fazlaMesaiShared";
import { getAsgariUcretByDate } from "../lib/fazlaMesaiShared";
import {
  normalizeDeductionDays,
  parseFmDate,
  type NormalizedDeductionOnDate,
} from "../lib/fazlaMesai/deductionPeriodEngine";
import { splitByExclusions } from "../rules/splitByExclusions.rule";
import { countWeeksBySevenDaySteps } from "../rules/preserveWeeks.rule";
import { filterExclusionsForWeeklyOff } from "../lib/fazlaMesai/weeklyOffExclusionFilter";

const LEGACY_ONLY_EXCLUSION_TYPES = new Set(["Rapor", "Diğer", "Puantaj/Bordro"]);

export interface ExpandHaftalikKarmaRowsForDeductionsParams {
  rows: FazlaMesaiRowBase[];
  exclusions: ExcludedDay[];
  weeklyOffDay: number | null;
}

function isLegacyOnlyExclusionType(type: string): boolean {
  return LEGACY_ONLY_EXCLUSION_TYPES.has(String(type || "").trim());
}

export function exclusionsNeedLegacySplit(exclusions: ExcludedDay[]): boolean {
  if (!exclusions?.length) return false;
  return exclusions.some((ex) => isLegacyOnlyExclusionType(String(ex.type || "")));
}

function parseIsoDateLocal(iso: string): Date | null {
  return parseFmDate(iso);
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

function enrichRowsWithoutDeductions(
  rows: FazlaMesaiRowBase[],
  weeklyOffDay: number | null,
): FazlaMesaiRowBase[] {
  return rows.map((row) => {
    const s = String(row.startISO || "").slice(0, 10);
    const e = String(row.endISO || "").slice(0, 10);
    const a = parseIsoDateLocal(s);
    const b = parseIsoDateLocal(e);
    const seg = a && b && a <= b ? countWorkDaysInInclusiveRange(a, b, weeklyOffDay) : 0;
    const Wpre =
      a && b && a <= b
        ? Math.max(0, Math.floor(Number(row.weeks) || 0)) || countWeeksBySevenDaySteps(a, b)
        : Math.max(0, Math.floor(Number(row.weeks) || 0));
    return {
      ...row,
      segmentWorkDays: seg,
      excludedDays: 0,
      totalDays: seg,
      isExclusionBlock: false,
      prePreserveWeeks: Wpre,
    } as FazlaMesaiRowBase;
  });
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildCombinedNormalRow(
  sourceRow: FazlaMesaiRowBase,
  rowIdx: number,
  periodStartISO: string,
  periodEndISO: string,
  baseWeeks: number,
  originalWeeks: number,
  weeklyOffDay: number | null,
): FazlaMesaiRowBase {
  const rowStart = parseIsoDateLocal(periodStartISO);
  const rowEnd = parseIsoDateLocal(periodEndISO);
  const segmentMain =
    rowStart && rowEnd && rowStart <= rowEnd
      ? countWorkDaysInInclusiveRange(rowStart, rowEnd, weeklyOffDay)
      : 0;

  return {
    ...sourceRow,
    id: `auto-base-${rowIdx}-${periodStartISO}-${periodEndISO}`,
    startISO: periodStartISO,
    endISO: periodEndISO,
    rangeLabel: `${periodStartISO} – ${periodEndISO}`,
    weeks: baseWeeks,
    originalWeekCount: originalWeeks,
    segmentWorkDays: segmentMain,
    excludedDays: 0,
    totalDays: segmentMain,
    isExclusionBlock: false,
    prePreserveWeeks: baseWeeks,
    yillikIzinAciklama: undefined,
  } as FazlaMesaiRowBase;
}

interface DeductionWindow {
  startISO: string;
  endISO: string;
  deductions: NormalizedDeductionOnDate[];
  totalDeductionDayUnits: number;
  caption: string;
}

function formatDayUnits(n: number): string {
  if (Math.abs(n - 0.5) < 1e-6) return "0,5";
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return String(n).replace(".", ",");
}

function formatWindowCaption(deductions: NormalizedDeductionOnDate[]): string {
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

/** Düşüm günlerini 7 günlük pencerelere böler; bitişik pencereler birleştirilmez. */
function buildSevenDayWindows(
  normalizedDays: NormalizedDeductionOnDate[],
  periodEnd: Date,
): DeductionWindow[] {
  if (normalizedDays.length === 0) return [];
  const sorted = [...normalizedDays].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const windows: DeductionWindow[] = [];
  let i = 0;
  while (i < sorted.length) {
    const firstDay = parseFmDate(sorted[i].dateISO);
    if (!firstDay) { i++; continue; }
    const windowEnd = addDays(firstDay, 6);
    const group: NormalizedDeductionOnDate[] = [];
    while (i < sorted.length) {
      const d = parseFmDate(sorted[i].dateISO);
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

function mapWindowToRow(
  win: DeductionWindow,
  sourceRow: FazlaMesaiRowBase,
  rowIdx: number,
  winIdx: number,
  weeklyOffDay: number | null,
): FazlaMesaiRowBase {
  const b0 = parseFmDate(win.startISO);
  const b1 = parseFmDate(win.endISO);
  const seg = b0 && b1 && b0 <= b1 ? countWorkDaysInInclusiveRange(b0, b1, weeklyOffDay) : 0;
  const excludedDays = win.totalDeductionDayUnits;
  const brut = getAsgariUcretByDate(win.startISO) ?? sourceRow.brut;

  return {
    ...sourceRow,
    id: `auto-ded-${rowIdx}-${winIdx}-${win.startISO}-${win.endISO}`,
    startISO: win.startISO,
    endISO: win.endISO,
    rangeLabel: `${win.startISO} – ${win.endISO}`,
    weeks: 1,
    originalWeekCount: 1,
    brut,
    segmentWorkDays: seg,
    excludedDays,
    totalDays: seg,
    yillikIzinAciklama: win.caption || undefined,
    isExclusionBlock: true,
    prePreserveWeeks: 1,
    karmaDeductionDates: win.deductions.map((d) => ({
      dateISO: d.dateISO,
      dayWeight: d.dayWeight,
    })),
  } as FazlaMesaiRowBase;
}

function expandWithMotor(
  rows: FazlaMesaiRowBase[],
  exclusionsForMotor: ExcludedDay[],
  weeklyOffDay: number | null,
): FazlaMesaiRowBase[] {
  const out: FazlaMesaiRowBase[] = [];
  const allNormalized = normalizeDeductionDays(exclusionsForMotor);

  rows.forEach((row, rowIdx) => {
    const startISO = row.startISO;
    const endISO = row.endISO;
    const w0 = row.weeks ?? 0;
    if (!startISO || !endISO || w0 <= 0) {
      out.push(row);
      return;
    }

    const periodStart = parseIsoDateLocal(startISO);
    const periodEnd = parseIsoDateLocal(endISO);
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      out.push(...enrichRowsWithoutDeductions([row], weeklyOffDay));
      return;
    }

    const daysInPeriod = allNormalized.filter((d) => {
      const dd = parseFmDate(d.dateISO);
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

    const originalWeeks = Math.max(
      0,
      Math.floor(Number(row.originalWeekCount ?? w0) || 0),
    );
    const deductionWeekCount = windows.length;
    const baseWeeks = Math.max(0, originalWeeks - deductionWeekCount);

    if (baseWeeks > 0) {
      out.push(
        buildCombinedNormalRow(row, rowIdx, startISO, endISO, baseWeeks, originalWeeks, weeklyOffDay),
      );
    }

    windows.forEach((win, winIdx) => {
      out.push(mapWindowToRow(win, row, rowIdx, winIdx, weeklyOffDay));
    });
  });

  return out.length > 0 ? out : rows;
}

/**
 * UBGT/yıllık izin: 7 günlük pencere bazlı düşüm (bitişik pencereler birleştirilmez).
 * Rapor/Diğer/Puantaj vb.: splitByExclusions fallback.
 */
export function expandHaftalikKarmaRowsForDeductions(
  params: ExpandHaftalikKarmaRowsForDeductionsParams,
): FazlaMesaiRowBase[] {
  const { rows, exclusions, weeklyOffDay } = params;
  if (!rows.length) return rows;
  if (!exclusions?.length) {
    return enrichRowsWithoutDeductions(rows, weeklyOffDay);
  }

  const exclusionsForDeduction = filterExclusionsForWeeklyOff(exclusions, weeklyOffDay);

  if (exclusionsNeedLegacySplit(exclusions)) {
    return splitByExclusions(rows, exclusionsForDeduction, { weeklyOffDay });
  }

  return expandWithMotor(rows, exclusionsForDeduction, weeklyOffDay);
}
