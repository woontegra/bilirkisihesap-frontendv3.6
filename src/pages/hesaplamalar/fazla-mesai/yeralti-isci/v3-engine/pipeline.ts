/**
 * Yeraltı İşçisi V3 motor zinciri — V3 `YeraltiIsciPage` + backend `computeClassic` sırası.
 * 1) computeClassic dönemleri (270 şirket/yargıtay backend'de)  2) tanık FM  3) UBGT/izin expand
 */

import { fmHoursAfterYargitay270Simple } from "../../shared/mode270Core";
import {
  applyRowOverrides,
  applyYargitayRounding,
  computeBreakHours,
  computeTotalsFromRows,
  computeWeeklyHours,
  isValidRange,
  parseKatsayi,
  parseTimeToHours,
  rawDailyHoursBetween,
  WEEKLY_LIMIT,
} from "../engine";
import type { FmRow, YeraltiFormSnapshot } from "../model";
import { buildClassicPeriodRows } from "./computeClassicPeriods";
import { expandYeraltiRowsForDeductions } from "./expandYeraltiRowsForDeductions";
import { applyWitnessFmPipeline } from "./witnessFmOverride";

export type YeraltiPipelineOutput = {
  dailyHours: number;
  breakHours: number;
  weeklyHours: number;
  fmHoursWeekly: number;
  rows: FmRow[];
  exitYear: number;
};

/** Yeraltı FM — V3 backend + frontend post-processing zinciri. */
export function runYeraltiV3Pipeline(form: YeraltiFormSnapshot): YeraltiPipelineOutput {
  const davaciStartH = parseTimeToHours(form.davaciIn);
  const davaciEndHRaw = parseTimeToHours(form.davaciOut);

  let dailyHours = 0;
  let breakHours = 0;
  let weeklyHours = 0;
  let fmHoursWeekly = 0;
  if (davaciStartH != null && davaciEndHRaw != null) {
    const davaciEndH = davaciEndHRaw === 0 && davaciStartH > 0 ? 24 : davaciEndHRaw;
    const rawDaily = rawDailyHoursBetween(davaciStartH, davaciEndH);
    breakHours = computeBreakHours(rawDaily);
    dailyHours = Math.max(0, rawDaily - breakHours);
    weeklyHours = computeWeeklyHours(dailyHours, form.weeklyDays, form.sevenDayMode);
    fmHoursWeekly = Math.max(0, applyYargitayRounding(weeklyHours) - WEEKLY_LIMIT);
  }

  const exitYear = form.davaciDateOut
    ? Number(form.davaciDateOut.slice(0, 4))
    : new Date().getFullYear();

  if (!isValidRange(form.davaciDateIn, form.davaciDateOut)) {
    return { dailyHours, breakHours, weeklyHours, fmHoursWeekly, rows: [], exitYear };
  }

  const katsayi = parseKatsayi(form.katsayi);

  // V3: backend computeClassic (270 şirket: calculateOvertimeWeeks; yargıtay: FM −5:12)
  let rows = buildClassicPeriodRows(form);

  // V3: tanık FM override + birleştirme
  rows = applyWitnessFmPipeline(rows, form);

  const weeklyOffDay =
    form.haftaTatiliGunu !== "" && Number.isInteger(form.haftaTatiliGunu)
      ? form.haftaTatiliGunu
      : null;

  // V3: UBGT / yıllık izin expand (270 backend'de uygulandıktan sonra)
  if (form.exclusions.length > 0 && dailyHours > 0) {
    const applyLeaveFmAdj =
      form.mode270 === "simple"
        ? (h: number) => fmHoursAfterYargitay270Simple(h)
        : (h: number) => h;
    rows = expandYeraltiRowsForDeductions(rows, form.exclusions, {
      weeklyOffDay,
      fmParams: {
        dailyNet: dailyHours,
        hg: Number(form.weeklyDays) || 6,
        weeklyOffDay,
        davaciSevenDay: Number(form.weeklyDays) === 7 ? form.sevenDayMode : "tatilsiz",
        applyLeaveFmAdj,
      },
    });
  }

  rows = applyRowOverrides(
    rows,
    form.rowOverrides ?? {},
    form.manualRows ?? [],
    katsayi,
  );

  return { dailyHours, breakHours, weeklyHours, fmHoursWeekly, rows, exitYear };
}

export function computeTotalsForPipeline(
  rows: FmRow[],
  exitYear: number,
  mahsupInput: string,
) {
  return computeTotalsFromRows(rows, exitYear, mahsupInput);
}
