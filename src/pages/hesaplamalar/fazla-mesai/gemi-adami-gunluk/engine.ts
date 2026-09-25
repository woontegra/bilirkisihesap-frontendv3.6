/**
 * Gemi Adamı — Günlük Çalışan Fazla Mesai motoru (%100 lokal).
 * Backend gemiFM.service + V3 sayfa sonrası tanık FM override / birleştirme / düşüm.
 */

import { runGemiGunlukV3Pipeline } from "./v3-engine/pipeline";
import {
  DAMGA_ORAN,
  FAZLA_MESAI_DENOMINATOR,
  FAZLA_MESAI_KATSAYI,
  GEMI_DAILY_REF_HOURS,
  HALF_YEAR_DAY_LIMIT,
  ISSIZLIK_ORANI,
  MAX_WEEKS_PER_YEAR,
  PANDEMI_BASLANGIC,
  PANDEMI_BITIS,
  PANDEMI_SABIT_GUN,
  SGK_ORANI,
  WEEKLY_WORK_LIMIT,
} from "./constants";
import {
  bilirkisiRoundWeeklyTotalHours,
  buildSevenDayWindowsForTest,
  calculateFm,
  gemiFmHoursForDeductionWeek,
  makeBlankManualRow,
} from "./expandRowsForDeductions";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import {
  type GemiGunlukFormSnapshot,
  type GemiGunlukResult,
  type PeriodRow,
  type RowOverride,
  type SevenDayMode,
} from "./model";

export {
  bilirkisiRoundWeeklyTotalHours,
  buildSevenDayWindowsForTest as buildSevenDayWindows,
  calculateFm,
  gemiFmHoursForDeductionWeek,
  makeBlankManualRow,
};
export { WEEKLY_WORK_LIMIT, GEMI_DAILY_REF_HOURS as DAILY_REF, FAZLA_MESAI_DENOMINATOR as DENOM, FAZLA_MESAI_KATSAYI as FACTOR };

/* ── Sayı / para ── */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseMoneyInput(value: string): number {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n || 0 : 0;
}

export { sanitizeMoneyTyping } from "@/utils/moneyInput";

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value || 0 : 0);
}

export function formatHours(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value || 0 : 0);
}

export function parseKatsayi(value: string): number {
  const n = parseMoneyInput(value);
  return n > 0 ? n : 1;
}

/** V3 `ceilWeeklyWorkHoursToHalfHour` — metin / tanık FM. */
export function ceilWeeklyWorkHoursToHalfHour(weeklyTotal: number): number {
  const GRID_EPS = 1e-7;
  if (!Number.isFinite(weeklyTotal)) return 0;
  const doubled = weeklyTotal * 2;
  const nearestHalf = Math.round(doubled);
  if (Math.abs(doubled - nearestHalf) < GRID_EPS) return nearestHalf / 2;
  return Math.ceil(doubled - GRID_EPS) / 2;
}

/* ── Tarih ── */

export function isValidIsoDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? "").trim());
}

function isoToUtcDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetweenIsoInclusive(startISO: string, endISO: string): number {
  if (!isValidIsoDate(startISO) || !isValidIsoDate(endISO)) return 0;
  return isoToUtcDays(endISO) - isoToUtcDays(startISO) + 1;
}

export function validateDateRange(startIso: string, endIso: string): string | null {
  if (!startIso || !endIso) return null;
  if (!isValidIsoDate(startIso) || !isValidIsoDate(endIso)) return "Geçersiz tarih.";
  if (endIso < startIso) return "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.";
  return null;
}

