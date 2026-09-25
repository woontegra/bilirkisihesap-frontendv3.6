import { createInitialUsedRows, normalizeUsedRows } from "../lib/core";
import type { SavedYillikCase } from "../lib/caseStorage";
import type { UsedLeaveRow, YillikResultSnapshot } from "../lib/types";

export type YillikBasinForm = {
  meslegeBaslangic: string;
  startDate: string;
  endDate: string;
  brut: string;
  usedRows: UsedLeaveRow[];
  employerPayment: string;
};

export type SavedCase = SavedYillikCase<YillikBasinForm, YillikResultSnapshot>;

export function createEmptyForm(): YillikBasinForm {
  return { meslegeBaslangic: "", startDate: "", endDate: "", brut: "", usedRows: createInitialUsedRows(7), employerPayment: "" };
}

export function normalizeForm(raw: Partial<YillikBasinForm> | null | undefined): YillikBasinForm {
  const e = createEmptyForm();
  if (!raw || typeof raw !== "object") return e;
  return {
    meslegeBaslangic: String(raw.meslegeBaslangic ?? e.meslegeBaslangic),
    startDate: String(raw.startDate ?? e.startDate),
    endDate: String(raw.endDate ?? e.endDate),
    brut: String(raw.brut ?? e.brut),
    usedRows: normalizeUsedRows(raw.usedRows, 7),
    employerPayment: String(raw.employerPayment ?? e.employerPayment),
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

export function snapshotKey(form: YillikBasinForm): string {
  return JSON.stringify({ m: form.meslegeBaslangic, a: form.startDate, b: form.endDate, c: form.brut, r: form.usedRows, p: form.employerPayment });
}
