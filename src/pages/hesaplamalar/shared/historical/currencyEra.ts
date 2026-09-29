/**
 * 01.01.2005 redenominasyonu.
 * 1.000.000 Eski TL = 1 güncel TL. Dönüşüm tarih döneminden gelir;
 * tutarın büyüklüğünden tahmin edilmez. Sonuç bir kez üretilir.
 */

export const STANDART_FM_MIN_ISO = "1996-01-01";
export const REDENOMINATION_ISO = "2005-01-01";
export const TRL_TO_TRY_DIVISOR = 1_000_000;

export type CurrencyEra = "TRL" | "TRY";

declare const NormalizedTryBrand: unique symbol;
/** Güncel TL ölçeği. Bu değeri tekrar 1.000.000'a bölmeyin. */
export type NormalizedTryGross = number & { readonly [NormalizedTryBrand]: "TRY" };

export type ScaledWage = {
  historicalGross: number;
  normalizedGross: NormalizedTryGross;
  currencyEra: CurrencyEra;
  conversionDivisor: 1 | typeof TRL_TO_TRY_DIVISOR;
};

export function eraForIso(iso: string | null | undefined): CurrencyEra {
  const day = String(iso ?? "").slice(0, 10);
  return day.length === 10 && day < REDENOMINATION_ISO ? "TRL" : "TRY";
}

export function asNormalizedTry(value: number): NormalizedTryGross {
  return value as NormalizedTryGross;
}

/** Eski TL tam sayısını güncel TL ölçeğine bir kez çevirir. İki haneye yuvarlamaz. */
export function trlHistoricalToTry(historicalGross: number): NormalizedTryGross {
  const sign = historicalGross < 0 ? -1 : 1;
  const abs = Math.abs(historicalGross);
  const whole = Math.floor(abs / TRL_TO_TRY_DIVISOR);
  const remainder = abs - whole * TRL_TO_TRY_DIVISOR;
  return asNormalizedTry(sign * (whole + remainder / TRL_TO_TRY_DIVISOR));
}

/**
 * Tablo veya kullanıcının yazdığı ham tutar.
 * `tableOrTypedGross` henüz bölünmemiş kaynaktır: TRL döneminde Eski TL, TRY döneminde güncel TL.
 */
export function scaleTableBrut(iso: string, tableOrTypedGross: number): ScaledWage {
  const currencyEra = eraForIso(iso);
  if (currencyEra === "TRY") {
    return {
      historicalGross: tableOrTypedGross,
      normalizedGross: asNormalizedTry(tableOrTypedGross),
      currencyEra,
      conversionDivisor: 1,
    };
  }
  return {
    historicalGross: tableOrTypedGross,
    normalizedGross: trlHistoricalToTry(tableOrTypedGross),
    currencyEra,
    conversionDivisor: TRL_TO_TRY_DIVISOR,
  };
}

export function formatHistoricalTrl(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(Math.round(value));
}

/** Karşılık metni. 35,4375 ve 222,00075 erken iki haneye indirilmez. */
export function formatTryEquivalent(value: number): string {
  if (!Number.isFinite(value)) return "0,00";
  const negative = value < 0;
  const rounded = Math.round(Math.abs(value) * 1e8) / 1e8;
  const fixed = rounded.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  const [intRaw, fracRaw = ""] = fixed.split(".");
  const intGrouped = new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(Number(intRaw));
  const frac = fracRaw.length >= 2 ? fracRaw : fracRaw.padEnd(2, "0");
  return `${negative ? "-" : ""}${intGrouped},${frac}`;
}

export function formatTrlWageLines(historicalGross: number, normalizedGross: number): string {
  return `${formatHistoricalTrl(historicalGross)} Eski TL\n(${formatTryEquivalent(normalizedGross)} TL karşılığı)`;
}

/** Güncel TL giriş gösterimi: 33.030,00 */
export function formatTryWageInput(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
}

export function formatTrlWageHint(normalizedGross: number): string {
  return `Güncel hesaplama karşılığı: ${formatTryEquivalent(normalizedGross)} TL`;
}

/** 444.150.000 ve 444150000 aynı tarihsel değeri verir. Bilimsel gösterim kabul edilmez. */
export function parseTurkishAmount(raw: string): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || /e/i.test(trimmed)) return null;
  const grouped = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
  const plain = /^\d+(,\d+)?$/;
  if (!grouped.test(trimmed) && !plain.test(trimmed)) return null;
  const n = Number(trimmed.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function manualWageClashes(
  override: { brutManual?: boolean; currencyEra?: CurrencyEra; scaleMismatch?: boolean } | null | undefined,
  startISO: string | null | undefined,
): boolean {
  if (!override?.brutManual) return false;
  if (override.scaleMismatch) return true;
  const start = String(startISO ?? "").slice(0, 10);
  if (start.length < 10) return false;
  const era = eraForIso(start);
  if (override.currencyEra && override.currencyEra !== era) return true;
  if (!override.currencyEra && era === "TRL") return true;
  return false;
}
