/**
 * Ücret Alacağı — lokal hesaplama motoru.
 * V3 (`ucret-alacagi/ucretAlacagiCalc.ts`, `ucret-alacagi/incomeTaxCore.ts`) ve backend
 * (`ucretAlacagi.service.calculateUcret` — ay bölme algoritması) ile kuruşu kuruşuna.
 * Başka hesaplama sayfasından import yok. Ağ yok — ay bölme algoritması burada yeniden
 * uygulanmıştır (V3'te backend'e istek atılıyordu, burada tamamen istemci taraflıdır).
 */

import { getAsgariBrutForDate, getAsgariNetUcretForPeriod, getAsgariUcretForPeriod } from "./asgariUcret";
import type { CetvelRow, ConversionPanelData, UcretAlacagiForm, UcretAlacagiResult, WorkPeriod } from "./model";
import { EMPTY_CONVERSION_PANEL } from "./model";

/* ────────────────────────────────────────────────────────────────────────
 * Temel yardımcılar
 * ──────────────────────────────────────────────────────────────────────── */

export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export function parseNum(v: string): number {
  return Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
}

export function formatMoney(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
}

export function formatDateTR(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export function clampYear(value: string): string {
  if (!value || !value.includes("-")) return value;
  const parts = value.split("-");
  if (parts[0] && parts[0].length > 4) parts[0] = parts[0].substring(0, 4);
  return parts.join("-");
}

export function isDateOrderInvalid(startDate: string, endDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false;
  return new Date(endDate) < new Date(startDate);
}

const EMPTY_PERIOD: WorkPeriod = { years: 0, months: 0, days: 0, label: "0 Yıl 0 Ay 0 Gün" };

function calcWorkPeriodExclusive(startISO: string, endISO: string): WorkPeriod {
  if (!startISO || !endISO) return EMPTY_PERIOD;
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return EMPTY_PERIOD;
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  if (days < 0) {
    months--;
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months, days, label: `${years} Yıl ${months} Ay ${days} Gün` };
}

/** V3 `calcWorkPeriodBilirKisi` (ihbar-tazminati/utils ile aynı algoritma). */
export function calcWorkPeriodBilirKisi(startISO: string, endISO: string): WorkPeriod {
  if (!startISO || !endISO) return EMPTY_PERIOD;
  try {
    const start = new Date(startISO);
    const end = new Date(endISO);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return EMPTY_PERIOD;
    if (end < start) return EMPTY_PERIOD;
    end.setDate(end.getDate() + 1);
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();
    if (days < 0) {
      months--;
      const lastDayOfPrevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
      days += lastDayOfPrevMonth.getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    const label = calcWorkPeriodExclusive(startISO, endISO).label;
    return { years, months, days, label };
  } catch {
    return EMPTY_PERIOD;
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Ay bölme algoritması — backend `ucretAlacagi.service.calculateUcret` ile birebir.
 * ──────────────────────────────────────────────────────────────────────── */

const DAYS_PER_MONTH = 30;

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function minDateOf(dates: Date[]): Date {
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

function differenceInCalendarDays(d1: Date, d2: Date): number {
  const date1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const date2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type MonthRow = { start: string; end: string; days: number };

/** Backend `calculateUcret` ay bölme döngüsü (yalnızca start/end/days; tutar burada hesaplanmaz). */
export function generateMonthRows(startDate: string, endDate: string): MonthRow[] {
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (!startDate || !endDate || Number.isNaN(+s) || Number.isNaN(+e) || s > e) return [];

  const rows: MonthRow[] = [];
  let currentStart = new Date(s);

  while (currentStart <= e) {
    const currentMonth = currentStart.getMonth();
    const currentYear = currentStart.getFullYear();
    const monthEnd = endOfMonth(new Date(currentYear, currentMonth, 1));

    const ps = currentStart;
    const pe = minDateOf([e, monthEnd]);
    const actualDays = Math.max(0, differenceInCalendarDays(pe, ps) + 1);

    if (actualDays > 0) {
      const isFullMonth = ps.getDate() === 1 && pe.getDate() === monthEnd.getDate() && pe.getMonth() === monthEnd.getMonth();
      const days = isFullMonth ? DAYS_PER_MONTH : actualDays;
      rows.push({ start: formatDateISO(ps), end: formatDateISO(pe), days });
    }

    currentStart = new Date(currentYear, currentMonth + 1, 1);
  }

  return rows;
}

/** Backend `validateAsgariUcret` (Not: `monthly` her zaman tablo değeriyle üretildiğinden pratikte tetiklenmez). */
export function validateAsgariUcretDonemi(
  startDate: string,
  endDate: string,
  monthly: number,
): { isValid: boolean; error?: string } {
  try {
    if (!startDate || !endDate) return { isValid: true };
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (Number.isNaN(+s) || Number.isNaN(+e)) return { isValid: true };
    const sTime = s.getTime();
    const eTime = e.getTime();
    const ASGARI_UCRET_DONEMLERI = [
      { start: "2015-01-01", end: "2015-06-30", value: 949.07 },
      { start: "2015-07-01", end: "2015-12-31", value: 1000.54 },
      { start: "2016-01-01", end: "2016-12-31", value: 1300.99 },
      { start: "2017-01-01", end: "2017-12-31", value: 1404.06 },
      { start: "2018-01-01", end: "2018-12-31", value: 1603.12 },
      { start: "2019-01-01", end: "2019-12-31", value: 2020.9 },
      { start: "2020-01-01", end: "2020-12-31", value: 2324.71 },
      { start: "2021-01-01", end: "2021-12-31", value: 2825.9 },
      { start: "2022-01-01", end: "2022-06-30", value: 4253.4 },
      { start: "2022-07-01", end: "2022-12-31", value: 5500.35 },
      { start: "2023-01-01", end: "2023-06-30", value: 8506.8 },
      { start: "2023-07-01", end: "2023-12-31", value: 11402.32 },
      { start: "2024-01-01", end: "2024-12-31", value: 17002.12 },
      { start: "2025-01-01", end: "2025-12-31", value: 22104.67 },
      { start: "2026-01-01", end: "2026-12-31", value: 28075.0 },
    ];
    const ilgili = ASGARI_UCRET_DONEMLERI.filter((d) => {
      const ds = new Date(d.start).getTime();
      const de = new Date(d.end).getTime();
      return !(eTime < ds || sTime > de);
    });
    if (ilgili.length > 0) {
      const minAsgari = Math.min(...ilgili.map((d) => d.value));
      if (monthly < minAsgari) {
        return { isValid: false, error: "Girilen ücret, belirtilen dönemdeki asgari ücretin altında olamaz." };
      }
    }
    return { isValid: true };
  } catch {
    return { isValid: true };
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Cetvel satır hesapları — V3 `ucretAlacagiCalc.ts` ile birebir.
 * ──────────────────────────────────────────────────────────────────────── */

export function calcRowUcretBase(row: CetvelRow): number {
  const isFullMonth = row.gunSayisi === row.ayGunSayisi;
  return isFullMonth ? row.ucret * row.katsayi : (row.ucret / 30) * row.gunSayisi * row.katsayi;
}

export function calcRowHakEdisDisplay(row: CetvelRow): number {
  return round2(calcRowUcretBase(row));
}

export function monthlyUcretFromHakEdis(hakEdis: number, row: CetvelRow): number {
  const katsayi = row.katsayi || 1;
  if (katsayi <= 0) return 0;
  const isFullMonth = row.gunSayisi === row.ayGunSayisi;
  if (isFullMonth) return round2(hakEdis / katsayi);
  const gun = row.gunSayisi || 0;
  if (gun <= 0) return 0;
  return round2((hakEdis * 30) / (gun * katsayi));
}

export function calcKalanRows(rows: CetvelRow[]): number[] {
  let running = 0;
  return rows.map((row) => {
    const hak = calcRowUcretBase(row);
    const odenen = row.odenenUcret || 0;
    running = round2(running + hak - odenen);
    return running;
  });
}

export function calcPeriodSliceRows(rows: CetvelRow[]): number[] {
  return rows.map((row) => round2(calcRowUcretBase(row) - (row.odenenUcret || 0)));
}

export function calcRowKalan(rows: CetvelRow[], index: number): number {
  return calcKalanRows(rows)[index] ?? 0;
}

export function calcCetvelGrandTotal(rows: CetvelRow[]): number {
  const hakToplam = rows.reduce((acc, row) => acc + calcRowUcretBase(row), 0);
  const odenenToplam = rows.reduce((acc, row) => acc + (row.odenenUcret || 0), 0);
  return round2(hakToplam - odenenToplam);
}

/* ────────────────────────────────────────────────────────────────────────
 * Cetvel satırı üretimi/birleştirme — V3 `mergeCetvelWithApi` / `mergeNetCetvelWithApi`.
 * ──────────────────────────────────────────────────────────────────────── */

function cetvelSpanKey(startISO: string, endISO: string): string {
  return `${startISO}\0${endISO}`;
}

/** Ayın gün sayısı (date-fns `getDaysInMonth` karşılığı). */
function daysInMonthOf(dateISO: string): number {
  const d = new Date(dateISO);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Brüt cetvel: mevcut satırları tarih aralığına göre eşleştirip korur, yenilerini asgari brütle doldurur. */
export function mergeCetvelWithApi(prev: CetvelRow[], monthRows: MonthRow[], globalKatsayiNow: number): CetvelRow[] {
  const prevBySpan = new Map(prev.map((r) => [cetvelSpanKey(r.startISO, r.endISO), r]));
  return monthRows.map((row, idx) => {
    const startISO = row.start;
    const endISO = row.end;
    const existing = prevBySpan.get(cetvelSpanKey(startISO, endISO));
    const ayGunSayisi = daysInMonthOf(row.start);
    if (existing) {
      return { ...existing, rangeLabel: `${formatDateTR(startISO)} – ${formatDateTR(endISO)}`, startISO, endISO, gunSayisi: row.days, ayGunSayisi };
    }
    return {
      id: `row-${idx}-${startISO}`,
      rangeLabel: `${formatDateTR(startISO)} – ${formatDateTR(endISO)}`,
      startISO,
      endISO,
      katsayi: globalKatsayiNow,
      ucret: getAsgariUcretForPeriod(startISO),
      gunSayisi: row.days,
      ayGunSayisi,
      ucretManual: false,
      odenenUcret: 0,
    };
  });
}

/** Net cetvel: aynı mantık; ücret dönemsel resmi net asgari ücretten, yoksa `netVerisiYok=true`. */
export function mergeNetCetvelWithApi(prev: CetvelRow[], monthRows: MonthRow[], globalKatsayiNow: number): CetvelRow[] {
  const prevBySpan = new Map(prev.map((r) => [cetvelSpanKey(r.startISO, r.endISO), r]));
  return monthRows.map((row, idx) => {
    const startISO = row.start;
    const endISO = row.end;
    const existing = prevBySpan.get(cetvelSpanKey(startISO, endISO));
    const ayGunSayisi = daysInMonthOf(row.start);
    if (existing) {
      return { ...existing, rangeLabel: `${formatDateTR(startISO)} – ${formatDateTR(endISO)}`, startISO, endISO, gunSayisi: row.days, ayGunSayisi };
    }
    const netVal = getAsgariNetUcretForPeriod(startISO);
    return {
      id: `net-row-${idx}-${startISO}`,
      rangeLabel: `${formatDateTR(startISO)} – ${formatDateTR(endISO)}`,
      startISO,
      endISO,
      katsayi: globalKatsayiNow,
      ucret: netVal ?? 0,
      gunSayisi: row.days,
      ayGunSayisi,
      ucretManual: false,
      odenenUcret: 0,
      netVerisiYok: netVal == null,
    };
  });
}

/** Brüt cetvel oluşunca aynı dönem yapısından net cetveli üretir (V3 `applyNetCetvelFromCetvelRows`). */
export function applyNetCetvelFromCetvelRows(prevNet: CetvelRow[], brutRows: CetvelRow[], netKatsayi: number): CetvelRow[] {
  const monthRows: MonthRow[] = brutRows
    .map((r) => ({ start: r.startISO, end: r.endISO, days: r.gunSayisi }))
    .filter((r) => r.start && r.end && r.days > 0);
  if (monthRows.length === 0) return [];
  return mergeNetCetvelWithApi(prevNet, monthRows, netKatsayi);
}

/* ────────────────────────────────────────────────────────────────────────
 * Gelir vergisi tarifesi (ücretliler), 2010–2026 — V3 `incomeTaxCore.ts` ile birebir.
 * ──────────────────────────────────────────────────────────────────────── */

type Bracket = { limit: number | null; rate: number; baseTax: number; baseLimit: number };

const incomeTaxRates: Record<number, Bracket[]> = {
  2010: [
    { limit: 8800, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 22000, rate: 0.2, baseTax: 1320, baseLimit: 8800 },
    { limit: 50000, rate: 0.27, baseTax: 3960, baseLimit: 22000 },
    { limit: null, rate: 0.35, baseTax: 11520, baseLimit: 50000 },
  ],
  2011: [
    { limit: 9400, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 23000, rate: 0.2, baseTax: 1410, baseLimit: 9400 },
    { limit: 80000, rate: 0.27, baseTax: 4130, baseLimit: 23000 },
    { limit: null, rate: 0.35, baseTax: 19520, baseLimit: 80000 },
  ],
  2012: [
    { limit: 10000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 25000, rate: 0.2, baseTax: 1500, baseLimit: 10000 },
    { limit: 88000, rate: 0.27, baseTax: 4500, baseLimit: 25000 },
    { limit: null, rate: 0.35, baseTax: 21510, baseLimit: 88000 },
  ],
  2013: [
    { limit: 10700, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 26000, rate: 0.2, baseTax: 1605, baseLimit: 10700 },
    { limit: 94000, rate: 0.27, baseTax: 4665, baseLimit: 26000 },
    { limit: null, rate: 0.35, baseTax: 23025, baseLimit: 94000 },
  ],
  2014: [
    { limit: 11000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 27000, rate: 0.2, baseTax: 1650, baseLimit: 11000 },
    { limit: 97000, rate: 0.27, baseTax: 4850, baseLimit: 27000 },
    { limit: null, rate: 0.35, baseTax: 23750, baseLimit: 97000 },
  ],
  2015: [
    { limit: 12000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 29000, rate: 0.2, baseTax: 1800, baseLimit: 12000 },
    { limit: 106000, rate: 0.27, baseTax: 5200, baseLimit: 29000 },
    { limit: null, rate: 0.35, baseTax: 25990, baseLimit: 106000 },
  ],
  2016: [
    { limit: 12600, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 30000, rate: 0.2, baseTax: 1890, baseLimit: 12600 },
    { limit: 110000, rate: 0.27, baseTax: 5370, baseLimit: 30000 },
    { limit: null, rate: 0.35, baseTax: 26970, baseLimit: 110000 },
  ],
  2017: [
    { limit: 13000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 30000, rate: 0.2, baseTax: 1950, baseLimit: 13000 },
    { limit: 110000, rate: 0.27, baseTax: 5350, baseLimit: 30000 },
    { limit: null, rate: 0.35, baseTax: 26950, baseLimit: 110000 },
  ],
  2018: [
    { limit: 14800, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 34000, rate: 0.2, baseTax: 2220, baseLimit: 14800 },
    { limit: 120000, rate: 0.27, baseTax: 6060, baseLimit: 34000 },
    { limit: null, rate: 0.35, baseTax: 29280, baseLimit: 120000 },
  ],
  2019: [
    { limit: 18000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 40000, rate: 0.2, baseTax: 2700, baseLimit: 18000 },
    { limit: 148000, rate: 0.27, baseTax: 7100, baseLimit: 40000 },
    { limit: null, rate: 0.35, baseTax: 36260, baseLimit: 148000 },
  ],
  2020: [
    { limit: 22000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 49000, rate: 0.2, baseTax: 3300, baseLimit: 22000 },
    { limit: 120000, rate: 0.27, baseTax: 8700, baseLimit: 49000 },
    { limit: 600000, rate: 0.35, baseTax: 27870, baseLimit: 120000 },
    { limit: null, rate: 0.4, baseTax: 191070, baseLimit: 600000 },
  ],
  2021: [
    { limit: 24000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 53000, rate: 0.2, baseTax: 3600, baseLimit: 24000 },
    { limit: 190000, rate: 0.27, baseTax: 9400, baseLimit: 53000 },
    { limit: 650000, rate: 0.35, baseTax: 46390, baseLimit: 190000 },
    { limit: null, rate: 0.4, baseTax: 207390, baseLimit: 650000 },
  ],
  2022: [
    { limit: 32000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 70000, rate: 0.2, baseTax: 4800, baseLimit: 32000 },
    { limit: 250000, rate: 0.27, baseTax: 12400, baseLimit: 70000 },
    { limit: 880000, rate: 0.35, baseTax: 61000, baseLimit: 250000 },
    { limit: null, rate: 0.4, baseTax: 281500, baseLimit: 880000 },
  ],
  2023: [
    { limit: 70000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 150000, rate: 0.2, baseTax: 10500, baseLimit: 70000 },
    { limit: 370000, rate: 0.27, baseTax: 26500, baseLimit: 150000 },
    { limit: 1900000, rate: 0.35, baseTax: 85900, baseLimit: 370000 },
    { limit: null, rate: 0.4, baseTax: 607000, baseLimit: 1900000 },
  ],
  2024: [
    { limit: 110000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 230000, rate: 0.2, baseTax: 16500, baseLimit: 110000 },
    { limit: 870000, rate: 0.27, baseTax: 40500, baseLimit: 230000 },
    { limit: 3000000, rate: 0.35, baseTax: 213300, baseLimit: 870000 },
    { limit: null, rate: 0.4, baseTax: 958800, baseLimit: 3000000 },
  ],
  2025: [
    { limit: 158000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 330000, rate: 0.2, baseTax: 23700, baseLimit: 158000 },
    { limit: 1200000, rate: 0.27, baseTax: 58100, baseLimit: 330000 },
    { limit: 4300000, rate: 0.35, baseTax: 293000, baseLimit: 1200000 },
    { limit: null, rate: 0.4, baseTax: 1410000, baseLimit: 4300000 },
  ],
  2026: [
    { limit: 198274, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 414117, rate: 0.2, baseTax: 29741, baseLimit: 198274 },
    { limit: 1505880, rate: 0.27, baseTax: 71909, baseLimit: 414117 },
    { limit: 5396070, rate: 0.35, baseTax: 366685, baseLimit: 1505880 },
    { limit: null, rate: 0.4, baseTax: 1731252, baseLimit: 5396070 },
  ],
};

const SGK_ORAN = 0.14;
const ISSIZLIK_ORAN = 0.01;
export const DAMGA_ORAN = 0.00759;

function getRatesForYear(year: number): Bracket[] {
  if (incomeTaxRates[year]) return incomeTaxRates[year];
  const years = Object.keys(incomeTaxRates).map(Number).sort((a, b) => b - a);
  for (const y of years) {
    if (year >= y) return incomeTaxRates[y];
  }
  return incomeTaxRates[2010];
}

function calculateIncomeTax(year: number, income: number): number {
  const brackets = getRatesForYear(year);
  for (const b of brackets) {
    if (b.limit === null || income <= b.limit) {
      return b.baseTax + (income - b.baseLimit) * b.rate;
    }
  }
  return 0;
}

export function calculateIncomeTaxWithBrackets(year: number, income: number): { tax: number; summary: string } {
  const brackets = getRatesForYear(year);
  if (!brackets || income <= 0) return { tax: 0, summary: "" };

  const appliedRates: number[] = [];
  let totalTax = 0;

  for (const bracket of brackets) {
    const bracketStart = bracket.baseLimit;
    const bracketEnd = bracket.limit;

    let taxableInThisBracket = 0;
    if (bracketEnd === null) {
      taxableInThisBracket = income - bracketStart;
    } else if (income > bracketEnd) {
      taxableInThisBracket = bracketEnd - bracketStart;
    } else {
      taxableInThisBracket = income - bracketStart;
    }

    if (taxableInThisBracket > 0) {
      totalTax += taxableInThisBracket * bracket.rate;
      const ratePct = Math.round(bracket.rate * 100);
      if (!appliedRates.includes(ratePct)) appliedRates.push(ratePct);
    }

    if (bracketEnd === null || income <= bracketEnd) break;
  }

  const summary = appliedRates.length > 0 ? `(${appliedRates.map((r) => `%${r}`).join(", ")})` : "";
  return { tax: round2(totalTax), summary };
}

export function calculateNetFromGross(gross: number, year: number) {
  const sgk = round2(gross * SGK_ORAN);
  const issizlik = round2(gross * ISSIZLIK_ORAN);
  const matrah = gross - sgk - issizlik;
  const gelirVergisi = round2(calculateIncomeTax(year, matrah));
  const damgaVergisi = round2(gross * DAMGA_ORAN);
  const net = round2(gross - sgk - issizlik - gelirVergisi - damgaVergisi);
  return { gross, sgk, issizlik, gelirVergisi, damgaVergisi, net };
}

function getRowYear(row: CetvelRow): number {
  return row.startISO ? new Date(row.startISO).getFullYear() : new Date().getFullYear();
}

function incrementalIncomeTax(year: number, prevCumMatrah: number, matrahSlice: number): number {
  if (matrahSlice <= 0) return 0;
  const newCum = prevCumMatrah + matrahSlice;
  return round2(calculateIncomeTax(year, newCum) - calculateIncomeTax(year, prevCumMatrah));
}

function mergeBracketSummaries(summaries: string[]): string {
  const rates = new Set<number>();
  for (const summary of summaries) {
    for (const match of summary.matchAll(/%(\d+)/g)) {
      rates.add(Number(match[1]));
    }
  }
  if (rates.size === 0) return "";
  return `(${[...rates].sort((a, b) => a - b).map((r) => `%${r}`).join(", ")})`;
}

function computeAsgariIstisnalar(
  gelirVergisi: number,
  damgaVergisi: number,
  year: number,
  dateStr: string,
): { gelirIstisna: number; damgaIstisna: number } {
  let gelirIstisna = 0;
  let damgaIstisna = 0;
  if (year >= 2022 && dateStr) {
    const asgariBrut = getAsgariBrutForDate(dateStr);
    if (asgariBrut != null && asgariBrut > 0) {
      const asgariResult = calculateNetFromGross(asgariBrut, year);
      gelirIstisna = Math.min(gelirVergisi, asgariResult.gelirVergisi);
      damgaIstisna = Math.min(damgaVergisi, asgariResult.damgaVergisi);
    }
  }
  return { gelirIstisna, damgaIstisna };
}

function computeGrossFromNetWithCumulativeTax(
  netTarget: number,
  year: number,
  prevCumMatrah: number,
  dateStr: string,
): {
  gross: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirIstisna: number;
  damgaVergisi: number;
  damgaIstisna: number;
  matrah: number;
} {
  if (netTarget <= 0) {
    return { gross: netTarget, sgk: 0, issizlik: 0, gelirVergisi: 0, gelirIstisna: 0, damgaVergisi: 0, damgaIstisna: 0, matrah: 0 };
  }

  let low = netTarget;
  let high = netTarget * 2;
  let gross = netTarget / 0.7;

  for (let i = 0; i < 100; i++) {
    gross = (low + high) / 2;
    const sgk = round2(gross * SGK_ORAN);
    const issizlik = round2(gross * ISSIZLIK_ORAN);
    const matrah = gross - sgk - issizlik;
    const gelirVergisi = incrementalIncomeTax(year, prevCumMatrah, matrah);
    const damgaVergisi = round2(gross * DAMGA_ORAN);
    const { gelirIstisna, damgaIstisna } = computeAsgariIstisnalar(gelirVergisi, damgaVergisi, year, dateStr);
    const calculatedNet = round2(gross - sgk - issizlik - (gelirVergisi - gelirIstisna) - (damgaVergisi - damgaIstisna));
    if (Math.abs(calculatedNet - netTarget) < 0.005) break;
    if (calculatedNet < netTarget) low = gross;
    else high = gross;
  }

  gross = round2(gross);
  const sgk = round2(gross * SGK_ORAN);
  const issizlik = round2(gross * ISSIZLIK_ORAN);
  const matrah = gross - sgk - issizlik;
  const gelirVergisi = incrementalIncomeTax(year, prevCumMatrah, matrah);
  const damgaVergisi = round2(gross * DAMGA_ORAN);
  const { gelirIstisna, damgaIstisna } = computeAsgariIstisnalar(gelirVergisi, damgaVergisi, year, dateStr);

  return { gross, sgk, issizlik, gelirVergisi, gelirIstisna, damgaVergisi, damgaIstisna, matrah };
}

function calcBrutToNetPerRowNet(rows: CetvelRow[]): number[] {
  const kalans = calcPeriodSliceRows(rows);
  const sortedIndices = rows.map((row, i) => ({ i, start: String(row.startISO || "") })).sort((a, b) => a.start.localeCompare(b.start));
  const cumMatrahByYear = new Map<number, number>();
  const rowNets = new Array<number>(rows.length).fill(0);

  for (const { i } of sortedIndices) {
    const row = rows[i];
    const netBrut = kalans[i];
    if (netBrut === 0) continue;
    if (netBrut < 0) {
      rowNets[i] = round2(netBrut);
      continue;
    }

    const year = getRowYear(row);
    const dateStr = String(row.startISO || "");
    const sgk = round2(netBrut * SGK_ORAN);
    const issizlik = round2(netBrut * ISSIZLIK_ORAN);
    const matrah = netBrut - sgk - issizlik;
    const prevCum = cumMatrahByYear.get(year) || 0;
    const gelirVergisi = incrementalIncomeTax(year, prevCum, matrah);
    cumMatrahByYear.set(year, prevCum + matrah);

    const damgaVergisi = round2(netBrut * DAMGA_ORAN);
    const { gelirIstisna, damgaIstisna } = computeAsgariIstisnalar(gelirVergisi, damgaVergisi, year, dateStr);
    rowNets[i] = round2(netBrut - sgk - issizlik - (gelirVergisi - gelirIstisna) - (damgaVergisi - damgaIstisna));
  }

  return rowNets;
}

function computeGelirVergisiDilimleriFromMatrahByYear(matrahByYear: Map<number, number>): string {
  const summaries: string[] = [];
  for (const [year, matrah] of matrahByYear) {
    if (matrah > 0) summaries.push(calculateIncomeTaxWithBrackets(year, matrah).summary);
  }
  return mergeBracketSummaries(summaries);
}

/** Brütten Nete (segmentli, dönem/yıl kümülatif matrah + asgari ücret istisnası). */
export function calculateSegmentedNetFromRows(rows: CetvelRow[]): ConversionPanelData {
  const z = (v: number) => round2(v);
  const emptyResult = (): ConversionPanelData => ({ ...EMPTY_CONVERSION_PANEL });
  if (!Array.isArray(rows) || rows.length === 0) return emptyResult();

  const kalans = calcPeriodSliceRows(rows);
  const sortedIndices = rows.map((row, i) => ({ i, start: String(row.startISO || "") })).sort((a, b) => a.start.localeCompare(b.start));

  const cumMatrahByYear = new Map<number, number>();
  const rowSgk = new Array<number>(rows.length).fill(0);
  const rowIssizlik = new Array<number>(rows.length).fill(0);
  const rowGelirBrut = new Array<number>(rows.length).fill(0);
  const rowGelirIstisna = new Array<number>(rows.length).fill(0);
  const rowDamgaBrut = new Array<number>(rows.length).fill(0);
  const rowDamgaIstisna = new Array<number>(rows.length).fill(0);

  let totalGross = 0;
  let totalSgk = 0;
  let totalIssizlik = 0;
  let totalGelirVergisiBrut = 0;
  let totalGelirVergisiIstisna = 0;
  let totalDamgaVergisiBrut = 0;
  let totalDamgaVergisiIstisna = 0;

  for (const { i } of sortedIndices) {
    const row = rows[i];
    const netBrut = kalans[i];
    if (netBrut === 0) continue;
    if (netBrut < 0) continue;

    const year = getRowYear(row);
    const sgk = z(netBrut * SGK_ORAN);
    const issizlik = z(netBrut * ISSIZLIK_ORAN);
    const matrah = netBrut - sgk - issizlik;
    const prevCum = cumMatrahByYear.get(year) || 0;
    const gelirVergisi = incrementalIncomeTax(year, prevCum, matrah);
    cumMatrahByYear.set(year, prevCum + matrah);

    const damgaVergisi = z(netBrut * DAMGA_ORAN);
    const { gelirIstisna, damgaIstisna } = computeAsgariIstisnalar(gelirVergisi, damgaVergisi, year, String(row.startISO || ""));

    rowSgk[i] = sgk;
    rowIssizlik[i] = issizlik;
    rowGelirBrut[i] = gelirVergisi;
    rowGelirIstisna[i] = gelirIstisna;
    rowDamgaBrut[i] = damgaVergisi;
    rowDamgaIstisna[i] = damgaIstisna;
    totalGross += netBrut;
  }

  for (let i = 0; i < rows.length; i++) {
    totalSgk += rowSgk[i];
    totalIssizlik += rowIssizlik[i];
    totalGelirVergisiBrut += rowGelirBrut[i];
    totalGelirVergisiIstisna += rowGelirIstisna[i];
    totalDamgaVergisiBrut += rowDamgaBrut[i];
    totalDamgaVergisiIstisna += rowDamgaIstisna[i];
  }

  const grandBrut = z(calcCetvelGrandTotal(rows));
  const totalGelirVergisi = z(totalGelirVergisiBrut - totalGelirVergisiIstisna);
  const totalDamgaVergisi = z(totalDamgaVergisiBrut - totalDamgaVergisiIstisna);
  const gelirVergisiDilimleri = computeGelirVergisiDilimleriFromMatrahByYear(cumMatrahByYear);

  return {
    gross: grandBrut,
    sgk: z(totalSgk),
    issizlik: z(totalIssizlik),
    gelirVergisiBrut: z(totalGelirVergisiBrut),
    gelirVergisiIstisna: z(totalGelirVergisiIstisna),
    gelirVergisi: totalGelirVergisi,
    damgaVergisiBrut: z(totalDamgaVergisiBrut),
    damgaVergisiIstisna: z(totalDamgaVergisiIstisna),
    damgaVergisi: totalDamgaVergisi,
    net: z(grandBrut - totalSgk - totalIssizlik - totalGelirVergisi - totalDamgaVergisi),
    gelirVergisiDilimleri,
  };
}

function segmentedGrossFromNetTargets(rows: CetvelRow[], netTargets: number[]): ConversionPanelData {
  const z = (v: number) => round2(v);
  let totalGross = 0;
  let totalSgk = 0;
  let totalIssizlik = 0;
  let totalGelirVergisiBrut = 0;
  let totalGelirVergisiIstisna = 0;
  let totalGelirVergisi = 0;
  let totalDamgaVergisiBrut = 0;
  let totalDamgaVergisiIstisna = 0;
  let totalDamgaVergisi = 0;

  const sortedIndices = rows.map((row, i) => ({ i, start: String(row.startISO || "") })).sort((a, b) => a.start.localeCompare(b.start));
  const cumMatrahByYear = new Map<number, number>();

  for (const { i } of sortedIndices) {
    const row = rows[i];
    const netPeriod = netTargets[i];
    if (netPeriod <= 0) {
      totalGross += z(netPeriod);
      continue;
    }

    const dateStr = String(row.startISO || "");
    const year = getRowYear(row);
    const prevCum = cumMatrahByYear.get(year) || 0;
    const result = computeGrossFromNetWithCumulativeTax(netPeriod, year, prevCum, dateStr);
    cumMatrahByYear.set(year, prevCum + result.matrah);

    totalGross += result.gross;
    totalSgk += result.sgk;
    totalIssizlik += result.issizlik;
    totalGelirVergisiBrut += result.gelirVergisi;
    totalGelirVergisiIstisna += result.gelirIstisna;
    totalGelirVergisi += z(result.gelirVergisi - result.gelirIstisna);
    totalDamgaVergisiBrut += result.damgaVergisi;
    totalDamgaVergisiIstisna += result.damgaIstisna;
    totalDamgaVergisi += z(result.damgaVergisi - result.damgaIstisna);
  }

  const gelirVergisiDilimleri = computeGelirVergisiDilimleriFromMatrahByYear(cumMatrahByYear);

  return {
    gross: z(totalGross),
    sgk: z(totalSgk),
    issizlik: z(totalIssizlik),
    gelirVergisiBrut: z(totalGelirVergisiBrut),
    gelirVergisiIstisna: z(totalGelirVergisiIstisna),
    gelirVergisi: z(totalGelirVergisi),
    damgaVergisiBrut: z(totalDamgaVergisiBrut),
    damgaVergisiIstisna: z(totalDamgaVergisiIstisna),
    damgaVergisi: z(totalDamgaVergisi),
    net: z(calcCetvelGrandTotal(rows)),
    gelirVergisiDilimleri,
  };
}

/** Brüt cetvel satırlarından netten brüte (Brütten Nete'nin tersi: önce brüt→net, sonra net→brüt). */
export function calculateSegmentedGrossFromBrutCetvelRows(rows: CetvelRow[]): ConversionPanelData {
  if (!Array.isArray(rows) || rows.length === 0) return { ...EMPTY_CONVERSION_PANEL };
  const rowNets = calcBrutToNetPerRowNet(rows);
  const grossResult = segmentedGrossFromNetTargets(rows, rowNets);
  const netTotals = calculateSegmentedNetFromRows(rows);
  return { ...grossResult, net: netTotals.net, gelirVergisiDilimleri: grossResult.gelirVergisiDilimleri || netTotals.gelirVergisiDilimleri };
}

/** Net cetvel satırlarından netten brüte toplam (ücret alanı zaten net olduğundan doğrudan hedef). */
export function calculateSegmentedGrossFromNetRows(rows: CetvelRow[]): ConversionPanelData {
  if (!Array.isArray(rows) || rows.length === 0) return { ...EMPTY_CONVERSION_PANEL };
  return segmentedGrossFromNetTargets(rows, calcPeriodSliceRows(rows));
}

function getStartISOForYearPeriod(year: number, period?: 1 | 2): string {
  return period === 2 ? `${year}-07-15` : `${year}-06-15`;
}

/** Tek aylık brüt için brütten nete (Davacı Ücreti mantığıyla aynı, tek satır). */
export function computeNetFromGrossSingle(gross: number, year: number, period?: 1 | 2, startISO?: string): ConversionPanelData {
  if (!gross || gross <= 0) return { ...EMPTY_CONVERSION_PANEL };
  const row: CetvelRow = {
    id: "single",
    rangeLabel: "",
    startISO: startISO || getStartISOForYearPeriod(year, period),
    endISO: "",
    ucret: gross,
    katsayi: 1,
    gunSayisi: 30,
    ayGunSayisi: 30,
    ucretManual: false,
    odenenUcret: 0,
  };
  return calculateSegmentedNetFromRows([row]);
}

/** Tek aylık net için netten brüte (binary search, Brütten Nete ile aynı kurallar). */
export function computeGrossFromNetSingle(netInput: number, year: number, period?: 1 | 2, startISO?: string): ConversionPanelData {
  if (!netInput || netInput <= 0) return { ...EMPTY_CONVERSION_PANEL };
  const rowStartISO = startISO || getStartISOForYearPeriod(year, period);
  let low = netInput;
  let high = netInput * 2;
  let gross = netInput / 0.7;
  for (let i = 0; i < 100; i++) {
    gross = (low + high) / 2;
    const res = computeNetFromGrossSingle(gross, year, period, rowStartISO);
    const calculatedNet = round2(res.net);
    if (Math.abs(calculatedNet - netInput) < 0.005) break;
    if (calculatedNet < netInput) low = gross;
    else high = gross;
  }
  gross = round2(gross);
  const grossPlus1 = round2(gross + 0.01);
  const resPlus = computeNetFromGrossSingle(grossPlus1, year, period, rowStartISO);
  if (round2(resPlus.net) === round2(netInput)) {
    return { ...computeNetFromGrossSingle(grossPlus1, year, period, rowStartISO), gross: grossPlus1 };
  }
  return { ...computeNetFromGrossSingle(gross, year, period, rowStartISO), gross };
}

/* ────────────────────────────────────────────────────────────────────────
 * Üst düzey orkestrasyon
 * ──────────────────────────────────────────────────────────────────────── */

function selectedYearFromEndDate(endDate: string): number {
  if (endDate && endDate.trim() !== "") {
    const exitDate = new Date(endDate);
    if (!Number.isNaN(exitDate.getTime())) {
      const year = exitDate.getFullYear();
      if (year >= 2010 && year <= 2030) return year;
    }
  }
  return new Date().getFullYear();
}

export function computeUcretAlacagi(form: UcretAlacagiForm): UcretAlacagiResult {
  const workPeriod = form.startDate && form.endDate ? calcWorkPeriodBilirKisi(form.startDate, form.endDate) : EMPTY_PERIOD;
  const selectedYear = selectedYearFromEndDate(form.endDate);

  const totalBrut = calcCetvelGrandTotal(form.cetvelRows);
  const totalNet = calcCetvelGrandTotal(form.netCetvelRows);
  const brutKalanRows = calcKalanRows(form.cetvelRows);
  const netKalanRows = calcKalanRows(form.netCetvelRows);
  const brutOdenenToplam = form.cetvelRows.reduce((acc, row) => acc + (row.odenenUcret || 0), 0);
  const netOdenenToplam = form.netCetvelRows.reduce((acc, row) => acc + (row.odenenUcret || 0), 0);

  const netFromGross = form.cetvelRows.length > 0 ? calculateSegmentedNetFromRows(form.cetvelRows) : EMPTY_CONVERSION_PANEL;
  const netTabGrossFromCetvel = form.netCetvelRows.length > 0 ? calculateSegmentedGrossFromNetRows(form.netCetvelRows) : EMPTY_CONVERSION_PANEL;

  const netVal = parseNum(form.netForGross);
  let brutTabGrossFromNetManual: ConversionPanelData = EMPTY_CONVERSION_PANEL;
  if (netVal > 0) {
    const cetvelNet = netFromGross.net;
    const useSegmented = form.cetvelRows.length > 0 && Math.abs(netVal - cetvelNet) < 0.02;
    const d = useSegmented ? calculateSegmentedGrossFromBrutCetvelRows(form.cetvelRows) : computeGrossFromNetSingle(netVal, selectedYear);
    brutTabGrossFromNetManual = { ...d, net: useSegmented ? netVal : d.net };
  }

  const netTabGrossVal = parseNum(form.netTabGrossForNet);
  let netTabNetFromGrossManual: ConversionPanelData = EMPTY_CONVERSION_PANEL;
  if (netTabGrossVal > 0) {
    const cetvelGross = netTabGrossFromCetvel.gross;
    const useSegmented = form.netCetvelRows.length > 0 && Math.abs(netTabGrossVal - cetvelGross) < 0.02;
    const d = useSegmented ? calculateSegmentedGrossFromNetRows(form.netCetvelRows) : computeNetFromGrossSingle(netTabGrossVal, selectedYear);
    netTabNetFromGrossManual = { ...d, gross: useSegmented ? netTabGrossVal : d.gross };
  }

  return {
    workPeriod,
    totalBrut,
    totalNet,
    brutKalanRows,
    netKalanRows,
    brutOdenenToplam,
    netOdenenToplam,
    netFromGross,
    netTabGrossFromCetvel,
    brutTabGrossFromNetManual,
    netTabNetFromGrossManual,
  };
}
