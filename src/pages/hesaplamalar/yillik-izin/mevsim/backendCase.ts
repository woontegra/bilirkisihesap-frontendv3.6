import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Yıllık Ücretli İzin (Mevsimlik İşçi).
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import { newLocalId } from "../lib/caseStorage";
import {
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../../shared/calcBackendCrud";
import {
  normalizeSimplePeriods,
  type SimpleWorkPeriod,
} from "../lib/workPeriods";
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
import { normalizeForm, normalizeResults, type YillikMevsimForm } from "./model";

export const YILLIK_MEVSIM_TYPE = "yillik_izin_mevsim" as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function isYillikMevsimRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === YILLIK_MEVSIM_TYPE || (t.includes("yillik") && t.includes("mevsim"));
}

function mapWorkPeriods(
  raw: unknown,
  fallbackStart: string,
  fallbackEnd: string,
): SimpleWorkPeriod[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item) => {
      const p = asRecord(item);
      return {
        id: str(p?.id) || newLocalId("period"),
        iseGiris: normalizeDateInput(p?.iseGiris ?? p?.ise_giris),
        istenCikis: normalizeDateInput(p?.istenCikis ?? p?.isten_cikis),
      };
    });
  }
  return normalizeSimplePeriods(raw, fallbackStart, fallbackEnd);
}

export function mapYillikMevsimFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): YillikMevsimForm | null {
  try {
    const payload = unwrapYillikBackendData(data);
    const form = pickYillikBackendForm(payload);
    const eklentiler = asRecord(payload.eklentiler);
    const startDate = normalizeDateInput(
      form.startDate ?? form.iseGiris ?? form.ise_giris ?? record?.ise_giris,
    );
    const endDate = normalizeDateInput(
      form.endDate ?? form.exitDate ?? form.istenCikis ?? form.isten_cikis ?? record?.isten_cikis,
    );
    const workPeriods = mapWorkPeriods(form.workPeriods ?? eklentiler?.workPeriods, startDate, endDate);
    return normalizeForm({
      workPeriods,
      startDate,
      endDate,
      brut: str(form.brut ?? form.brutUcret ?? form.brut_ucret),
      usedRows: mapUsedRows(form.usedRows ?? form.rows),
      employerPayment: str(
        form.employerPayment ??
          form.employer_payment ??
          eklentiler?.employer_payment ??
          payload.employer_payment,
      ),
      is18Or50: !!(form.is18Or50 ?? form.is_18_or_50),
      isUnderground: !!(form.isUnderground ?? form.is_underground),
    });
  } catch {
    return null;
  }
}

function toV3Form(form: YillikMevsimForm): Record<string, unknown> {
  return {
    workPeriods: form.workPeriods,
    iseGiris: form.startDate,
    istenCikis: form.endDate,
    brutUcret: form.brut,
    rows: form.usedRows,
    employerPayment: form.employerPayment ?? "",
    is18Or50: form.is18Or50,
    isUnderground: form.isUnderground,
    startDate: form.startDate,
    endDate: form.endDate,
    brut: form.brut,
    usedRows: form.usedRows,
  };
}

function buildSaveData(form: YillikMevsimForm, result: YillikStandartSaveResult): Record<string, unknown> {
  return {
    form: toV3Form(form),
    results: {
      breakdown: result.breakdown,
      usedTotal: result.usedTotal,
      remainingDays: result.remainingDays,
      totalEntitlement: result.totalEntitlement,
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
    eklentiler: { employer_payment: form.employerPayment ?? "" },
  };
}

const caseCrud = createCalcBackendCrud({
  recordType: YILLIK_MEVSIM_TYPE,
  isRecordType: isYillikMevsimRecordType,
  mapFormFromBackend: mapYillikMevsimFormFromBackend,
  buildSaveData,
  localStorageKey: STORAGE_KEY,
});

function mapRecordToSavedCase(record: SavedCaseRecord): YillikSavedCase<YillikMevsimForm> | null {
  const form = mapYillikMevsimFormFromBackend(record.data, record);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const breakdown = asRecord(results?.breakdown);
  const brut = Number(results?.brutIzin ?? payload.brut_toplam ?? results?.brut ?? 0);
  const net = Number(results?.netIzin ?? payload.net_toplam ?? results?.net ?? 0);
  return {
    id: String(record.id),
    name: resolveYillikSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: normalizeResults({
      totalEntitlement: Number(results?.totalEntitlement ?? breakdown?.total ?? 0),
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

async function listCasesFromBackend(): Promise<YillikSavedCase<YillikMevsimForm>[]> {
  return listCalcSavedCases(YILLIK_MEVSIM_TYPE, mapRecordToSavedCase);
}

export const yillikMevsimBackend = {
  recordType: YILLIK_MEVSIM_TYPE,
  caseCrud,
  mapFormFromBackend: mapYillikMevsimFormFromBackend,
  listCasesFromBackend,
};

export const yillikMevsimCaseCrud = caseCrud;

export function mevsimYillikSaveGate(result: {
  brutIzin: number;
  totalEntitlement: number;
  remainingDays: number;
  startDate: string;
  endDate: string;
}): { ok: true } | { ok: false; message: string } {
  if (!result.startDate || !result.endDate) {
    return { ok: false, message: "Lütfen işe giriş ve çıkış tarihlerini girin" };
  }
  if (result.remainingDays == null || result.remainingDays < 0) {
    return { ok: false, message: "Kalan izin günü hesaplanamadı" };
  }
  if (!(result.brutIzin > 0)) {
    return { ok: false, message: "Hesaplamayı kaydetmek için brüt ücret girmeniz gerekiyor" };
  }
  return { ok: true };
}

export { buildYillikStandartSaveResult };

export type MevsimSaveResult = CalcSaveResult;
