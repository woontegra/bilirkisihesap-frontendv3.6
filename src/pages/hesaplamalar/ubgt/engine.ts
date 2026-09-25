/**
 * UBGT Alacağı — lokal hesaplama motoru.
 * Backend `ubgt.standard.service.js` / `ubgt.bilirkisi.service.js` ile birebir.
 * Başka hesaplama modülünden import yok. Ağ yok.
 */
import { calculateIncomeTaxForYear, calculateIncomeTaxWithBrackets } from "./incomeTax";
import { calculateUbgtSegments, normalizeLocalDate, type UbgtDateRangeInput } from "./lib/dateSegmentation";
import { getUbgtDaysForPeriod, type UbgtExcludedDay, type UbgtDayEntry } from "./lib/holidays";
import { MIN_WAGE_TABLE } from "./lib/minWage";
import {
  BACKEND_ID_TO_UBGT_TYPE,
  filterExcludedUbgtHolidaysByRules,
  type UbgtDayEntryTyped,
  type UbgtExclusionRule,
  type UbgtHolidayType,
} from "./filterExcludedUbgtHolidays";
import { settleAmountFromMahsupMatrix } from "./mahsuplasama";
import { sumMahsuplasamaMatrix } from "./mahsuplasama";

export { buildTanikRanges, collectDavaciHolidayIds } from "./buildTanikRanges";
export { sumMahsuplasamaMatrix, settleAmountFromMahsupMatrix };

export const SGK_ORANI = 0.14;
export const ISSIZLIK_ORANI = 0.01;
export const DAMGA_ORANI = 0.00759;

export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export function round6(n: number): number {
  return Number(n.toFixed(6));
}

export function parseNum(v: string): number {
  return Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
}

/**
 * Katsayı / gün gibi alanlar: V3 sayı veya "1.5" / "1,5" / "1,5000".
 * parseNum("1.5") → 15 (TR thousands) olduğu için katsayıda kullanma.
 */
