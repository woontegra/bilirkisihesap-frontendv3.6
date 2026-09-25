import { createInitialUsedRows, normalizeUsedRows } from "../../lib/core";
import type { SavedYillikCase } from "../../lib/caseStorage";
import type { UsedLeaveRow, YillikResultSnapshot } from "../../lib/types";

export type YillikBasinGunlukOlmayanForm = {
  meslegeBaslangic: string;
  startDate: string;
  endDate: string;
  brut: string;
  usedRows: UsedLeaveRow[];
  employerPayment: string;
};

export type SavedCase = SavedYillikCase<YillikBasinGunlukOlmayanForm, YillikResultSnapshot>;

export function createEmptyForm(): YillikBasinGunlukOlmayanForm {
  return { meslegeBaslangic: "", startDate: "", endDate: "", brut: "", usedRows: createInitialUsedRows(7), employerPayment: "" };
}

export function normalizeForm(raw: Partial<YillikBasinGunlukOlmayanForm> | null | undefined): YillikBasinGunlukOlmayanForm {
  const e = createEmptyForm();
  if (!raw || typeof raw !== "object") return e;
  const meslegeBaslangic = String(raw.meslegeBaslangic ?? e.meslegeBaslangic);
  return {
    meslegeBaslangic,
    startDate: String(raw.startDate ?? meslegeBaslangic ?? e.startDate),
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

export function snapshotKey(form: YillikBasinGunlukOlmayanForm): string {
  return JSON.stringify({ m: form.meslegeBaslangic, a: form.startDate, b: form.endDate, c: form.brut, r: form.usedRows, p: form.employerPayment });
}
