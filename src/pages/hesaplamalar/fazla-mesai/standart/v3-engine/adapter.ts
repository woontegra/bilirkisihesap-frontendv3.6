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
import { runStandartFmV3Pipeline } from "./pipeline";
import {
  standartFmDamgaOrani,
  standartFmIssizlikOrani,
  standartFmSgkOrani,
  wageIncomeTaxForDate,
  WageIncomeTaxError,
  resolveStandartFmAccrualIso,
} from "./lib/standartFmKesinti";
import {
  computeBaselineWeeklyFmHours,
  computeDailyNetHours,
  parseKatsayi,
  validateDateRange,
} from "../engine";

const EMPTY_GROSS_NET: StandartGrossNet = {
  sgk: 0,
  issizlik: 0,
  gelirVergisi: 0,
  gelirVergisiDilimleri: "",
  damgaVergisi: 0,
  net: 0,
  sgkOran: 0,
  issizlikOran: 0,
  damgaOran: 0,
  tahakkukTarihi: "",
};

export type StandartGrossNet = {
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  net: number;
  sgkOran: number;
  issizlikOran: number;
  damgaOran: number;
  tahakkukTarihi: string;
};

/**
 * Cetvelde alacağı doğuran satırların en geç bitiş günü.
 * İşten çıkış alanı bu seçime girmez; düşüm satırları tahakkuk tarihi sayılmaz.
 */
export function lastStandartFmAccrualIso(
  rows: Array<{ endISO?: string; isDeductionRow?: boolean }>,
): string | null {
  let last = "";
  for (const row of rows) {
    if (row.isDeductionRow) continue;
    const end = String(row.endISO ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    if (end > last) last = end;
  }
  return last || null;
}

/** Mevcut brütten-nete sırası. Toplam brüt ve Son Brüt için aynı fonksiyon, tek sefer. */
export function netFromGrossStandartFm(brut: number, accrual: number | string): StandartGrossNet {
  if (!(brut > 0)) return EMPTY_GROSS_NET;
  const tahakkukTarihi = resolveStandartFmAccrualIso(accrual);
  const sgkOran = standartFmSgkOrani(tahakkukTarihi);
  const issizlikOran = standartFmIssizlikOrani(tahakkukTarihi);
  const damgaOran = standartFmDamgaOrani(tahakkukTarihi);
  const sgk = Math.round(brut * sgkOran * 100) / 100;
  const issizlik = Math.round(brut * issizlikOran * 100) / 100;
  const matrah = Math.max(0, brut - sgk - issizlik);
  const gvResult = wageIncomeTaxForDate(tahakkukTarihi, matrah);
  const gelirVergisi = Math.round(gvResult.tax * 100) / 100;
  const damgaVergisi = Math.round(brut * damgaOran * 100) / 100;
  const net = Math.round((brut - sgk - issizlik - gelirVergisi - damgaVergisi) * 100) / 100;
  return {
    sgk,
    issizlik,
    gelirVergisi,
    gelirVergisiDilimleri: gvResult.brackets,
    damgaVergisi,
    net,
    sgkOran,
    issizlikOran,
    damgaOran,
    tahakkukTarihi,
  };
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
    historicalBrut: typeof row.historicalBrut === "number" ? row.historicalBrut : undefined,
    currencyEra: row.currencyEra === "TRL" || row.currencyEra === "TRY" ? row.currencyEra : undefined,
    conversionDivisor: row.conversionDivisor === 1 || row.conversionDivisor === 1_000_000 ? row.conversionDivisor : undefined,
    scaleMismatch: row.scaleMismatch === true,
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
    tahakkukTarihi: "",
    sgkOran: 0,
    issizlikOran: 0,
    damgaOran: 0,
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
  if (rows.some((row) => row.scaleMismatch)) {
    warnings.push(
      "Ücret ölçeği belirsiz. Para dönemi değiştiği için manuel ücret otomatik dönüştürülmedi. Tutarı yeniden girin.",
    );
  }
  const toplamFm = Math.round(pipeline.totalBrut * 100) / 100;
  const tahakkukTarihi = lastStandartFmAccrualIso(rows) ?? "";
  let fullNet = EMPTY_GROSS_NET;
  if (toplamFm > 0 && tahakkukTarihi) {
    try {
      fullNet = netFromGrossStandartFm(toplamFm, tahakkukTarihi);
    } catch (error) {
      const message = error instanceof WageIncomeTaxError || error instanceof Error
        ? error.message
        : "Brütten nete çevrim yapılamadı.";
      warnings.push(message);
    }
  } else if (toplamFm > 0) {
    warnings.push("Son tahakkuk tarihi bulunamadı. Brütten nete çevrim yapılmadı.");
  }
  const gelirVergisi = fullNet.gelirVergisi;
  const gelirVergisiDilimleri = fullNet.gelirVergisiDilimleri;
  const damgaVergisi = fullNet.damgaVergisi;
  const netYillik = fullNet.net;
  const sgk = fullNet.sgk;
  const issizlik = fullNet.issizlik;

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
    tahakkukTarihi: fullNet.tahakkukTarihi,
    sgkOran: fullNet.sgkOran,
    issizlikOran: fullNet.issizlikOran,
    damgaOran: fullNet.damgaOran,
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
