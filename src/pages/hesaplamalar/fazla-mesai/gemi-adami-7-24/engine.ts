/**
 * Gemi Adamı — 7/24 Tam Mürettebat Fazla Mesai hesaplama motoru — %100 lokal.
 * V3 backend `gemiFullCrew24FM.service.js` + istemci expand ile aynı sonuç.
 */

import { getAsgariUcretByDate, getAsgariUcretPeriodsInRange } from "./asgariUcret";
import { FIXED_FM_HOURS } from "./constants";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import type {
  Gemi724FormSnapshot,
  Gemi724Result,
  PeriodRow,
  WitnessInput,
} from "./model";
import { newLocalId } from "./model";
import { runGemi724V3Pipeline } from "./v3-engine/pipeline";

/* ── Sabitler ── */
export const WEEKLY_LIMIT = 48;
export const DENOM = 240;
export const FACTOR = 1.25;
export const WEEKLY_NET_HOURS = 91;
export const DAILY_NET_HOURS = 13;
export const LEAVE_HOURS = 8;
/** 91 - 48 - 8 = 35 */
export { FIXED_FM_HOURS } from "./constants";
export const YARGITAY_270_DEDUCTION_HOURS = 5 + 12 / 60;
export const DAMGA_ORANI = 0.00759;
/** @deprecated Satır bazlı düz oran; brütten-nete kademeli GV kullanır. */
export const GELIR_VERGISI_ORANI = 0.15;
export const SGK_ORANI = 0.14;
export const ISSIZLIK_ORANI = 0.01;
export const DAMGA_ORAN = DAMGA_ORANI;
const MAX_WEEKS_PER_YEAR = 52;
const HALF_YEAR_DAY_LIMIT = 183;

export const GEMI_724_METIN_SABLON =
  "7/24 çalışan hesabı:\n" +
  "7 gün × 24 saat = 168 saat (toplam)\n" +
  "168 - 77 saat (dinlenme molası) = 91 saat (net çalışma)\n" +
  "91 - 48 saat (yasal haftalık çalışma) - 8 saat (hafta tatili izni) = 35 saat haftalık fazla mesai";

/* ── Sayı / para ── */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseMoneyInput(value: string): number {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n || 0 : 0;
}

