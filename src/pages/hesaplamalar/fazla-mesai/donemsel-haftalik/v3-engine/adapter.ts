import {ratesForAccrual, wageTaxKeepingModernTable , lastClaimAccrualIso, wageSummaryText } from "../../../shared/historical/laborNet";
/**
 * V3.5 DonemselHaftalikFormSnapshot ↔ taşınmış V3 DonemselFazlaMesaiCore (haftalikMode) motor giriş/çıkışı.
 */

import type {
  DonemselHaftalikFormSnapshot,
  DonemselHaftalikResult,
  DonemselHaftalikWitness,
  ExclusionItem,
  PeriodRow,
  RowOverride,
  SeasonalHaftalikPattern,
} from "../model";
import type { ExcludedDay } from "./types/exclusionStorage";
import type { FazlaMesaiRowBase } from "./lib/fazlaMesaiShared";
import { calculateIncomeTaxWithBrackets } from "./lib/incomeTaxCore";
import { runDonemselHaftalikV3Pipeline } from "./pipeline";
import type { DonemselWitness, SeasonalPattern } from "./donemsel/types";
import type { DonemselHaftalikDeductionMeta } from "./donemsel-haftalik/expandDonemselHaftalikRowsForDeductions";
import { parseKatsayi, validateDateRange } from "../engine";

export type FmGrossNet = {
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  net: number;
};

/** Mevcut brütten-nete. Tam brüt ve Son Brüt Alacak için aynı fonksiyon. */
export function netFromGrossFm(brut: number, accrual: number | string): FmGrossNet {
  if (!(brut > 0)) {
    return { sgk: 0, issizlik: 0, gelirVergisi: 0, gelirVergisiDilimleri: "", damgaVergisi: 0, net: 0 };
  }
  const rates = ratesForAccrual(accrual);
  const sgk = Math.round(brut * rates.sgkOran * 100) / 100;
  const issizlik = Math.round(brut * rates.issizlikOran * 100) / 100;
  const matrah = Math.max(0, brut - sgk - issizlik);
  const gv = wageTaxKeepingModernTable(rates.tahakkukTarihi, matrah, (year, income) => {
    const modern = calculateIncomeTaxWithBrackets(year, income);
    const summary = wageSummaryText(modern);
    return { tax: modern.tax, summary };
  });
  const gelirVergisi = Math.round(gv.tax * 100) / 100;
  const damgaVergisi = Math.round(brut * rates.damgaOran * 100) / 100;
  const net = Math.round((brut - sgk - issizlik - gelirVergisi - damgaVergisi) * 100) / 100;
  return { sgk, issizlik, gelirVergisi, gelirVergisiDilimleri: gv.summary, damgaVergisi, net };
}

export function fmTaxYear(exitDate: string | null | undefined): number {
  return exitDate ? new Date(exitDate).getFullYear() : new Date().getFullYear();
}

function parseDays(value: string | undefined): number | undefined {
  const n = parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 7) return undefined;
  return n;
}

function toV3HaftalikPattern(p: SeasonalHaftalikPattern): SeasonalPattern {
  return {
    months: p.months,
    days1: parseDays(p.days1),
    startTime: p.startTime,
    endTime: p.endTime,
    days2: parseDays(p.days2),
    startTime2: p.startTime2,
    endTime2: p.endTime2,
    hasWeeklyHoliday: p.hasWeeklyHoliday,
    weeklyHolidayRow: p.weeklyHolidayRow,
    weeklyHolidayWeekday: p.weeklyHolidayWeekday,
  };
}

function fromV3HaftalikPattern(p: SeasonalPattern): SeasonalHaftalikPattern {
  return {
    months: p.months ?? [],
    days1: p.days1 != null ? String(p.days1) : "",
    startTime: p.startTime ?? "",
    endTime: p.endTime ?? "",
    days2: p.days2 != null ? String(p.days2) : "",
    startTime2: p.startTime2 ?? "",
    endTime2: p.endTime2 ?? "",
    hasWeeklyHoliday: Boolean(p.hasWeeklyHoliday),
    weeklyHolidayRow: p.weeklyHolidayRow === 2 ? 2 : 1,
    weeklyHolidayWeekday: p.weeklyHolidayWeekday ?? 0,
  };
}

