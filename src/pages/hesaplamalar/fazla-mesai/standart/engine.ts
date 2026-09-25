/**
 * Standart Fazla Mesai hesaplama motoru — %100 lokal, network isteği yok.
 * Bu dosya yalnızca bu klasördeki model.ts / constants.ts / asgariUcret.ts /
 * incomeTax.ts'e bağımlıdır; başka bir fazla mesai alt türüne veya
 * kıdem/davacı ücreti motorlarına referans vermez.
 */

import {
  DAMGA_ORAN,
  FAZLA_MESAI_DENOMINATOR,
  FAZLA_MESAI_KATSAYI,
  ISSIZLIK_ORANI,
  MODE270_INCLUDED_HOURS,
  MODE270_SIMPLE_REDUCTION_HOURS,
  SGK_ORANI,
  STANDARD_DAILY_REFERENCE_HOURS,
  WEEKLY_WORK_LIMIT,
} from "./constants";
import { getAsgariUcretByDate, splitRangeByAsgariPeriodBounds } from "./asgariUcret";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import {
  type ExclusionItem,
  type Mode270,
  type PeriodRow,
  type RowOverride,
  type SevenDayMode,
  type StandartFormSnapshot,
  type StandartResult,
  type ZamanasimiInfo,
} from "./model";

/* ── Sayı / para yardımcıları ── */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseMoneyInput(value: string): number {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n || 0 : 0;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value || 0 : 0);
}

export { sanitizeMoneyTyping } from "@/utils/moneyInput";

export function parseKatsayi(value: string): number {
  const n = parseMoneyInput(value);
  return n > 0 ? n : 1;
}

/* ── Tarih yardımcıları (yerel takvim günü; UTC tabanlı, kaymasız) ── */

export function isValidIsoDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? "").trim());
}

function isoToUtcDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function daysBetweenIsoInclusive(startISO: string, endISO: string): number {
  return isoToUtcDays(endISO) - isoToUtcDays(startISO) + 1;
}

export function addIsoDays(iso: string, amount: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + amount);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** 0=Pazar … 6=Cumartesi (JS Date.getDay ile aynı sırada). */
export function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function validateDateRange(startIso: string, endIso: string): string | null {
  if (!startIso || !endIso) return null;
  if (!isValidIsoDate(startIso) || !isValidIsoDate(endIso)) return "Geçersiz tarih.";
  if (endIso < startIso) return "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.";
  return null;
}

/* ── Saat yardımcıları ── */

