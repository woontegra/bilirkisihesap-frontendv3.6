import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Ayrımcılık Tazminatı form mapping.
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
import type { AyrimcilikForm, SavedCase } from "./model";
import { createEmptyForm, normalizeNetAyKatsayi } from "./model";

export const AYRIMCILIK_TYPE = "ayrimcilik_tazminati" as const;

export function isAyrimcilikRecordType(type: string | undefined | null): boolean {
  return type === AYRIMCILIK_TYPE;
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
export function mapAyrimcilikFormFromBackend(data: unknown): AyrimcilikForm | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    return {
      startDate: str(form.startDate ?? form.iseGiris ?? form.ise_giris) || empty.startDate,
      endDate: str(form.endDate ?? form.istenCikis ?? form.isten_cikis) || empty.endDate,
      brut: str(form.brut ?? form.ciplakBrut ?? form.ciplak_brut) || empty.brut,
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

export const ayrimcilikCaseCrud = createCalcBackendCrud({
  recordType: AYRIMCILIK_TYPE,
  isRecordType: isAyrimcilikRecordType,
  mapFormFromBackend: mapAyrimcilikFormFromBackend,
  buildSaveData: (form, result) =>
    buildCalcSavePayload({
      form,
      result,
      iseGiris: form.startDate || null,
      istenCikis: form.endDate || null,
    }),
  localStorageKey: STORAGE_KEY,
});

export function buildAyrimcilikSaveResult(result: {
  brutForNetConversion: number;
  gelirVergisi: number;
  damgaVergisi: number;
  netTazminat: number;
  maxAmount: number;
}): CalcSaveResult {
  return {
    brut: result.maxAmount,
    net: result.netTazminat,
    brutForNetConversion: result.brutForNetConversion,
    gelirVergisi: result.gelirVergisi,
    damgaVergisi: result.damgaVergisi,
    netTazminat: result.netTazminat,
    maxAmount: result.maxAmount,
  };
}

export function mapAyrimcilikRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapAyrimcilikFormFromBackend(record.data);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const brutForNetConversion = Number(
    results?.brutForNetConversion ?? results?.brutForNet ?? payload.brut_total ?? results?.brut ?? 0,
  );
  const netTazminat = Number(results?.netTazminat ?? results?.net ?? payload.net_total ?? 0);
  const gelirVergisi = Number(results?.gelirVergisi ?? 0);
  const damgaVergisi = Number(results?.damgaVergisi ?? 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: {
      brutForNetConversion: Number.isFinite(brutForNetConversion) ? brutForNetConversion : 0,
      gelirVergisi: Number.isFinite(gelirVergisi) ? gelirVergisi : 0,
      damgaVergisi: Number.isFinite(damgaVergisi) ? damgaVergisi : 0,
      netTazminat: Number.isFinite(netTazminat) ? netTazminat : 0,
    },
  };
}

export async function listAyrimcilikCasesFromBackend(): Promise<SavedCase[]> {
  return listCalcSavedCases(AYRIMCILIK_TYPE, mapAyrimcilikRecordToSavedCase);
}
