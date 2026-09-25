import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Haksız Fesih form mapping.
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
import type { HaksizFesihForm, SavedCase } from "./model";
import { createEmptyForm, normalizeNetAyKatsayi } from "./model";

export const HAKSIZ_FESIH_TYPE = "haksiz_fesih_tazminati" as const;

export function isHaksizFesihRecordType(type: string | undefined | null): boolean {
  return type === HAKSIZ_FESIH_TYPE;
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
export function mapHaksizFesihFormFromBackend(data: unknown): HaksizFesihForm | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    return {
      startDate: str(form.startDate ?? form.iseGiris ?? form.ise_giris) || empty.startDate,
      endDate: str(form.endDate ?? form.istenCikis ?? form.isten_cikis) || empty.endDate,
      brut: str(form.brut ?? form.ciplakBrut ?? form.ciplak_brut) || empty.brut,
      odenenTutar: str(form.odenenTutar ?? form.mahsup ?? form.odenen_tutar) || empty.odenenTutar,
      brutInputForNet:
        str(form.brutInputForNet ?? form.brut_input_for_net ?? form.opsiyonelBrut) ||
        empty.brutInputForNet,
      netAyKatsayi: normalizeNetAyKatsayi(
        form.netAyKatsayi ?? form.net_ay_katsayi ?? form.ayKatsayi ?? empty.netAyKatsayi,
      ),
    };
  } catch {
    return null;
  }
}

export const haksizFesihCaseCrud = createCalcBackendCrud({
  recordType: HAKSIZ_FESIH_TYPE,
  isRecordType: isHaksizFesihRecordType,
  mapFormFromBackend: mapHaksizFesihFormFromBackend,
  buildSaveData: (form, result) =>
    buildCalcSavePayload({
      form,
      result,
      iseGiris: form.startDate || null,
      istenCikis: form.endDate || null,
    }),
  localStorageKey: STORAGE_KEY,
});

export function buildHaksizFesihSaveResult(result: {
  brutForNet: number;
  netTazminat: number;
  mahsupSonrasiNet: number;
  maxAmount: number;
}): CalcSaveResult {
  return {
    brut: result.maxAmount,
    net: result.netTazminat,
    brutForNet: result.brutForNet,
    netTazminat: result.netTazminat,
    mahsupSonrasiNet: result.mahsupSonrasiNet,
    maxAmount: result.maxAmount,
  };
}

export function mapHaksizFesihRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapHaksizFesihFormFromBackend(record.data);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const brutForNet = Number(results?.brutForNet ?? payload.brut_total ?? results?.brut ?? 0);
  const netTazminat = Number(results?.netTazminat ?? results?.net ?? payload.net_total ?? 0);
  const mahsupSonrasiNet = Number(results?.mahsupSonrasiNet ?? netTazminat);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: {
      brutForNet: Number.isFinite(brutForNet) ? brutForNet : 0,
      netTazminat: Number.isFinite(netTazminat) ? netTazminat : 0,
      mahsupSonrasiNet: Number.isFinite(mahsupSonrasiNet) ? mahsupSonrasiNet : 0,
    },
  };
}

export async function listHaksizFesihCasesFromBackend(): Promise<SavedCase[]> {
  return listCalcSavedCases(HAKSIZ_FESIH_TYPE, mapHaksizFesihRecordToSavedCase);
}
