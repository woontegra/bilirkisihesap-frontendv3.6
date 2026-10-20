/**
 * Gemi adamları yıllık izin — 30/360 gün mantığı.
 * `aktuerya-backend/src/services/yillikIzinGemi.service.js` ile birebir.
 */

import { calculateNetIzin, calculateBrutIzin as coreBrutIzin, toDays } from "./core";
import { round2 } from "./money";
import type { GemiWorkPeriod } from "./types";

export type { GemiWorkPeriod };

function parseDateStrict(value: string): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let y = 0;
  let m = 0;
  let d = 0;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const tr = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
    if (!tr) return null;
    d = Number(tr[1]);
    m = Number(tr[2]);
    y = Number(tr[3]);
  }
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function calculateDaysBetween(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  try {
    const start = parseDateStrict(startDate);
    const end = parseDateStrict(endDate);
    if (!start || !end) return 0;
    if (end < start) return 0;
    const startYear = start.getFullYear();
    const startMonth = start.getMonth();
    const startDay = start.getDate();
    const endYear = end.getFullYear();
    const endMonth = end.getMonth();
    const endDay = Math.min(30, end.getDate());
    const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth);
    return totalMonths * 30 + (endDay - startDay) + 1;
  } catch {
    return 0;
  }
}

export function calculateTotalDays(workPeriods: GemiWorkPeriod[]): number {
  return workPeriods.reduce((total, period) => {
    if (period.gunSayisi !== undefined) return total + period.gunSayisi;
    if (period.iseGiris && period.istenCikis) {
      return total + calculateDaysBetween(period.iseGiris, period.istenCikis);
    }
    return total;
  }, 0);
}

export function formatTotalWorkDays(totalDays: number): string {
  if (totalDays === 0) return "0 gün";
  if (totalDays < 360) {
    const ay = Math.floor(totalDays / 30);
    const gun = totalDays % 30;
    return `${totalDays} gün / 30 = ${ay} ay ${gun} gün`;
  }
  const yil = Math.floor(totalDays / 360);
  const kalanGun = totalDays % 360;
  const ay = Math.floor(kalanGun / 30);
  const gun = kalanGun % 30;
  return `${totalDays} gün / 360 = ${yil} yıl ${ay} ay ${gun} gün`;
}

export function calculateGemiIzin(workPeriods: GemiWorkPeriod[]): number {
  if (!workPeriods?.length) return 0;
  try {
    const totalDaysOverall = calculateTotalDays(workPeriods);
    const yearlyDays: Record<number, number> = {};

    workPeriods.forEach((period) => {
      if (!period.iseGiris || !period.istenCikis) return;
      const startDate = parseDateStrict(period.iseGiris);
      const endDate = parseDateStrict(period.istenCikis);
      if (!startDate || !endDate) return;
      const startYear = startDate.getFullYear();
      const endYear = endDate.getFullYear();
      for (let year = startYear; year <= endYear; year++) {
        if (!yearlyDays[year]) yearlyDays[year] = 0;
        const yearStart = year === startYear ? startDate : new Date(year, 0, 1);
        const yearEnd = year === endYear ? endDate : new Date(year, 11, 31);
        yearlyDays[year] += calculateDaysBetween(toISODateLocal(yearStart), toISODateLocal(yearEnd));
      }
    });

    let totalDaysForCalendarRule = 0;
    Object.values(yearlyDays).forEach((days) => {
      if (days >= 180) totalDaysForCalendarRule += days;
    });

    if (totalDaysOverall >= 360) {
      return Math.floor(totalDaysOverall / 360) * 30;
    }
    if (totalDaysForCalendarRule >= 180) return 15;
    return 0;
  } catch {
    return 0;
  }
}

