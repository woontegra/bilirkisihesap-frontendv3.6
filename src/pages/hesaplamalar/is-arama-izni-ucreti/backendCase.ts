import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → İş Arama İzni Ücreti form mapping.
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
import type { IsAramaForm, SavedCase, TarihAralikDusum } from "./model";
import { createEmptyForm, newLocalId } from "./model";

export const IS_ARAMA_IZNI_TYPE = "is_arama_izni" as const;

export function isIsAramaIzniRecordType(type: string | undefined | null): boolean {
  return type === IS_ARAMA_IZNI_TYPE;
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

function mapTarihAralikDusumler(raw: unknown): TarihAralikDusum[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const row = asRecord(item);
      if (!row) return null;
      const baslangic = str(row.baslangic ?? row.start ?? row.startDate);
      const bitis = str(row.bitis ?? row.end ?? row.endDate);
      const gunlukSaat = str(row.gunlukSaat ?? row.dailyHours ?? row.saat);
      if (!baslangic && !bitis && !gunlukSaat) return null;
      return {
        id: str(row.id) || newLocalId(`dusum-${index}`),
        baslangic,
        bitis,
        gunlukSaat,
      };
    })
    .filter((row): row is TarihAralikDusum => row !== null);
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

/** Backend data → lokal form. Bozuksa null. */
export function mapIsAramaFormFromBackend(data: unknown): IsAramaForm | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    return {
      startDate: str(form.startDate ?? form.iseGiris) || empty.startDate,
      endDate: str(form.endDate ?? form.istenCikis) || empty.endDate,
      brut: str(form.brut ?? form.brutUcret) || empty.brut,
      prim: str(form.prim) || empty.prim,
      ikramiye: str(form.ikramiye) || empty.ikramiye,
      yol: str(form.yol) || empty.yol,
      yemek: str(form.yemek) || empty.yemek,
      extras: empty.extras,
      haftalikCalismaGunu: str(form.haftalikCalismaGunu) || empty.haftalikCalismaGunu,
      kullandirilanIzinGun: str(form.kullandirilanIzinGun) || empty.kullandirilanIzinGun,
      tarihAralikDusumler: mapTarihAralikDusumler(form.tarihAralikDusumler),
    };
  } catch {
    return null;
  }
}

export const isAramaIzniCaseCrud = createCalcBackendCrud({
  recordType: IS_ARAMA_IZNI_TYPE,
  isRecordType: isIsAramaIzniRecordType,
  mapFormFromBackend: mapIsAramaFormFromBackend,
  buildSaveData: (form, result) =>
    buildCalcSavePayload({
      form,
      result,
      iseGiris: form.startDate || null,
      istenCikis: form.endDate || null,
    }),
  localStorageKey: STORAGE_KEY,
});

export function buildIsAramaIzniSaveResult(result: {
  toplamBrut: number;
  brut: number;
  net: number;
}): CalcSaveResult {
  return {
    brut: result.brut,
    net: result.net,
    toplamBrut: result.toplamBrut,
  };
}

export function mapIsAramaIzniRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapIsAramaFormFromBackend(record.data);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const toplamBrut = Number(results?.toplamBrut ?? payload.brut_total ?? 0);
  const brut = Number(results?.brut ?? payload.brut_total ?? toplamBrut);
  const net = Number(results?.net ?? payload.net_total ?? 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: {
      toplamBrut: Number.isFinite(toplamBrut) ? toplamBrut : 0,
      brut: Number.isFinite(brut) ? brut : 0,
      net: Number.isFinite(net) ? net : 0,
    },
  };
}

export async function listIsAramaIzniCasesFromBackend(): Promise<SavedCase[]> {
  return listCalcSavedCases(IS_ARAMA_IZNI_TYPE, mapIsAramaIzniRecordToSavedCase);
}
