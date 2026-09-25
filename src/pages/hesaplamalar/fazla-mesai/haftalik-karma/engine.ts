/**
 * Haftalık Karma Fazla Mesai — hesaplama motoru (V3 pipeline, izolasyon).
 *
 * Sıra: davacı FM → tanık clamp+FM → buildMergedWitnessSegments (boşsa davacı-only)
 * → asgari dönem → weeks=round(days/7) → zamanaşımı → expandRows → calculateFm
 * → karma deduction MIN → preserveWeeks → para → overrides/manual → 270 → net.
 */

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
import { getAsgariUcretByDate, splitRangeByAsgariPeriodBounds } from "./asgariUcret";
import {
  calculateFm,
  exclusionsNeedLegacySplit,
  expandRowsForDeductions,
} from "./expandRowsForDeductions";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import { preserveWeeks, countWeeksBySevenDaySteps } from "./preserveWeeks";
import {
  applyMode270DetailedHireYear,
  applyMode270SimpleToRows,
} from "../shared/mode270Core";
import { buildMergedWitnessSegments } from "./witnessSegments";
import {
  calculateLegalBreak,
  calculateWeeklyFMFromDayGroups,
  calculateWeeklyKarmaDeductionFmHours,
  ceilWeeklyWorkHoursToHalfHour,
  clampWitnessGroupsByIndex,
  fallbackDailyNetFromWeeklyFm,
  generateWeeklyText,
  getPatternGroupNetDaily,
  representativeDailyNetFromDayGroups,
  sumRegisteredWorkDays,
  toNumericDayGroups,
  witnessWeeklyHolidayFromPlaintiffClaim,
} from "./weeklyHours";
import {
  newLocalId,
  type EffectiveSegment,
  type HaftalikKarmaFormSnapshot,
  type HaftalikKarmaResult,
  type PeriodRow,
  type RowOverride,
  type WeeklyKarmaFmContext,
} from "./model";

/* ── Sayı / para ── */

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

/** V3 calculateWeeksBetweenDates: round(inclusiveDays / 7). */
export function calculateWeeksBetweenDates(startISO: string, endISO: string): number {
  if (!isValidIsoDate(startISO) || !isValidIsoDate(endISO) || endISO < startISO) return 0;
  const days = daysBetweenIsoInclusive(startISO, endISO);
  return Math.max(0, Math.round(days / 7));
}