/** "HH:mm" → dakika; geçersizse null. */
function parseHmToMinutes(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Giriş/çıkış saatlerinden günlük brüt (moladan önce) çalışma saatini hesaplar. Çıkış < giriş ise gece yarısını geçtiği varsayılır. */
export function calculateDailyGrossHours(startTime: string, endTime: string): number {
  const startMins = parseHmToMinutes(startTime);
  let endMins = parseHmToMinutes(endTime);
  if (startMins == null || endMins == null) return 0;
  if (endMins < startMins) endMins += 24 * 60;
  return (endMins - startMins) / 60;
}

/**
 * Ara dinlenme süresi (saat) — 4857 sayılı Kanun m.68:
 * ≤4 saat → 15 dk (0,25); ≤7,5 saat → 30 dk (0,5); <11 saat → 1 saat;
 * <14 saat → 1,5 saat; <15 saat → 2 saat; ≥15 saat → 3 saat.
 */
export function computeBreakHours(dailyGrossHours: number): number {
  if (!Number.isFinite(dailyGrossHours) || dailyGrossHours <= 0) return 0;
  if (dailyGrossHours <= 4) return 0.25;
  if (dailyGrossHours <= 7.5) return 0.5;
  if (dailyGrossHours < 11) return 1;
  if (dailyGrossHours < 14) return 1.5;
  if (dailyGrossHours < 15) return 2;
  return 3;
}

export function computeDailyNetHours(startTime: string, endTime: string): {
  gross: number;
  breakHours: number;
  net: number;
} {
  const gross = calculateDailyGrossHours(startTime, endTime);
  const breakHours = computeBreakHours(gross);
  return { gross, breakHours, net: Math.max(0, gross - breakHours) };
}

/**
 * Haftalık fiili çalışma süresini (45 saat eşiği öncesi) yarım saate
 * yuvarlar: değer zaten tam saat/buçuklu ise aynen kalır, aksi halde bir
 * üst buçuğa çıkarılır (Math.round kaynaklı .5 kaybı önlenir).
 */
export function ceilWeeklyWorkHoursToHalfHour(weeklyTotal: number): number {
  if (!Number.isFinite(weeklyTotal)) return 0;
  const EPS = 1e-7;
  const doubled = weeklyTotal * 2;
  const nearestHalf = Math.round(doubled);
  if (Math.abs(doubled - nearestHalf) < EPS) return nearestHalf / 2;
  return Math.ceil(doubled - EPS) / 2;
}

/**
 * Bilirkişi yuvarlaması: kesir <0,5 ise alta, >0,5 ise üste tam sayıya
 * yuvarlanır; tam 0,5 ise aynen (…,5) korunur. Math.round kullanılmaz.
 */
export function bilirkisiRound(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const EPS = 1e-7;
  const int = Math.floor(value + EPS);
  const frac = value - int;
  if (frac < 0.5 - EPS) return int;
  if (frac > 0.5 + EPS) return int + 1;
  return int + 0.5;
}

/**
 * Haftalık gün sayısı ve tatilli/tatilsiz seçimine göre ham (yuvarlamasız)
 * haftalık çalışma saatini döner:
 * - 1..6 gün: dailyNet × n
 * - 7 gün tatilsiz: dailyNet × 7
 * - 7 gün tatilli: dailyNet × 6 + max(0, dailyNet − 7,5)
 */
export function computeWeeklyRawHours(
  dailyNetHours: number,
  weeklyDays: number,
  sevenDayMode: SevenDayMode,
): number {
  if (!dailyNetHours || dailyNetHours <= 0) return 0;
  const n = Math.round(weeklyDays);
  if (n === 7) {
    if (sevenDayMode === "tatilsiz") return dailyNetHours * 7;
    const extra = Math.max(0, dailyNetHours - STANDARD_DAILY_REFERENCE_HOURS);
    return dailyNetHours * 6 + extra;
  }
  if (n >= 1 && n <= 6) return dailyNetHours * n;
  return 0;
}

/** Ana (düşümsüz) haftalık fazla mesai saati: 45 saat üstü kısım. Basit mod gösterim için burada düşülür; cetvelde 270 basit/detaylı `applyMode270AfterOverrides` ile uygulanır (V3 `computeDisplayRows` sırası). */
export function computeBaselineWeeklyFmHours(
  dailyNetHours: number,
  weeklyDays: number,
  sevenDayMode: SevenDayMode,
  mode270: Mode270,
): { weeklyRawHours: number; weeklyRoundedHours: number; fmHours: number } {
  const weeklyRawHours = computeWeeklyRawHours(dailyNetHours, weeklyDays, sevenDayMode);
  const weeklyRoundedHours = ceilWeeklyWorkHoursToHalfHour(weeklyRawHours);
  let fmHours = Math.max(0, weeklyRoundedHours - WEEKLY_WORK_LIMIT);
  if (mode270 === "simple") {
    fmHours = Math.max(0, fmHours - MODE270_SIMPLE_REDUCTION_HOURS);
  }
  return { weeklyRawHours, weeklyRoundedHours, fmHours };
}

/* ── Zamanaşımı ── */

export {
  computePandemiGunFromIseGiris,
  computeZamanasimiLimitDate,
  computeZamanasimiNihaiBaslangic,
} from "../shared/zamanasimiCore";
import {
  buildSevenDayDeductionWindows,
  normalizeWeeksForStandard,
  parseFmDate,
  prepareDeductionDaysInPeriod,
} from "../shared/deductionCore";

/** Düşüm penceresindeki haftalık fazla mesai saati (bilirkişi yuvarlaması ile). */
export function computeDeductionWindowFmHours(
  weeklyDays: number,
  dailyNetHours: number,
  deductionDayUnits: number,
  sevenDayMode: SevenDayMode,
): number {
  const hg = Math.max(1, Math.min(7, Math.round(weeklyDays) || 6));
  const leave = Math.min(hg, Math.max(0, deductionDayUnits));

  if (hg >= 7) {
    let rawTotal: number;
    if (sevenDayMode === "tatilli") {
      const weeklyWork = dailyNetHours * 6;
      const extra = Math.max(0, dailyNetHours - STANDARD_DAILY_REFERENCE_HOURS);
      rawTotal = Math.max(0, weeklyWork + extra - leave * dailyNetHours);
    } else {
      rawTotal = Math.max(0, (7 - leave) * dailyNetHours);
    }
    return Math.max(0, bilirkisiRound(rawTotal) - WEEKLY_WORK_LIMIT);
  }

  const workedDays = Math.max(0, hg - leave);
  const rawTotal = dailyNetHours * workedDays;
  return Math.max(0, bilirkisiRound(rawTotal) - WEEKLY_WORK_LIMIT);
}

/* ── Zamanaşımı: segmentlerin kırpılması ── */

function clipSegmentsByZamanasimi<T extends { start: string; end: string }>(
  segments: T[],
  nihaiBaslangicISO: string | null,
): T[] {
  if (!nihaiBaslangicISO) return segments;
  const out: T[] = [];
  for (const seg of segments) {
    if (seg.end < nihaiBaslangicISO) continue;
    if (seg.start < nihaiBaslangicISO) {
      out.push({ ...seg, start: nihaiBaslangicISO });
    } else {
      out.push(seg);
    }
  }
  return out;
}

/* ── "270 gün" detaylı uygulama (satır bazlı hafta yeniden dağıtımı) ── */

type HireYearWindow = {
  fmStartMs: number;
  fmEndMs: number;
  fmWeeks: number;
};

/** V3 `calculateOvertimeWith270AndLimitation` ile aynı Date semantiği: ISO → `new Date(iso)`, yıldönümü `setFullYear`/`setDate` (yerel). */
function parseIsoDateLikeV3(iso: string): Date {
  return new Date(iso);
}

export function buildHireYearWindows(
  iseGirisISO: string,
  istenCikisISO: string,
  weeklyFmHours: number,
  zamanasimiISO: string | null,
): HireYearWindow[] {
  if (!(weeklyFmHours > 0) || !isValidIsoDate(iseGirisISO) || !isValidIsoDate(istenCikisISO)) return [];

  const GUN = 86400000;
  const HAFTA = 7 * GUN;
  const iseGirisTarihi = parseIsoDateLikeV3(iseGirisISO);
  const istenCikisTarihi = parseIsoDateLikeV3(istenCikisISO);
  if (iseGirisTarihi > istenCikisTarihi) return [];

  const zamanaSimiTarihi =
    zamanasimiISO && isValidIsoDate(zamanasimiISO) ? parseIsoDateLikeV3(zamanasimiISO) : null;
  const dusulecekHafta = Math.round(MODE270_INCLUDED_HOURS / weeklyFmHours);

  const windows: HireYearWindow[] = [];
  let yilBaslangic = new Date(iseGirisTarihi);

  while (yilBaslangic <= istenCikisTarihi) {
    const yilBitis = new Date(yilBaslangic);
    yilBitis.setFullYear(yilBitis.getFullYear() + 1);
    yilBitis.setDate(yilBitis.getDate() - 1);

    const fiiliYilBitis = yilBitis > istenCikisTarihi ? istenCikisTarihi : yilBitis;

    const toplamHafta = Math.floor((fiiliYilBitis.getTime() - yilBaslangic.getTime() + GUN) / HAFTA);
    const hireYearFM = Math.max(0, toplamHafta - dusulecekHafta);
    const fmBaslangic = new Date(fiiliYilBitis.getTime() - hireYearFM * HAFTA);

    let fmFiiliBaslangic = fmBaslangic;
    const fmFiiliBitis = fiiliYilBitis;
    let fmFiiliHafta = hireYearFM;

    if (zamanaSimiTarihi) {
      if (zamanaSimiTarihi > fiiliYilBitis) {
        fmFiiliHafta = 0;
      } else if (zamanaSimiTarihi > fmBaslangic) {
        fmFiiliBaslangic = zamanaSimiTarihi;
        fmFiiliHafta = Math.floor((fmFiiliBitis.getTime() - fmFiiliBaslangic.getTime() + GUN) / HAFTA);
        fmFiiliHafta = Math.max(0, Math.min(fmFiiliHafta, hireYearFM));
      }
    }

    if (fmFiiliHafta > 0) {
      windows.push({
        fmStartMs: fmFiiliBaslangic.getTime(),
        fmEndMs: fmFiiliBitis.getTime(),
        fmWeeks: fmFiiliHafta,
      });
    }

    yilBaslangic.setFullYear(yilBaslangic.getFullYear() + 1);
  }
  return windows;
}

/**
 * "270 gün" detaylı uygulama: işe giriş yılı sabit alınarak her hire-year
 * için 270 saatlik muafiyet düşülür (round(270/haftalıkFmSaati) hafta),
 * kalan hafta ilgili dönem satırlarına GÜN ORANIYLA dağıtılır. V3'teki
 * `calculateOvertimeWith270AndLimitation` ile aynı algoritmanın bu motora
 * özgü, bağımsız yeniden yazımıdır.
 */
/** V3 `fmHoursAfterYargitay270Simple` ile aynı IEEE yuvarlama düzeltmesi. */
function fmHoursAfterMode270Simple(haftalikFmSaat: number): number {
  const raw = Math.max(0, (Number(haftalikFmSaat) || 0) - MODE270_SIMPLE_REDUCTION_HOURS);
  return Math.round(raw * 1e4) / 1e4;
}

function applyMode270Detailed(
  rows: PeriodRow[],
  iseGirisISO: string,
  istenCikisISO: string,
  weeklyFmHours: number,
  zamanasimiISO: string | null,
): PeriodRow[] {
  const valid = rows.filter((r) => r.startISO && r.endISO);
  const weeklyFm = valid[0]?.fmHours ?? weeklyFmHours;
  const windows = buildHireYearWindows(iseGirisISO, istenCikisISO, weeklyFm, zamanasimiISO);
  if (rows.length === 0) return rows;
  // Hire-year FM penceresi yoksa (270 tüm fiili haftayı tüketir) V3 davranışı:
  // computeDisplayRows adjusted=0 → rawWeeks; satırları olduğu gibi bırak.
  if (windows.length === 0) return rows;

  const nextWeeks = new Map<string, number>();
  for (const row of valid) nextWeeks.set(row.id, 0);

  const spans = valid.map((r) => ({
    id: r.id,
    start: parseIsoDateLikeV3(r.startISO).getTime(),
    end: parseIsoDateLikeV3(r.endISO).getTime(),
  }));

  for (const win of windows) {
    let yazilan = 0;
    const hireYearGun = win.fmEndMs - win.fmStartMs;
    for (let i = 0; i < valid.length; i++) {
      if (yazilan >= win.fmWeeks) break;
      const span = spans[i];
      const kesisimBas = Math.max(win.fmStartMs, span.start);
      const kesisimBit = Math.min(win.fmEndMs, span.end);
      if (kesisimBas > kesisimBit) continue;
      const satirGun = kesisimBit - kesisimBas;
      if (satirGun > 0 && hireYearGun > 0) {
        const oran = satirGun / hireYearGun;
        let eklenecek = Math.round(win.fmWeeks * oran);
        eklenecek = Math.min(eklenecek, win.fmWeeks - yazilan);
        if (eklenecek > 0) {
          nextWeeks.set(span.id, (nextWeeks.get(span.id) ?? 0) + eklenecek);
          yazilan += eklenecek;
        }
      }
    }
  }

  // V3 `computeDisplayRows` (tableDisplayPipeline): 270 sonrası adjusted<=0 ise
  // otomatik satırda önceki hafta korunur; manuel satırda en az 1 hafta kalır.
  return rows.map((r) => {
    if (!r.startISO || !r.endISO) return r;
    const rawWeeks = r.originalWeekCount ?? r.weeks;
    const adjusted = nextWeeks.get(r.id) ?? 0;
    const isManual = !!r.isManual;
    const weeks = Number.isFinite(adjusted)
      ? isManual && adjusted <= 0
        ? Math.max(1, rawWeeks)
        : adjusted > 0
          ? adjusted
          : rawWeeks
      : rawWeeks;
    return { ...r, weeks: weeks > 0 ? weeks : rawWeeks };
  });
}

/**
 * V3 `computeDisplayRows` sırası: override sonrası 270 basit/detaylı + yıllık izin (detaylı).
 * Satırlar düşümsüz haftalık FM ile üretilmiş olmalıdır (`mode270: "none"` baseline).
 */
function applyMode270AfterOverrides(
  rows: PeriodRow[],
  form: Pick<StandartFormSnapshot, "iseGiris" | "istenCikis" | "mode270" | "exclusions" | "zamanasimi" | "katSayi">,
  baselineWeeklyFmHoursNo270: number,
  katsayi: number,
): PeriodRow[] {
  if (form.mode270 === "none") {
    return rows.map((r) => ({
      ...r,
      fm: calcRowFm(r.brut, r.katsayi || katsayi, r.weeks, r.fmHours),
    }));
  }

  const withOriginal = rows.map((r) => ({
    ...r,
    originalWeekCount: r.originalWeekCount ?? r.weeks,
  }));

  if (form.mode270 === "simple") {
    return withOriginal.map((r) => {
      const fmHours = fmHoursAfterMode270Simple(r.fmHours ?? baselineWeeklyFmHoursNo270);
      return {
        ...r,
        fmHours,
        fm: calcRowFm(r.brut, r.katsayi || katsayi, r.weeks, fmHours),
      };
    });
  }

  const out = applyMode270Detailed(
    withOriginal,
    form.iseGiris,
    form.istenCikis,
    baselineWeeklyFmHoursNo270,
    form.zamanasimi?.nihaiBaslangic || null,
  );
  return out.map((r) => ({
    ...r,
    fm: calcRowFm(r.brut, r.katsayi || katsayi, r.weeks, r.fmHours),
  }));
}

/* ── Para hesabı (satır bazlı) — yalnızca brüt fazla mesai; damga/GV TOPLAM bazında hesaplanır ── */

/** Satır brüt FM — V3 `Number((...).toFixed(2))` ile birebir (Math.round 0,5’te 1 kuruş sapabilir). */
function calcRowFm(brut: number, katsayi: number, weeks: number, fmHours: number): number {
  return Number(
    ((((weeks * fmHours) * brut * katsayi) / FAZLA_MESAI_DENOMINATOR) * FAZLA_MESAI_KATSAYI).toFixed(2),
  );
}

/* ── Dönem satırlarının oluşturulması + düşümlerin uygulanması ── */

/**
 * UBGT/yıllık izin düşüm pencerelerini dönem satırlarına uygular (V3
 * `expandStandartRowsForDeductions` ile aynı sıra: 270 öncesi, tüm düşümler).
 */
function applyDeductionWindowsToRows(
  segments: ReturnType<typeof splitRangeByAsgariPeriodBounds>,
  exclusions: ExclusionItem[],
  haftaTatiliGunu: number | "",
  katsayi: number,
  baselineWeeklyFmHours: number,
  weeklyDays: number,
  dailyNetHours: number,
  sevenDayMode: SevenDayMode,
): PeriodRow[] {
  const weeklyOffDay =
    haftaTatiliGunu !== "" && Number.isInteger(haftaTatiliGunu) ? haftaTatiliGunu : null;
  const rows: PeriodRow[] = [];

  segments.forEach((seg, segIdx) => {
    const rawWeeks = weeksBetweenIso(seg.start, seg.end);
    const originalWeeks = normalizeWeeksForStandard(seg.start, seg.end, rawWeeks);
    const periodEnd = parseFmDate(seg.end);

    const daysInSegment = prepareDeductionDaysInPeriod(
      exclusions,
      seg.start,
      seg.end,
      weeklyOffDay,
    );

    if (daysInSegment.length === 0 || !periodEnd) {
      rows.push({
        id: `p${segIdx}`,
        startISO: seg.start,
        endISO: seg.end,
        weeks: originalWeeks,
        originalWeekCount: originalWeeks,
        brut: seg.brut,
        katsayi,
        fmHours: baselineWeeklyFmHours,
        isDeductionRow: false,
        fm: 0,
      });
      return;
    }

    const windows = buildSevenDayDeductionWindows(daysInSegment, periodEnd);
    const baseWeeks = Math.max(0, originalWeeks - windows.length);

    if (baseWeeks > 0) {
      rows.push({
        id: `p${segIdx}-base`,
        startISO: seg.start,
        endISO: seg.end,
        weeks: baseWeeks,
        originalWeekCount: originalWeeks,
        brut: seg.brut,
        katsayi,
        fmHours: baselineWeeklyFmHours,
        isDeductionRow: false,
        fm: 0,
      });
    }

    windows.forEach((win, winIdx) => {
      const brutAtWindow = getAsgariUcretByDate(win.startISO) ?? seg.brut;
      const fmHours = computeDeductionWindowFmHours(
        weeklyDays,
        dailyNetHours,
        win.totalDeductionDayUnits,
        sevenDayMode,
      );
      rows.push({
        id: `p${segIdx}-d${winIdx}`,
        startISO: win.startISO,
        endISO: win.endISO,
        weeks: 1,
        brut: brutAtWindow,
        katsayi,
        fmHours,
        isDeductionRow: true,
        note: win.caption,
        fm: 0,
      });
    });
  });

  return rows;
}

export function buildPeriodRows(
  iseGiris: string,
  istenCikis: string,
  katsayi: number,
  baselineWeeklyFmHours: number,
  weeklyDays: number,
  dailyNetHours: number,
  sevenDayMode: SevenDayMode,
  exclusions: ExclusionItem[],
  haftaTatiliGunu: number | "",
  _mode270: Mode270,
  zamanasimi: ZamanasimiInfo,
): PeriodRow[] {
  const rawSegments = splitRangeByAsgariPeriodBounds(iseGiris, istenCikis);
  const segments = clipSegmentsByZamanasimi(rawSegments, zamanasimi?.nihaiBaslangic || null);
  if (segments.length === 0) return [];

  const rows = applyDeductionWindowsToRows(
    segments,
    exclusions,
    haftaTatiliGunu,
    katsayi,
    baselineWeeklyFmHours,
    weeklyDays,
    dailyNetHours,
    sevenDayMode,
  );

  return rows.map((r) => ({ ...r, fm: calcRowFm(r.brut, r.katsayi, r.weeks, r.fmHours) }));
}

/** Tarih aralığından hafta sayısı (V3 calculateWeeksBetweenDates ile aynı: inclusive gün / 7, yuvarlanmış). */
export function weeksBetweenIso(startISO: string, endISO: string): number {
  if (!isValidIsoDate(startISO) || !isValidIsoDate(endISO) || endISO < startISO) return 0;
  const days = daysBetweenIsoInclusive(startISO, endISO);
  return Math.max(0, Math.round(days / 7));
}

/** Cetvel satırlarına kullanıcı düzeltmelerini uygular; gizlenen otomatik satırlar çıkarılır; manuel satırlar insertAfter ile yerleştirilir. */
export function applyRowOverrides(
  rows: PeriodRow[],
  overrides: Record<string, RowOverride>,
  manualRows: PeriodRow[] = [],
  defaultKatsayi = 1,
  defaultFmHours = 0,
): PeriodRow[] {
  const applyOne = (row: PeriodRow): PeriodRow | null => {
    const ov = overrides[row.id];
    if (ov?.hidden && !row.isManual) return null;
    if (!ov) {
      if (!row.isManual) return row;
      const fm = calcRowFm(row.brut, row.katsayi || defaultKatsayi, row.weeks, row.fmHours || defaultFmHours);
      return { ...row, katsayi: row.katsayi || defaultKatsayi, fmHours: row.fmHours || defaultFmHours, fm };
    }
    const startISO = ov.startISO ?? row.startISO;
    const endISO = ov.endISO ?? row.endISO;
    const hasDateOverride = ov.startISO !== undefined || ov.endISO !== undefined;
    const weeksFromDates =
      hasDateOverride || row.isManual
        ? startISO && endISO
          ? weeksBetweenIso(startISO, endISO)
          : 0
        : undefined;
    let weeks = ov.weeks ?? weeksFromDates ?? row.weeks;
    if (weeks <= 0 && (weeksFromDates ?? row.weeks ?? 0) > 0) {
      weeks = weeksFromDates ?? row.weeks ?? weeks;
    }
    const brut = ov.brut ?? row.brut;
    const fmHours = ov.fmHours ?? row.fmHours ?? defaultFmHours;
    const katsayi = row.katsayi || defaultKatsayi;
    return {
      ...row,
      startISO,
      endISO,
      weeks,
      brut,
      fmHours,
      katsayi,
      fm: calcRowFm(brut, katsayi, weeks, fmHours),
    };
  };

  const automatic: PeriodRow[] = [];
  for (const row of rows) {
    const next = applyOne(row);
    if (next) automatic.push(next);
  }

  const manuals = (manualRows ?? [])
    .map((row) => applyOne({ ...row, isManual: true }))
    .filter((r): r is PeriodRow => r != null);

  const result: PeriodRow[] = [];
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

/* ── Ana hesap ── */

function emptyResult(): StandartResult {
  return {
    dailyGrossHours: 0,
    breakHours: 0,
    dailyNetHours: 0,
    weeklyRawHours: 0,
    weeklyRoundedHours: 0,
    baselineWeeklyFmHours: 0,
    rows: [],
    toplamFm: 0,
    sgk: 0,
    issizlik: 0,
    gelirVergisi: 0,
    gelirVergisiDilimleri: "",
    damgaVergisi: 0,
    netYillik: 0,
    hakkaniyetIndirimi: 0,
    mahsupTutari: 0,
    sonNet: 0,
    warnings: [],
  };
}

/** Cetvel satırlarından (override sonrası dahi kullanılabilir) TOPLAM bazlı brütten-nete ve hakkaniyet hesabını üretir. */
export function computeTotalsFromRows(
  rows: { fm: number }[],
  exitYear: number,
  mahsupInput: string,
): Pick<
  StandartResult,
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
  const toplamFm = round2(rows.reduce((sum, r) => sum + (r.fm || 0), 0));
  const sgk = round2(toplamFm * SGK_ORANI);
  const issizlik = round2(toplamFm * ISSIZLIK_ORANI);
  const matrah = Math.max(0, toplamFm - sgk - issizlik);
  const gv = calculateIncomeTaxWithBrackets(exitYear, matrah);
  const gelirVergisi = round2(gv.tax);
  const damgaVergisi = round2(toplamFm * DAMGA_ORAN);
  const netYillik = round2(toplamFm - sgk - issizlik - gelirVergisi - damgaVergisi);
  const hakkaniyetIndirimi = round2(toplamFm / 3);
  const mahsupTutari = parseMoneyInput(mahsupInput);
  const sonNet = Math.max(0, round2(toplamFm - hakkaniyetIndirimi - mahsupTutari));
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

export function computeStandartFmResult(form: StandartFormSnapshot): StandartResult {
  const warnings: string[] = [];
  const dateError = validateDateRange(form.iseGiris, form.istenCikis);
  if (dateError) warnings.push(dateError);

  const { gross, breakHours, net } = computeDailyNetHours(form.davaciIn, form.davaciOut);
  if (!form.iseGiris || !form.istenCikis || dateError || net <= 0) {
    return { ...emptyResult(), dailyGrossHours: gross, breakHours, dailyNetHours: net, warnings };
  }

  const katsayi = parseKatsayi(form.katSayi);
  const baselineNo270 = computeBaselineWeeklyFmHours(net, form.weeklyDays, form.sevenDayMode, "none");
  const baselineDisplay = computeBaselineWeeklyFmHours(net, form.weeklyDays, form.sevenDayMode, form.mode270);

  const rawRows = buildPeriodRows(
    form.iseGiris,
    form.istenCikis,
    katsayi,
    baselineNo270.fmHours,
    form.weeklyDays,
    net,
    form.sevenDayMode,
    form.exclusions,
    form.haftaTatiliGunu,
    form.mode270,
    form.zamanasimi,
  );

  const rowsAfterOverrides = applyRowOverrides(
    rawRows,
    form.rowOverrides ?? {},
    form.manualRows ?? [],
    katsayi,
    baselineNo270.fmHours,
  );

  const rows = applyMode270AfterOverrides(rowsAfterOverrides, form, baselineNo270.fmHours, katsayi);

  if (rows.length === 0) {
    warnings.push("Girilen tarih aralığı için asgari ücret dönemi bulunamadı veya zamanaşımı nedeniyle hesaplanacak dönem kalmadı.");
  }

  const exitYear = form.istenCikis ? Number(form.istenCikis.slice(0, 4)) : new Date().getFullYear();
  const totals = computeTotalsFromRows(rows, exitYear, form.mahsup);

  return {
    dailyGrossHours: gross,
    breakHours,
    dailyNetHours: net,
    weeklyRawHours: baselineDisplay.weeklyRawHours,
    weeklyRoundedHours: baselineDisplay.weeklyRoundedHours,
    baselineWeeklyFmHours: baselineDisplay.fmHours,
    rows,
    ...totals,
    warnings,
  };
}