function toV3Witnesses(witnesses: DonemselHaftalikWitness[]): DonemselWitness[] {
  return witnesses.map((w, idx) => ({
    id: idx + 1,
    name: w.name,
    dateIn: w.dateIn,
    dateOut: w.dateOut,
    summerPattern: toV3HaftalikPattern(w.summerPattern),
    winterPattern: toV3HaftalikPattern(w.winterPattern),
  }));
}

function toExcludedDays(items: ExclusionItem[]): ExcludedDay[] {
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    start: item.start,
    end: item.end,
    days: item.days,
  }));
}

function toFazlaMesaiManualRows(rows: PeriodRow[]): FazlaMesaiRowBase[] {
  return rows.map((row) => ({
    id: row.id,
    startISO: row.startISO,
    endISO: row.endISO,
    weeks: row.weeks,
    originalWeekCount: row.originalWeekCount ?? row.weeks,
    brut: row.brut,
    katsayi: row.katsayi,
    fmHours: row.fmHours,
    fm: row.fm,
    dailyNet: row.dailyNet,
    annualLeaveHg: row.annualLeaveHg,
    annualLeaveSevenDay: row.annualLeaveSevenDay,
    segmentWorkDays: row.segmentWorkDays,
    excludedDays: row.excludedDays,
    isExclusionBlock: row.isExclusionBlock,
    prePreserveWeeks: row.prePreserveWeeks,
    isManual: true,
    insertAfter: row.insertAfter,
  }));
}

function toRowOverrides(
  overrides: Record<string, RowOverride>,
): Record<string, Partial<FazlaMesaiRowBase>> {
  return overrides as Record<string, Partial<FazlaMesaiRowBase>>;
}

function v3RowToPeriodRow(row: FazlaMesaiRowBase, katSayi: number): PeriodRow {
  const yillikIzinAciklama = (row as { yillikIzinAciklama?: string }).yillikIzinAciklama;
  const isDeductionRow =
    Boolean((row as { isExclusionBlock?: boolean }).isExclusionBlock) ||
    Boolean(yillikIzinAciklama && String(yillikIzinAciklama).trim());
  const deductionMeta = (row as { donemselHaftalikDeduction?: DonemselHaftalikDeductionMeta })
    .donemselHaftalikDeduction;
  return {
    id: row.id,
    startISO: row.startISO ?? "",
    endISO: row.endISO ?? "",
    weeks: Number(row.weeks) || 0,
    originalWeekCount: row.originalWeekCount ?? row.weeks,
    brut: Number(row.brut) || 0,
    katsayi: Number(row.katsayi) || katSayi,
    fmHours: Number(row.fmHours) || 0,
    fm: Number(row.fm) || 0,
    isDeductionRow,
    note: yillikIzinAciklama || undefined,
    yillikIzinAciklama: yillikIzinAciklama || undefined,
    dailyNet: row.dailyNet,
    annualLeaveHg: (row as { annualLeaveHg?: number }).annualLeaveHg,
    annualLeaveSevenDay: (row as { annualLeaveSevenDay?: "tatilli" | "tatilsiz" }).annualLeaveSevenDay,
    annualLeaveWeeklyIgnoredWeekday: (row as { annualLeaveWeeklyIgnoredWeekday?: number | null })
      .annualLeaveWeeklyIgnoredWeekday,
    segmentWorkDays: (row as { segmentWorkDays?: number }).segmentWorkDays,
    excludedDays: (row as { excludedDays?: number }).excludedDays,
    isExclusionBlock: (row as { isExclusionBlock?: boolean }).isExclusionBlock,
    prePreserveWeeks: (row as { prePreserveWeeks?: number }).prePreserveWeeks,
    donemselHaftalikDeduction: deductionMeta
      ? {
          pattern: fromV3HaftalikPattern(deductionMeta.pattern),
          deductionDates: deductionMeta.deductionDates ?? [],
        }
      : undefined,
    isManual: Boolean(row.isManual),
    insertAfter: row.insertAfter,
  };
}

