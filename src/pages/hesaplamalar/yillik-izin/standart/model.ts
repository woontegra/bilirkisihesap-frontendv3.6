import { createInitialUsedRows, normalizeUsedRows } from "../lib/core";
import { newLocalId, type SavedYillikCase } from "../lib/caseStorage";
import type { UsedLeaveRow, YillikResultSnapshot } from "../lib/types";
import type { StandardYillikForm } from "../lib/types";

export type YillikStandartForm = StandardYillikForm;
export type SavedCase = SavedYillikCase<YillikStandartForm, YillikResultSnapshot>;

export function createEmptyForm(): YillikStandartForm {
  return {
    startDate: "",
    endDate: "",
    brut: "",
    usedRows: createInitialUsedRows(7),
    is18Or50: false,
    isUnderground: false,
    employerPayment: "",
  };
}

export function normalizeForm(raw: Partial<YillikStandartForm> | null | undefined): YillikStandartForm {
  const e = createEmptyForm();
  if (!raw || typeof raw !== "object") return e;
  return {
    startDate: String(raw.startDate ?? e.startDate),
    endDate: String(raw.endDate ?? e.endDate),
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

export function snapshotKey(form: YillikStandartForm): string {
  return JSON.stringify({
    a: form.startDate,
    b: form.endDate,
    c: form.brut,
    r: form.usedRows.map((x) => [x.start, x.end, x.days]),
    i: form.is18Or50,
    u: form.isUnderground,
    p: form.employerPayment ?? "",
  });
}

export { newLocalId, type UsedLeaveRow };
