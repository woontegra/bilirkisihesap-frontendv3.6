/**
 * V3 YeraltiIsciPage — satır bazında en iyi tanık FM override + birleştirme.
 * Backend satırları üretildikten sonra her dönem için tanık tarih kapsamı
 * (`startMs <= rowStart && endMs >= rowEnd`) içinde en yüksek haftalık FM seçilir.
 */

import { fmHoursAfterYargitay270Simple } from "../../shared/mode270Core";
import {
  applyYargitayRounding,
  calcRowFm,
  parseKatsayi,
  WEEKLY_LIMIT,
  DAILY_REF,
} from "../engine";
import type { FmRow, SevenDayMode, WitnessInput, YeraltiFormSnapshot } from "../model";

/** V3 YeraltiIsciPage override bloğu ile aynı ara dinlenme kademeleri. */
function computeBreakHoursForWitnessFm(dailyGross: number): number {
  if (!Number.isFinite(dailyGross) || dailyGross <= 0) return 0;
  if (dailyGross <= 4) return 0.25;
  if (dailyGross <= 7.5) return 0.5;
  if (dailyGross <= 11) return 1;
  if (dailyGross < 14) return 1.5;
  if (dailyGross < 15) return 2;
  return 3;
}

function timeToMinutes(t: string): number {
  const [h, m] = (t || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** V3 `witnessWeeklyFmHoursForYeralti` — 37,5 saat sınırı, Yargıtay yuvarlama. */
export function witnessWeeklyFmHoursForYeralti(
  netDaily: number,
  weeklyDays: number,
  sevenDayMode: SevenDayMode,
): number {
  const n = weeklyDays;
  let weeklyCalc = 0;
  if (n === 7 && sevenDayMode === "tatilli") {
    const weeklyWork = netDaily * 6;
    const extra = Math.max(0, netDaily - DAILY_REF);
    weeklyCalc = weeklyWork + extra;
  } else {
    const daysWork = n > 0 ? n : 7;
    weeklyCalc = netDaily * daysWork;
  }
  const rounded = applyYargitayRounding(weeklyCalc);
  return Math.max(0, rounded - WEEKLY_LIMIT);
}

type WitnessFmEntry = { startMs: number; endMs: number; fmHours: number };

function buildWitnessFmIndex(form: YeraltiFormSnapshot): WitnessFmEntry[] {
  if (!form.davaciIn || !form.davaciOut) return [];
  const dIn = timeToMinutes(form.davaciIn);
  const dOut = timeToMinutes(form.davaciOut);
  const hg = Number(form.weeklyDays) || 6;

  return form.witnesses
    .filter((w) => w.dateIn && w.dateOut && w.in && w.out)
    .map((w) => {
      const tIn = Math.max(timeToMinutes(w.in), dIn);
      const tOut = Math.min(timeToMinutes(w.out), dOut);
      const brut = Math.max(0, (tOut - tIn) / 60);
      const brk = computeBreakHoursForWitnessFm(brut);
      const net = Math.max(0, brut - brk);
      const fm = witnessWeeklyFmHoursForYeralti(net, hg, form.sevenDayMode);
      return {
        startMs: new Date(w.dateIn).getTime(),
        endMs: new Date(w.dateOut).getTime(),
        fmHours: fm,
      };
    });
}

function resolveWitnessWeeklyDays(witness: WitnessInput, davaciHg: number): number {
  const raw = witness.weeklyDays;
  if (raw === "" || raw == null) return davaciHg;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 7 ? Math.floor(n) : davaciHg;
}

/** Tanığa özel haftalık gün ile FM (ileride metin kartı ile uyum). */
export function witnessWeeklyFmForWitness(
  witness: WitnessInput,
  form: Pick<YeraltiFormSnapshot, "davaciIn" | "davaciOut" | "weeklyDays" | "sevenDayMode">,
): number {
  const dIn = timeToMinutes(form.davaciIn);
  const dOut = timeToMinutes(form.davaciOut);
  const tIn = Math.max(timeToMinutes(witness.in), dIn);
  const tOut = Math.min(timeToMinutes(witness.out), dOut);
  const brut = Math.max(0, (tOut - tIn) / 60);
  const net = Math.max(0, brut - computeBreakHoursForWitnessFm(brut));
  const hg = resolveWitnessWeeklyDays(witness, Number(form.weeklyDays) || 6);
  return witnessWeeklyFmHoursForYeralti(net, hg, form.sevenDayMode);
}

/**
 * Her satır için tanık tarih kapsamında en yüksek FM'yi uygular (V3 `withBestFM`).
 * `rowFmAlready270`: satır FM saati zaten 270 Yargıtay düşümü almışsa tanık FM'sine de aynı düşüm uygulanır.
 */
export function applyBestWitnessFmToRows(
  rows: FmRow[],
  form: YeraltiFormSnapshot,
  rowFmAlready270: boolean,
): FmRow[] {
  const index = buildWitnessFmIndex(form);
  if (index.length === 0) return rows;

  const adjustWitnessFm =
    rowFmAlready270 && form.mode270 === "simple"
      ? (h: number) => fmHoursAfterYargitay270Simple(h)
      : (h: number) => h;

  return rows.map((row) => {
    if (row.isManual || row.isDeductionRow) return row;
    const rS = new Date(row.startISO).getTime();
    const rE = new Date(row.endISO).getTime();
    const active = index.filter((t) => t.startMs <= rS && t.endMs >= rE);
    if (active.length === 0) return row;
    const best = active.reduce((p, c) => (c.fmHours > p.fmHours ? c : p));
    const bestAdj = adjustWitnessFm(best.fmHours);
    if (bestAdj === row.fmHours) return row;
    return {
      ...row,
      fmHours: bestAdj,
      fm: calcRowFm(row.brut, row.katsayi, row.weeks, bestAdj),
    };
  });
}

/** V3: ardışık satırları aynı FM / ücret / katsayı ise birleştir. */
export function mergeYeraltiRowsByFmBrutKatsayi(rows: FmRow[], defaultKatsayi: number): FmRow[] {
  const kats = defaultKatsayi > 0 ? defaultKatsayi : 1;
  const merged: FmRow[] = [];

  for (const row of rows) {
    const last = merged[merged.length - 1];
    if (
      last &&
      !last.isManual &&
      !row.isManual &&
      !last.isDeductionRow &&
      !row.isDeductionRow &&
      last.fmHours === row.fmHours &&
      last.brut === row.brut &&
      last.katsayi === row.katsayi
    ) {
      const totalWeeks = (last.weeks || 0) + (row.weeks || 0);
      const rowKats = last.katsayi || kats;
      merged[merged.length - 1] = {
        ...last,
        endISO: row.endISO,
        weeks: totalWeeks,
        fm: calcRowFm(last.brut, rowKats, totalWeeks, last.fmHours),
      };
    } else {
      merged.push({ ...row });
    }
  }

  return merged;
}

export function applyWitnessFmPipeline(rows: FmRow[], form: YeraltiFormSnapshot): FmRow[] {
  const katsayi = parseKatsayi(form.katsayi);
  const rowFmAlready270 = form.mode270 === "simple";
  const withBest = applyBestWitnessFmToRows(rows, form, rowFmAlready270);
  return mergeYeraltiRowsByFmBrutKatsayi(withBest, katsayi);
}
