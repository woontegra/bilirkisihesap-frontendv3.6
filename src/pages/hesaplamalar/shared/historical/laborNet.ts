/**
 * Sayfanın mevcut kesinti kalemlerini tarihsel oranla çalıştırır.
 * 2010 ve sonrası gelir vergisi, sayfanın kendi tablosundan gelir.
 * 2009 ve öncesi yalnız onaylı ücret tarifesini kullanır.
 */
import { eraForIso, formatHistoricalTrl, formatTrlWageHint, scaleTableBrut } from "./currencyEra";
import { getAsgariUcretRowByDate } from "./asgariUcret";
import {
  resolveStandartFmAccrualIso,
  standartFmDamgaLabel,
  standartFmDamgaOrani,
  standartFmIssizlikLabel,
  standartFmIssizlikOrani,
  standartFmSgkOrani,
  wageIncomeTaxForDate,
} from "./wageDeductions";

export type ClaimRow = { endISO?: string; isDeductionRow?: boolean };

/** Alacağı doğuran satırların en geç bitiş günü. Düşüm satırları sayılmaz. */
export function lastClaimAccrualIso(rows: ClaimRow[]): string | null {
  let last = "";
  for (const row of rows) {
    if (row.isDeductionRow) continue;
    const end = String(row.endISO ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    if (end > last) last = end;
  }
  return last || null;
}

export function accrualIsoFromYearOrDate(accrual: number | string | null | undefined): string {
  if (typeof accrual === "number" && Number.isInteger(accrual)) {
    return resolveStandartFmAccrualIso(`${accrual}-12-31`);
  }
  if (typeof accrual === "string" && accrual.trim()) {
    return resolveStandartFmAccrualIso(accrual);
  }
  throw new Error("Son tahakkuk tarihi geçersiz. Brütten nete çevrim yapılmadı.");
}

export type ModernWageTax = { tax: number; summary: string };

export function wageSummaryText(modern: { summary?: unknown; brackets?: unknown }): string {
  if (typeof modern.summary === "string") return modern.summary;
  if (typeof modern.brackets === "string") return modern.brackets;
  return "";
}

/**
 * 01.01.2010 öncesi onaylı ücret tarifesi.
 * 2010 ve sonrası çağıranın mevcut tablosu. Tablo yoksa 2010'a düşülmez.
 */
export function wageTaxKeepingModernTable(
  accrual: number | string,
  matrah: number,
  modern: (year: number, income: number) => ModernWageTax,
): ModernWageTax {
  const day = accrualIsoFromYearOrDate(accrual);
  if (day <= "2009-12-31") {
    const historical = wageIncomeTaxForDate(day, matrah);
    return { tax: historical.tax, summary: historical.brackets };
  }
  return modern(Number(day.slice(0, 4)), matrah);
}

export function ratesForAccrual(accrual: number | string): {
  tahakkukTarihi: string;
  sgkOran: number;
  issizlikOran: number;
  damgaOran: number;
} {
  const tahakkukTarihi = accrualIsoFromYearOrDate(accrual);
  return {
    tahakkukTarihi,
    sgkOran: standartFmSgkOrani(tahakkukTarihi),
    issizlikOran: standartFmIssizlikOrani(tahakkukTarihi),
    damgaOran: standartFmDamgaOrani(tahakkukTarihi),
  };
}

/** Tarih yoksa, geçersizse veya 1996 öncesiyse sayfanın mevcut binde 7,59 oranı korunur. */
export function stampRateForDate(iso: string | null | undefined): number {
  const day = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < "1996-01-01") return 0.00759;
  return standartFmDamgaOrani(day);
}

export function deductionLabels(accrual: number | string): { sgk: string; issizlik: string; damga: string } {
  const rates = ratesForAccrual(accrual);
  return {
    sgk: "SGK İşçi Payı (%14)",
    issizlik: standartFmIssizlikLabel(rates.issizlikOran),
    damga: standartFmDamgaLabel(rates.damgaOran),
  };
}

/** 2013+ binde 7,59 metni korunur. Daha eski oran kendi binde karşılığını alır. */
export function damgaLabelForRate(rate: number | undefined, style: "binde" | "permille" = "binde"): string {
  const safe = typeof rate === "number" && rate > 0 ? rate : 0.00759;
  if (style === "permille") {
    if (safe === 0.0048) return "Damga vergisi (‰4,8)";
    if (safe === 0.006) return "Damga vergisi (‰6)";
    if (safe === 0.0066) return "Damga vergisi (‰6,6)";
    if (safe === 0.00759) return "Damga vergisi (‰7,59)";
    return "Damga vergisi";
  }
  return standartFmDamgaLabel(safe);
}

/** Sayfanın mevcut %1 cümlesi korunur; oran değişirse yalnız yüzde güncellenir. */
export function issizlikLabelForRate(rate: number | undefined, template = "İşsizlik (%1)"): string {
  const safe = typeof rate === "number" ? rate : 0.01;
  const pct = safe === 0 ? "%0" : safe === 0.02 ? "%2" : safe === 0.01 ? "%1" : null;
  if (!pct || !/\(%[^)]*\)/.test(template)) return template;
  return template.replace(/\(%[^)]*\)/, `(${pct})`);
}

/** Cetvel ücreti: Eski TL satırında tarihsel tutar ve güncel karşılık. */
export function formatEngineWageCell(startISO: string, engineBrut: number, historicalBrut?: number): string {
  const era = eraForIso(startISO);
  if (era !== "TRL") return "";
  const row = getAsgariUcretRowByDate(startISO);
  const tableScaled = row ? scaleTableBrut(startISO, row.brut) : null;
  const historical =
    typeof historicalBrut === "number"
      ? historicalBrut
      : tableScaled && Math.abs(engineBrut - tableScaled.normalizedGross) < 1e-6
        ? row!.brut
        : null;
  if (historical == null) return "";
  return `${formatHistoricalTrl(historical)} Eski TL\n${formatTrlWageHint(engineBrut)}`;
}
