/**
 * Standart Fazla Mesai para dönemi API'si.
 * Veri ortak tarihsel modüldedir; bu dosya mevcut importları korur.
 */
export {
  STANDART_FM_MIN_ISO,
  REDENOMINATION_ISO,
  TRL_TO_TRY_DIVISOR,
  type CurrencyEra,
  type NormalizedTryGross,
  type ScaledWage,
  eraForIso,
  asNormalizedTry,
  trlHistoricalToTry,
  scaleTableBrut,
  formatHistoricalTrl,
  formatTryEquivalent,
  formatTrlWageLines,
  formatTryWageInput,
  formatTrlWageHint,
  parseTurkishAmount,
  manualWageClashes,
} from "../../shared/historical/currencyEra";
