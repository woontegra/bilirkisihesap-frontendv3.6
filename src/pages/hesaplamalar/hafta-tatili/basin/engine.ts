/**
 * Hafta Tatili — Basın İş hesaplama motoru.
 * Basın: total = daily50 * weekCount * (geceCalisan ? 2 : 1)
 */

import {
  calculateWeekCount,
  formatPeriodLabel,
  generateHaftaTatiliPeriods,
  getHaftaTatiliDaysForPeriod,
} from "../lib/calculations";
import { calcHakkaniyet, calcMahsupSonuc, calculateNetFromBrut, resolveTaxYear } from "../lib/net";
import { formatMoney, newLocalId, parseNum, round2 } from "../lib/money";
import type { TableRow } from "../lib/types";
import type { BasinForm, BasinResult } from "./model";
import { weekDayMultiplier } from "./model";

export { formatMoney, parseNum, round2 };

export function recalcRow(row: TableRow, multiplier: number): TableRow {
  const dailyWage = ((row.wage ?? 0) * (row.coefficient ?? 1)) / 30;
  const daily50 = Number((dailyWage * 1.5).toFixed(2));
  const haftaTatiliTotal = round2(daily50 * (row.weekCount ?? 0) * multiplier);
  return { ...row, dailyWage: round2(dailyWage), daily50, haftaTatiliTotal };
}

export function buildAutoRows(form: BasinForm): TableRow[] {
  const mult = weekDayMultiplier(form);
  const all: TableRow[] = [];

  form.dateRanges.forEach((range) => {
    if (!range.start || !range.end) return;
    const effectiveStart =
      form.expiryStart && new Date(range.start) <= new Date(form.expiryStart)
        ? form.expiryStart
        : range.start;

    const periods = generateHaftaTatiliPeriods(effectiveStart, range.end);

    periods.forEach((p) => {
      const weekCount = calculateWeekCount(p.start, p.end, form.excludedDays);
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
      all.push(recalcRow(base, mult));
    });
  });

  return all.sort((a, b) => new Date(a.startISO).getTime() - new Date(b.startISO).getTime());
}

export function resolveDisplayRows(form: BasinForm): TableRow[] {
  const mult = weekDayMultiplier(form);
  if (form.rows.length > 0) return form.rows.map((r) => recalcRow(r, mult));
  return buildAutoRows(form);
}

export function computeBasinHaftaTatili(form: BasinForm): BasinResult {
  const mult = weekDayMultiplier(form);
  const rows = resolveDisplayRows(form);
  const totalBrut = round2(rows.reduce((s, r) => s + (r.haftaTatiliTotal ?? 0), 0));
  const year = resolveTaxYear(form.dateRanges);
  const net = calculateNetFromBrut(totalBrut, year);
  return {
    rows,
    totalBrut,
    year,
    net,
    hakkaniyet: calcHakkaniyet(totalBrut),
    mahsupSonuc: calcMahsupSonuc(totalBrut, form.settleAmount),
    weekDayMultiplier: mult,
  };
}

export function applyGlobalCoefficient(rows: TableRow[], k: number, multiplier: number): TableRow[] {
  const fixed = Number(k.toFixed(4));
  return rows.map((r) => recalcRow({ ...r, coefficient: fixed }, multiplier));
}

export function calcKatsayi(bilinen: string, asgari: string): number {
  const known = parseNum(bilinen);
  const minimum = parseNum(asgari);
  if (!minimum) return 0;
  return Number((known / minimum).toFixed(4));
}