export function calculateGemiBreakdown(workPeriods: GemiWorkPeriod[]) {
  if (!workPeriods?.length) return { d1: 0, d2: 0, total: 0, y1: 0, y2: 0 };
  try {
    const totalDaysOverall = calculateTotalDays(workPeriods);
    const yearlyDays: Record<number, number> = {};

    workPeriods.forEach((period) => {
      if (!period.iseGiris || !period.istenCikis) return;
      const startDate = parseDateStrict(period.iseGiris);
      const endDate = parseDateStrict(period.istenCikis);
      if (!startDate || !endDate) return;
      const startYear = startDate.getFullYear();
      const endYear = endDate.getFullYear();
      for (let year = startYear; year <= endYear; year++) {
        if (!yearlyDays[year]) yearlyDays[year] = 0;
        const yearStart = year === startYear ? startDate : new Date(year, 0, 1);
        const yearEnd = year === endYear ? endDate : new Date(year, 11, 31);
        yearlyDays[year] += calculateDaysBetween(toISODateLocal(yearStart), toISODateLocal(yearEnd));
      }
    });

    let totalDaysForCalendarRule = 0;
    Object.values(yearlyDays).forEach((days) => {
      if (days >= 180) totalDaysForCalendarRule += days;
    });

    if (totalDaysOverall >= 360) {
      const fullYears = Math.floor(totalDaysOverall / 360);
      return { y1: 0, y2: fullYears, d1: 0, d2: fullYears * 30, total: fullYears * 30 };
    }
    if (totalDaysForCalendarRule >= 180) {
      return { y1: 1, y2: 0, d1: 15, d2: 0, total: 15 };
    }
    return { y1: 0, y2: 0, d1: 0, d2: 0, total: 0 };
  } catch {
    return { d1: 0, d2: 0, total: 0, y1: 0, y2: 0 };
  }
}

export type GemiCoreInput = {
  workPeriods: GemiWorkPeriod[];
  brutUcret: string | number;
  usedDays: number;
  year: number;
};

export type GemiCoreResult = {
  totalWorkDays: number;
  totalVacationDays: number;
  breakdown: ReturnType<typeof calculateGemiBreakdown>;
  usedDays: number;
  remainingDays: number;
  brutIzin: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netIzin: number;
  error?: string;
};

export function calculateYillikIzinGemi(input: GemiCoreInput): GemiCoreResult {
  const { workPeriods, brutUcret, usedDays, year } = input;

  const hasValidPeriod = workPeriods?.some((p) => p.iseGiris && p.istenCikis);
  if (!workPeriods?.length || !hasValidPeriod) {
    return emptyGemiResult("Çalışma dönemleri gerekli");
  }

  const totalWorkDays = calculateTotalDays(workPeriods);
  const totalVacationDays = calculateGemiIzin(workPeriods);
  const breakdown = calculateGemiBreakdown(workPeriods);
  const totalUsedDays = usedDays || 0;
  const remainingDays = Math.max(0, totalVacationDays - totalUsedDays);

  const brut = toDays(brutUcret);
  if (!brutUcret || brut <= 0) {
    return {
      totalWorkDays,
      totalVacationDays,
      breakdown,
      usedDays: totalUsedDays,
      remainingDays,
      brutIzin: 0,
      sgk: 0,
      issizlik: 0,
      gelirVergisi: 0,
      gelirVergisiDilimleri: "",
      damgaVergisi: 0,
      netIzin: 0,
    };
  }

  const brutIzin = round2(coreBrutIzin(brut, remainingDays));
  const selectedYear = year || new Date().getFullYear();
  const net = calculateNetIzin(brutIzin, selectedYear, "brackets");

  return {
    totalWorkDays,
    totalVacationDays,
    breakdown,
    usedDays: totalUsedDays,
    remainingDays,
    brutIzin,
    ...net,
  };
}

function emptyGemiResult(error: string): GemiCoreResult {
  return {
    totalWorkDays: 0,
    totalVacationDays: 0,
    breakdown: { d1: 0, d2: 0, total: 0, y1: 0, y2: 0 },
    usedDays: 0,
    remainingDays: 0,
    brutIzin: 0,
    sgk: 0,
    issizlik: 0,
    gelirVergisi: 0,
    gelirVergisiDilimleri: "",
    damgaVergisi: 0,
    netIzin: 0,
    error,
  };
}