export function parseKatsayi(value: string): number {
  const n = parseMoneyInput(value);
  return n > 0 ? n : 1;
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

/* ── Tarih ── */
export function parseIsoDateParts(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export function isoToDate(iso: string): Date | null {
  const p = parseIsoDateParts(iso);
  if (!p) return null;
  return new Date(p.y, p.m - 1, p.d);
}

export function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = isoToDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return dateToIso(d);
}

export function inclusiveDayCount(startIso: string, endIso: string): number {
  const s = isoToDate(startIso);
  const e = isoToDate(endIso);
  if (!s || !e || e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

export function isValidRange(startIso: string, endIso: string): boolean {
  const s = isoToDate(startIso);
  const e = isoToDate(endIso);
  return !!s && !!e && s <= e;
}

export function isValidIsoDate(iso: string): boolean {
  return parseIsoDateParts(iso) != null;
}

export function daysBetweenIsoInclusive(startISO: string, endISO: string): number {
  return inclusiveDayCount(startISO, endISO);
}

export function validateDateRange(start: string, end: string): string | null {
  if (!start || !end) return null;
  return isValidRange(start, end) ? null : "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.";
}

/* ── Zamanaşımı ── */
export const PANDEMI_BASLANGIC = "2020-03-13";
export const PANDEMI_BITIS = "2020-06-15";
export const PANDEMI_SABIT_GUN = 94;

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoToUtcDays(iso: string): number {
  return isoToUtcMs(iso) / 86400000;
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
    arabuluculukGun = Math.max(0, isoToUtcDays(arabuluculukBitis) - isoToUtcDays(arabuluculukBaslangic) + 1);
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

function getExcludedDaysInPeriod(
  startIso: string,
  endIso: string,
  exclusions: Array<{ start: string; end: string }>,
): number {
  if (!exclusions.length) return 0;
  const periodStart = isoToDate(startIso);
  const periodEnd = isoToDate(endIso);
  if (!periodStart || !periodEnd) return 0;
  let total = 0;
  for (const ex of exclusions) {
    const es = isoToDate(ex.start);
    const ee = isoToDate(ex.end || ex.start);
    if (!es || !ee) continue;
    const overlapStart = es > periodStart ? es : periodStart;
    const overlapEnd = ee < periodEnd ? ee : periodEnd;
    if (overlapStart <= overlapEnd) {
      total += Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1;
    }
  }
  return total;
}

/**
 * Backend calculateWeekCount: round(gün/7); 25→26 (≤183); exclusion haftası (0.5 eşiği);
 * min 1, max 52.
 */
export function calculateWeekCount(
  startIso: string,
  endIso: string,
  exclusions: Array<{ start: string; end: string }> = [],
): number {
  const days = inclusiveDayCount(startIso, endIso);
  if (days <= 0) return 0;
  let totalWeeks = Math.round(days / 7);
  if (totalWeeks === 25 && days <= HALF_YEAR_DAY_LIMIT) totalWeeks = 26;

  const excludedDaysTotal = getExcludedDaysInPeriod(startIso, endIso, exclusions);
  const weeksFrac = excludedDaysTotal / 7;
  const full = Math.floor(weeksFrac);
  const fraction = weeksFrac - full;
  const excludedWeeks = fraction < 0.5 ? full : full + 1;

  let weeksResult = Math.max(0, totalWeeks - excludedWeeks);
  if (weeksResult > MAX_WEEKS_PER_YEAR) weeksResult = MAX_WEEKS_PER_YEAR;
  if (weeksResult < 1) weeksResult = 1;
  return weeksResult;
}

/** İstemci birleştirme: round(inclusiveDays/7); ≤370 gün → max 52. */
export function calculateWeeksBetweenDates(startIso: string, endIso: string): number {
  const days = inclusiveDayCount(startIso, endIso);
  if (days <= 0) return 0;
  let weeks = Math.round(days / 7);
  if (days <= 370) weeks = Math.min(52, weeks);
  return Math.max(1, weeks);
}

/* ── Para hesabı (backend adımlı) ── */
export function computeFmMoney(
  weeks: number,
  brutAsgari: number,
  katsayi: number,
  fmHours: number,
): { fm: number; net: number } {
  const step1 = Number((weeks * brutAsgari).toFixed(6));
  const step2 = Number((step1 * katsayi).toFixed(6));
  const step3 = Number((step2 * fmHours).toFixed(6));
  const step4 = Number((step3 / DENOM).toFixed(6));
  const step5 = Number((step4 * FACTOR).toFixed(6));
  const fm = Number(step5.toFixed(2));
  const net = Number((fm * (1 - DAMGA_ORANI - GELIR_VERGISI_ORANI)).toFixed(2));
  return { fm, net };
}

/* ── Tanık segmentasyonu (V3 normalizeWitnessDateRanges) ── */
type DateRange = { start: string; end: string };
type DateSegment = DateRange & { witnessIds: string[] };

function clipRange(a: DateRange, bound: DateRange): DateRange | null {
  const start = a.start > bound.start ? a.start : bound.start;
  const end = a.end < bound.end ? a.end : bound.end;
  if (start > end) return null;
  return { start, end };
}

export function buildDateSegments(
  claimStart: string,
  claimEnd: string,
  witnesses: WitnessInput[],
): DateSegment[] {
  if (!isValidRange(claimStart, claimEnd)) return [];

  const effective: { start: string; end: string; id: string }[] = [];
  for (const w of witnesses) {
    if (!w.dateIn || !w.dateOut || !isValidRange(w.dateIn, w.dateOut)) continue;
    const clipped = clipRange({ start: w.dateIn, end: w.dateOut }, { start: claimStart, end: claimEnd });
    if (clipped) effective.push({ ...clipped, id: w.id });
  }

  if (effective.length === 0) {
    return [{ start: claimStart, end: claimEnd, witnessIds: [] }];
  }

  const pivots = new Set<string>();
  pivots.add(claimStart);
  pivots.add(addDaysIso(claimEnd, 1));
  for (const r of effective) {
    pivots.add(r.start);
    pivots.add(addDaysIso(r.end, 1));
  }
  for (const p of getAsgariUcretPeriodsInRange(claimStart, claimEnd)) {
    if (p.start > claimStart && p.start <= claimEnd) pivots.add(p.start);
  }

  const sorted = [...pivots].sort();
  const segments: DateSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = addDaysIso(sorted[i + 1], -1);
    if (segStart > segEnd) continue;
    if (segStart < claimStart || segEnd > claimEnd) continue;
    const witnessIds = effective
      .filter((r) => !(segEnd < r.start || segStart > r.end))
      .map((r) => r.id);
    if (witnessIds.length === 0) continue;
    segments.push({ start: segStart, end: segEnd, witnessIds });
  }
  return segments.length > 0 ? segments : [{ start: claimStart, end: claimEnd, witnessIds: [] }];
}

export function splitSegmentByAsgari(segment: DateSegment): (DateSegment & { brut: number })[] {
  const periods = getAsgariUcretPeriodsInRange(segment.start, segment.end);
  if (periods.length === 0) {
    const brut = getAsgariUcretByDate(segment.start) ?? 0;
    return [{ ...segment, brut }];
  }
  return periods.map((p) => ({
    start: p.start,
    end: p.end,
    witnessIds: segment.witnessIds,
    brut: p.brut,
  }));
}

export function computeTotalsFromRows(
  rows: { fm: number }[],
  exitYear: number,
  mahsupInput: string,
): Pick<
  Gemi724Result,
  | "totalFm"
  | "sgk"
  | "issizlik"
  | "gelirVergisi"
  | "gelirVergisiDilimleri"
  | "damgaVergisi"
  | "netYillik"
  | "hakkaniyetIndirimi"
  | "mahsupTutari"
  | "sonNet"
  | "totalNet"
> {
  const totalFm = round2(rows.reduce((sum, r) => sum + (r.fm || 0), 0));
  const sgk = round2(totalFm * SGK_ORANI);
  const issizlik = round2(totalFm * ISSIZLIK_ORANI);
  const matrah = Math.max(0, totalFm - sgk - issizlik);
  const gv = calculateIncomeTaxWithBrackets(exitYear, matrah);
  const gelirVergisi = round2(gv.tax);
  const damgaVergisi = round2(totalFm * DAMGA_ORAN);
  const netYillik = round2(totalFm - sgk - issizlik - gelirVergisi - damgaVergisi);
  const hakkaniyetIndirimi = round2(totalFm / 3);
  const mahsupTutari = parseMoneyInput(mahsupInput);
  const sonNet = Math.max(0, round2(totalFm - hakkaniyetIndirimi - mahsupTutari));
  return {
    totalFm,
    sgk,
    issizlik,
    gelirVergisi,
    gelirVergisiDilimleri: gv.summary,
    damgaVergisi,
    netYillik,
    hakkaniyetIndirimi,
    mahsupTutari,
    sonNet,
    totalNet: sonNet,
  };
}

export function createManualPeriodRow(afterRowId: string, katsayi: number, fmHours = FIXED_FM_HOURS): PeriodRow {
  return {
    id: `manual-${newLocalId()}`,
    startISO: "",
    endISO: "",
    weeks: 0,
    brut: 0,
    katsayi,
    fmHours,
    fm: 0,
    net: 0,
    isDeductionRow: false,
    isManual: true,
    insertAfter: afterRowId,
  };
}

export function computeGemi724Result(form: Gemi724FormSnapshot): Gemi724Result {
  const { rows: pipeRows } = runGemi724V3Pipeline(form);

  const displayRows = pipeRows.filter((r) => {
    if (r.isManual) return true;
    return Number(r.fmHours ?? 0) !== 0 && Number(r.weeks ?? 0) !== 0 && Number(r.fm ?? 0) !== 0;
  });

  const exitYear = form.istenCikis ? Number(form.istenCikis.slice(0, 4)) : new Date().getFullYear();
  const totals = computeTotalsFromRows(displayRows, exitYear, form.mahsup);

  return { fixedFmHoursWeekly: FIXED_FM_HOURS, rows: displayRows, ...totals };
}

export { fmHoursForDeductionWindow } from "./expandRowsForDeductions";
