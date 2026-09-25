/**
 * Tanıklı Standart Fazla Mesai hesaplama motoru — %100 lokal.
 * V3 TanikliStandartPage rows pipeline + buildMergedWitnessSegments ile birebir.
 * `fazla-mesai/standart` dahil başka FM alt türüne referans vermez.
 */

import {
  DAMGA_ORAN,
  FAZLA_MESAI_DENOMINATOR,
  FAZLA_MESAI_KATSAYI,
  ISSIZLIK_ORANI,
  MODE270_SIMPLE_REDUCTION_HOURS,
  PANDEMI_BASLANGIC,
  PANDEMI_BITIS,
  PANDEMI_SABIT_GUN,
  SGK_ORANI,
  STANDARD_DAILY_REFERENCE_HOURS,
  WEEKLY_WORK_LIMIT,
} from "./constants";
import { getAsgariUcretByDate, splitRangeByAsgariPeriodBounds } from "./asgariUcret";
import { calculateFm, expandRowsForDeductions } from "./expandRowsForDeductions";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import { preserveWeeks } from "./preserveWeeks";
import {
  applyMode270DetailedHireYear,
  applyMode270SimpleToRows,
} from "../shared/mode270Core";
import { buildMergedWitnessSegments } from "./witnessOvertimeSegments";
import {
  newLocalId,
  type EffectiveSegment,
  type Mode270,
  type PeriodRow,
  type RowOverride,
  type SevenDayMode,
  type TanikliFormSnapshot,
  type TanikliResult,
  type Witness,
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

/* ── Tarih yardımcıları ── */

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

export function addIsoDays(iso: string, amount: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + amount);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

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

/** V3 calculateWeeksBetweenDates: round(inclusiveDays / 7). 52/26 cap YOK. */
export function calculateWeeksBetweenDates(startISO: string, endISO: string): number {
  if (!isValidIsoDate(startISO) || !isValidIsoDate(endISO) || endISO < startISO) return 0;
  const days = daysBetweenIsoInclusive(startISO, endISO);
  return Math.max(0, Math.round(days / 7));
}

export function weeksBetweenIso(startISO: string, endISO: string): number {
  return calculateWeeksBetweenDates(startISO, endISO);
}

/* ── Saat yardımcıları ── */

function parseHmToMinutes(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToHm(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function calculateDailyGrossHours(startTime: string, endTime: string): number {
  const startMins = parseHmToMinutes(startTime);
  let endMins = parseHmToMinutes(endTime);
  if (startMins == null || endMins == null) return 0;
  if (endMins < startMins) endMins += 24 * 60;
  return (endMins - startMins) / 60;
}

export function computeBreakHours(dailyGrossHours: number): number {
  if (!Number.isFinite(dailyGrossHours) || dailyGrossHours <= 0) return 0;
  if (dailyGrossHours <= 4) return 0.25;
  if (dailyGrossHours <= 7.5) return 0.5;
  if (dailyGrossHours < 11) return 1;
  if (dailyGrossHours < 14) return 1.5;
  if (dailyGrossHours < 15) return 2;
  return 3;
}

export function computeDailyNetHours(
  startTime: string,
  endTime: string,
): { gross: number; breakHours: number; net: number } {
  const gross = calculateDailyGrossHours(startTime, endTime);
  const breakHours = computeBreakHours(gross);
  return { gross, breakHours, net: Math.max(0, gross - breakHours) };
}

export function ceilWeeklyWorkHoursToHalfHour(weeklyTotal: number): number {
  if (!Number.isFinite(weeklyTotal)) return 0;
  const EPS = 1e-7;
  const doubled = weeklyTotal * 2;
  const nearestHalf = Math.round(doubled);
  if (Math.abs(doubled - nearestHalf) < EPS) return nearestHalf / 2;
  return Math.ceil(doubled - EPS) / 2;
}

export function bilirkisiRound(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const EPS = 1e-7;
  const int = Math.floor(value + EPS);
  const frac = value - int;
  if (frac < 0.5 - EPS) return int;
  if (frac > 0.5 + EPS) return int + 1;
  return int + 0.5;
}

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

export function computeBaselineWeeklyFmHours(
  dailyNetHours: number,
  weeklyDays: number,
  sevenDayMode: SevenDayMode,
  mode270: Mode270 = "none",
): { weeklyRawHours: number; weeklyRoundedHours: number; fmHours: number } {
  const weeklyRawHours = computeWeeklyRawHours(dailyNetHours, weeklyDays, sevenDayMode);
  const weeklyRoundedHours = ceilWeeklyWorkHoursToHalfHour(weeklyRawHours);
  let fmHours = Math.max(0, weeklyRoundedHours - WEEKLY_WORK_LIMIT);
  if (mode270 === "simple") {
    fmHours = Math.max(0, fmHours - MODE270_SIMPLE_REDUCTION_HOURS);
  }
  return { weeklyRawHours, weeklyRoundedHours, fmHours };
}

export function resolveWitnessWeeklyDays(t: Witness, davaciHg: number): number {
  const raw = t.weeklyDays;
  if (raw === "" || raw == null) return davaciHg;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 7 ? Math.floor(n) : davaciHg;
}

/**
 * Tanık giriş/çıkışını davacı in/out ile kırp (max giriş, min çıkış),
 * ara dinlenme + haftalık FM hesapla (V3 TanikliStandartPage ile aynı).
 */
export function computeWitnessClippedFm(params: {
  davaciIn: string;
  davaciOut: string;
  witnessIn: string;
  witnessOut: string;
  weeklyDays: number;
  sevenDayMode: SevenDayMode;
}): {
  clippedIn: string;
  clippedOut: string;
  dailyGross: number;
  breakHours: number;
  dailyNet: number;
  fmHours: number;
} | null {
  const dGir = parseHmToMinutes(params.davaciIn);
  const dCik = parseHmToMinutes(params.davaciOut);
  const tGir = parseHmToMinutes(params.witnessIn);
  const tCik = parseHmToMinutes(params.witnessOut);
  if (dGir == null || dCik == null || tGir == null || tCik == null) return null;

  const tGirMin = Math.max(tGir, dGir);
  const tCikMin = Math.min(tCik, dCik);
  const tDailyBrut = Math.max(0, (tCikMin - tGirMin) / 60);
  const tBrk = computeBreakHours(tDailyBrut);
  const tDailyNet = Math.max(0, tDailyBrut - tBrk);
  const tHg = Math.round(params.weeklyDays) || 6;

  let tWeeklyFM: number;
  if (tHg === 7 && params.sevenDayMode === "tatilli") {
    const weeklyNormal = 6 * tDailyNet;
    const holidayOvertime = Math.max(0, tDailyNet - STANDARD_DAILY_REFERENCE_HOURS);
    tWeeklyFM = Math.max(
      0,
      ceilWeeklyWorkHoursToHalfHour(weeklyNormal + holidayOvertime) - WEEKLY_WORK_LIMIT,
    );
  } else {
    tWeeklyFM = Math.max(0, ceilWeeklyWorkHoursToHalfHour(tDailyNet * tHg) - WEEKLY_WORK_LIMIT);
  }

  return {
    clippedIn: minutesToHm(tGirMin),
    clippedOut: minutesToHm(tCikMin),
    dailyGross: tDailyBrut,
    breakHours: tBrk,
    dailyNet: tDailyNet,
    fmHours: tWeeklyFM,
  };
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

/* ── Para ── */

/** Satır brüt FM — V3 `Number((...).toFixed(2))` ile birebir (Math.round 0,5’te 1 kuruş sapabilir). */
function calcRowFm(brut: number, katsayi: number, weeks: number, fmHours: number): number {
  return Number(
    ((((weeks * fmHours) * brut * katsayi) / FAZLA_MESAI_DENOMINATOR) * FAZLA_MESAI_KATSAYI).toFixed(2),
  );
}

/** @deprecated V3.5 eski API — test uyumluluğu için korundu; yeni kod buildMergedWitnessSegments kullanır. */
export function buildEffectiveSegments(form: TanikliFormSnapshot): EffectiveSegment[] {
  return buildWitnessSegmentsForForm(form).segments;
}

export function buildWitnessSegmentsForForm(form: TanikliFormSnapshot): {
  segments: EffectiveSegment[];
  witnessInputs: Array<{
    startMs: number;
    endMs: number;
    fmHours: number;
    dailyNet: number;
    annualLeaveHg: number;
    annualLeaveSevenDay: SevenDayMode;
  }>;
} {
  const davaciDateIn = form.iseGiris;
  const davaciDateOut = form.istenCikis;
  if (!isValidIsoDate(davaciDateIn) || !isValidIsoDate(davaciDateOut) || davaciDateOut < davaciDateIn) {
    return { segments: [], witnessInputs: [] };
  }
  if (!form.davaciIn || !form.davaciOut) {
    return { segments: [], witnessInputs: [] };
  }

  const hg = Number(form.weeklyDays) || 6;
  const seven = form.sevenDayMode;

  const witnessInputs = form.taniklar
    .filter((t) => isValidIsoDate(t.dateIn) && isValidIsoDate(t.dateOut) && t.in && t.out && t.dateOut >= t.dateIn)
    .map((t) => {
      const tHg = resolveWitnessWeeklyDays(t, hg);
      const clipped = computeWitnessClippedFm({
        davaciIn: form.davaciIn,
        davaciOut: form.davaciOut,
        witnessIn: t.in,
        witnessOut: t.out,
        weeklyDays: tHg,
        sevenDayMode: seven,
      });
      if (!clipped) return null;
      return {
        startMs: new Date(t.dateIn).getTime(),
        endMs: new Date(t.dateOut).getTime(),
        fmHours: clipped.fmHours,
        dailyNet: clipped.dailyNet,
        annualLeaveHg: tHg,
        annualLeaveSevenDay: seven,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (witnessInputs.length === 0) return { segments: [], witnessInputs: [] };

  const merged = buildMergedWitnessSegments(davaciDateIn, davaciDateOut, witnessInputs);
  const segments: EffectiveSegment[] = merged.map((seg) => ({
    startISO: seg.start,
    endISO: seg.end,
    fmHours: seg.fmHours,
    dailyNet: seg.dailyNet,
    weeklyDays: seg.annualLeaveHg,
    annualLeaveSevenDay: seg.annualLeaveSevenDay,
  }));

  return { segments, witnessInputs };
}

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

function emptyResult(): TanikliResult {
  return {
    segments: [],
    rows: [],
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
    warnings: [],
  };
}

export function computeTotalsFromRows(
  rows: { fm: number }[],
  exitYear: number,
  mahsupInput: string,
): Pick<
  TanikliResult,
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

/**
 * Ana hesap — V3 TanikliStandartPage rows useMemo ile aynı sıra:
 * tanık FM (davacıya kırp) → buildMergedWitnessSegments → asgari dönem →
 * weeks=round(days/7) → düşüm pencereleri → calculateFm → preserveWeeks → para → 270.
 */
export function computeTanikliFmResult(form: TanikliFormSnapshot): TanikliResult {
  const warnings: string[] = [];
  const dateError = validateDateRange(form.iseGiris, form.istenCikis);
  if (dateError) warnings.push(dateError);

  if (!form.iseGiris || !form.istenCikis || dateError) {
    return { ...emptyResult(), warnings };
  }

  if (!form.davaciIn || !form.davaciOut) {
    warnings.push("Davacı giriş/çıkış saatlerini giriniz.");
    return { ...emptyResult(), warnings };
  }

  const { segments, witnessInputs } = buildWitnessSegmentsForForm(form);
  if (witnessInputs.length === 0) {
    // Tanık yok / geçersiz → cetvel boş (davacı fill YOK)
    return { ...emptyResult(), segments: [], warnings };
  }

  const katsayi = parseKatsayi(form.katSayi);
  const zamanasimiISO: string | null = form.zamanasimi?.nihaiBaslangic || null;

  const tableRows: PeriodRow[] = [];
  segments.forEach((seg, segIdx) => {
    const rawPeriods = splitRangeByAsgariPeriodBounds(seg.startISO, seg.endISO);
    const periods = clipSegmentsByZamanasimi(
      rawPeriods.map((p) => ({ start: p.start, end: p.end, brut: p.brut })),
      zamanasimiISO,
    );

    periods.forEach((period, periodIdx) => {
      const weeks = calculateWeeksBetweenDates(period.start, period.end);
      const brut = period.brut || getAsgariUcretByDate(period.start) || 0;
      tableRows.push({
        id: `auto-${period.start}-${period.end}-${segIdx}-${periodIdx}`,
        startISO: period.start,
        endISO: period.end,
        weeks,
        originalWeekCount: weeks,
        brut,
        katsayi,
        fmHours: seg.fmHours,
        dailyNet: seg.dailyNet,
        annualLeaveHg: seg.weeklyDays,
        annualLeaveSevenDay: seg.annualLeaveSevenDay,
        fm: 0,
        isDeductionRow: false,
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
  pipeline = preserveWeeks(pipeline, originalTotalWeeks);
  pipeline = pipeline.map((r) => ({
    ...r,
    fm: calcRowFm(r.brut, r.katsayi, r.weeks, r.fmHours),
  }));

  let representativeWeeklyFmHours = segments[0]?.fmHours ?? 0;

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

  if (displayRows.length === 0 && warnings.length === 0) {
    warnings.push(
      "Girilen tarih aralığı için asgari ücret dönemi bulunamadı, zamanaşımı nedeniyle dönem kalmadı veya geçerli tanık beyanı yok.",
    );
  }

  const exitYear = form.istenCikis ? Number(form.istenCikis.slice(0, 4)) : new Date().getFullYear();
  const totals = computeTotalsFromRows(displayRows, exitYear, form.mahsup);

  return {
    segments,
    rows: displayRows,
    ...totals,
    warnings,
  };
}

/** Test / UI yardımcı: yeni manuel cetvel satırı. */
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

/** Düşüm penceresi FM (eski API uyumu / test). */
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

export { buildMergedWitnessSegments };
