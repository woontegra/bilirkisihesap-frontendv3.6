/**
 * Hafta Tatili — Standart hesaplama motoru.
 * V3 formülleri: dailyWage=(wage*coef)/30; daily50=round(dailyWage*1.5); total=daily50*weekCount
 */

import {
  adjustWeekCountForSeasonalUsage,
  calculateWeekCount,
  formatPeriodLabel,
  generateHaftaTatiliPeriods,
  getHaftaTatiliDaysForPeriod,
} from "../lib/calculations";
import { calcHakkaniyet, calcMahsupSonuc, calculateNetFromBrut, resolveTaxYear } from "../lib/net";
import { formatMoney, newLocalId, parseNum, round2 } from "../lib/money";
import type { TableRow } from "../lib/types";
import type { StandardForm, StandardResult } from "./model";

export { formatMoney, parseNum, round2 };

export function recalcRow(row: TableRow, weekMultiplier = 1): TableRow {
  const dailyWage = ((row.wage ?? 0) * (row.coefficient ?? 1)) / 30;
  const daily50 = Number((dailyWage * 1.5).toFixed(2));
  const haftaTatiliTotal = round2(daily50 * (row.weekCount ?? 0) * weekMultiplier);
  return { ...row, dailyWage: round2(dailyWage), daily50, haftaTatiliTotal };
}

export function buildAutoRows(form: StandardForm, weekMultiplier = 1): TableRow[] {
  const all: TableRow[] = [];

  form.dateRanges.forEach((range) => {
    if (!range.start || !range.end) return;
    const effectiveStart =
      form.expiryStart && new Date(range.start) <= new Date(form.expiryStart)
        ? form.expiryStart
        : range.start;

    const periods = generateHaftaTatiliPeriods(effectiveStart, range.end);

    periods.forEach((p) => {
      const origWeek = calculateWeekCount(p.start, p.end, form.excludedDays);
      const weekCount = adjustWeekCountForSeasonalUsage(
        origWeek,
        p.start,
        p.end,
        form.kullanimBaslangic,
        form.kullanimBitis,
        form.kullanimGunSayisi,
      );
      const haftaTatiliDays = getHaftaTatiliDaysForPeriod(
        p.start,
        p.end,
        form.selectedHolidayIds,
        form.excludedDays,
      );

      const base: TableRow = {
        id: newLocalId("row"),
        period: formatPeriodLabel(p.start, p.end),
        startISO: p.start,
        endISO: p.end,
        weekCount,
        wage: p.wage,
        coefficient: form.globalCoefficient,
        dailyWage: 0,
        daily50: 0,
        haftaTatiliDays,
        haftaTatiliTotal: 0,
        manual: false,
      };
      all.push(recalcRow(base, weekMultiplier));
    });
  });

  return all.sort((a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime());
}

export function resolveDisplayRows(form: StandardForm, weekMultiplier = 1): TableRow[] {
  if (form.rows.length > 0) {
    return form.rows.map((r) => recalcRow(r, weekMultiplier));
  }
  return buildAutoRows(form, weekMultiplier);
}

export function computeStandardHaftaTatili(form: StandardForm, weekMultiplier = 1): StandardResult {
  const rows = resolveDisplayRows(form, weekMultiplier);
  const totalBrut = round2(rows.reduce((s, r) => s + (r.haftaTatiliTotal ?? 0), 0));
  const year = resolveTaxYear(form.dateRanges);
  const net = calculateNetFromBrut(totalBrut, year);
  const hakkaniyet = calcHakkaniyet(totalBrut);
  const mahsupSonuc = calcMahsupSonuc(totalBrut, form.settleAmount);

  return { rows, totalBrut, year, net, hakkaniyet, mahsupSonuc };
}

export function applyGlobalCoefficient(rows: TableRow[], k: number, weekMultiplier = 1): TableRow[] {
  const fixed = Number(k.toFixed(4));
  return rows.map((r) => recalcRow({ ...r, coefficient: fixed }, weekMultiplier));
}

export function calcKatsayi(bilinen: string, asgari: string): number {
  const known = parseNum(bilinen);
  const minimum = parseNum(asgari);
  if (!minimum) return 0;
  return Number((known / minimum).toFixed(4));
}
