/**
 * Dönemsel Fazla Mesai — hesaplama motoru (V3 klasik pipeline, izolasyon).
 *
 * Sıra: buildDonemselRows → zamanaşımı kırp → expand → calculateFm → preserveWeeks
 * → para → overrides/manual → 270 → filtre → brütten nete.
 */

import {
  applyMode270DetailedHireYear,
  fmHoursAfterYargitay270Simple,
} from "../shared/mode270Core";
import {
  DAMGA_ORAN,
  FM_DENOMINATOR,
  FM_ZAM_KATSAYISI,
  ISSIZLIK_ORANI,
  PANDEMI_BASLANGIC,
  PANDEMI_BITIS,
  PANDEMI_SABIT_GUN,
  SGK_ORANI,
} from "./constants";
import { getAsgariUcretByDate, splitRangeByAsgariUcretPeriods } from "./asgariUcret";
import {
  calculateFm,
  expandRowsForDeductions,
} from "./expandRowsForDeductions";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import { preserveWeeks, countWeeksBySevenDaySteps } from "./preserveWeeks";
import {
  annualLeaveMetaFromPattern,
  buildIntervalsFromWitnesses,
  calcFmHoursPerWeek,
  classicSevenTabForWitnessOrDavaci,
  clampDonemselWitnessesToDavaci,
  effectiveClassicWorkDays,
  sevenModeFromPattern,
  weeklyIgnoredWeekdayFromPattern,
  workDaysFromPattern,
} from "./seasonalHours";
import {
  newLocalId,
  type DonemselFormSnapshot,
  type DonemselResult,
  type DonemselWitness,
  type PeriodRow,
  type RowOverride,
  type SeasonalPattern,
} from "./model";

/* ── Sayı / para ── */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseMoneyInput(value: string): number {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n || 0 : 0;
}

/** Modal uyumluluğu (eski isim). */
export const parseNum = parseMoneyInput;

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value || 0 : 0);
}

/** Modal uyumluluğu (eski isim). */
export const fmtCurrency = formatMoney;

export { sanitizeMoneyTyping } from "@/utils/moneyInput";

export function parseKatsayi(value: string): number {
  const n = parseMoneyInput(value);
  return n > 0 ? n : 1;
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
  return isoToUtcDays(endISO) - isoToUtcDays(startISO) + 1;
}

export function validateDateRange(startIso: string, endIso: string): string | null {
  if (!startIso || !endIso) return null;
  if (!isValidIsoDate(startIso) || !isValidIsoDate(endIso)) return "Geçersiz tarih.";
  if (endIso < startIso) return "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.";
  return null;
}

/** V3: weeks = round(inclusiveDays / 7). */
export function calculateWeeksBetweenDates(startISO: string, endISO: string): number {
  if (!isValidIsoDate(startISO) || !isValidIsoDate(endISO) || endISO < startISO) return 0;
  const days = daysBetweenIsoInclusive(startISO, endISO);
  return Math.max(0, Math.round(days / 7));
}

