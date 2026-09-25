/**
 * Belirli / kısmi / mevsim — çoklu çalışma dönemi form modeli (V3 parity).
 * Hesap motoru startDate/endDate kullanır; bunlar ilk giriş — son çıkış span'inden türetilir.
 */

import { createInitialUsedRows, normalizeUsedRows } from "./core";
import { newLocalId, type SavedYillikCase } from "./caseStorage";
import type { StandardYillikForm, UsedLeaveRow, YillikResultSnapshot } from "./types";
import {
  createEmptySimplePeriod,
  deriveSpanDates,
  normalizeSimplePeriods,
  type SimpleWorkPeriod,
} from "./workPeriods";

export type MultiPeriodYillikForm = StandardYillikForm & {
  workPeriods: SimpleWorkPeriod[];
};

export type SavedCase = SavedYillikCase<MultiPeriodYillikForm, YillikResultSnapshot>;

export function createEmptyForm(): MultiPeriodYillikForm {
  const workPeriods = [createEmptySimplePeriod()];
  const span = deriveSpanDates(workPeriods);
  return {
    workPeriods,
    startDate: span.startDate,
    endDate: span.endDate,
    brut: "",
    usedRows: createInitialUsedRows(7),
    is18Or50: false,
    isUnderground: false,
    employerPayment: "",
  };
}

export function withSyncedSpan(form: MultiPeriodYillikForm): MultiPeriodYillikForm {
  const span = deriveSpanDates(form.workPeriods);
  return { ...form, startDate: span.startDate, endDate: span.endDate };
}

export function normalizeForm(raw: Partial<MultiPeriodYillikForm> | null | undefined): MultiPeriodYillikForm {
  const e = createEmptyForm();
  if (!raw || typeof raw !== "object") return e;
  const startDate = String(raw.startDate ?? e.startDate);
  const endDate = String(raw.endDate ?? e.endDate);
  const workPeriods = normalizeSimplePeriods(raw.workPeriods, startDate, endDate);
  const span = deriveSpanDates(workPeriods);
  return {
    workPeriods,
    startDate: span.startDate || startDate,
    endDate: span.endDate || endDate,
    brut: String(raw.brut ?? e.brut),
    usedRows: normalizeUsedRows(raw.usedRows, 7),
    is18Or50: !!raw.is18Or50,
    isUnderground: !!raw.isUnderground,
    employerPayment: String(raw.employerPayment ?? e.employerPayment ?? ""),
  };
}

export function normalizeResults(raw: Partial<YillikResultSnapshot> | null | undefined): YillikResultSnapshot {
  return {
    totalEntitlement: Number(raw?.totalEntitlement) || 0,
    remainingDays: Number(raw?.remainingDays) || 0,
    brutIzin: Number(raw?.brutIzin) || 0,
    sgk: Number(raw?.sgk) || 0,
    issizlik: Number(raw?.issizlik) || 0,
    gelirVergisi: Number(raw?.gelirVergisi) || 0,
    damgaVergisi: Number(raw?.damgaVergisi) || 0,
    netIzin: Number(raw?.netIzin) || 0,
  };
}

export function snapshotKey(form: MultiPeriodYillikForm): string {
  return JSON.stringify({
    wp: form.workPeriods.map((p) => [p.iseGiris, p.istenCikis]),
    a: form.startDate,
    b: form.endDate,
    c: form.brut,
    r: form.usedRows.map((x) => [x.start, x.end, x.days]),
    i: form.is18Or50,
    u: form.isUnderground,
    p: form.employerPayment ?? "",
  });
}

export { newLocalId, type UsedLeaveRow, type SimpleWorkPeriod };
