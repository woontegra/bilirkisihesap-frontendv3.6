/**
 * Yeraltı İşçisi Fazla Mesai hesaplama motoru — %100 lokal, network isteği yok.
 * V3 backend `yeraltiIsci.service.js` ile aynı yuvarlama/formül lokal uygulanır
 * (sunucuya çağrı yapılmaz):
 * - Haftalık yasal çalışma sınırı: 37,5 saat (37:30)
 * - Ücret formülü: (hafta × çift asgari × katsayı × FM saat) / 187,5 × 2
 * - Günlük referans (tatilli hafta tatili): 6,25 (6:15)
 * - Yargıtay 270 saat düşümü: 5,2 saat (5:12)
 * - Ara dinlenme (cetvel): ≤11 saat → 1 saat; üstü → max(1,5; yuvarla(brüt/6,25))
 * Bu dosya yalnızca bu klasördeki model / asgariUcret / incomeTax'e bağımlıdır.
 */

import { getAsgariUcretByDate, splitRangeByAsgariPeriodBounds } from "./asgariUcret";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import {
  newLocalId,
  type FmRow,
  type RowOverride,
  type SevenDayMode,
  type WitnessInput,
  type YeraltiFormSnapshot,
  type YeraltiResult,
  type ZamanasimiInfo,
} from "./model";

/* ── Sabitler ── */
export const WEEKLY_LIMIT = 37.5;
export const DENOM = 187.5;
export const FACTOR = 2;
export const DAILY_REF = 6.25;
/** 270 Yargıtay: her satırın haftalık FM saatinden düşülür (5 saat 12 dakika). */
export const YARGITAY_270_DEDUCTION_HOURS = 5 + 12 / 60;
/** Detaylı (şirket) 270: yıllık dahil edilen fazla mesai saat bütçesi. */
export const MODE270_INCLUDED_HOURS = 270;
export const DAMGA_ORAN = 0.00759;
export const SGK_ORANI = 0.14;
export const ISSIZLIK_ORANI = 0.01;
const MAX_WEEKS_PER_YEAR = 52;
const HALF_YEAR_DAY_LIMIT = 183;