export function weeksBetweenIso(startISO: string, endISO: string): number {
  return calculateWeeksBetweenDates(startISO, endISO);
}

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDay(iso: string): Date | null {
  const head = String(iso || "").trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/* ── Zamanaşımı ── */

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

/* ── Para formülü ── */

export function calcRowFm(brut: number, katsayi: number, weeks: number, fmHours: number): number {
  if (!brut || !fmHours || weeks <= 0) return 0;
  return Number(((((weeks * fmHours) * brut * katsayi) / FM_DENOMINATOR) * FM_ZAM_KATSAYISI).toFixed(2));
}

export { countWeeksBySevenDaySteps, calcFmHoursPerWeek, workDaysFromPattern, sevenModeFromPattern };

/* ── Sezon satırları ── */

type RowWithWitness = PeriodRow & { witnessData?: DonemselWitness };

function seasonSegmentRow(
  row: RowWithWitness,
  summerMonths: number[],
  _winterMonths: number[],
  summerPattern: SeasonalPattern,
  winterPattern: SeasonalPattern,
  katSayi: number,
  davaciSummer: SeasonalPattern,
  davaciWinter: SeasonalPattern,
): PeriodRow[] {
  const rowStart = parseLocalDay(row.startISO);
  const rowEnd = parseLocalDay(row.endISO);
  if (!rowStart || !rowEnd || rowEnd < rowStart) return [];

  const result: PeriodRow[] = [];
  let cur = new Date(rowStart);
  let segStart = new Date(rowStart);
  const monthSeason = (month1to12: number): "summer" | "winter" =>
    summerMonths.includes(month1to12) ? "summer" : "winter";
  let segSeason: "summer" | "winter" = monthSeason(cur.getMonth() + 1);

  while (cur <= rowEnd) {
    const m = cur.getMonth() + 1;
    const newSeason = monthSeason(m);
    const lastDay = cur.getTime() === rowEnd.getTime();
    const changed = newSeason !== segSeason;

    if (changed || lastDay) {
      const segEnd = new Date(cur);
      if (changed) segEnd.setDate(segEnd.getDate() - 1);

      const siso = toLocalISO(segStart);
      const eiso = toLocalISO(segEnd);
      const diffMs = segEnd.getTime() - segStart.getTime();
      const diffDays = Math.ceil(diffMs / 86400000) + 1;
      const weeks = Math.round(diffDays / 7);
      const pattern = segSeason === "summer" ? summerPattern : winterPattern;
      const hasWitness = Boolean(row.witnessData);
      const dDavaciSeason = segSeason === "summer" ? davaciSummer : davaciWinter;
      const wd = effectiveClassicWorkDays(pattern, dDavaciSeason, hasWitness);
      const useDavaciSeven = hasWitness && wd === 7;
      const tab = useDavaciSeven
        ? classicSevenTabForWitnessOrDavaci(pattern, dDavaciSeason, true)
        : wd === 7
          ? sevenModeFromPattern(pattern)
          : "tatilsiz";
      const fmHours = calcFmHoursPerWeek(pattern, wd, tab);
      const brut = getAsgariUcretByDate(siso) || 0;
      const patternForLeave: SeasonalPattern = useDavaciSeven
        ? {
            ...pattern,
            workDays: "7",
            sevenDayMode: tab,
            weeklyHolidayWeekday: dDavaciSeason.weeklyHolidayWeekday,
          }
        : { ...pattern, workDays: String(wd), sevenDayMode: wd === 7 ? tab : "tatilsiz" };
      const leaveMeta = annualLeaveMetaFromPattern(patternForLeave);
      const annualLeaveWeeklyIgnoredWeekday = weeklyIgnoredWeekdayFromPattern(patternForLeave);

      result.push({
        id: `period-${result.length}`,
        startISO: siso,
        endISO: eiso,
        weeks,
        originalWeekCount: weeks,
        brut,
        katsayi: katSayi,
        fmHours,
        fm: 0,
        ...leaveMeta,
        annualLeaveWeeklyIgnoredWeekday,
      });

      if (changed && !lastDay) {
        segStart = new Date(cur);
        segSeason = newSeason;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

/** V3 buildDonemselRows — klasik (haftalikMode=false). */
export function buildDonemselRows(params: {
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalPattern;
  winterPattern: SeasonalPattern;
  witnesses: DonemselWitness[];
  katSayi: number;
}): PeriodRow[] {
  const { dateIn, dateOut, summerPattern, winterPattern, witnesses, katSayi } = params;
  const kats = katSayi || 1;

  const witnessesClamped = clampDonemselWitnessesToDavaci(
    dateIn,
    dateOut,
    summerPattern,
    winterPattern,
    witnesses,
  );

  const intervals = buildIntervalsFromWitnesses(
    dateIn,
    dateOut,
    summerPattern,
    winterPattern,
    witnessesClamped,
  );

  const rawRows: PeriodRow[] = [];

  for (const interval of intervals) {
    const segments = splitRangeByAsgariUcretPeriods(interval.start, interval.end);

    for (const seg of segments) {
      const siso = seg.start;
      const eiso = seg.end;
      const diffDays = daysBetweenIsoInclusive(siso, eiso);
      const weeks = Math.round(diffDays / 7) || 1;
      const brut = getAsgariUcretByDate(siso) || seg.brut || 0;
      const month = parseLocalDay(siso)?.getMonth() ?? 0;
      const month1 = month + 1;
      const activeSummer = interval.witnessData?.summerPattern?.months ?? summerPattern.months;
      const isSummer = activeSummer.includes(month1);
      const pattern = isSummer
        ? (interval.witnessData?.summerPattern ?? summerPattern)
        : (interval.witnessData?.winterPattern ?? winterPattern);
      const davaciSeasonPat = isSummer ? summerPattern : winterPattern;
      const patWd = effectiveClassicWorkDays(pattern, davaciSeasonPat, Boolean(interval.witnessData));
      const patTab =
        interval.witnessData && patWd === 7
          ? classicSevenTabForWitnessOrDavaci(pattern, davaciSeasonPat, true)
          : patWd === 7
            ? sevenModeFromPattern(pattern)
            : "tatilsiz";
      const fmHours = calcFmHoursPerWeek(pattern, patWd, patTab);
      const leaveMeta = annualLeaveMetaFromPattern({
        ...pattern,
        workDays: String(patWd),
        sevenDayMode: patWd === 7 ? patTab : "tatilsiz",
      });

      const baseRow: RowWithWitness = {
        id: `period-${rawRows.length}`,
        startISO: siso,
        endISO: eiso,
        weeks,
        originalWeekCount: weeks,
        brut,
        katsayi: kats,
        fmHours,
        fm: 0,
        ...leaveMeta,
        annualLeaveWeeklyIgnoredWeekday: weeklyIgnoredWeekdayFromPattern({
          ...pattern,
          workDays: String(patWd),
          sevenDayMode: patWd === 7 ? patTab : "tatilsiz",
        }),
        witnessData: interval.witnessData,
      };

      const summerMonths = interval.witnessData?.summerPattern?.months ?? summerPattern.months;
      const winterMonths = interval.witnessData?.winterPattern?.months ?? winterPattern.months;
      const activeSummerP = interval.witnessData?.summerPattern ?? summerPattern;
      const activeWinterP = interval.witnessData?.winterPattern ?? winterPattern;

      const seasonRows = seasonSegmentRow(
        baseRow,
        summerMonths,
        winterMonths,
        activeSummerP,
        activeWinterP,
        kats,
        summerPattern,
        winterPattern,
      );

      seasonRows.forEach((r) => rawRows.push(r));
    }
  }

  rawRows.forEach((r, i) => {
    r.id = `period-${i}`;
  });

  return rawRows.sort((a, b) => (a.startISO || "").localeCompare(b.startISO || ""));
}

/* ── Overrides ── */

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
    let weeksFromDates: number | undefined;
    if ((hasDateOverride || row.isManual) && startISO && endISO) {
      const a = parseLocalDay(startISO);
      const b = parseLocalDay(endISO);
      if (a && b && b >= a) weeksFromDates = countWeeksBySevenDaySteps(a, b);
    }
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
      weeks: Math.max(0, Math.floor(Number(weeks) || 0)),
      brut,
      fmHours,
      katsayi,
      fm: calcRowFm(brut, katsayi, Math.max(0, Math.floor(Number(weeks) || 0)), fmHours),
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

export function computeTotalsFromRows(
  rows: { fm: number }[],
  exitYear: number,
  mahsupInput: string,
): Pick<
  DonemselResult,
  | "toplamFm"
  | "sgk"
  | "issizlik"
  | "gelirVergisi"
  | "gelirVergisiDilimleri"
  | "damgaVergisi"
  | "netYillik"
  | "hakkaniyetOneri"
  | "mahsupTutari"
  | "mahsupSonrasiNet"
> {
  const toplamFm = round2(rows.reduce((sum, r) => sum + (r.fm || 0), 0));
  const sgk = round2(toplamFm * SGK_ORANI);
  const issizlik = round2(toplamFm * ISSIZLIK_ORANI);
  const matrah = Math.max(0, toplamFm - sgk - issizlik);
  const gv = calculateIncomeTaxWithBrackets(exitYear, matrah);
  const gelirVergisi = round2(gv.tax);
  const damgaVergisi = round2(toplamFm * DAMGA_ORAN);
  const netYillik = round2(toplamFm - sgk - issizlik - gelirVergisi - damgaVergisi);
  const hakkaniyetOneri = round2(toplamFm / 3);
  const mahsupTutari = parseMoneyInput(mahsupInput);
  const mahsupSonrasiNet = Math.max(0, round2(toplamFm - hakkaniyetOneri - mahsupTutari));
  return {
    toplamFm,
    sgk,
    issizlik,
    gelirVergisi,
    gelirVergisiDilimleri: gv.summary,
    damgaVergisi,
    netYillik,
    hakkaniyetOneri,
    mahsupTutari,
    mahsupSonrasiNet,
  };
}

function emptyResult(warnings: string[] = []): DonemselResult {
  return {
    rows: [],
    yazFmHours: 0,
    kisFmHours: 0,
    toplamFm: 0,
    sgk: 0,
    issizlik: 0,
    gelirVergisi: 0,
    gelirVergisiDilimleri: "",
    damgaVergisi: 0,
    netYillik: 0,
    hakkaniyetOneri: 0,
    mahsupTutari: 0,
    mahsupSonrasiNet: 0,
    warnings,
  };
}

/**
 * Ana hesap — V3 DonemselFazlaMesaiCore rows + computedDisplayRows pipeline.
 */
export function computeDonemselResult(form: DonemselFormSnapshot): DonemselResult {
  const warnings: string[] = [];
  const dateError = validateDateRange(form.dateIn, form.dateOut);
  if (dateError) warnings.push(dateError);

  const sp = form.summerPattern;
  const wp = form.winterPattern;
  const yazFmHours = calcFmHoursPerWeek(sp, workDaysFromPattern(sp), sevenModeFromPattern(sp));
  const kisFmHours = calcFmHoursPerWeek(wp, workDaysFromPattern(wp), sevenModeFromPattern(wp));

  if (!form.dateIn || !form.dateOut || dateError) {
    return { ...emptyResult(warnings), yazFmHours, kisFmHours };
  }

  const katsayi = parseKatsayi(form.katSayi);
  const zamanasimiISO: string | null = form.zamanasimi?.nihaiBaslangic || null;

  let raw = buildDonemselRows({
    dateIn: form.dateIn,
    dateOut: form.dateOut,
    summerPattern: form.summerPattern,
    winterPattern: form.winterPattern,
    witnesses: form.witnessesSeasons,
    katSayi: katsayi,
  });

  // Zamanaşımı kırpma
  if (zamanasimiISO) {
    raw = raw
      .map((r) => {
        if (!r.startISO || !r.endISO) return r;
        if (r.endISO < zamanasimiISO) return null;
        if (r.startISO < zamanasimiISO && r.endISO >= zamanasimiISO) {
          const diffDays = daysBetweenIsoInclusive(zamanasimiISO, r.endISO);
          const adjWeeks = Math.round(diffDays / 7);
          return {
            ...r,
            startISO: zamanasimiISO,
            weeks: adjWeeks,
            originalWeekCount: adjWeeks,
          };
        }
        return r;
      })
      .filter((r): r is PeriodRow => r != null);
  }

  const davaciWeeklyOffFallback = weeklyIgnoredWeekdayFromPattern(form.summerPattern);
  const originalTotalWeeks = raw.reduce(
    (a, r) => a + Math.max(0, Math.floor(Number(r.weeks) || 0)),
    0,
  );

  let pipeline = expandRowsForDeductions({
    rows: raw,
    exclusions: form.exclusions,
    weeklyOffDay: davaciWeeklyOffFallback,
  });
  pipeline = pipeline.map((r) => calculateFm(r));
  pipeline = preserveWeeks(pipeline, originalTotalWeeks);
  pipeline = pipeline.map((r) => ({
    ...r,
    fm: calcRowFm(r.brut, r.katsayi || katsayi, r.weeks, r.fmHours),
  }));

  let displayRows = applyRowOverrides(
    pipeline,
    form.rowOverrides ?? {},
    form.manualRows ?? [],
    katsayi,
    yazFmHours,
  );

  // 270
  if (form.mode270 === "simple") {
    displayRows = displayRows.map((r) => {
      const fmHours = fmHoursAfterYargitay270Simple(Number(r.fmHours) || 0);
      return { ...r, fmHours, fm: calcRowFm(r.brut, r.katsayi, r.weeks, fmHours) };
    });
  } else if (form.mode270 === "detailed") {
    const valid = displayRows.filter((r) => r.startISO && r.endISO);
    const weeklyFM = valid[0]?.fmHours ?? yazFmHours;
    if (valid.length > 0 && weeklyFM > 0) {
      const withWeeks = applyMode270DetailedHireYear(
        displayRows,
        form.dateIn,
        form.dateOut,
        weeklyFM,
        zamanasimiISO,
      );
      displayRows = withWeeks.map((r) => ({
        ...r,
        fm: calcRowFm(r.brut, r.katsayi, r.weeks, r.fmHours),
      }));
    }
  }

  // Sıfır otomatik satırları gizle
  displayRows = displayRows.filter((r) => {
    if (r.isManual) return true;
    return Number(r.fmHours ?? 0) !== 0 && Number(r.weeks ?? 0) !== 0 && Number(r.fm ?? 0) !== 0;
  });

  if (displayRows.length === 0 && raw.length > 0) {
    warnings.push(
      "Hafta, FM saati veya fazla mesai tutarı 0 olan satırlar gösterilmez; görüntülenecek cetvel satırı yok.",
    );
  }

  const exitYear = form.dateOut ? Number(form.dateOut.slice(0, 4)) : new Date().getFullYear();
  const totals = computeTotalsFromRows(displayRows, exitYear, form.mahsup);

  return {
    rows: displayRows,
    yazFmHours,
    kisFmHours,
    ...totals,
    warnings,
  };
}

export function createManualPeriodRow(afterRowId: string, katsayi: number): PeriodRow {
  return {
    id: `manual-${newLocalId()}`,
    startISO: "",
    endISO: "",
    weeks: 0,
    brut: 0,
    katsayi,
    fmHours: 0,
    fm: 0,
    isDeductionRow: false,
    isManual: true,
    insertAfter: afterRowId,
  };
}
