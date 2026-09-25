/**
 * V3.5 StandartFormSnapshot ↔ taşınmış V3 motor giriş/çıkışı.
 * Hesap formülü burada üretilmez; yalnızca dönüştürme ve toplam özeti.
 */

import type {
  ExclusionItem,
  Mode270,
  PeriodRow,
  RowOverride,
  SevenDayMode,
  StandartFormSnapshot,
  StandartResult,
} from "../model";
import type { ExcludedDay } from "./types/exclusionStorage";
import type { FazlaMesaiRowBase } from "./lib/fazlaMesaiShared";
import { calculateIncomeTaxWithBrackets } from "./lib/incomeTaxCore";
import { DAMGA_VERGISI_ORANI } from "./lib/fazlaMesaiShared";
import { runStandartFmV3Pipeline } from "./pipeline";
import {
  computeBaselineWeeklyFmHours,
  computeDailyNetHours,
  parseKatsayi,
  validateDateRange,
} from "../engine";

const SSK_ORAN = 0.14;
const ISSIZLIK_ORAN = 0.01;

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
  const isDeductionRow = Boolean(yillikIzinAciklama && String(yillikIzinAciklama).trim());
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
    isManual: Boolean(row.isManual),
    insertAfter: row.insertAfter,
  };
}

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

function parseMahsup(value: string): number {
  const s = String(value || "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Standart FM hesabı — V3 StandartFazlaMesaiPage motor zinciri (taşınmış kopya).
 * Eski `engine.ts` içindeki `computeStandartFmResult` yerine kullanılır.
 */
export function computeStandartFmResultV3(form: StandartFormSnapshot): StandartResult {
  const warnings: string[] = [];
  const dateError = validateDateRange(form.iseGiris, form.istenCikis);
  if (dateError) warnings.push(dateError);

  const { gross, breakHours, net } = computeDailyNetHours(form.davaciIn, form.davaciOut);
  if (!form.iseGiris || !form.istenCikis || dateError || net <= 0) {
    return { ...emptyResult(), dailyGrossHours: gross, breakHours, dailyNetHours: net, warnings };
  }

  const katsayi = parseKatsayi(form.katSayi);
  const baselineDisplay = computeBaselineWeeklyFmHours(
    net,
    form.weeklyDays,
    form.sevenDayMode,
    form.mode270 as Mode270,
  );

  const pipeline = runStandartFmV3Pipeline({
    iseGiris: form.iseGiris,
    istenCikis: form.istenCikis,
    davaciIn: form.davaciIn,
    davaciOut: form.davaciOut,
    weeklyDays: form.weeklyDays,
    sevenDayMode: form.sevenDayMode as SevenDayMode,
    haftaTatiliGunu: form.haftaTatiliGunu,
    katSayi: katsayi,
    mode270: form.mode270,
    exclusions: toExcludedDays(form.exclusions),
    zamanasimiBaslangic: form.zamanasimi?.nihaiBaslangic || null,
    rowOverrides: toRowOverrides(form.rowOverrides ?? {}),
    manualRows: toFazlaMesaiManualRows(form.manualRows ?? []),
  });

  if (pipeline.tableDisplayRows.length === 0 && pipeline.baseRows.length === 0) {
    warnings.push(
      "Girilen tarih aralığı için asgari ücret dönemi bulunamadı veya zamanaşımı nedeniyle hesaplanacak dönem kalmadı.",
    );
  }

  const rows = pipeline.tableDisplayRows.map((r) => v3RowToPeriodRow(r, katsayi));
  const toplamFm = Math.round(pipeline.totalBrut * 100) / 100;

  const exitYear = form.istenCikis
    ? new Date(form.istenCikis).getFullYear()
    : new Date().getFullYear();

  let gelirVergisi = 0;
  let gelirVergisiDilimleri = "";
  let damgaVergisi = 0;
  let netYillik = 0;
  let sgk = 0;
  let issizlik = 0;

  if (toplamFm > 0) {
    sgk = Math.round(toplamFm * SSK_ORAN * 100) / 100;
    issizlik = Math.round(toplamFm * ISSIZLIK_ORAN * 100) / 100;
    const matrah = Math.max(0, toplamFm - sgk - issizlik);
    const gvResult = calculateIncomeTaxWithBrackets(exitYear, matrah);
    gelirVergisi = Math.round(gvResult.tax * 100) / 100;
    gelirVergisiDilimleri = gvResult.brackets;
    damgaVergisi = Math.round(toplamFm * DAMGA_VERGISI_ORANI * 100) / 100;
    netYillik = Math.round((toplamFm - sgk - issizlik - gelirVergisi - damgaVergisi) * 100) / 100;
  }

  const hakkaniyetIndirimi = toplamFm / 3;
  const mahsupTutari = parseMahsup(form.mahsup);
  const sonNet = Math.max(0, toplamFm - hakkaniyetIndirimi - mahsupTutari);

  return {
    dailyGrossHours: pipeline.dailyGrossHours,
    breakHours: pipeline.breakHours,
    dailyNetHours: pipeline.dailyNetHours,
    weeklyRawHours: baselineDisplay.weeklyRawHours,
    weeklyRoundedHours: baselineDisplay.weeklyRoundedHours,
    baselineWeeklyFmHours: baselineDisplay.fmHours,
    rows,
    toplamFm,
    sgk,
    issizlik,
    gelirVergisi,
    gelirVergisiDilimleri,
    damgaVergisi,
    netYillik,
    hakkaniyetIndirimi,
    mahsupTutari,
    sonNet,
    warnings,
  };
}

/** Manuel kontrol: 270 modları ve düşüm zinciri için özet (konsol). */
export function logStandartFmV3EngineCheck(form: StandartFormSnapshot): void {
  const result = computeStandartFmResultV3(form);
  const mode = form.mode270;
  // eslint-disable-next-line no-console
  console.info("[Standart FM v3-engine]", {
    mode270: mode,
    exclusionCount: form.exclusions.length,
    zamanasimi: form.zamanasimi?.nihaiBaslangic ?? null,
    rowCount: result.rows.length,
    toplamFm: result.toplamFm,
    sonNet: result.sonNet,
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
