import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Yıllık Ücretli İzin (Basın — Günlük Gazete).
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../../shared/calcBackendCrud";
import {
  buildYillikStandartSaveResult,
  mapUsedRows,
  normalizeDateInput,
  pickYillikBackendForm,
  resolveYillikSavedCaseDisplayName,
  unwrapYillikBackendData,
  type YillikSavedCase,
  type YillikStandartSaveResult,
} from "../lib/yillikBackendCase";
import { normalizeForm, normalizeResults, type YillikBasinForm } from "./model";

export const YILLIK_BASIN_TYPE = "yillik_izin_basin" as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function isYillikBasinRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === YILLIK_BASIN_TYPE || (t.includes("yillik") && t.includes("basin"));
}

export function mapYillikBasinFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): YillikBasinForm | null {
  try {
    const payload = unwrapYillikBackendData(data);
    const form = pickYillikBackendForm(payload);
    const eklentiler = asRecord(payload.eklentiler);
    return normalizeForm({
      meslegeBaslangic: normalizeDateInput(
        form.meslegeBaslangic ??
          form.meslege_baslangic ??
          eklentiler?.meslege_baslangic ??
          payload.meslege_baslangic,
      ),
      startDate: normalizeDateInput(
        form.startDate ?? form.iseGiris ?? form.ise_giris ?? record?.ise_giris,
      ),
      endDate: normalizeDateInput(
        form.endDate ?? form.exitDate ?? form.istenCikis ?? form.isten_cikis ?? record?.isten_cikis,
      ),
      brut: str(form.brut ?? form.brutUcret ?? form.brut_ucret),
      usedRows: mapUsedRows(form.usedRows ?? form.rows),
      employerPayment: str(
        form.employerPayment ??
          form.employer_payment ??
          eklentiler?.employer_payment ??
          payload.employer_payment,
      ),
    });
  } catch {
    return null;
  }
}

function toV3Form(form: YillikBasinForm): Record<string, unknown> {
  return {
    meslegeBaslangic: form.meslegeBaslangic,
    iseGiris: form.startDate,
    istenCikis: form.endDate,
    brutUcret: form.brut,
    rows: form.usedRows,
    employerPayment: form.employerPayment,
    startDate: form.startDate,
    endDate: form.endDate,
    brut: form.brut,
    usedRows: form.usedRows,
  };
}

function buildSaveData(form: YillikBasinForm, result: YillikStandartSaveResult): Record<string, unknown> {
  const izinHesaplama = asRecord(result.breakdown);
  return {
    form: toV3Form(form),
    results: {
      izinHesaplama,
      totalEntitlement: result.totalEntitlement,
      usedTotal: result.usedTotal,
      remainingDays: result.remainingDays,
      brutIzin: result.brut,
      sgk: result.sgk,
      issizlik: result.issizlik,
      gelirVergisi: result.gelirVergisi,
      damgaVergisi: result.damgaVergisi,
      netIzin: result.net,
      brut: result.brut,
      net: result.net,
    },
    hesaplama_tipi: "Yıllık Ücretli İzin",
    brut_toplam: result.brut,
    net_toplam: result.net,
    ise_giris: form.startDate || null,
    isten_cikis: form.endDate || null,
    meslege_baslangic: form.meslegeBaslangic || null,
    eklentiler: {
      employer_payment: form.employerPayment ?? "",
      meslege_baslangic: form.meslegeBaslangic ?? "",
    },
  };
}

const caseCrud = createCalcBackendCrud({
  recordType: YILLIK_BASIN_TYPE,
  isRecordType: isYillikBasinRecordType,
  mapFormFromBackend: mapYillikBasinFormFromBackend,
  buildSaveData,
  localStorageKey: STORAGE_KEY,
});

function mapRecordToSavedCase(record: SavedCaseRecord): YillikSavedCase<YillikBasinForm> | null {
  const form = mapYillikBasinFormFromBackend(record.data, record);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const izinHesaplama = asRecord(results?.izinHesaplama);
  const brut = Number(results?.brutIzin ?? payload.brut_toplam ?? results?.brut ?? 0);
  const net = Number(results?.netIzin ?? payload.net_toplam ?? results?.net ?? 0);
  return {
    id: String(record.id),
    name: resolveYillikSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: normalizeResults({
      totalEntitlement: Number(
        results?.totalEntitlement ?? izinHesaplama?.izinGun ?? 0,
      ),
      remainingDays: Number(results?.remainingDays ?? 0),
      brutIzin: Number.isFinite(brut) ? brut : 0,
      sgk: Number(results?.sgk ?? 0),
      issizlik: Number(results?.issizlik ?? 0),
      gelirVergisi: Number(results?.gelirVergisi ?? 0),
      damgaVergisi: Number(results?.damgaVergisi ?? 0),
      netIzin: Number.isFinite(net) ? net : 0,
    }),
  };
}

async function listCasesFromBackend(): Promise<YillikSavedCase<YillikBasinForm>[]> {
  return listCalcSavedCases(YILLIK_BASIN_TYPE, mapRecordToSavedCase);
}

export const yillikBasinBackend = {
  recordType: YILLIK_BASIN_TYPE,
  caseCrud,
  mapFormFromBackend: mapYillikBasinFormFromBackend,
  listCasesFromBackend,
};

export const yillikBasinCaseCrud = caseCrud;

export function basinYillikSaveGate(result: {
  brutIzin: number;
  totalEntitlement: number;
  remainingDays: number;
  startDate: string;
  endDate: string;
}): { ok: true } | { ok: false; message: string } {
  if (!result.startDate?.trim()) {
    return { ok: false, message: "Giriş tarihi gerekli" };
  }
  if (!result.endDate?.trim()) {
    return { ok: false, message: "Çıkış tarihi gerekli" };
  }
  if (result.remainingDays < 0) {
    return { ok: false, message: "Geçerli izin günü giriniz" };
  }
  if (!(result.brutIzin > 0)) {
    return {
      ok: false,
      message: "Brüt izin tutarı hesaplanamadı. Lütfen çıplak brüt ücreti kontrol edin.",
    };
  }
  return { ok: true };
}

export { buildYillikStandartSaveResult };

export type BasinSaveResult = CalcSaveResult;
