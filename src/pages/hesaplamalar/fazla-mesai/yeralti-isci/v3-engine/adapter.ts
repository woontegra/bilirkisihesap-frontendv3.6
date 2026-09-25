/**
 * V3.5 YeraltiFormSnapshot ↔ yeraltı V3 motor giriş/çıkışı.
 */

import type { YeraltiFormSnapshot, YeraltiResult } from "../model";
import { computeTotalsForPipeline, runYeraltiV3Pipeline } from "./pipeline";

/** Yeraltı İşçisi FM — V3 motor zinciri. */
export function computeYeraltiResultV3(form: YeraltiFormSnapshot): YeraltiResult {
  const pipeline = runYeraltiV3Pipeline(form);
  const totals = computeTotalsForPipeline(pipeline.rows, pipeline.exitYear, form.mahsup);

  return {
    dailyHours: pipeline.dailyHours,
    breakHours: pipeline.breakHours,
    weeklyHours: pipeline.weeklyHours,
    fmHoursWeekly: pipeline.fmHoursWeekly,
    rows: pipeline.rows,
    ...totals,
  };
}

/** Manuel kontrol: konsol özeti (dev). */
export function logYeraltiFmV3EngineCheck(form: YeraltiFormSnapshot): void {
  const result = computeYeraltiResultV3(form);
  // eslint-disable-next-line no-console
  console.info("[Yeraltı FM v3-engine]", {
    mode270: form.mode270,
    witnessCount: form.witnesses.filter((w) => w.dateIn && w.dateOut).length,
    exclusionCount: form.exclusions.length,
    zamanasimi: form.zamanasimi?.nihaiBaslangic ?? null,
    fmHoursWeekly: result.fmHoursWeekly,
    rowCount: result.rows.length,
    totalFm: result.totalFm,
    sonNet: result.sonNet,
    rows: result.rows.map((r) => ({
      id: r.id,
      range: `${r.startISO} – ${r.endISO}`,
      weeks: r.weeks,
      fmHours: r.fmHours,
      fm: r.fm,
      deduction: r.isDeductionRow,
      note: r.note,
    })),
  });
}