export function weeksBetweenIso(startISO: string, endISO: string): number {
  return calculateWeeksBetweenDates(startISO, endISO);
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

/* ── Para formülü ── */

export function calcRowFm(brut: number, katsayi: number, weeks: number, fmHours: number): number {
  if (!brut || !fmHours || weeks <= 0) return 0;
  return Number(((((weeks * fmHours) * brut * katsayi) / FM_DENOMINATOR) * FM_ZAM_KATSAYISI).toFixed(2));
}

export {
  generateWeeklyText,
  calculateWeeklyFMFromDayGroups,
  countWeeksBySevenDaySteps,
  sumRegisteredWorkDays,
  toNumericDayGroups,
  clampWitnessGroupsByIndex,
  witnessWeeklyHolidayFromPlaintiffClaim,
  calculateWeeklyKarmaDeductionFmHours,
  ceilWeeklyWorkHoursToHalfHour,
  calculateLegalBreak,
  getPatternGroupNetDaily,
};

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

export function computeTotalsFromRows(
  rows: { fm: number }[],
  exitYear: number,
  mahsupInput: string,
): Pick<
  HaftalikKarmaResult,
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

function emptyResult(warnings: string[] = []): HaftalikKarmaResult {
  return {
    segments: [],
    rows: [],
    davaciWeeklyFmHours: 0,
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

function resolveWeeklyKarmaFmContextForDate(
  dateISO: string,
  witnesses: Array<{
    startDateISO: string;
    endDateISO: string;
    dayGroups: WeeklyKarmaFmContext["dayGroups"];
    hasWeeklyHoliday: boolean;
    weeklyHolidayGroup: number;
  }>,
  fallback: WeeklyKarmaFmContext,
): WeeklyKarmaFmContext {
  const t = new Date(dateISO).getTime();
  if (!Number.isFinite(t)) return fallback;
  for (const w of witnesses) {
    const s = new Date(w.startDateISO).getTime();
    const e = new Date(w.endDateISO).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    if (t >= s && t <= e) {
      return {
        dayGroups: w.dayGroups,
        hasWeeklyHoliday: w.hasWeeklyHoliday,
        weeklyHolidayGroup: w.weeklyHolidayGroup,
      };
    }
  }
  return fallback;
}

/**
 * Ana hesap — V3 HaftalikKarmaPage rows useMemo ile aynı sıra.
 */
export function computeHaftalikKarmaResult(form: HaftalikKarmaFormSnapshot): HaftalikKarmaResult {
  const warnings: string[] = [];
  const dateError = validateDateRange(form.iseGiris, form.istenCikis);
  if (dateError) warnings.push(dateError);

  const davaciGroups = toNumericDayGroups(form.dayGroups);
  const hasHoliday = form.hasWeeklyHoliday ?? false;
  const holidayGroup = form.weeklyHolidayGroup || 1;
  const davaciFM = calculateWeeklyFMFromDayGroups(davaciGroups, hasHoliday, holidayGroup);

  if (!form.iseGiris || !form.istenCikis || dateError) {
    return { ...emptyResult(warnings), davaciWeeklyFmHours: davaciFM };
  }

  const totalDays = sumRegisteredWorkDays(davaciGroups);
  if (totalDays > 0 && totalDays !== 7) {
    warnings.push(`Gün gruplarının toplamı ${totalDays} gün; haftalık 7 gün ile eşleşmiyor.`);
  }

  const davaciFmContext: WeeklyKarmaFmContext = {
    dayGroups: davaciGroups,
    hasWeeklyHoliday: hasHoliday,
    weeklyHolidayGroup: holidayGroup,
  };

  const witnessFmProfiles = form.witnesses
    .filter((w) => w.startISO && w.endISO)
    .map((w) => {
      const rawGroups = w.dayGroups?.length
        ? toNumericDayGroups(w.dayGroups)
        : davaciGroups;
      const clampedGroups = clampWitnessGroupsByIndex(rawGroups, davaciGroups);
      const wHt = witnessWeeklyHolidayFromPlaintiffClaim({
        davaciDayGroups: davaciGroups,
        davaciHasWeeklyHoliday: hasHoliday,
        davaciWeeklyHolidayGroup: holidayGroup,
        witnessDayGroups: clampedGroups,
      });
      return {
        startDateISO: w.startISO,
        endDateISO: w.endISO,
        dayGroups: clampedGroups,
        hasWeeklyHoliday: wHt.hasWeeklyHoliday,
        weeklyHolidayGroup: wHt.weeklyHolidayGroup,
      };
    });

  const validWitnesses = form.witnesses
    .filter((w) => {
      if (!w.startISO || !w.endISO) return false;
      const groups = toNumericDayGroups(w.dayGroups || []);
      return groups.some((g) => g.dayCount > 0 && g.startTime && g.endTime);
    })
    .map((w) => {
      const rawGroups = w.dayGroups?.length ? toNumericDayGroups(w.dayGroups) : davaciGroups;
      const clampedGroups = clampWitnessGroupsByIndex(rawGroups, davaciGroups);
      const wHt = witnessWeeklyHolidayFromPlaintiffClaim({
        davaciDayGroups: davaciGroups,
        davaciHasWeeklyHoliday: hasHoliday,
        davaciWeeklyHolidayGroup: holidayGroup,
        witnessDayGroups: clampedGroups,
      });
      const wFM = calculateWeeklyFMFromDayGroups(clampedGroups, wHt.hasWeeklyHoliday, wHt.weeklyHolidayGroup);
      const repNet = representativeDailyNetFromDayGroups(
        clampedGroups,
        wHt.hasWeeklyHoliday,
        wHt.weeklyHolidayGroup,
      );
      const dailyNet =
        repNet ?? fallbackDailyNetFromWeeklyFm(wFM, clampedGroups);
      const workDays = sumRegisteredWorkDays(clampedGroups);
      return {
        startMs: new Date(w.startISO).getTime(),
        endMs: new Date(w.endISO).getTime(),
        fmHours: wFM,
        dailyNet,
        annualLeaveHg: Math.max(1, Math.min(7, workDays || 6)),
        annualLeaveSevenDay: (wHt.hasWeeklyHoliday ? "tatilli" : "tatilsiz") as "tatilli" | "tatilsiz",
      };
    })
    .filter((w) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs));

  type MergedSeg = {
    start: string;
    end: string;
    fmHours: number;
    dailyNet?: number;
    annualLeaveHg?: number;
    annualLeaveSevenDay?: "tatilli" | "tatilsiz";
  };

  const buildDavaciOnlyMerged = (): MergedSeg[] => {
    const repNet = representativeDailyNetFromDayGroups(davaciGroups, hasHoliday, holidayGroup);
    const dailyNet = repNet ?? fallbackDailyNetFromWeeklyFm(davaciFM, davaciGroups);
    const workDays = sumRegisteredWorkDays(davaciGroups);
    const start = String(form.iseGiris).slice(0, 10);
    const end = String(form.istenCikis).slice(0, 10);
    const hasUsableDavaciPattern = davaciGroups.some(
      (g) => g.dayCount > 0 && g.startTime && g.endTime,
    );
    if (!hasUsableDavaciPattern || !(davaciFM > 0)) return [];
    return [
      {
        start,
        end,
        fmHours: davaciFM,
        dailyNet,
        annualLeaveHg: Math.max(1, Math.min(7, workDays || 6)),
        annualLeaveSevenDay: hasHoliday ? "tatilli" : "tatilsiz",
      },
    ];
  };

  let merged: MergedSeg[] = [];
  if (validWitnesses.length > 0) {
    merged = buildMergedWitnessSegments(form.iseGiris, form.istenCikis, validWitnesses);
  }
  if (merged.length === 0) {
    merged = buildDavaciOnlyMerged();
  }

  if (merged.length === 0) {
    if (!warnings.length) {
      warnings.push("Geçerli haftalık desen veya tanık beyanı giriniz.");
    }
    return { ...emptyResult(warnings), davaciWeeklyFmHours: davaciFM };
  }

  const segments: EffectiveSegment[] = merged.map((seg) => ({
    startISO: seg.start,
    endISO: seg.end,
    fmHours: seg.fmHours,
    dailyNet: seg.dailyNet,
    annualLeaveHg: seg.annualLeaveHg,
    annualLeaveSevenDay: seg.annualLeaveSevenDay,
  }));

  const katsayi = parseKatsayi(form.katSayi);
  const zamanasimiISO: string | null = form.zamanasimi?.nihaiBaslangic || null;

  const tableRows: PeriodRow[] = [];
  merged.forEach((seg, segIdx) => {
    const rawPeriods = splitRangeByAsgariPeriodBounds(seg.start, seg.end);
    const periods = clipSegmentsByZamanasimi(
      rawPeriods.map((p) => ({ start: p.start, end: p.end, brut: p.brut })),
      zamanasimiISO,
    );

    periods.forEach((period, periodIdx) => {
      const weeks = calculateWeeksBetweenDates(period.start, period.end);
      const brut = period.brut || getAsgariUcretByDate(period.start) || 0;
      const karmaFmContext = resolveWeeklyKarmaFmContextForDate(
        period.start,
        witnessFmProfiles,
        davaciFmContext,
      );
      tableRows.push({
        id: `row-${period.start}-${period.end}-${segIdx}-${periodIdx}`,
        startISO: period.start,
        endISO: period.end,
        weeks,
        originalWeekCount: weeks,
        brut,
        katsayi,
        fmHours: seg.fmHours,
        dailyNet: seg.dailyNet,
        annualLeaveHg: seg.annualLeaveHg,
        annualLeaveSevenDay: seg.annualLeaveSevenDay,
        fm: 0,
        isDeductionRow: false,
        karmaFmContext,
      });
    });
  });

  const weeklyOffDayNum =
    form.haftaTatiliGunu === "" || form.haftaTatiliGunu == null ? null : Number(form.haftaTatiliGunu);
  const weeklyOff = Number.isInteger(weeklyOffDayNum) ? weeklyOffDayNum : null;

  const originalTotalWeeks = tableRows.reduce(
    (a, r) => a + Math.max(0, Math.floor(Number(r.weeks) || 0)),
    0,
  );

  let pipeline = expandRowsForDeductions({
    rows: tableRows,
    exclusions: form.exclusions,
    weeklyOffDay: weeklyOff,
  });
  pipeline = pipeline.map((r) => calculateFm(r));

  if (form.exclusions.length > 0 && !exclusionsNeedLegacySplit(form.exclusions)) {
    pipeline = pipeline.map((r) => {
      if (!r.isExclusionBlock || !r.karmaFmContext) return r;
      const fmHours = calculateWeeklyKarmaDeductionFmHours({
        context: r.karmaFmContext,
        deductionDates: r.karmaDeductionDates ?? [],
      });
      return { ...r, fmHours };
    });
  }

  pipeline = preserveWeeks(pipeline, originalTotalWeeks);
  pipeline = pipeline.map((r) => ({
    ...r,
    fm: calcRowFm(r.brut, r.katsayi, r.weeks, r.fmHours),
  }));

  let representativeWeeklyFmHours = segments[0]?.fmHours ?? davaciFM;

  let displayRows = applyRowOverrides(
    pipeline,
    form.rowOverrides ?? {},
    form.manualRows ?? [],
    katsayi,
    representativeWeeklyFmHours,
  );

  if (form.mode270 === "simple") {
    displayRows = applyMode270SimpleToRows(displayRows, representativeWeeklyFmHours).map((r) => ({
      ...r,
      fm: calcRowFm(r.brut, r.katsayi, r.weeks, r.fmHours),
    }));
  } else if (form.mode270 === "detailed" && representativeWeeklyFmHours > 0) {
    const withWeeks = applyMode270DetailedHireYear(
      displayRows.map((r) => ({ ...r, originalWeekCount: r.originalWeekCount ?? r.weeks })),
      form.iseGiris,
      form.istenCikis,
      representativeWeeklyFmHours,
      zamanasimiISO,
    );
    displayRows = withWeeks.map((r) => ({
      ...r,
      fm: calcRowFm(r.brut, r.katsayi, r.weeks, r.fmHours),
    }));
  }

  // Sıfır otomatik satırları gizle
  displayRows = displayRows.filter((r) => {
    if (r.isManual) return true;
    return Number(r.fmHours ?? 0) !== 0 && Number(r.weeks ?? 0) !== 0 && Number(r.fm ?? 0) !== 0;
  });

  const exitYear = form.istenCikis ? Number(form.istenCikis.slice(0, 4)) : new Date().getFullYear();
  const totals = computeTotalsFromRows(displayRows, exitYear, form.mahsup);

  return {
    segments,
    rows: displayRows,
    davaciWeeklyFmHours: davaciFM,
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

/** Toplam gün sayısını 7'ye clamp et (V3 WeeklyPatternEditor). */
export function clampDayCountForGroup(
  groups: Array<{ dayCount: string }>,
  index: number,
  rawValue: string,
): string {
  const n = Math.floor(Number(String(rawValue).replace(",", ".")) || 0);
  if (n <= 0) return "";
  const otherSum = groups.reduce((s, g, i) => {
    if (i === index) return s;
    return s + Math.max(0, Math.floor(Number(String(g.dayCount).replace(",", ".")) || 0));
  }, 0);
  const maxForThis = Math.max(0, 7 - otherSum);
  const clamped = Math.min(n, maxForThis);
  return clamped > 0 ? String(clamped) : "";
}
