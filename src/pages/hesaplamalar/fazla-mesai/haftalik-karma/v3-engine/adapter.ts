import {ratesForAccrual, wageTaxKeepingModernTable , lastClaimAccrualIso, wageSummaryText } from "../../../shared/historical/laborNet";
/**
 * V3.5 HaftalikKarmaFormSnapshot ↔ taşınmış V3 HaftalikKarmaPage motor giriş/çıkışı.
 */

import type {
  ExclusionItem,
  HaftalikKarmaFormSnapshot,
  HaftalikKarmaResult,
  PeriodRow,
  RowOverride,
  Witness,
} from "../model";
import type { ExcludedDay } from "./types/exclusionStorage";
import type { FazlaMesaiRowBase } from "./lib/fazlaMesaiShared";
import { calculateIncomeTaxWithBrackets } from "./lib/incomeTaxCore";
import { runHaftalikKarmaV3Pipeline } from "./pipeline";
import type { PatternDay } from "./haftalik/types";
import { calculateWeeklyFMFromDayGroups, sumRegisteredWorkDays } from "./haftalik/utils";
import {
  parseKatsayi,
  toNumericDayGroups,
  validateDateRange,
} from "../engine";

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

function toExcludedDays(items: ExclusionItem[]): ExcludedDay[] {
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    start: item.start,
    end: item.end,
    days: item.days,
  }));
}

function toWitnessDayGroups(witness: Witness, davaciGroups: PatternDay[]): PatternDay[] {
  const raw = witness.dayGroups?.length ? toNumericDayGroups(witness.dayGroups) : davaciGroups;
  return raw;
}

function toWitnessInputs(witnesses: Witness[], davaciGroups: PatternDay[]) {
  return witnesses.map((w) => ({
    startDateISO: w.startISO,
    endDateISO: w.endISO,
    dayGroups: toWitnessDayGroups(w, davaciGroups),
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
    karmaFmContext: row.karmaFmContext,
    karmaDeductionDates: row.karmaDeductionDates,
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
    segmentWorkDays: (row as { segmentWorkDays?: number }).segmentWorkDays,
    excludedDays: (row as { excludedDays?: number }).excludedDays,
    isExclusionBlock: (row as { isExclusionBlock?: boolean }).isExclusionBlock,
    prePreserveWeeks: (row as { prePreserveWeeks?: number }).prePreserveWeeks,
    karmaFmContext: (row as { karmaFmContext?: PeriodRow["karmaFmContext"] }).karmaFmContext,
    karmaDeductionDates: (row as { karmaDeductionDates?: PeriodRow["karmaDeductionDates"] })
      .karmaDeductionDates,
    isManual: Boolean(row.isManual),
    insertAfter: row.insertAfter,
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

function parseMahsup(value: string): number {
  const s = String(value || "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Haftalık Karma FM — V3 HaftalikKarmaPage motor zinciri (taşınmış kopya). */
export function computeHaftalikKarmaResultV3(form: HaftalikKarmaFormSnapshot): HaftalikKarmaResult {
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

  const katsayi = parseKatsayi(form.katSayi);

  const pipeline = runHaftalikKarmaV3Pipeline({
    iseGiris: form.iseGiris,
    istenCikis: form.istenCikis,
    dayGroups: davaciGroups,
    hasWeeklyHoliday: hasHoliday,
    weeklyHolidayGroup: holidayGroup,
    witnesses: toWitnessInputs(form.witnesses, davaciGroups),
    katSayi: katsayi,
    mode270: form.mode270,
    zamanasimiBaslangic: form.zamanasimi?.nihaiBaslangic || null,
    exclusions: toExcludedDays(form.exclusions),
    haftaTatiliGunu: form.haftaTatiliGunu,
    rowOverrides: toRowOverrides(form.rowOverrides ?? {}),
    manualRows: toFazlaMesaiManualRows(form.manualRows ?? []),
  });

  if (pipeline.tableDisplayRows.length === 0 && pipeline.baseRows.length === 0) {
    if (!warnings.length) {
      warnings.push("Geçerli haftalık desen veya tanık beyanı giriniz.");
    }
  }

  const rows = pipeline.tableDisplayRows.map((r) => v3RowToPeriodRow(r, katsayi));
  const toplamFm = Math.round(pipeline.totalBrut * 100) / 100;

  const exitYear = fmTaxYear(form.istenCikis);
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
    segments: pipeline.segments,
    rows,
    davaciWeeklyFmHours: pipeline.davaciWeeklyFM,
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
export function logHaftalikKarmaV3EngineCheck(form: HaftalikKarmaFormSnapshot): void {
  const result = computeHaftalikKarmaResultV3(form);
  // eslint-disable-next-line no-console
  console.info("[Haftalık Karma v3-engine]", {
    mode270: form.mode270,
    witnessCount: form.witnesses.filter((w) => w.startISO && w.endISO).length,
    exclusionCount: form.exclusions.length,
    zamanasimi: form.zamanasimi?.nihaiBaslangic ?? null,
    davaciWeeklyFm: result.davaciWeeklyFmHours,
    segmentCount: result.segments.length,
    rowCount: result.rows.length,
    toplamFm: result.toplamFm,
    mahsupSonrasiNet: result.mahsupSonrasiNet,
    segments: result.segments,
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
