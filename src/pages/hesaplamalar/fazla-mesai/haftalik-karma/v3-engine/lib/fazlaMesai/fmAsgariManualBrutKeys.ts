import { findAsgariPeriodForStartISO, periodStorageKey } from "../manualWageTemplateStorage";

/** Manuel ücret şablonu ile aynı asgari dönem anahtarı (`start_end`, ISO). */
export const FM_ASGARI_MANUAL_BRUT_PREFIX = "__asgariManualBrut:" as const;

export function fmAsgariManualBrutOverrideKeyForStartISO(startISO: string): string | null {
  const period = findAsgariPeriodForStartISO(String(startISO || "").slice(0, 10));
  if (!period) return null;
  return `${FM_ASGARI_MANUAL_BRUT_PREFIX}${periodStorageKey(period)}`;
}
