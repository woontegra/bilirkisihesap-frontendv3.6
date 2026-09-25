/**
 * Gemi Adamı 7/24 — UBGT / yıllık izin düşüm (V3 `expandGemi724RowsForDeductions.ts` ile aynı).
 */

import { getAsgariUcretByDate } from "./asgariUcret";
import { DAILY_NET_HOURS, FAZLA_MESAI_DENOMINATOR, FAZLA_MESAI_KATSAYI, LEAVE_HOURS, WEEKLY_WORK_LIMIT } from "./constants";
import { expandGemiRowsAnnualLeaveUbgt, type GemiExpandParams } from "./gemiAnnualLeaveUbgtExpand";
import type { ExclusionItem, PeriodRow } from "./model";
import { normalizeDeductionDays, parseFmDate, buildSevenDayDeductionWindows } from "../shared/deductionCore";

const LEGACY_ONLY_EXCLUSION_TYPES = new Set(["Rapor", "Diğer", "Puantaj/Bordro"]);
const DAMGA_ORANI = 0.00759;
const GELIR_VERGISI_ORANI = 0.15;
const EPS = 1e-7;

export interface ExpandGemi724RowsOptions {
  weeklyOffDay: number | null;
  applyYargitay270FmDeduction?: boolean;
}

function gemi724FmNet(weeks: number, brut: number, kats: number, fmHours: number): { fm: number; net: number } {
  const step1 = Number((weeks * brut * kats * fmHours).toFixed(6));
  const step2 = Number((step1 / FAZLA_MESAI_DENOMINATOR).toFixed(6));
  const step3 = Number((step2 * FAZLA_MESAI_KATSAYI).toFixed(6));
  const fm = Number(step3.toFixed(2));
  const net = Number((fm * (1 - DAMGA_ORANI - GELIR_VERGISI_ORANI)).toFixed(2));
  return { fm, net };
}

export function exclusionsNeedLegacySplit(exclusions: ExclusionItem[]): boolean {
  if (!exclusions?.length) return false;
  return exclusions.some((ex) => LEGACY_ONLY_EXCLUSION_TYPES.has(String(ex.type || "").trim()));
}

/** 7×24: weeklyNet=(7-excl)*13; fm=max(0, weeklyNet-48-8). */
export function gemi724FmHoursForDeduction(excludedUnits: number): number {
  const excl = Math.max(0, Math.min(7, Number(excludedUnits) || 0));
  const weeklyNet = (7 - excl) * DAILY_NET_HOURS;
  return Math.max(0, weeklyNet - WEEKLY_WORK_LIMIT - LEAVE_HOURS);
}

export function fmHoursForDeductionWindow(excludedUnits: number): number {
  return gemi724FmHoursForDeduction(excludedUnits);
}

function enrichRowsWithoutDeductions(rows: PeriodRow[]): PeriodRow[] {
  return rows.map((row) => ({ ...row }));
}

function expandWithMotor(rows: PeriodRow[], exclusions: ExclusionItem[]): PeriodRow[] {
  const out: PeriodRow[] = [];
  const allNormalized = normalizeDeductionDays(exclusions);

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
      out.push(...enrichRowsWithoutDeductions([row]));
      return;
    }

    const daysInPeriod = allNormalized.filter((d) => {
      const dd = parseFmDate(d.dateISO);
      return dd && dd >= periodStart && dd <= periodEnd;
    });

    if (daysInPeriod.length === 0) {
      out.push(...enrichRowsWithoutDeductions([row]));
      return;
    }

    const windows = buildSevenDayDeductionWindows(daysInPeriod, periodEnd);
    if (windows.length === 0) {
      out.push(...enrichRowsWithoutDeductions([row]));
      return;
    }

    const originalWeeks = Math.max(0, Math.floor(Number(row.weeks) || 0));
    const baseWeeks = Math.max(0, originalWeeks - windows.length);

    if (baseWeeks > 0) {
      const brut = row.brut ?? (getAsgariUcretByDate(startISO) || 0);
      const kats = row.katsayi ?? 1;
      const fmHours = row.fmHours ?? 0;
      const { fm, net } = gemi724FmNet(baseWeeks, brut, kats, fmHours);
      out.push({
        ...row,
        id: `gemi724-base-${rowIdx}-${startISO}-${endISO}`,
        startISO,
        endISO,
        weeks: baseWeeks,
        brut,
        fmHours,
        fm,
        net,
        yillikIzinAciklama: undefined,
        note: undefined,
        isDeductionRow: false,
      });
    }

    windows.forEach((win, winIdx) => {
      const excludedDays = win.totalDeductionDayUnits;
      const brut = getAsgariUcretByDate(win.startISO) ?? row.brut;
      const kats = row.katsayi ?? 1;
      const fmHours = excludedDays > EPS ? gemi724FmHoursForDeduction(excludedDays) : row.fmHours ?? 0;
      if (fmHours <= EPS) return;
      const { fm, net } = gemi724FmNet(1, brut, kats, fmHours);
      out.push({
        ...row,
        id: `gemi724-ded-${rowIdx}-${winIdx}-${win.startISO}-${win.endISO}`,
        startISO: win.startISO,
        endISO: win.endISO,
        weeks: 1,
        brut,
        katsayi: kats,
        fmHours,
        fm,
        net,
        isDeductionRow: true,
        yillikIzinAciklama: win.caption || undefined,
        note: win.caption || undefined,
      });
    });
  });

  return out.length > 0 ? out : rows;
}

export function expandGemi724RowsForDeductions(
  rows: PeriodRow[],
  exclusions: ExclusionItem[] | null | undefined,
  options: ExpandGemi724RowsOptions,
): PeriodRow[] {
  const { weeklyOffDay, applyYargitay270FmDeduction } = options;
  if (!rows.length) return rows;
  if (!exclusions?.length) return enrichRowsWithoutDeductions(rows);

  if (exclusionsNeedLegacySplit(exclusions)) {
    const legacyParams: GemiExpandParams = {
      hg: 7,
      weeklyOffDay,
      davaciSevenDay: "tatilsiz",
      applyYargitay270FmDeduction,
    };
    return expandGemiRowsAnnualLeaveUbgt(rows, exclusions, legacyParams);
  }

  return expandWithMotor(rows, exclusions);
}

/** @deprecated expandGemi724RowsForDeductions kullanın */
export function expandRowsForDeductions(params: {
  rows: PeriodRow[];
  exclusions: ExclusionItem[];
  weeklyOffDay: number | null;
  applyYargitay270FmDeduction?: boolean;
}): PeriodRow[] {
  return expandGemi724RowsForDeductions(params.rows, params.exclusions, {
    weeklyOffDay: params.weeklyOffDay,
    applyYargitay270FmDeduction: params.applyYargitay270FmDeduction,
  });
}
