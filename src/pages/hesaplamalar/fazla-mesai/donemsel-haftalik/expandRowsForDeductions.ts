/**
 * Haftalık Karma — UBGT/yıllık izin 7-gün pencere + legacy (Rapor/Diğer/Puantaj) split.
 * V3 expandHaftalikKarmaRowsForDeductions mantığı (izolasyon).
 */

import { getAsgariUcretByDate } from "./asgariUcret";
import type { ExclusionItem, PeriodRow, SeasonalHaftalikPattern } from "./model";
import { countWeeksBySevenDaySteps } from "./preserveWeeks";
import { createDefaultSummerPattern } from "./model";
import {
  filterExclusionsForWeeklyOff,
  normalizeFmDeductionDaysFiltered,
  parseFmDate,
} from "../shared/deductionCore";

export type SeasonalDeductionContext = {
  summerPattern: SeasonalHaftalikPattern;
  winterPattern: SeasonalHaftalikPattern;
  summerMonths: number[];
};

export function resolveSeasonalPatternForDate(
  dateISO: string,
  ctx: SeasonalDeductionContext,
): SeasonalHaftalikPattern {
  const head = String(dateISO || "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  const month = m ? Number(m[2]) : 0;
  const summerMonths = ctx.summerMonths?.length ? ctx.summerMonths : ctx.summerPattern.months ?? [];
  return summerMonths.includes(month) ? ctx.summerPattern : ctx.winterPattern;
}

const LEGACY_ONLY_EXCLUSION_TYPES = new Set([
  "Rapor",
  "Diğer",
  "Puantaj/Bordro",
  "Puantaj-Bordro",
]);

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

function isLegacyOnlyExclusionType(type: string): boolean {
  return LEGACY_ONLY_EXCLUSION_TYPES.has(String(type || "").trim());
}

export function exclusionsNeedLegacySplit(exclusions: ExclusionItem[]): boolean {
  if (!exclusions?.length) return false;
  return exclusions.some((ex) => isLegacyOnlyExclusionType(String(ex.type || "")));
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

/** V3 calculateFm — uzun dönemde haftalık FM sabiti; düşüm satırında günlük formül. */
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
  const span = a && b && b >= a ? Math.floor((b.getTime() - a.getTime()) / 86400000) + 1 : 0;
  const isBlockRow = row.isExclusionBlock === true;
  const hasExclusionDeduction = excl > 0 || isBlockRow;
  const workedDays = isBlockRow ? Math.max(0, hg - excl) : Math.max(0, seg - excl);
  const raw = dailyNet * workedDays - WEEKLY_LIMIT;
  const keepWeeklyFm = !hasExclusionDeduction && span > 7;
  const fmHours = keepWeeklyFm ? baselineFm : Math.max(0, raw);
  return { ...row, excludedDays: excl, fmHours };
}

function expandWithMotor(
  rows: PeriodRow[],
  exclusionsForMotor: ExclusionItem[],
  weeklyOffDay: number | null,
  seasonalCtx?: SeasonalDeductionContext,
): PeriodRow[] {
  const out: PeriodRow[] = [];
  const allNormalized = normalizeFmDeductionDaysFiltered(exclusionsForMotor);

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
        yillikIzinAciklama: undefined,
        isDeductionRow: false,
        donemselHaftalikDeduction: undefined,
      });
    }

    windows.forEach((win, winIdx) => {
      const b0 = parseLocalDay(win.startISO);
      const b1 = parseLocalDay(win.endISO);
      const seg = b0 && b1 && b0 <= b1 ? countWorkDaysInInclusiveRange(b0, b1, weeklyOffDay) : 0;
      const brut = getAsgariUcretByDate(win.startISO) ?? row.brut;
      const deductionDates = win.deductions.map((d) => ({
        dateISO: d.dateISO,
        dayWeight: d.dayWeight,
      }));
      const pattern =
        seasonalCtx != null
          ? resolveSeasonalPatternForDate(win.startISO, seasonalCtx)
          : row.donemselHaftalikDeduction?.pattern ??
            createDefaultSummerPattern();
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
        note: undefined,
        yillikIzinAciklama: win.caption || undefined,
        isExclusionBlock: true,
        isDeductionRow: true,
        prePreserveWeeks: 1,
        donemselHaftalikDeduction: { pattern, deductionDates },
      });
    });
  });

  return out.length > 0 ? out : rows;
}