export function isValidRange(startIso: string, endIso: string): boolean {
  return !validateDateRange(startIso, endIso) && !!startIso && !!endIso;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Backend calculateWeekCount (exclusions=[] ile): round(gün/7), 25→26, ≤370 ise max 52. */
export function calculateWeekCount(startIso: string, endIso: string): number {
  const days = daysBetweenIsoInclusive(startIso, endIso);
  if (days <= 0) return 0;
  let weeks = Math.round(days / 7);
  if (weeks === 25 && days <= HALF_YEAR_DAY_LIMIT) weeks = 26;
  if (days <= 370 && weeks > MAX_WEEKS_PER_YEAR) weeks = MAX_WEEKS_PER_YEAR;
  if (weeks < 1) weeks = 1;
  return weeks;
}

export function calculateWeeksBetweenDates(startISO: string, endISO: string): number {
  return calculateWeekCount(startISO, endISO);
}

export function computeZamanasimiNihaiBaslangic(
  davaTarihi: string,
  arabuluculukBaslangic: string,
  arabuluculukBitis: string,
  iseGiris: string,
): string | null {
  if (!isValidIsoDate(davaTarihi)) return null;
  const davaMs = isoToUtcMs(davaTarihi);
  const limitMs = Date.UTC(
    new Date(davaMs).getUTCFullYear() - 5,
    new Date(davaMs).getUTCMonth(),
    new Date(davaMs).getUTCDate(),
  );

  let arabuluculukGun = 0;
  if (isValidIsoDate(arabuluculukBaslangic) && isValidIsoDate(arabuluculukBitis)) {
    arabuluculukGun = Math.max(
      0,
      isoToUtcDays(arabuluculukBitis) - isoToUtcDays(arabuluculukBaslangic) + 1,
    );
  }

  let pandemiGun = 0;
  if (isValidIsoDate(iseGiris)) {
    const iseMs = isoToUtcMs(iseGiris);
    const pandemiBasMs = isoToUtcMs(PANDEMI_BASLANGIC);
    const pandemiBitMs = isoToUtcMs(PANDEMI_BITIS);
    if (iseMs < pandemiBasMs) pandemiGun = PANDEMI_SABIT_GUN;
    else if (iseMs >= pandemiBasMs && iseMs <= pandemiBitMs) {
      pandemiGun = Math.max(0, Math.round((pandemiBitMs - iseMs) / 86400000) + 1);
    }
  }

  const nihaiMs = limitMs - arabuluculukGun * 86400000 - pandemiGun * 86400000;
  const d = new Date(nihaiMs);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/* ── Saat ── */

export function parseTimeToHours(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

export function normalizeTimeStr(timeStr?: string | null): string | null {
  if (!timeStr) return null;
  const clean = String(timeStr).trim().replace(".", ":");
  const [hs, ms] = clean.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function rawDailyHoursBetween(startHour: number, endHour: number): number {
  let raw = endHour - startHour;
  if (raw < 0) raw += 24;
  if (raw > 24) raw -= 24;
  return raw;
}

export function computeBreakHours(dailyGross: number): number {
  if (!Number.isFinite(dailyGross) || dailyGross <= 0) return 0;
  if (dailyGross <= 4) return 0.25;
  if (dailyGross <= 7.5) return 0.5;
  if (dailyGross < 11) return 1;
  if (dailyGross < 14) return 1.5;
  if (dailyGross < 15) return 2;
  return 3;
}

export function calculateDailyWorkHours(inT: string, outT: string): number {
  const a = parseTimeToHours(inT);
  let b = parseTimeToHours(outT);
  if (a == null || b == null) return 0;
  if (b === 0 && a > 0) b = 24;
  return rawDailyHoursBetween(a, b);
}

/** Cetvel FM: yuvarlamasız (backend computeClassic). */
export function computeWeeklyHoursRaw(dailyHours: number, weeklyDays: number, sevenDayMode: SevenDayMode): number {
  const n = Number(weeklyDays) || 0;
  if (n === 7 && sevenDayMode === "tatilli") {
    return dailyHours * 6 + Math.max(0, dailyHours - GEMI_DAILY_REF_HOURS);
  }
  const daysWork = n > 0 ? n : 7;
  return dailyHours * daysWork;
}

export function computeFmHoursWeekly(dailyHours: number, weeklyDays: number, sevenDayMode: SevenDayMode): number {
  return Math.max(0, computeWeeklyHoursRaw(dailyHours, weeklyDays, sevenDayMode) - WEEKLY_WORK_LIMIT);
}

/** Alias tests. */
export function computeWeeklyHours(dailyHours: number, weeklyDays: number, sevenDayMode: SevenDayMode): number {
  return computeWeeklyHoursRaw(dailyHours, weeklyDays, sevenDayMode);
}

export function computeFmMoney(weeks: number, brut: number, katsayi: number, fmHours: number): { fm: number; net: number } {
  const fm = calculateFm(weeks, brut, katsayi, fmHours);
  const net = Number((fm * (1 - DAMGA_ORAN - 0.15)).toFixed(2));
  return { fm, net };
}

/* ── Overrides ── */

export function applyRowOverrides(
  rows: PeriodRow[],
  overrides: Record<string, RowOverride>,
  manualRows: PeriodRow[] = [],
  defaultKatsayi = 1,
): PeriodRow[] {
  const applyOne = (row: PeriodRow): PeriodRow | null => {
    const ov = overrides[row.id];
    if (ov?.hidden && !row.isManual) return null;
    if (!ov) {
      if (!row.isManual) return row;
      return {
        ...row,
        fm: calculateFm(row.weeks, row.brut, row.katsayi || defaultKatsayi, row.fmHours),
      };
    }
    let startISO = ov.startISO ?? row.startISO;
    let endISO = ov.endISO ?? row.endISO;
    let weeks = ov.weeks ?? row.weeks;
    if ((ov.startISO != null || ov.endISO != null) && isValidIsoDate(startISO) && isValidIsoDate(endISO)) {
      let w = Math.max(1, calculateWeeksBetweenDates(startISO, endISO) || 1);
      const spanDays = daysBetweenIsoInclusive(startISO, endISO);
      if (spanDays > 0 && spanDays <= 370) w = Math.min(52, w);
      weeks = w;
    }
    const brut = ov.brut ?? row.brut;
    const katsayi = ov.katsayi ?? row.katsayi;
    const fmHours = ov.fmHours ?? row.fmHours;
    return {
      ...row,
      startISO,
      endISO,
      weeks,
      brut,
      katsayi,
      fmHours,
      fm: calculateFm(weeks, brut, katsayi, fmHours),
    };
  };

  const base: PeriodRow[] = [];
  for (const r of rows) {
    const next = applyOne(r);
    if (next) base.push(next);
  }

  const manuals = (manualRows ?? [])
    .map((m) => applyOne(m))
    .filter((x): x is PeriodRow => !!x);

  const autoRowKeys = new Set(
    base.map(
      (r) =>
        `${(r.startISO || "").slice(0, 10)}|${(r.endISO || "").slice(0, 10)}|${Number(r.fmHours) || 0}|${Number(r.weeks) || 0}`,
    ),
  );
  const uniqueManuals = manuals.filter((m) => {
    const key = `${(m.startISO || "").slice(0, 10)}|${(m.endISO || "").slice(0, 10)}|${Number(m.fmHours) || 0}|${Number(m.weeks) || 0}`;
    return !autoRowKeys.has(key);
  });

  if (uniqueManuals.length === 0) return base;

  const result: PeriodRow[] = [];
  const placed = new Set<string>();
  for (const r of base) {
    result.push(r);
    for (const m of uniqueManuals) {
      if (m.insertAfter === r.id && !placed.has(m.id)) {
        result.push(m);
        placed.add(m.id);
      }
    }
  }
  for (const m of uniqueManuals) {
    if (!placed.has(m.id)) result.push(m);
  }
  return result;
}

export function createManualPeriodRow(katsayi: number, insertAfter?: string): PeriodRow {
  return makeBlankManualRow(katsayi, insertAfter);
}

/* ── Totals ── */

export function computeTotalsFromRows(
  rows: { fm: number }[],
  exitYear: number,
  mahsupInput: string,
): Pick<
  GemiGunlukResult,
  | "toplamFm"
  | "sgk"
  | "issizlik"
  | "gelirVergisi"
  | "gelirVergisiDilimleri"
  | "damgaVergisi"
  | "netYillik"
  | "hakkaniyetIndirimi"
  | "mahsupTutari"
  | "sonNet"
> {
  const toplamFm = rows.reduce((sum, r) => sum + (Number(r.fm) || 0), 0);
  const sgk = Math.round(toplamFm * SGK_ORANI * 100) / 100;
  const issizlik = Math.round(toplamFm * ISSIZLIK_ORANI * 100) / 100;
  const matrah = Math.max(0, toplamFm - sgk - issizlik);
  const gv = calculateIncomeTaxWithBrackets(exitYear, matrah);
  const gelirVergisi = Math.round(gv.tax * 100) / 100;
  const damgaVergisi = Math.round(toplamFm * DAMGA_ORAN * 100) / 100;
  const netYillik = Math.round((toplamFm - sgk - issizlik - gelirVergisi - damgaVergisi) * 100) / 100;
  const hakkaniyetIndirimi = toplamFm / 3;
  const mahsupTutari = parseMoneyInput(mahsupInput);
  const sonNet = Math.max(0, toplamFm - hakkaniyetIndirimi - mahsupTutari);
  return {
    toplamFm,
    sgk,
    issizlik,
    gelirVergisi,
    gelirVergisiDilimleri: gv.summary,
    damgaVergisi,
    netYillik,
    hakkaniyetIndirimi,
    mahsupTutari,
    sonNet,
  };
}

/* ── Ana hesap ── */

export function computeGemiGunlukResult(form: GemiGunlukFormSnapshot): GemiGunlukResult {
  const piped = runGemiGunlukV3Pipeline(form);
  const exitYear = form.istenCikis ? Number(form.istenCikis.slice(0, 4)) : new Date().getFullYear();
  const totals = computeTotalsFromRows(piped.rows, exitYear, form.mahsup);

  return {
    dailyGrossHours: piped.dailyGrossHours,
    breakHours: piped.breakHours,
    dailyNetHours: piped.dailyNetHours,
    weeklyRawHours: piped.weeklyRawHours,
    weeklyRoundedHours: piped.weeklyRoundedHours,
    baselineWeeklyFmHours: piped.baselineWeeklyFmHours,
    rows: piped.rows,
    ...totals,
    warnings: piped.warnings,
  };
}

/** Test alias — eski include270 API. */
export function fmHoursForDeductionWindow(
  dailyHours: number,
  weeklyDays: number,
  sevenDayMode: SevenDayMode,
  excludedUnits: number,
): number {
  return gemiFmHoursForDeductionWeek(
    {
      dailyNet: dailyHours,
      hg: weeklyDays,
      weeklyOffDay: null,
      davaciSevenDay: sevenDayMode,
    },
    excludedUnits,
  );
}
