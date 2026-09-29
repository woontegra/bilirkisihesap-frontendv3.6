import {ratesForAccrual, wageTaxKeepingModernTable , lastClaimAccrualIso, wageSummaryText } from "../../../shared/historical/laborNet";
/**
 * V3.5 TanikliFormSnapshot ↔ taşınmış V3 TanikliStandartPage motor giriş/çıkışı.
 */

import type {
  ExclusionItem,
  PeriodRow,
  RowOverride,
  SevenDayMode,
  TanikliFormSnapshot,
  TanikliResult,
  Witness,
} from "../model";
import type { ExcludedDay } from "./types/exclusionStorage";
import type { FazlaMesaiRowBase } from "./lib/fazlaMesaiShared";
import { calculateIncomeTaxWithBrackets } from "./lib/incomeTaxCore";
import { runTanikliFmV3Pipeline } from "./pipeline";
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

function toExcludedDays(items: ExclusionItem[]): ExcludedDay[] {
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    start: item.start,
    end: item.end,
    days: item.days,
  }));
}

function toWitnessInputs(witnesses: Witness[]) {
  return witnesses.map((w) => ({
    dateIn: w.dateIn,
    dateOut: w.dateOut,
    in: w.in,
    out: w.out,
    weeklyDays: w.weeklyDays,
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
    dailyNet: row.dailyNet,
    annualLeaveHg: (row as { annualLeaveHg?: number }).annualLeaveHg,
    annualLeaveSevenDay: (row as { annualLeaveSevenDay?: SevenDayMode }).annualLeaveSevenDay,
    segmentWorkDays: (row as { segmentWorkDays?: number }).segmentWorkDays,
    excludedDays: (row as { excludedDays?: number }).excludedDays,
    isExclusionBlock: (row as { isExclusionBlock?: boolean }).isExclusionBlock,
    prePreserveWeeks: (row as { prePreserveWeeks?: number }).prePreserveWeeks,
    isManual: Boolean(row.isManual),
    insertAfter: row.insertAfter,
  };
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

function parseMahsup(value: string): number {
  const s = String(value || "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Tanıklı Standart FM — V3 TanikliStandartPage motor zinciri (taşınmış kopya). */
export function computeTanikliFmResultV3(form: TanikliFormSnapshot): TanikliResult {
  const warnings: string[] = [];
  const dateError = validateDateRange(form.iseGiris, form.istenCikis);
  if (dateError) warnings.push(dateError);

  if (!form.iseGiris || !form.istenCikis || dateError) {
    return { ...emptyResult(), warnings };
  }

  if (!form.davaciIn || !form.davaciOut) {
    return { ...emptyResult(), warnings };
  }

  const validWitnesses = form.taniklar.filter((t) => t.dateIn && t.dateOut && t.in && t.out);
  if (validWitnesses.length === 0) {
    warnings.push("En az bir geçerli tanık beyanı giriniz (tarih ve saat).");
    return { ...emptyResult(), warnings };
  }

  const katsayi = parseKatsayi(form.katSayi);

  const pipeline = runTanikliFmV3Pipeline({
    iseGiris: form.iseGiris,
    istenCikis: form.istenCikis,
    davaciIn: form.davaciIn,
    davaciOut: form.davaciOut,
    weeklyDays: form.weeklyDays,
    sevenDayMode: form.sevenDayMode,
    haftaTatiliGunu: form.haftaTatiliGunu,
    katSayi: katsayi,
    mode270: form.mode270,
    zamanasimiBaslangic: form.zamanasimi?.nihaiBaslangic || null,
    exclusions: toExcludedDays(form.exclusions),
    rowOverrides: toRowOverrides(form.rowOverrides ?? {}),
    manualRows: toFazlaMesaiManualRows(form.manualRows ?? []),
    witnesses: toWitnessInputs(form.taniklar),
  });

  if (pipeline.tableDisplayRows.length === 0 && pipeline.baseRows.length === 0) {
    warnings.push(
      "Girilen tarih aralığı için asgari ücret dönemi bulunamadı, zamanaşımı nedeniyle dönem kalmadı veya geçerli tanık beyanı yok.",
    );
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
export function logTanikliFmV3EngineCheck(form: TanikliFormSnapshot): void {
  const result = computeTanikliFmResultV3(form);
  // eslint-disable-next-line no-console
  console.info("[Tanıklı FM v3-engine]", {
    mode270: form.mode270,
    witnessCount: form.taniklar.filter((t) => t.dateIn && t.dateOut).length,
    exclusionCount: form.exclusions.length,
    zamanasimi: form.zamanasimi?.nihaiBaslangic ?? null,
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