function emptyResult(warnings: string[] = []): DonemselHaftalikResult {
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

function parseMahsup(value: string): number {
  const s = String(value || "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function runPipeline(form: DonemselHaftalikFormSnapshot, katSayi: number) {
  return runDonemselHaftalikV3Pipeline({
    dateIn: form.dateIn,
    dateOut: form.dateOut,
    summerPattern: toV3HaftalikPattern(form.summerPattern),
    winterPattern: toV3HaftalikPattern(form.winterPattern),
    witnesses: toV3Witnesses(form.witnessesSeasons),
    katSayi,
    mode270: form.mode270,
    zamanasimiBaslangic: form.zamanasimi?.nihaiBaslangic || null,
    exclusions: toExcludedDays(form.exclusions),
    rowOverrides: toRowOverrides(form.rowOverrides ?? {}),
    manualRows: toFazlaMesaiManualRows(form.manualRows ?? []),
  });
}

/** Dönemsel Haftalık FM — V3 DonemselFazlaMesaiCore (haftalikMode) motor zinciri (taşınmış kopya). */
export function computeDonemselHaftalikResultV3(
  form: DonemselHaftalikFormSnapshot,
): DonemselHaftalikResult {
  const warnings: string[] = [];
  const dateError = validateDateRange(form.dateIn, form.dateOut);
  if (dateError) warnings.push(dateError);

  const katsayi = parseKatsayi(form.katSayi);

  if (!form.dateIn || !form.dateOut || dateError) {
    const pipeline = runPipeline(form, katsayi);
    return { ...emptyResult(warnings), yazFmHours: pipeline.yazFmHours, kisFmHours: pipeline.kisFmHours };
  }

  const pipeline = runPipeline(form, katsayi);

  if (pipeline.tableDisplayRows.length === 0 && pipeline.baseRows.length > 0) {
    warnings.push(
      "Hafta, FM saati veya fazla mesai tutarı 0 olan satırlar gösterilmez; görüntülenecek cetvel satırı yok.",
    );
  }

  const rows = pipeline.tableDisplayRows.map((r) => v3RowToPeriodRow(r, katsayi));
  const toplamFm = Math.round(pipeline.totalBrut * 100) / 100;

  const exitYear = fmTaxYear(form.dateOut);
  const fullNet = netFromGrossFm(toplamFm, lastClaimAccrualIso(rows) || exitYear);
  const gelirVergisi = fullNet.gelirVergisi;
  const gelirVergisiDilimleri = fullNet.gelirVergisiDilimleri;
  const damgaVergisi = fullNet.damgaVergisi;
  const netYillik = fullNet.net;
  const sgk = fullNet.sgk;
  const issizlik = fullNet.issizlik;

  const hakkaniyetOneri = toplamFm / 3;
  const mahsupTutari = parseMahsup(form.mahsup);
  const mahsupSonrasiNet = Math.max(0, toplamFm - hakkaniyetOneri - mahsupTutari);

  return {
    rows,
    yazFmHours: pipeline.yazFmHours,
    kisFmHours: pipeline.kisFmHours,
    toplamFm,
    sgk,
    issizlik,
    gelirVergisi,
    gelirVergisiDilimleri,
    damgaVergisi,
    netYillik,
    hakkaniyetOneri,
    mahsupTutari,
    mahsupSonrasiNet,
    warnings,
  };
}

/** Manuel kontrol: konsol özeti (dev). */
export function logDonemselHaftalikFmV3EngineCheck(form: DonemselHaftalikFormSnapshot): void {
  const result = computeDonemselHaftalikResultV3(form);
  // eslint-disable-next-line no-console
  console.info("[Dönemsel Haftalık v3-engine]", {
    mode270: form.mode270,
    witnessCount: form.witnessesSeasons.filter((w) => w.dateIn && w.dateOut).length,
    exclusionCount: form.exclusions.length,
    zamanasimi: form.zamanasimi?.nihaiBaslangic ?? null,
    yazFmHours: result.yazFmHours,
    kisFmHours: result.kisFmHours,
    rowCount: result.rows.length,
    toplamFm: result.toplamFm,
    mahsupSonrasiNet: result.mahsupSonrasiNet,
    rows: result.rows.map((r) => ({
      id: r.id,
      range: `${r.startISO} – ${r.endISO}`,
      weeks: r.weeks,
      fmHours: r.fmHours,
      fm: r.fm,
      deduction: r.isDeductionRow,
    })),
  });
}