/** Legacy: Rapor/Diğer/Puantaj → splitByExclusions benzeri. */
function splitByExclusions(
  rows: PeriodRow[],
  exclusions: ExclusionItem[],
  weeklyOffDay: number | null,
): PeriodRow[] {
  const FM_TYPES = new Set([
    "Yıllık İzin",
    "UBGT",
    "Rapor",
    "Diğer",
    "Puantaj/Bordro",
    "Puantaj-Bordro",
  ]);

  const anchors: Date[] = [];
  for (const ex of exclusions) {
    if (!FM_TYPES.has(String(ex.type || ""))) continue;
    const s = parseLocalDay(ex.start);
    const e = parseLocalDay(ex.end);
    if (!s || !e || s > e) continue;
    const cap = Number(ex.days) > 0 && Number.isFinite(Number(ex.days)) ? Math.floor(Number(ex.days)) : null;
    let used = 0;
    let cur = new Date(s);
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      if (isWorkDay(cur, weeklyOffDay)) {
        anchors.push(startOfLocalDay(cur));
        if (cap != null) used += 1;
      }
      cur = addDays(cur, 1);
    }
  }
  anchors.sort((a, b) => a.getTime() - b.getTime());
  const seen = new Set<string>();
  const uniq: Date[] = [];
  for (const d of anchors) {
    const k = toISODate(d);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(d);
  }

  type MergedBlock = { start: Date; end: Date; anchors: Date[] };
  const blocks: MergedBlock[] = [];
  {
    let i = 0;
    while (i < uniq.length) {
      const start = startOfLocalDay(uniq[i]);
      const end = addDays(start, 6);
      const group: Date[] = [];
      while (i < uniq.length && uniq[i].getTime() <= end.getTime()) {
        group.push(startOfLocalDay(uniq[i]));
        i += 1;
      }
      blocks.push({ start, end, anchors: group });
    }
  }

  if (blocks.length === 0) return enrichRowsWithoutDeductions(rows, weeklyOffDay);

  const out: PeriodRow[] = [];
  for (const row of rows) {
    const rowStart = parseLocalDay(row.startISO || "");
    const rowEnd = parseLocalDay(row.endISO || "");
    if (!rowStart || !rowEnd || rowEnd < rowStart) {
      out.push({ ...row, prePreserveWeeks: Math.max(0, Math.floor(Number(row.weeks) || 0)) });
      continue;
    }

    const overlapping = blocks
      .filter((b) => !(b.end < rowStart || b.start > rowEnd))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (overlapping.length === 0) {
      out.push(...enrichRowsWithoutDeductions([row], weeklyOffDay));
      continue;
    }

    const segmentMain = countWorkDaysInInclusiveRange(rowStart, rowEnd, weeklyOffDay);
    let blockWeeksSum = 0;
    const blockMeta: Array<{ b0: Date; b1: Date; w: number; excl: number; seg: number }> = [];
    for (const blk of overlapping) {
      const b0 = rowStart > blk.start ? rowStart : blk.start;
      const b1 = rowEnd < blk.end ? rowEnd : blk.end;
      if (b0 > b1) continue;
      const wBlk = countWeeksBySevenDaySteps(b0, b1);
      blockWeeksSum += wBlk;
      const anchorsInSlice = blk.anchors.filter((d) => d >= b0 && d <= b1);
      const seg = countWorkDaysInInclusiveRange(b0, b1, weeklyOffDay);
      blockMeta.push({ b0, b1, w: wBlk, excl: anchorsInSlice.length, seg });
    }

    const W =
      Math.max(0, Math.floor(Number(row.weeks) || 0)) || countWeeksBySevenDaySteps(rowStart, rowEnd);
    const mainWeeks = Math.max(0, W - blockWeeksSum);

    out.push({
      ...row,
      startISO: toISODate(rowStart),
      endISO: toISODate(rowEnd),
      segmentWorkDays: segmentMain,
      excludedDays: 0,
      isExclusionBlock: false,
      prePreserveWeeks: mainWeeks,
      note: undefined,
      yillikIzinAciklama: undefined,
      isDeductionRow: false,
    });

    for (const bm of blockMeta) {
      const startISO = toISODate(bm.b0);
      const endISO = toISODate(bm.b1);
      const brut = getAsgariUcretByDate(startISO) ?? row.brut;
      const caption = bm.excl > 0 ? `(${bm.excl} gün dışlama düşülmüştür)` : "";
      out.push({
        ...row,
        id: `${row.id}-b-${startISO}`,
        startISO,
        endISO,
        brut,
        segmentWorkDays: bm.seg,
        excludedDays: bm.excl,
        note: undefined,
        yillikIzinAciklama: caption || undefined,
        isExclusionBlock: true,
        isDeductionRow: true,
        prePreserveWeeks: bm.w,
      });
    }
  }

  return out;
}

export function expandRowsForDeductions(params: {
  rows: PeriodRow[];
  exclusions: ExclusionItem[];
  weeklyOffDay: number | null;
  seasonalDeductionContext?: SeasonalDeductionContext;
}): PeriodRow[] {
  const { rows, exclusions, weeklyOffDay, seasonalDeductionContext } = params;
  if (!rows.length) return rows;
  if (!exclusions?.length) return enrichRowsWithoutDeductions(rows, weeklyOffDay);

  const exclusionsForDeduction = filterExclusionsForWeeklyOff(exclusions, weeklyOffDay);

  if (exclusionsNeedLegacySplit(exclusions)) {
    return splitByExclusions(rows, exclusionsForDeduction, weeklyOffDay);
  }

  return expandWithMotor(rows, exclusionsForDeduction, weeklyOffDay, seasonalDeductionContext);
}
