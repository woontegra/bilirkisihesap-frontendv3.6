/**
 * Gemi Adamı 7/24 — V3 backend + V3 sayfa post-processing zinciri.
 */

import { expandGemi724RowsForDeductions } from "../expandRowsForDeductions";
import type { Gemi724FormSnapshot, PeriodRow, RowOverride } from "../model";
import { buildClassicPeriodRows } from "./computeClassicPeriods";
import { calculateWeeksBetweenDates } from "./dateUtils";

const DENOM = 240;
const FACTOR = 1.25;
const DAMGA_ORANI = 0.00759;
const GELIR_VERGISI_ORANI = 0.15;

function parseKatsayi(value: string): number {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function validateDateRange(start: string, end: string): string | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  return s <= e ? null : "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.";
}

function inclusiveDayCount(startIso: string, endIso: string): number {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(+s) || Number.isNaN(+e) || e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

function computeFmMoney(weeks: number, brut: number, katsayi: number, fmHours: number): { fm: number; net: number } {
  const step1 = Number((weeks * brut).toFixed(6));
  const step2 = Number((step1 * katsayi).toFixed(6));
  const step3 = Number((step2 * fmHours).toFixed(6));
  const step4 = Number((step3 / DENOM).toFixed(6));
  const step5 = Number((step4 * FACTOR).toFixed(6));
  const fm = Number(step5.toFixed(2));
  const net = Number((fm * (1 - DAMGA_ORANI - GELIR_VERGISI_ORANI)).toFixed(2));
  return { fm, net };
}

function applyOverridesAndManual(
  rows: PeriodRow[],
  overrides: Record<string, RowOverride>,
  manualRows: PeriodRow[],
  katsayi: number,
): PeriodRow[] {
  let result = rows
    .filter((r) => !overrides[r.id]?.hidden)
    .map((r) => {
      const ov = overrides[r.id];
      if (!ov) return r;
      const startISO = ov.startISO ?? r.startISO;
      const endISO = ov.endISO ?? r.endISO;
      const weeks = ov.weeks ?? r.weeks;
      const brut = ov.brut ?? r.brut;
      const fmHours = ov.fmHours ?? r.fmHours;
      const kat = ov.katsayi ?? r.katsayi ?? katsayi;
      const { fm, net } = computeFmMoney(weeks, brut, kat, fmHours);
      return { ...r, startISO, endISO, weeks, brut, fmHours, katsayi: kat, fm, net };
    });

  const manuals = (manualRows ?? []).map((m) => {
    const ov = overrides[m.id];
    const startISO = ov?.startISO ?? m.startISO;
    const endISO = ov?.endISO ?? m.endISO;
    const weeks = ov?.weeks ?? m.weeks;
    const brut = ov?.brut ?? m.brut;
    const fmHours = ov?.fmHours ?? m.fmHours;
    const kat = ov?.katsayi ?? m.katsayi ?? katsayi;
    const { fm, net } = computeFmMoney(weeks, brut, kat, fmHours);
    return { ...m, startISO, endISO, weeks, brut, fmHours, katsayi: kat, fm, net, isManual: true };
  });

  for (const m of manuals) {
    if (overrides[m.id]?.hidden) continue;
    const after = m.insertAfter;
    if (!after) {
      result.push(m);
      continue;
    }
    const idx = result.findIndex((r) => r.id === after);
    if (idx >= 0) result.splice(idx + 1, 0, m);
    else result.push(m);
  }

  return result;
}

function mergeAdjacentRows(rows: PeriodRow[], katsayi: number): PeriodRow[] {
  const merged: PeriodRow[] = [];
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
      const mergedStart = last.startISO;
      const mergedEnd = row.endISO;
      let totalWeeks =
        mergedStart.length >= 10 && mergedEnd.length >= 10
          ? Math.max(1, calculateWeeksBetweenDates(mergedStart, mergedEnd) || 1)
          : (last.weeks || 0) + (row.weeks || 0);
      const spanDays = inclusiveDayCount(mergedStart, mergedEnd);
      if (spanDays > 0 && spanDays <= 370) totalWeeks = Math.min(52, totalWeeks);
      const { fm, net } = computeFmMoney(totalWeeks, last.brut, katsayi, last.fmHours);
      merged[merged.length - 1] = {
        ...last,
        endISO: row.endISO,
        weeks: totalWeeks,
        fm,
        net,
      };
    } else {
      merged.push({ ...row });
    }
  }
  return merged;
}

export function runGemi724V3Pipeline(form: Gemi724FormSnapshot): {
  rows: PeriodRow[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const dateError = validateDateRange(form.iseGiris, form.istenCikis);
  if (dateError) warnings.push(dateError);
  if (!form.iseGiris || !form.istenCikis || dateError) {
    return { rows: [], warnings };
  }

  const katsayi = parseKatsayi(form.katSayi);
  let pipeRows = buildClassicPeriodRows(form);
  pipeRows = mergeAdjacentRows(pipeRows, katsayi);

  const weeklyOffNum =
    form.haftaTatiliGunu === "" || form.haftaTatiliGunu == null ? null : Number(form.haftaTatiliGunu);
  const weeklyOffDay = Number.isInteger(weeklyOffNum) ? weeklyOffNum : null;
  const yargitay270 = form.mode270 === "simple";

  if (form.exclusions.length > 0) {
    pipeRows = expandGemi724RowsForDeductions(pipeRows, form.exclusions, {
      weeklyOffDay,
      applyYargitay270FmDeduction: yargitay270,
    }).map((r) => ({
      ...r,
      fm: computeFmMoney(r.weeks, r.brut, r.katsayi, r.fmHours).fm,
      net: computeFmMoney(r.weeks, r.brut, r.katsayi, r.fmHours).net,
    }));
  }

  const rows = applyOverridesAndManual(
    pipeRows,
    form.rowOverrides ?? {},
    form.manualRows ?? [],
    katsayi,
  );

  return { rows, warnings };
}
