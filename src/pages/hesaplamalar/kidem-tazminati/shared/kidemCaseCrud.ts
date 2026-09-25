/**
 * Kıdem tazminatı varyantları — backend saved-cases CRUD.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildCalcSavePayload,
  createCalcBackendCrud,
  type CalcSaveResult,
} from "../../shared/calcBackendCrud";

export const KIDEM_30ISCI_TYPE = "kidem_30isci" as const;
export const KIDEM_BASIN_TYPE = "kidem_basin" as const;
export const KIDEM_GEMI_TYPE = "kidem_gemi" as const;
export const KIDEM_MEVSIMLIK_TYPE = "kidem_mevsimlik" as const;
export const KIDEM_KISMI_SURELI_TYPE = "kidem_kismi_sureli" as const;

function pickDates(form: Record<string, unknown>): { iseGiris: string | null; istenCikis: string | null } {
  const iseGiris = str(
    form.iseGirisTarihi ?? form.iseGiris ?? form.startDate ?? form.meslegeBaslangic,
  );
  const istenCikis = str(
    form.istenCikisTarihi ?? form.istenCikis ?? form.endDate ?? form.exitDate,
  );
  return {
    iseGiris: iseGiris || null,
    istenCikis: istenCikis || null,
  };
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function buildKidemSaveData<TForm extends Record<string, unknown>>(
  form: TForm,
  result: CalcSaveResult,
): Record<string, unknown> {
  const dates = pickDates(form);
  return buildCalcSavePayload({
    form,
    result,
    iseGiris: dates.iseGiris,
    istenCikis: dates.istenCikis,
  });
}

export function createKidemCrud<TForm extends Record<string, unknown>>(
  recordType: string,
  mapFormFromBackend: (
    data: unknown,
    record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
  ) => TForm | null,
  localStorageKey?: string,
) {
  return createCalcBackendCrud({
    recordType,
    isRecordType: (t) => t === recordType,
    mapFormFromBackend,
    buildSaveData: (form, result) => buildKidemSaveData(form as Record<string, unknown>, result),
    localStorageKey,
  });
}
