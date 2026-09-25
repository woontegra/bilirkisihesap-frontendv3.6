/**
 * Yeraltı İşçileri — UBGT / yıllık izin düşüm satırı (V3 `expandYeraltiRowsForDeductions.ts` birebir).
 */

import { getAsgariUcretByDate } from "../asgariUcret";
import type { ExclusionItem, FmRow, SevenDayMode } from "../model";
import {
  buildSevenDayDeductionWindows,
  filterExclusionsForWeeklyOff,
  normalizeDeductionDays,
  parseFmDate,
} from "../../shared/deductionCore";

const LEGACY_ONLY_EXCLUSION_TYPES = new Set(["Rapor", "Diğer", "Puantaj-Bordro"]);
const EPS = 1e-7;

export type YeraltiExpandFmParams = {
  dailyNet: number;
  hg: number;
  weeklyOffDay: number | null;
  davaciSevenDay: SevenDayMode;
  applyLeaveFmAdj: (h: number) => number;
};

export type ExpandYeraltiRowsForDeductionsOptions = {
  weeklyOffDay: number | null;
  fmParams?: YeraltiExpandFmParams;
};

function applyYargitayRoundingYeralti(decimalHours: number): number {
  const hours = Math.floor(decimalHours);
  const fractionalPart = decimalHours - hours;
  const minutes = Math.round(fractionalPart * 60);
  if (minutes === 0) return hours;
  if (minutes <= 30) return hours + 0.5;
  return hours + 1;
}

const WEEKLY_WORK_LIMIT_Y = 37.5;
const DAILY_REF = 6.25;

function remainingNetWeeklyForYeraltiDeduction(
  dailyNet: number,
  weeklyWorkingDays: number,
  excludedUnits: number,
  davaciSevenDay: SevenDayMode,
): number {
  const hgSafe = Math.max(1, Math.min(7, Math.floor(weeklyWorkingDays) || 6));
  const excl = Math.max(0, Math.min(hgSafe, excludedUnits));
  if (hgSafe !== 7) return Math.max(0, (hgSafe - excl) * dailyNet);
  if (davaciSevenDay === "tatilsiz") return Math.max(0, (7 - excl) * dailyNet);
  const holidayExtra = Math.max(0, dailyNet - DAILY_REF);
  return Math.max(0, 6 * dailyNet + holidayExtra - excl * dailyNet);
}

function yeraltiFmHoursForDeductionWeek(
  fmParams: YeraltiExpandFmParams,
  excludedUnits: number,
): number {
  const remainingNetWeekly = remainingNetWeeklyForYeraltiDeduction(
    fmParams.dailyNet,
    fmParams.hg,
    excludedUnits,
    fmParams.davaciSevenDay,
  );
  const totalRounded = applyYargitayRoundingYeralti(remainingNetWeekly);
  let fmWeek = Math.max(0, totalRounded - WEEKLY_WORK_LIMIT_Y);
  fmWeek = fmParams.applyLeaveFmAdj(fmWeek);
  return fmWeek;
}

function yeraltiFmNet(weeks: number, brut: number, kats: number, fmHours: number): number {
  const step1 = Number((weeks * brut * kats * fmHours).toFixed(6));
  const step2 = Number((step1 / 187.5).toFixed(6));
  const step3 = Number((step2 * 2).toFixed(6));
  return Number(step3.toFixed(2));
}

export function exclusionsNeedLegacySplit(exclusions: ExclusionItem[]): boolean {
  if (!exclusions?.length) return false;
  return exclusions.some((ex) => LEGACY_ONLY_EXCLUSION_TYPES.has(String(ex.type || "").trim()));
}

