/**
 * Ücret Alacağı — shared manuel brüt helpers re-export.
 * HT’ye özgü asgari eşlemesi gerekmez; dönem kataloğu ortaktır.
 */

export {
  applyManualWagePeriodsToRowBruts,
  countFilledPeriods,
  formatManualPeriodLabel,
  getManualBrutTemplate,
  hasManualBrutTemplates,
  loadManualBrutTemplates,
  type ManualBrutRowStub,
} from "@/features/manual-brut-wage/manualBrutApply";
