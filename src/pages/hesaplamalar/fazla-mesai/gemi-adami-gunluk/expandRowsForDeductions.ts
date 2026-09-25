/**

 * Gemi Adamı Günlük — UBGT / yıllık izin düşüm satırı motoru.

 * V3 `expandGemiGunlukRowsForDeductions.ts` ile aynı dallanma:

 * - Yalnız UBGT/yıllık izin: 7 günlük takvim penceresi (deductionPeriodEngine)

 * - Rapor/Diğer/Puantaj varsa: gemiAnnualLeaveUbgtExpand (iş günü anchor)

 */



import { getAsgariUcretByDate } from "./asgariUcret";

import {

  FAZLA_MESAI_DENOMINATOR,

  FAZLA_MESAI_KATSAYI,

  GEMI_DAILY_REF_HOURS,

  MODE270_SIMPLE_REDUCTION_HOURS,

  WEEKLY_WORK_LIMIT,

} from "./constants";

import { expandGemiRowsAnnualLeaveUbgt, type GemiExpandParams } from "./gemiAnnualLeaveUbgtExpand";

import type { ExclusionItem, PeriodRow, SevenDayMode } from "./model";

import { newLocalId } from "./model";

import {

  buildSevenDayDeductionWindows,

  normalizeDeductionDays,

  parseFmDate,

} from "../shared/deductionCore";



const LEGACY_ONLY_EXCLUSION_TYPES = new Set(["Rapor", "Diğer", "Puantaj/Bordro"]);

const EPS = 1e-7;



export type GemiExpandFmParams = {

  dailyNet: number;

  hg: number;

  weeklyOffDay: number | null;

  davaciSevenDay: SevenDayMode;

  applyYargitay270FmDeduction?: boolean;

};



export function bilirkisiRoundWeeklyTotalHours(value: number): number {

  const E = 1e-9;

  if (!Number.isFinite(value) || value <= 0) return 0;

  const int = Math.floor(value + E);

  const frac = value - int;

  if (frac < 0.5 - E) return int;

  if (frac > 0.5 + E) return int + 1;

  return int + 0.5;

}



export function calculateFm(weeks: number, brut: number, kats: number, fmHours: number): number {

  const step1 = Number((weeks * brut).toFixed(6));

  const step2 = Number((step1 * kats).toFixed(6));

  const step3 = Number((step2 * fmHours).toFixed(6));

  const step4 = Number((step3 / FAZLA_MESAI_DENOMINATOR).toFixed(6));

  const step5 = Number((step4 * FAZLA_MESAI_KATSAYI).toFixed(6));

  return Number(step5.toFixed(2));

}



export function exclusionsNeedLegacySplit(exclusions: ExclusionItem[]): boolean {

  if (!exclusions?.length) return false;

  return exclusions.some((ex) => LEGACY_ONLY_EXCLUSION_TYPES.has(String(ex.type || "").trim()));

}



function addDaysIso(iso: string, days: number): string {

  const [y, m, d] = iso.split("-").map(Number);

  const dt = new Date(y, m - 1, d + days);

  const yy = dt.getFullYear();

  const mm = String(dt.getMonth() + 1).padStart(2, "0");

  const dd = String(dt.getDate()).padStart(2, "0");

  return `${yy}-${mm}-${dd}`;

}



function remainingNetWeeklyForGemiDeduction(

  dailyNet: number,

  weeklyWorkingDays: number,

  excludedUnits: number,

  davaciSevenDay: SevenDayMode,

): number {

  const hgSafe = Math.max(1, Math.min(7, Math.floor(weeklyWorkingDays) || 6));

  const excl = Math.max(0, Math.min(hgSafe, Number(excludedUnits) || 0));

  if (hgSafe !== 7) {

    return Math.max(0, (hgSafe - excl) * dailyNet);

  }

  if (davaciSevenDay === "tatilsiz") {

    return Math.max(0, (7 - excl) * dailyNet);

  }

  const holidayExtra = Math.max(0, dailyNet - GEMI_DAILY_REF_HOURS);

  return Math.max(0, 6 * dailyNet + holidayExtra - excl * dailyNet);

}



export function gemiFmHoursForDeductionWeek(fmParams: GemiExpandFmParams, excludedUnits: number): number {

  const remainingNetWeekly = remainingNetWeeklyForGemiDeduction(

    fmParams.dailyNet,

    fmParams.hg,

    excludedUnits,

    fmParams.davaciSevenDay,

  );

  const totalRounded = bilirkisiRoundWeeklyTotalHours(remainingNetWeekly);

  let fmWeek = Math.max(0, totalRounded - WEEKLY_WORK_LIMIT);

  if (fmParams.applyYargitay270FmDeduction) {

    fmWeek = Math.max(0, fmWeek - MODE270_SIMPLE_REDUCTION_HOURS);

  }

  return fmWeek;

}