function buildCombinedNormalRow(
  sourceRow: FmRow,
  rowIdx: number,
  periodStartISO: string,
  periodEndISO: string,
  baseWeeks: number,
): FmRow {
  const kats = sourceRow.katsayi ?? 1;
  const fmHours = sourceRow.fmHours ?? 0;
  const brut = sourceRow.brut ?? getAsgariUcretByDate(periodStartISO) ?? 0;
  return {
    ...sourceRow,
    id: `yr-base-${rowIdx}-${periodStartISO}-${periodEndISO}`,
    startISO: periodStartISO,
    endISO: periodEndISO,
    weeks: baseWeeks,
    brut,
    katsayi: kats,
    fmHours,
    fm: yeraltiFmNet(baseWeeks, brut, kats, fmHours),
    isDeductionRow: false,
    note: undefined,
  };
}

function mapWindowToRow(
  win: {
    startISO: string;
    endISO: string;
    totalDeductionDayUnits: number;
    caption: string;
  },
  sourceRow: FmRow,
  rowIdx: number,
  winIdx: number,
  fmParams: YeraltiExpandFmParams | undefined,
): FmRow {
  const brut = getAsgariUcretByDate(win.startISO) ?? sourceRow.brut;
  const kats = sourceRow.katsayi ?? 1;
  let fmHours = sourceRow.fmHours ?? 0;
  if (fmParams && win.totalDeductionDayUnits > EPS) {
    fmHours = yeraltiFmHoursForDeductionWeek(fmParams, win.totalDeductionDayUnits);
  }
  return {
    ...sourceRow,
    id: `yr-ded-${rowIdx}-${winIdx}-${win.startISO}-${win.endISO}`,
    startISO: win.startISO,
    endISO: win.endISO,
    weeks: 1,
    brut,
    katsayi: kats,
    fmHours,
    fm: yeraltiFmNet(1, brut, kats, fmHours),
    isDeductionRow: true,
    note: win.caption || undefined,
  };
}

function expandWithMotor(
  rows: FmRow[],
  exclusionsForMotor: ExclusionItem[],
  fmParams: YeraltiExpandFmParams | undefined,
): FmRow[] {
  const out: FmRow[] = [];
  const allNormalized = normalizeDeductionDays(exclusionsForMotor);

  rows.forEach((row, rowIdx) => {
    if (row.isManual) {
      out.push(row);
      return;
    }
    const startISO = row.startISO;
    const endISO = row.endISO;
    const w0 = row.weeks ?? 0;
    if (!startISO || !endISO || w0 <= 0) {
      out.push(row);
      return;
    }

    const periodStart = parseFmDate(startISO);
    const periodEnd = parseFmDate(endISO);
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      out.push(row);
      return;
    }

    const daysInPeriod = allNormalized.filter((d) => {
      const dd = parseFmDate(d.dateISO);
      return dd && dd >= periodStart && dd <= periodEnd;
    });

    if (daysInPeriod.length === 0) {
      out.push(row);
      return;
    }

    const windows = buildSevenDayDeductionWindows(daysInPeriod, periodEnd);
    if (windows.length === 0) {
      out.push(row);
      return;
    }

    const originalWeeks = Math.max(0, Math.floor(Number(w0) || 0));
    const baseWeeks = Math.max(0, originalWeeks - windows.length);

    if (baseWeeks > 0) {
      out.push(buildCombinedNormalRow(row, rowIdx, startISO, endISO, baseWeeks));
    }

    windows.forEach((win, winIdx) => {
      const dedRow = mapWindowToRow(win, row, rowIdx, winIdx, fmParams);
      if (fmParams && dedRow.fmHours <= EPS) return;
      out.push(dedRow);
    });
  });

  return out.length > 0 ? out : rows;
}

/** V3 YeraltiIsciPage: tanık FM + birleştirmeden sonra expand. */
export function expandYeraltiRowsForDeductions(
  rows: FmRow[],
  exclusions: ExclusionItem[] | null | undefined,
  options: ExpandYeraltiRowsForDeductionsOptions,
): FmRow[] {
  const { weeklyOffDay, fmParams } = options;
  if (!rows.length) return rows;
  if (!exclusions?.length) return rows;

  const exclusionsForMotor = filterExclusionsForWeeklyOff(exclusions, weeklyOffDay);
  return expandWithMotor(rows, exclusionsForMotor, fmParams);
}
