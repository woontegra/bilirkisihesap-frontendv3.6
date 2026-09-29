/**
 * Standart Fazla Mesai kesinti API'si.
 * Veri ortak tarihsel modüldedir; bu dosya mevcut importları korur.
 */
export {
  WageIncomeTaxError,
  assertAccrualIso,
  resolveStandartFmAccrualIso,
  standartFmSgkOrani,
  standartFmIssizlikOrani,
  standartFmDamgaOrani,
  wageIncomeTaxBracketsForDate,
  wageIncomeTaxForDate,
  standartFmIssizlikLabel,
  standartFmDamgaLabel,
  standartFmWagePeriods,
} from "../../../../shared/historical/wageDeductions";
