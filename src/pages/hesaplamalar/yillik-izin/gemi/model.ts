import { newLocalId, type SavedYillikCase } from "../lib/caseStorage";
import { createEmptyUsedRow, createInitialUsedRows, normalizeUsedRows, calculateUsedTotal } from "../lib/core";
import type { GemiWorkPeriod, UsedLeaveRow, YillikResultSnapshot } from "../lib/types";

export type YillikGemiForm = {
  workPeriods: GemiWorkPeriod[];
  brut: string;
  /** V3 parity: satır listesi; usedDays bundan türetilir. */
  usedRows: UsedLeaveRow[];
  /** Eski kayıt uyumu / türetilmiş toplam. */
  usedDays: number;
  endDate: string;
  employerPayment: string;
};

export type SavedCase = SavedYillikCase<YillikGemiForm, YillikResultSnapshot>;

export function createEmptyPeriod(): GemiWorkPeriod {
  return { id: newLocalId("period"), iseGiris: "", istenCikis: "" };
}

export function createEmptyForm(): YillikGemiForm {
  return {
    workPeriods: [createEmptyPeriod()],
    brut: "",
    usedRows: createInitialUsedRows(7),
    usedDays: 0,
    endDate: "",
    employerPayment: "",
  };
}

function migrateUsedRows(raw: Partial<YillikGemiForm>): UsedLeaveRow[] {
  if (Array.isArray(raw.usedRows) && raw.usedRows.length > 0) {
    return normalizeUsedRows(raw.usedRows, 7);
  }
  const days = Number(raw.usedDays) || 0;
  if (days > 0) {
    const row = createEmptyUsedRow();
    return [{ ...row, days: String(days) }, ...createInitialUsedRows(6)];
  }
  return createInitialUsedRows(7);
}

export function normalizeForm(raw: Partial<YillikGemiForm> | null | undefined): YillikGemiForm {
  const e = createEmptyForm();
  if (!raw || typeof raw !== "object") return e;
  const usedRows = migrateUsedRows(raw);
  return {
    workPeriods: Array.isArray(raw.workPeriods) && raw.workPeriods.length
      ? raw.workPeriods.map((p) => ({
          id: String(p?.id || newLocalId("period")),
          iseGiris: String(p?.iseGiris ?? ""),
          istenCikis: String(p?.istenCikis ?? ""),
          gunSayisi: p?.gunSayisi,
        }))
      : [createEmptyPeriod()],
    brut: String(raw.brut ?? e.brut),
    usedRows,
    usedDays: calculateUsedTotal(usedRows),
    endDate: String(raw.endDate ?? e.endDate),
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

export function snapshotKey(form: YillikGemiForm): string {
  return JSON.stringify({
    p: form.workPeriods,
    b: form.brut,
    r: form.usedRows,
    u: calculateUsedTotal(form.usedRows),
    e: form.endDate,
    pay: form.employerPayment,
  });
}
