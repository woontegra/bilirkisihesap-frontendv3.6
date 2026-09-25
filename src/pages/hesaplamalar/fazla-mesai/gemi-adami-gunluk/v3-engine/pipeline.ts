/**
 * Gemi Adamı Günlük — V3 backend + V3 sayfa post-processing zinciri.
 * Sıra: computeClassic → tanık FM + birleştir → UBGT/yıllık izin expand
 */

import {
  applyRowOverrides,
  computeBreakHours,
  computeWeeklyHoursRaw,
  ceilWeeklyWorkHoursToHalfHour,
  parseKatsayi,
  parseTimeToHours,
  rawDailyHoursBetween,
  validateDateRange,
  calculateFm,
  normalizeTimeStr,
  WEEKLY_WORK_LIMIT,
} from "../engine";
import { expandGemiGunlukRowsForDeductions } from "../expandRowsForDeductions";
import type { GemiGunlukFormSnapshot, GemiGunlukResult, PeriodRow } from "../model";
import { buildClassicPeriodRows } from "./computeClassicPeriods";
import { applyWitnessFmPipeline } from "./witnessFmOverride";

function emptyRows(): GemiGunlukResult {
  return {
    dailyGrossHours: 0,
    breakHours: 0,
    dailyNetHours: 0,
    weeklyRawHours: 0,
    weeklyRoundedHours: 0,
    baselineWeeklyFmHours: 0,
    rows: [],
    toplamFm: 0,
    sgk: 0,
    issizlik: 0,
    gelirVergisi: 0,
    gelirVergisiDilimleri: "",
    damgaVergisi: 0,
    netYillik: 0,
    hakkaniyetIndirimi: 0,
    mahsupTutari: 0,
    sonNet: 0,
    warnings: [],
  };
}

/** V3 `/api/fm/gemi` + GemiAdamiGunlukPage client pipeline. */
export function runGemiGunlukV3Pipeline(form: GemiGunlukFormSnapshot): {
  rows: PeriodRow[];
  dailyGrossHours: number;
  breakHours: number;
  dailyNetHours: number;
  weeklyRawHours: number;
  weeklyRoundedHours: number;
  baselineWeeklyFmHours: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  const dateError = validateDateRange(form.iseGiris, form.istenCikis);
  if (dateError) warnings.push(dateError);

  const tin = normalizeTimeStr(form.davaciIn);
  const tout = normalizeTimeStr(form.davaciOut);
  if (!form.iseGiris || !form.istenCikis || dateError || !tin || !tout) {
    return { ...emptyRows(), warnings };
  }

  const davaciStartH = parseTimeToHours(tin)!;
  let davaciEndH = parseTimeToHours(tout)!;
  if (davaciEndH === 0 && davaciStartH > 0) davaciEndH = 24;

  const dailyGrossHours = rawDailyHoursBetween(davaciStartH, davaciEndH);
  const breakHours = computeBreakHours(dailyGrossHours);
  const dailyNetHours = Math.max(0, dailyGrossHours - breakHours);
  const weeklyRawHours = computeWeeklyHoursRaw(dailyNetHours, form.weeklyDays, form.sevenDayMode);
  const weeklyRoundedHours = ceilWeeklyWorkHoursToHalfHour(weeklyRawHours);
  const baselineWeeklyFmHours = Math.max(0, weeklyRoundedHours - WEEKLY_WORK_LIMIT);

  // 1) Backend computeClassic (270 + zamanaşımı dahil)
  let pipeRows = buildClassicPeriodRows(form);

  // 2) V3 client: tanık FM + birleştirme
  pipeRows = applyWitnessFmPipeline(pipeRows, form);

  // 3) V3 client: UBGT / yıllık izin expand (preserveWeeks YOK)
  const weeklyOffNum =
    form.haftaTatiliGunu === "" || form.haftaTatiliGunu == null ? null : Number(form.haftaTatiliGunu);
  const weeklyOffDay = Number.isInteger(weeklyOffNum) ? weeklyOffNum : null;
  const yargitay270 = form.mode270 === "simple";
  const katsayi = parseKatsayi(form.katSayi);

  if (form.exclusions.length > 0 && dailyNetHours > 0) {
    pipeRows = expandGemiGunlukRowsForDeductions(pipeRows, form.exclusions, {
      weeklyOffDay,
      fmParams: {
        dailyNet: dailyNetHours,
        hg: Number(form.weeklyDays) || 6,
        weeklyOffDay,
        davaciSevenDay: form.sevenDayMode,
        applyYargitay270FmDeduction: yargitay270,
      },
    }).map((r) => ({
      ...r,
      fm: calculateFm(r.weeks, r.brut, r.katsayi, r.fmHours),
    }));
  }

  const rows = applyRowOverrides(pipeRows, form.rowOverrides ?? {}, form.manualRows ?? [], katsayi);

  return {
    rows,
    dailyGrossHours,
    breakHours,
    dailyNetHours,
    weeklyRawHours,
    weeklyRoundedHours,
    baselineWeeklyFmHours,
    warnings,
  };
}