/* ── Sayı / para yardımcıları ── */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** 0 → değişmez; 1-30 dk → +0,5; 31-59 dk → +1 (Yargıtay yuvarlama kuralı, backend ile aynı). */
export function applyYargitayRounding(decimalHours: number): number {
  if (!Number.isFinite(decimalHours) || decimalHours <= 0) return 0;
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  if (minutes === 0) return hours;
  if (minutes <= 30) return hours + 0.5;
  return hours + 1;
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

/* ── Tarih yardımcıları (yerel takvim günü; saat dilimi kaymasız) ── */
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

/** İki tarih arasındaki gün farkı (her iki gün dahil). */
export function inclusiveDayCount(startIso: string, endIso: string): number {
  const s = isoToDate(startIso);
  const e = isoToDate(endIso);
  if (!s || !e || e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

export function daysBetweenIsoInclusive(startISO: string, endISO: string): number {
  return inclusiveDayCount(startISO, endISO);
}

export function isValidRange(startIso: string, endIso: string): boolean {
  const s = isoToDate(startIso);
  const e = isoToDate(endIso);
  return !!s && !!e && s <= e;
}

export function isValidIsoDate(iso: string): boolean {
  return parseIsoDateParts(iso) != null;
}

/** 0=Pazar … 6=Cumartesi. */
export function isoWeekday(iso: string): number {
  const d = isoToDate(iso);
  return d ? d.getDay() : -1;
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

/** Dava − 5 yıl − arabuluculuk günü − pandemi günü → nihai zamanaşımı başlangıcı. */
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

/** weeks = round(kapsayıcı gün / 7); ==25 && gün<=183 ise 26; en fazla 52; en az 1 (backend calculateWeekCount ile aynı). */
export function calculateWeekCount(startIso: string, endIso: string): number {
  const days = inclusiveDayCount(startIso, endIso);
  if (days <= 0) return 0;
  let weeks = Math.round(days / 7);
  if (weeks === 25 && days <= HALF_YEAR_DAY_LIMIT) weeks = 26;
  if (weeks > MAX_WEEKS_PER_YEAR) weeks = MAX_WEEKS_PER_YEAR;
  return Math.max(1, weeks);
}

/* ── Saat ── */
export function parseTimeToHours(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

export function formatHoursAsTime(decimalHours: number): string {
  let hours = Math.floor(decimalHours);
  let minutes = Math.round((decimalHours - hours) * 60);
  if (minutes >= 60) {
    hours += 1;
    minutes = 0;
  }
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/** Giriş/çıkış saatlerinden ham günlük çalışma süresi (gece yarısını aşan vardiyalar dahil). */
export function rawDailyHoursBetween(startHour: number, endHour: number): number {
  let raw = endHour - startHour;
  if (raw < 0) raw += 24;
  if (raw > 24) raw -= 24;
  return raw;
}

/* ── Ara dinlenme (Yeraltı — backend `computeBreakHours` ile aynı) ── */
export function computeBreakHours(dailyGross: number): number {
  if (!Number.isFinite(dailyGross) || dailyGross <= 0) return 0;
  if (dailyGross <= 11) return 1;
  return Math.max(1.5, roundToHalf(dailyGross / DAILY_REF));
}

/* ── Haftalık çalışma hesabı ── */
export function computeWeeklyHours(dailyHours: number, weeklyDays: number, sevenDayMode: SevenDayMode): number {
  const n = Number(weeklyDays) || 0;
  if (n === 7 && sevenDayMode === "tatilli") {
    return dailyHours * 6 + Math.max(0, dailyHours - DAILY_REF);
  }
  return dailyHours * (n > 0 ? n : 7);
}

/** Haftalık FM saati: applyYargitayRounding(weekly) − 37,5 (negatifse 0). */
export function computeFmHoursWeekly(dailyHours: number, weeklyDays: number, sevenDayMode: SevenDayMode): number {
  const weekly = computeWeeklyHours(dailyHours, weeklyDays, sevenDayMode);
  return Math.max(0, applyYargitayRounding(weekly) - WEEKLY_LIMIT);
}

/* ── Para hesabı (satır bazlı) — brut = ÇİFT asgari ücret; V3 recalcYeraltiFmNet ile birebir ── */
export function calcRowFm(brutDoubled: number, katsayi: number, weeks: number, fmHours: number): number {
  const kats = Number.isFinite(katsayi) && katsayi > 0 ? katsayi : 1;
  const step1 = Number((weeks * brutDoubled).toFixed(6));
  const step2 = Number((step1 * kats).toFixed(6));
  const step3 = Number((step2 * fmHours).toFixed(6));
  const step4 = Number((step3 / DENOM).toFixed(6));
  const step5 = Number((step4 * FACTOR).toFixed(6));
  return Number(step5.toFixed(2));
}

/* ── Tanık / davacı tarih segmentasyonu ── */
type DateRange = { start: string; end: string };
type DateSegment = DateRange & { witnessIds: string[] };

function clipRange(a: DateRange, bound: DateRange): DateRange | null {
  const start = a.start > bound.start ? a.start : bound.start;
  const end = a.end < bound.end ? a.end : bound.end;
  if (start > end) return null;
  return { start, end };
}

/**
 * Tanık aralıkları ile davacı döneminin kesişimine göre tarih segmentleri üretir.
 * V3 backend `normalizeWitnessDateRanges` ile uyumlu:
 * - Tanık varsa yalnızca en az bir tanığın kapsadığı günler hesaba girer (tanıksız boşluklar atlanır).
 * - Tanık yoksa / kesişme yoksa tüm davacı dönemi (witnessIds: []) kullanılır.
 */
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

  const asgariPivots = () => {
    for (const p of splitRangeByAsgariPeriodBounds(claimStart, claimEnd)) {
      if (p.start > claimStart && p.start <= claimEnd) pivots.add(p.start);
    }
  };

  const pivots = new Set<string>();

  if (effective.length === 0) {
    pivots.add(claimStart);
    pivots.add(addDaysIso(claimEnd, 1));
    asgariPivots();
    const sorted = [...pivots].sort();
    const segments: DateSegment[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const segStart = sorted[i];
      const segEnd = addDaysIso(sorted[i + 1], -1);
      if (segStart > segEnd) continue;
      if (segStart < claimStart || segEnd > claimEnd) continue;
      segments.push({ start: segStart, end: segEnd, witnessIds: [] });
    }
    return segments;
  }

  pivots.add(claimStart);
  pivots.add(addDaysIso(claimEnd, 1));
  for (const r of effective) {
    pivots.add(r.start);
    pivots.add(addDaysIso(r.end, 1));
  }
  asgariPivots();

  const sorted = [...pivots].sort();
  const segments: DateSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = addDaysIso(sorted[i + 1], -1);
    if (segStart > segEnd) continue;
    if (segStart < claimStart || segEnd > claimEnd) continue;
    const active = effective.filter((r) => !(segEnd < r.start || segStart > r.end)).map((r) => r.id);
    if (active.length === 0) continue;
    segments.push({ start: segStart, end: segEnd, witnessIds: active });
  }
  return segments;
}

/** Segmentteki tanık(lar)ın davacı saatleriyle kesişimini hesaplayarak günlük net çalışmayı döner. */
export function computeSegmentDailyHours(
  witnessIds: string[],
  witnesses: WitnessInput[],
  davaciStartH: number,
  davaciEndH: number,
): { rawDailyHours: number; breakHours: number; dailyHours: number } {
  const active = witnesses.filter(
    (w) => witnessIds.includes(w.id) && parseTimeToHours(w.in) != null && parseTimeToHours(w.out) != null,
  );

  let startH = davaciStartH;
  let endH = davaciEndH;

  if (active.length > 0) {
    let latestStart = davaciStartH;
    let earliestEnd = davaciEndH;
    for (const w of active) {
      const wStart = parseTimeToHours(w.in);
      let wEnd = parseTimeToHours(w.out);
      if (wStart == null || wEnd == null) continue;
      if (wEnd === 0 && wStart > 0) wEnd = 24;
      const clippedStart = Math.max(wStart, davaciStartH);
      const clippedEnd = Math.min(wEnd, davaciEndH);
      if (clippedStart > latestStart) latestStart = clippedStart;
      if (clippedEnd < earliestEnd) earliestEnd = clippedEnd;
    }
    if (latestStart < earliestEnd) {
      startH = latestStart;
      endH = earliestEnd;
    }
  }

  const rawDailyHours = rawDailyHoursBetween(startH, endH);
  const breakHours = computeBreakHours(rawDailyHours);
  const dailyHours = Math.max(0, rawDailyHours - breakHours);
  return { rawDailyHours, breakHours, dailyHours };
}

/* ── Düşüm günleri (UBGT / Yıllık İzin) — shared/deductionCore (V3 ile uyumlu) ── */

function remainingNetWeeklyForDeduction(
  dailyHours: number,
  weeklyDays: number,
  excludedUnits: number,
  sevenDayMode: SevenDayMode,
): number {
  const hgSafe = Math.max(1, Math.min(7, Math.floor(weeklyDays) || 6));
  const excl = Math.max(0, Math.min(hgSafe, excludedUnits));
  if (hgSafe !== 7) {
    return Math.max(0, (hgSafe - excl) * dailyHours);
  }
  if (sevenDayMode === "tatilsiz") {
    return Math.max(0, (7 - excl) * dailyHours);
  }
  const holidayExtra = Math.max(0, dailyHours - DAILY_REF);
  return Math.max(0, 6 * dailyHours + holidayExtra - excl * dailyHours);
}

/** Düşüm penceresi için haftalık FM saati (Yargıtay yuvarlaması, 37,5 sınırı). */
export function fmHoursForDeductionWindow(
  dailyHours: number,
  weeklyDays: number,
  sevenDayMode: SevenDayMode,
  excludedUnits: number,
): number {
  const remaining = remainingNetWeeklyForDeduction(dailyHours, weeklyDays, excludedUnits, sevenDayMode);
  return Math.max(0, applyYargitayRounding(remaining) - WEEKLY_LIMIT);
}

/* ── Zamanaşımı: segmentlerin kırpılması ── */
function clipStartByZamanasimi(claimStart: string, zamanasimi: ZamanasimiInfo): string {
  const nihai = zamanasimi?.nihaiBaslangic || null;
  if (nihai && isValidIsoDate(nihai) && nihai > claimStart) return nihai;
  return claimStart;
}

/* ── Dönem satırlarının oluşturulması + düşümlerin uygulanması ── */
export function buildPeriodRows(form: YeraltiFormSnapshot): FmRow[] {
  const davaciStartH = parseTimeToHours(form.davaciIn);
  const davaciEndHRaw = parseTimeToHours(form.davaciOut);
  if (
    !isValidRange(form.davaciDateIn, form.davaciDateOut) ||
    davaciStartH == null ||
    davaciEndHRaw == null
  ) {
    return [];
  }
  const davaciEndH = davaciEndHRaw === 0 && davaciStartH > 0 ? 24 : davaciEndHRaw;
  const katsayi = parseKatsayi(form.katsayi);

  const claimStart = clipStartByZamanasimi(form.davaciDateIn, form.zamanasimi);
  if (claimStart > form.davaciDateOut) return [];

  const dateSegments = buildDateSegments(claimStart, form.davaciDateOut, form.witnesses);

  const rows: FmRow[] = [];
  dateSegments.forEach((seg, segIdx) => {
    const hours = computeSegmentDailyHours(seg.witnessIds, form.witnesses, davaciStartH, davaciEndH);
    const segWeekly = computeWeeklyHours(hours.dailyHours, form.weeklyDays, form.sevenDayMode);
    const segFmHours = Math.max(0, applyYargitayRounding(segWeekly) - WEEKLY_LIMIT);

    splitRangeByAsgariPeriodBounds(seg.start, seg.end).forEach((child, aIdx) => {
      const brutDoubled = child.brut * 2;
      const cappedWeeks = calculateWeekCount(child.start, child.end);
      rows.push({
        id: `s${segIdx}-a${aIdx}`,
        startISO: child.start,
        endISO: child.end,
        weeks: cappedWeeks,
        brut: brutDoubled,
        katsayi,
        fmHours: segFmHours,
        fm: calcRowFm(brutDoubled, katsayi, cappedWeeks, segFmHours),
        isDeductionRow: false,
      });
    });
  });

  return rows.sort((a, b) => a.startISO.localeCompare(b.startISO));
}

/* ── Kullanıcı düzeltmeleri + manuel satırlar ── */
export function applyRowOverrides(
  rows: FmRow[],
  overrides: Record<string, RowOverride>,
  manualRows: FmRow[] = [],
  defaultKatsayi = 1,
): FmRow[] {
  const applyOne = (row: FmRow): FmRow | null => {
    const ov = overrides[row.id];
    if (ov?.hidden && !row.isManual) return null;
    if (!ov) {
      if (!row.isManual) return row;
      const katsayi = row.katsayi || defaultKatsayi;
      return { ...row, katsayi, fm: calcRowFm(row.brut, katsayi, row.weeks, row.fmHours) };
    }
    const startISO = ov.startISO ?? row.startISO;
    const endISO = ov.endISO ?? row.endISO;
    const hasDateOverride = ov.startISO !== undefined || ov.endISO !== undefined;
    const weeksFromDates =
      hasDateOverride || row.isManual
        ? startISO && endISO && isValidRange(startISO, endISO)
          ? calculateWeekCount(startISO, endISO)
          : 0
        : undefined;
    let weeks = ov.weeks ?? weeksFromDates ?? row.weeks;
    if (weeks <= 0 && (weeksFromDates ?? row.weeks ?? 0) > 0) {
      weeks = weeksFromDates ?? row.weeks ?? weeks;
    }
    // Başlangıç tarihi elle değiştirildiyse ve ücret elle verilmediyse, ücret dönemden (çift asgari) okunur.
    let brut = ov.brut ?? row.brut;
    if (ov.brut === undefined && ov.startISO !== undefined && isValidIsoDate(startISO)) {
      const au = getAsgariUcretByDate(startISO);
      if (au != null) brut = au * 2;
    }
    const fmHours = ov.fmHours ?? row.fmHours;
    const katsayi = row.katsayi || defaultKatsayi;
    return { ...row, startISO, endISO, weeks, brut, fmHours, katsayi, fm: calcRowFm(brut, katsayi, weeks, fmHours) };
  };

  const automatic: FmRow[] = [];
  for (const row of rows) {
    const next = applyOne(row);
    if (next) automatic.push(next);
  }

  const manuals = (manualRows ?? [])
    .map((row) => applyOne({ ...row, isManual: true }))
    .filter((r): r is FmRow => r != null);

  const result: FmRow[] = [];
  const placed = new Set<string>();
  for (const autoRow of automatic) {
    result.push(autoRow);
    for (const m of manuals) {
      if (m.insertAfter === autoRow.id) {
        result.push(m);
        placed.add(m.id);
      }
    }
  }
  for (const m of manuals) {
    if (!placed.has(m.id)) result.push(m);
  }
  return result;
}

/* ── Toplamlar (brütten nete + hakkaniyet) ── */
export function computeTotalsFromRows(
  rows: { fm: number }[],
  exitYear: number,
  mahsupInput: string,
): Pick<
  YeraltiResult,
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
> {
  const totalFm = rows.reduce((sum, r) => sum + (Number(r.fm) || 0), 0);
  const sgk = Math.round(totalFm * SGK_ORANI * 100) / 100;
  const issizlik = Math.round(totalFm * ISSIZLIK_ORANI * 100) / 100;
  const matrah = Math.max(0, totalFm - sgk - issizlik);
  const gv = calculateIncomeTaxWithBrackets(exitYear, matrah);
  const gelirVergisi = Math.round(gv.tax * 100) / 100;
  const damgaVergisi = Math.round(totalFm * DAMGA_ORAN * 100) / 100;
  const netYillik = Math.round((totalFm - sgk - issizlik - gelirVergisi - damgaVergisi) * 100) / 100;
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
  };
}

export { computeYeraltiResultV3 as computeYeraltiResult } from "./v3-engine/adapter";

/** Yeni manuel satır iskeleti (+ ile eklenir). */
export function createManualRow(afterId: string, katsayi: number, fmHours: number): FmRow {
  return {
    id: `manual-${newLocalId("m")}`,
    startISO: "",
    endISO: "",
    weeks: 0,
    brut: 0,
    katsayi: katsayi > 0 ? katsayi : 1,
    fmHours: fmHours || 0,
    fm: 0,
    isDeductionRow: false,
    isManual: true,
    insertAfter: afterId,
  };
}