function expandWithMotor(

  rows: PeriodRow[],

  exclusions: ExclusionItem[],

  fmParams: GemiExpandFmParams | undefined,

): PeriodRow[] {

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



    const originalWeeks = Math.max(0, Math.floor(Number(row.weeks) || 0));

    const baseWeeks = Math.max(0, originalWeeks - windows.length);



    if (baseWeeks > 0) {

      const brut = row.brut ?? (getAsgariUcretByDate(startISO) || 0);

      const kats = row.katsayi ?? 1;

      const fmHours = row.fmHours ?? 0;

      out.push({

        ...row,

        id: `gemi-base-${rowIdx}-${startISO}-${endISO}`,

        startISO,

        endISO,

        weeks: baseWeeks,

        brut,

        fmHours,

        fm: calculateFm(baseWeeks, brut, kats, fmHours),

        yillikIzinAciklama: undefined,

        note: undefined,

        isDeductionRow: false,

      });

    }



    windows.forEach((win, winIdx) => {

      const excludedDays = win.totalDeductionDayUnits;

      const brut = getAsgariUcretByDate(win.startISO) ?? row.brut;

      const kats = row.katsayi ?? 1;

      let fmHours = row.fmHours ?? 0;

      if (fmParams && excludedDays > EPS) {

        fmHours = gemiFmHoursForDeductionWeek(fmParams, excludedDays);

      }

      if (fmParams && fmHours <= EPS) return;

      out.push({

        ...row,

        id: `gemi-ded-${rowIdx}-${winIdx}-${win.startISO}-${win.endISO}`,

        startISO: win.startISO,

        endISO: win.endISO,

        weeks: 1,

        brut,

        katsayi: kats,

        fmHours,

        fm: calculateFm(1, brut, kats, fmHours),

        isDeductionRow: true,

        yillikIzinAciklama: win.caption || undefined,

        note: win.caption || undefined,

      });

    });

  });



  return out.length > 0 ? out : rows;

}



export function expandGemiGunlukRowsForDeductions(

  rows: PeriodRow[],

  exclusions: ExclusionItem[] | null | undefined,

  options: { weeklyOffDay: number | null; fmParams?: GemiExpandFmParams },

): PeriodRow[] {

  const { fmParams } = options;

  if (!rows.length) return rows;

  if (!exclusions?.length) return rows;



  if (exclusionsNeedLegacySplit(exclusions)) {

    if (!fmParams) return expandWithMotor(rows, exclusions, undefined);

    const legacyParams: GemiExpandParams = {

      hg: fmParams.hg,

      weeklyOffDay: fmParams.weeklyOffDay,

      davaciSevenDay: fmParams.davaciSevenDay,

      applyYargitay270FmDeduction: fmParams.applyYargitay270FmDeduction,

    };

    return expandGemiRowsAnnualLeaveUbgt(rows, exclusions, legacyParams);

  }



  return expandWithMotor(rows, exclusions, fmParams);

}



/** Test / UI: 7 günlük pencere üretimi. */

export function buildSevenDayWindowsForTest(

  days: Array<{ dateISO: string; type: "UBGT" | "YILLIK_IZIN" }>,

  periodEnd: string,

): Array<{ start: string; end: string; excludedUnits: number }> {

  const normalized = normalizeDeductionDays(

    days.map((d, i) => ({

      id: String(i),

      type: d.type === "UBGT" ? "UBGT" : "Yıllık İzin",

      start: d.dateISO,

      end: d.dateISO,

      days: 1,

    })),

  );

  const end = parseFmDate(periodEnd) ?? new Date();

  return buildSevenDayDeductionWindows(normalized, end).map((w) => ({

    start: w.startISO,

    end: w.endISO,

    excludedUnits: w.totalDeductionDayUnits,

  }));

}



export function makeBlankManualRow(katsayi: number, insertAfter?: string): PeriodRow {

  return {

    id: newLocalId("manual"),

    startISO: "",

    endISO: "",

    weeks: 0,

    brut: 0,

    katsayi,

    fmHours: 0,

    fm: 0,

    isManual: true,

    insertAfter,

  };

}



export { addDaysIso };


