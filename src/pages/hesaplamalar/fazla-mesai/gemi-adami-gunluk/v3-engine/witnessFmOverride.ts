/**
 * V3 GemiAdamiGunlukPage — tanık FM override + ardışık birleştirme (backend sonrası).
 */

import { MODE270_SIMPLE_REDUCTION_HOURS } from "../constants";
import {
  calculateFm,
  ceilWeeklyWorkHoursToHalfHour,
  computeBreakHours,
  parseKatsayi,
  WEEKLY_WORK_LIMIT,
} from "../engine";
import type { GemiGunlukFormSnapshot, PeriodRow } from "../model";
import { calculateWeeksBetweenDates } from "./dateUtils";

function timeToMinutes(t: string): number {
  const [h, m] = (t || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function buildWitnessFmIndex(form: GemiGunlukFormSnapshot): Array<{ startMs: number; endMs: number; fmHours: number }> {
  const dIn = timeToMinutes(form.davaciIn);
  const dOut = timeToMinutes(form.davaciOut);
  const hg = Number(form.weeklyDays) || 6;

  return form.witnesses
    .filter((w) => w.dateIn && w.dateOut && w.in && w.out)
    .map((w) => {
      const tIn = Math.max(timeToMinutes(w.in), dIn);
      const tOut = Math.min(timeToMinutes(w.out), dOut);
      const brut = Math.max(0, (tOut - tIn) / 60);
      const brk = computeBreakHours(brut);
      const net = Math.max(0, brut - brk);
      const fm = Math.max(0, ceilWeeklyWorkHoursToHalfHour(net * hg) - WEEKLY_WORK_LIMIT);
      return {
        startMs: new Date(w.dateIn).getTime(),
        endMs: new Date(w.dateOut).getTime(),
        fmHours: fm,
      };
    });
}

function applyWitnessBestFm(
  rows: PeriodRow[],
  form: GemiGunlukFormSnapshot,
  katsayi: number,
  yargitay270: boolean,
): PeriodRow[] {
  const tanikFM = buildWitnessFmIndex(form);
  if (tanikFM.length === 0) return rows;

  return rows.map((row) => {
    if (row.isManual || row.isDeductionRow) return row;
    const rS = new Date(row.startISO).getTime();
    const rE = new Date(row.endISO).getTime();
    const active = tanikFM.filter((t) => t.startMs <= rS && t.endMs >= rE);
    if (active.length === 0) return row;
    const best = active.reduce((p, c) => (c.fmHours > p.fmHours ? c : p));
    const bestFmAdjusted = yargitay270
      ? Math.max(0, (best.fmHours || 0) - MODE270_SIMPLE_REDUCTION_HOURS)
      : best.fmHours || 0;
    const rowFm = Number(row.fmHours) || 0;
    if (Math.abs(bestFmAdjusted - rowFm) < 1e-6) return row;
    return {
      ...row,
      fmHours: bestFmAdjusted,
      fm: calculateFm(row.weeks, row.brut, katsayi, bestFmAdjusted),
    };
  });
}

/** V3 gemi: ardışık aynı FM — hafta tarihlerden yeniden hesaplanır, ≤370 günde max 52. */
function mergeConsecutiveSameFm(rows: PeriodRow[], katsayi: number): PeriodRow[] {
  const merged: PeriodRow[] = [];
  for (const row of rows) {
    if (row.isManual || row.isDeductionRow) {
      merged.push(row);
      continue;
    }
    const last = merged[merged.length - 1];
    if (
      last &&
      !last.isManual &&
      !last.isDeductionRow &&
      last.fmHours === row.fmHours &&
      last.brut === row.brut &&
      last.katsayi === row.katsayi
    ) {
      const mergedStart = (last.startISO || "").slice(0, 10);
      const mergedEnd = (row.endISO || "").slice(0, 10);
      let totalWeeks =
        mergedStart.length >= 10 && mergedEnd.length >= 10
          ? Math.max(1, calculateWeeksBetweenDates(mergedStart, mergedEnd) || 1)
          : (last.weeks || 0) + (row.weeks || 0);
      const spanMs = new Date(mergedEnd).getTime() - new Date(mergedStart).getTime();
      const spanDays = Math.floor(spanMs / (1000 * 60 * 60 * 24)) + 1;
      if (Number.isFinite(spanDays) && spanDays > 0 && spanDays <= 370) {
        totalWeeks = Math.min(52, totalWeeks);
      }
      merged[merged.length - 1] = {
        ...last,
        endISO: row.endISO,
        weeks: totalWeeks,
        fm: calculateFm(totalWeeks, last.brut, katsayi, last.fmHours),
      };
    } else {
      merged.push({ ...row });
    }
  }
  return merged;
}

export function applyWitnessFmPipeline(
  rows: PeriodRow[],
  form: GemiGunlukFormSnapshot,
): PeriodRow[] {
  const katsayi = parseKatsayi(form.katSayi);
  const yargitay270 = form.mode270 === "simple";
  const withBest = applyWitnessBestFm(rows, form, katsayi, yargitay270);
  return mergeConsecutiveSameFm(withBest, katsayi);
}
