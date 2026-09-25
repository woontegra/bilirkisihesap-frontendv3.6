import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → İşe Başlatmama form mapping.
 * Yalnızca form alanlarını doldurur; sonucu backend'den almaz (lokal motor yeniden hesaplar).
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildCalcSavePayload,
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../shared/calcBackendCrud";
import type { IseAlmamaForm, SavedCase } from "./model";
import { createEmptyForm } from "./model";

export const ISE_ALMAMA_TYPE = "ise_almama_tazminati" as const;

export function isIseAlmamaRecordType(type: string | undefined | null): boolean {
  return type === ISE_ALMAMA_TYPE;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function unwrapData(data: unknown): Record<string, unknown> {
  let payload: unknown = data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return {};
    }
  }
  const root = asRecord(payload) ?? {};
  const nested = asRecord(root.data);
  return nested ?? root;
}

function pickForm(payload: Record<string, unknown>): Record<string, unknown> {
  return asRecord(payload.form) ?? asRecord(payload.formValues) ?? payload;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

/** Backend data → lokal form. Bozuksa null. */
export function mapIseAlmamaFormFromBackend(data: unknown): IseAlmamaForm | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    const rawK = form.selectedKatsayi ?? form.katsayi ?? form.kat;
    let selectedKatsayi = empty.selectedKatsayi;
    if (typeof rawK === "number" && [4, 5, 6, 7, 8].includes(rawK)) selectedKatsayi = rawK;
    else if (typeof rawK === "string") {
      const n = Number(rawK);
      if ([4, 5, 6, 7, 8].includes(n)) selectedKatsayi = n;
    }
    return {
      startDate: str(form.startDate ?? form.iseGiris ?? form.ise_giris) || empty.startDate,
      endDate: str(form.endDate ?? form.istenCikis ?? form.isten_cikis) || empty.endDate,
      brut: str(form.brut ?? form.ciplakBrut ?? form.ciplak_brut) || empty.brut,
      brutInputForNet:
        str(form.brutInputForNet ?? form.brut_input_for_net ?? form.opsiyonelBrut) ||
        empty.brutInputForNet,
      selectedKatsayi,
    };
  } catch {
    return null;
  }
}

export const iseAlmamaCaseCrud = createCalcBackendCrud({
  recordType: ISE_ALMAMA_TYPE,
  isRecordType: isIseAlmamaRecordType,
  mapFormFromBackend: mapIseAlmamaFormFromBackend,
  buildSaveData: (form, result) =>
    buildCalcSavePayload({
      form,
      result,
      iseGiris: form.startDate || null,
      istenCikis: form.endDate || null,
    }),
  localStorageKey: STORAGE_KEY,
});

export function buildIseAlmamaSaveResult(result: {
  brutForNet: number;
  netTazminat: number;
  selectedKatsayi: number;
}): CalcSaveResult {
  return {
    brut: result.brutForNet,
    net: result.netTazminat,
    brutForNet: result.brutForNet,
    netTazminat: result.netTazminat,
    selectedKatsayi: result.selectedKatsayi,
  };
}

export function mapIseAlmamaRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapIseAlmamaFormFromBackend(record.data);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const brutForNet = Number(results?.brutForNet ?? payload.brut_total ?? results?.brut ?? 0);
  const netTazminat = Number(results?.netTazminat ?? results?.net ?? payload.net_total ?? 0);
  const selectedKatsayi = Number(results?.selectedKatsayi ?? form.selectedKatsayi ?? 8);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: {
      brutForNet: Number.isFinite(brutForNet) ? brutForNet : 0,
      netTazminat: Number.isFinite(netTazminat) ? netTazminat : 0,
      selectedKatsayi: Number.isFinite(selectedKatsayi) ? selectedKatsayi : 8,
    },
  };
}

export async function listIseAlmamaCasesFromBackend(): Promise<SavedCase[]> {
  return listCalcSavedCases(ISE_ALMAMA_TYPE, mapIseAlmamaRecordToSavedCase);
}
