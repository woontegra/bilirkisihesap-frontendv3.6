import { withSyncedSpan, type MultiPeriodYillikForm } from "../lib/multiPeriodModel";
import { computeYillikStandartResult } from "../standart/engine";

export function computeYillikMevsimResult(form: MultiPeriodYillikForm) {
  return computeYillikStandartResult(withSyncedSpan(form));
}

export { clampYear, formatDateTR, isDateOrderInvalid } from "../standart/engine";