export function parseCoef(v: string | number | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : 1;
  const s = String(v ?? "").trim();
  if (!s) return 1;
  if (/^\d+[.,]\d+$/.test(s) || /^\d+$/.test(s)) {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  return parseNum(s) || 1;
}

/** UI/storage: TR ondalık (parseNum uyumlu), V3 gibi 4 hane. */
export function formatCoef(n: number): string {
  const safe = Number.isFinite(n) && n > 0 ? n : 1;
  return safe.toFixed(4).replace(".", ",");
}

export function formatMoney(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
}

export function formatDateTR(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR");
}

/** Türkçe uzun tarih: 30 Ağustos 2019 */
export function formatDateTRLong(iso: string): string {
  if (!iso) return "—";
  const normalized = iso.length === 10 ? `${iso}T00:00:00` : iso;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

/** V3 UbgtNetConversion: hakkaniyet = brut / 3 (NO round2 on hakkaniyet itself). */
export function calcHakkaniyet(brut: number): number {
  return (brut || 0) / 3;
}

/** V3 Standart REPORT mahsup sonucu: max(0, net − hakkaniyet) — settle NOT subtracted. */
export function calcMahsupSonucuStandart(net: number, hakkaniyet: number): number {
  return Math.max(0, net - hakkaniyet);
}

/** V3 Bilirkisi REPORT mahsup sonucu: max(0, brut − hakkaniyet − settleAmount). */
export function calcMahsupSonucuBilirkisi(brut: number, hakkaniyet: number, settle: number): number {
  return Math.max(0, brut - hakkaniyet - settle);
}

/**
 * V3 UbgtNetConversion selectedYear: latest non-empty dateRanges end (2010–2100),
 * else current calendar year.
 */
export function deriveTaxYear(dateRanges: Array<{ end?: string | null }>): number {
  const exitDates = dateRanges
    .map((r) => r.end)
    .filter((d): d is string => !!d && String(d).trim() !== "")
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (exitDates.length > 0) {
    const latestExit = exitDates.reduce((latest, current) => (current > latest ? current : latest));
    const year = latestExit.getFullYear();
    if (year >= 2010 && year <= 2100) return year;
  }
  return new Date().getFullYear();
}

export type UbgtPeriodRow = {
  period: string;
  /** Dönem başlangıç ISO (manuel brüt eşlemesi / UI). */
  startISO?: string;
  wage: number;
  coefficient: number;
  dailyWage: number;
  ubgtDays: number;
  ubgtTotal: number;
  persons?: string[];
};

export type UbgtNetResult = {
  ssk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netAmount: number;
};

export type UbgtComputeInput = {
  dateRanges: UbgtDateRangeInput[];
  selectedHolidayIds: string[];
  ubgtExcludedDays?: UbgtExcludedDay[];
  ubgtExpiryStart?: string | null;
  excludedWeekdays?: number[];
  year?: number;
  /** UI dönem override’ları (wage / coefficient / ubgtDays). Index → string alanlar. */
  periodOverrides?: Record<string, { wage?: string; coefficient?: string; ubgtDays?: string }>;
  /** Yıl × tatil tipi dışlama kuralları (V3 filterExcludedUbgtHolidaysByRules). */
  ubgtExclusionRules?: UbgtExclusionRule[];
};

export type UbgtResult = {
  periods: UbgtPeriodRow[];
  ubgtDayEntries: UbgtDayEntry[];
  /** Tip eşlemeli günler (ExclusionCompactUI / filtre). */
  ubgtDayEntriesTyped: UbgtDayEntryTyped[];
  toplamBrut: number;
  toplamNet: UbgtNetResult;
  totalDays: number;
  excludedWeekdayHolidays: Array<{ date: string; name: string; duration: number; dayOfWeek: number }>;
  error?: string;
};

/** Brüt → net (SGK %14, işsizlik %1, GV, damga). Editable brut override için de kullanılır. */
export function calculateNet(brutAmount: number, year: number): UbgtNetResult {
  if (!brutAmount || brutAmount <= 0) {
    return { ssk: 0, issizlik: 0, gelirVergisi: 0, gelirVergisiDilimleri: "", damgaVergisi: 0, netAmount: 0 };
  }
  const ssk = round2(brutAmount * SGK_ORANI);
  const issizlik = round2(brutAmount * ISSIZLIK_ORANI);
  const gelirVergisiMatrahi = Math.max(0, brutAmount - ssk - issizlik);
  const gelirVergisi = round2(calculateIncomeTaxForYear(year, gelirVergisiMatrahi));
  const damgaVergisi = round2(brutAmount * DAMGA_ORANI);
  const netAmount = round2(Math.max(0, brutAmount - ssk - issizlik - gelirVergisi - damgaVergisi));
  const gelirVergisiDilimleri = calculateIncomeTaxWithBrackets(year, gelirVergisiMatrahi).summary;
  return { ssk, issizlik, gelirVergisi, damgaVergisi, netAmount, gelirVergisiDilimleri };
}

function generateUbgtPeriods(workerStart: string, workerEnd: string) {
  if (!workerStart || !workerEnd) return [] as Array<{ start: string; end: string; wage: number }>;
  const workerStartDate = new Date(workerStart);
  const workerEndDate = new Date(workerEnd);
  const periods: Array<{ start: string; end: string; wage: number }> = [];

  MIN_WAGE_TABLE.forEach((wagePeriod) => {
    const wagePeriodStart = new Date(wagePeriod.start);
    const wagePeriodEnd = new Date(wagePeriod.end);
    const effectiveStart = workerStartDate > wagePeriodStart ? workerStartDate : wagePeriodStart;
    const effectiveEnd = workerEndDate < wagePeriodEnd ? workerEndDate : wagePeriodEnd;
    if (effectiveStart <= effectiveEnd) {
      periods.push({
        start: effectiveStart.toISOString().split("T")[0],
        end: effectiveEnd.toISOString().split("T")[0],
        wage: wagePeriod.wage,
      });
    }
  });

  return periods;
}

type InternalPeriod = UbgtPeriodRow & {
  startDate: string;
  excludedWeekdayHolidays: Array<{ date: string; name: string; duration: number; dayOfWeek: number }>;
  dayEntries: UbgtDayEntry[];
};

/** Ana UBGT hesaplama — backend calculateUbgt. */
export function computeUbgt(input: UbgtComputeInput): UbgtResult {
  const {
    dateRanges = [],
    selectedHolidayIds = [],
    ubgtExcludedDays = [],
    ubgtExpiryStart = null,
    excludedWeekdays = [],
    year = new Date().getFullYear(),
    periodOverrides = {},
    ubgtExclusionRules = [],
  } = input;

  for (const range of dateRanges) {
    if (range.start && range.end) {
      const startDate = normalizeLocalDate(range.start);
      const endDate = normalizeLocalDate(range.end);
      if (!startDate || !endDate) {
        return emptyResult(`Geçersiz tarih formatı: Başlangıç: ${range.start}, Bitiş: ${range.end}. Lütfen YYYY-MM-DD formatında girin.`);
      }
      const startYear = startDate.getFullYear();
      const endYear = endDate.getFullYear();
      if (startYear < 2000 || startYear > 2100 || endYear < 2000 || endYear > 2100) {
        return emptyResult(`Geçersiz yıl: Başlangıç yılı ${startYear}, Bitiş yılı ${endYear}. Lütfen 2000-2100 arası tarih girin.`);
      }
      if (endDate < startDate) {
        return emptyResult(`Bitiş tarihi (${range.end}) başlangıç tarihinden (${range.start}) önce olamaz.`);
      }
    }
  }

  const allPeriodsWithStartDate: InternalPeriod[] = [];
  const hasPersonField = dateRanges.some((r) => r.person !== undefined);

  if (hasPersonField) {
    const segments = calculateUbgtSegments(dateRanges);
    segments.forEach((segment) => {
      let effectiveStart = segment.start;
      let effectiveEnd = segment.end;

      if (ubgtExpiryStart) {
        const segStartDate = new Date(segment.start);
        const expiryStartDate = new Date(ubgtExpiryStart);
        if (segStartDate < expiryStartDate) effectiveStart = ubgtExpiryStart;
      }
      if (new Date(effectiveStart) > new Date(effectiveEnd)) return;

      const segStartDate = new Date(effectiveStart);
      let wage = 0;
      for (const wagePeriod of MIN_WAGE_TABLE) {
        const wageStart = new Date(wagePeriod.start);
        const wageEnd = new Date(wagePeriod.end);
        if (segStartDate >= wageStart && segStartDate <= wageEnd) {
          wage = wagePeriod.wage;
          break;
        }
      }
      if (wage === 0) return;

      const segmentHolidayIds = new Set<string>();
      if (segment.persons && segment.persons.length > 0) {
        segment.persons.forEach((personName) => {
          const personRange = dateRanges.find((r) => r.person === personName);
          if (personRange?.selectedHolidayIds && Array.isArray(personRange.selectedHolidayIds)) {
            personRange.selectedHolidayIds.forEach((id) => segmentHolidayIds.add(id));
          }
        });
      }

      const segmentHolidayArray = Array.from(segmentHolidayIds);
      const coefficient = 1;
      const dailyWage = round6(round6(wage * coefficient) / 30);
      const ubgtResult = getUbgtDaysForPeriod(
        effectiveStart,
        effectiveEnd,
        segmentHolidayArray,
        ubgtExcludedDays,
        excludedWeekdays,
      );
      const ubgtDays = ubgtResult.ubgtDays;
      const ubgtTotal = round2(round6(dailyWage * ubgtDays));

      allPeriodsWithStartDate.push({
        period: `${new Date(effectiveStart).toLocaleDateString("tr-TR")} - ${new Date(effectiveEnd).toLocaleDateString("tr-TR")}`,
        wage,
        coefficient,
        dailyWage,
        ubgtDays,
        ubgtTotal,
        startDate: effectiveStart,
        excludedWeekdayHolidays: ubgtResult.excludedWeekdayHolidays || [],
        dayEntries: ubgtResult.dayEntries || [],
        persons: segment.persons,
      });
    });
  } else {
    dateRanges.forEach((range) => {
      if (!range.start || !range.end) return;

      let effectiveStart: string;
      if (ubgtExpiryStart) {
        const rangeStartDate = new Date(range.start);
        const expiryStartDate = new Date(ubgtExpiryStart);
        effectiveStart = rangeStartDate > expiryStartDate ? range.start : ubgtExpiryStart;
      } else {
        effectiveStart = range.start;
      }

      const calculatedPeriods = generateUbgtPeriods(effectiveStart, range.end);
      calculatedPeriods.forEach((period) => {
        const wage = period.wage;
        const coefficient = 1;
        const dailyWage = round6(round6(wage * coefficient) / 30);
        const ubgtResult = getUbgtDaysForPeriod(
          period.start,
          period.end,
          selectedHolidayIds,
          ubgtExcludedDays,
          excludedWeekdays,
        );
        const ubgtDays = ubgtResult.ubgtDays;
        const ubgtTotal = round2(round6(dailyWage * ubgtDays));

        allPeriodsWithStartDate.push({
          period: `${new Date(period.start).toLocaleDateString("tr-TR")} - ${new Date(period.end).toLocaleDateString("tr-TR")}`,
          wage,
          coefficient,
          dailyWage,
          ubgtDays,
          ubgtTotal,
          startDate: period.start,
          excludedWeekdayHolidays: ubgtResult.excludedWeekdayHolidays || [],
          dayEntries: ubgtResult.dayEntries || [],
        });
      });
    });
  }

  allPeriodsWithStartDate.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const allExcludedWeekdayHolidays: Array<{ date: string; name: string; duration: number; dayOfWeek: number }> = [];
  const seenDates = new Set<string>();
  allPeriodsWithStartDate.forEach((period) => {
    period.excludedWeekdayHolidays?.forEach((holiday) => {
      if (!seenDates.has(holiday.date)) {
        seenDates.add(holiday.date);
        allExcludedWeekdayHolidays.push(holiday);
      }
    });
  });

  const ubgtDayEntriesRaw = allPeriodsWithStartDate.flatMap((p, idx) =>
    (p.dayEntries || []).map((e) => ({
      date: e.date,
      holidayId: e.holidayId,
      days: e.days,
      periodIndex: idx,
    })),
  );

  const ubgtDayEntriesTyped: UbgtDayEntryTyped[] = ubgtDayEntriesRaw.map((e) => ({
    date: e.date,
    holidayId: e.holidayId,
    holidayType: BACKEND_ID_TO_UBGT_TYPE[e.holidayId] ?? (e.holidayId as UbgtHolidayType),
    days: e.days,
    periodIndex: e.periodIndex,
  }));

  // V3: filterExcludedUbgtHolidaysByRules → dönem günlerini yeniden topla + ubgtTotal
  let filteredTyped = ubgtDayEntriesTyped;
  if (ubgtExclusionRules.length > 0 && ubgtDayEntriesTyped.length > 0) {
    filteredTyped = filterExcludedUbgtHolidaysByRules(ubgtDayEntriesTyped, ubgtExclusionRules);
    const daysByPeriod: Record<number, number> = {};
    filteredTyped.forEach((e) => {
      const idx = e.periodIndex ?? 0;
      daysByPeriod[idx] = (daysByPeriod[idx] ?? 0) + e.days;
    });
    allPeriodsWithStartDate.forEach((p, idx) => {
      const newUbgtDays = daysByPeriod[idx] ?? 0;
      const dailyWage = round6(round6(p.wage * (p.coefficient || 1)) / 30);
      p.ubgtDays = newUbgtDays;
      p.dailyWage = dailyWage;
      p.ubgtTotal = round2(round6(dailyWage * newUbgtDays));
    });
  }

  // Dönem override’ları (katsayı dahil) — exclusion sonrası; UI override son söz.
  if (periodOverrides && Object.keys(periodOverrides).length > 0) {
    allPeriodsWithStartDate.forEach((p, i) => {
      const ov = periodOverrides[String(i)];
      if (!ov) return;
      const wage = ov.wage !== undefined && ov.wage !== "" ? parseNum(ov.wage) : p.wage;
      const coefficient =
        ov.coefficient !== undefined && ov.coefficient !== ""
          ? parseCoef(ov.coefficient)
          : p.coefficient || 1;
      const ubgtDays = ov.ubgtDays !== undefined && ov.ubgtDays !== "" ? parseCoef(ov.ubgtDays) : p.ubgtDays;
      const dailyWage = round6(round6(wage * coefficient) / 30);
      const ubgtTotal = round2(round6(dailyWage * ubgtDays));
      p.wage = wage;
      p.coefficient = coefficient;
      p.ubgtDays = ubgtDays;
      p.dailyWage = dailyWage;
      p.ubgtTotal = ubgtTotal;
    });
  }

  const ubgtDayEntries: UbgtDayEntry[] = filteredTyped.map((e) => ({
    date: e.date,
    holidayId: e.holidayId || "",
    days: e.days,
    periodIndex: e.periodIndex,
  }));

  const periods: UbgtPeriodRow[] = allPeriodsWithStartDate.map(
    ({ startDate, excludedWeekdayHolidays: _e, dayEntries: _d, ...row }) => ({
      ...row,
      startISO: startDate,
    }),
  );
  const toplamBrut = round2(periods.reduce((sum, row) => sum + row.ubgtTotal, 0));
  const toplamNet = calculateNet(toplamBrut, year);

  return {
    periods,
    ubgtDayEntries,
    ubgtDayEntriesTyped,
    toplamBrut,
    toplamNet,
    totalDays: periods.reduce((sum, row) => sum + row.ubgtDays, 0),
    excludedWeekdayHolidays: allExcludedWeekdayHolidays,
  };
}

/** Alias — V3 / UI editable brut. */
export function calculateNetFromBrut(brutAmount: number, year: number): UbgtNetResult {
  return calculateNet(brutAmount, year);
}

function emptyResult(error: string): UbgtResult {
  return {
    periods: [],
    ubgtDayEntries: [],
    ubgtDayEntriesTyped: [],
    toplamBrut: 0,
    toplamNet: { ssk: 0, issizlik: 0, gelirVergisi: 0, gelirVergisiDilimleri: "", damgaVergisi: 0, netAmount: 0 },
    totalDays: 0,
    excludedWeekdayHolidays: [],
    error,
  };
}
