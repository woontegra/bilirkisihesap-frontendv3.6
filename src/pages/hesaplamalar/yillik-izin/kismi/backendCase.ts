import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Yıllık Ücretli İzin (Kısmi Süreli).
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import { newLocalId } from "../lib/caseStorage";
import {
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../../shared/calcBackendCrud";
import { normalizeSimplePeriods, type SimpleWorkPeriod } from "../lib/workPeriods";
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
import { normalizeForm, normalizeResults, type YillikKismiForm } from "./model";

export const YILLIK_KISMI_TYPE = "yillik_izin_kismi" as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function isYillikKismiRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === YILLIK_KISMI_TYPE || (t.includes("yillik") && t.includes("kismi"));
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

export function mapYillikKismiFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): YillikKismiForm | null {
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

function toV3Form(form: YillikKismiForm): Record<string, unknown> {
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

function buildSaveData(form: YillikKismiForm, result: YillikStandartSaveResult): Record<string, unknown> {
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
    eklentiler: {
      employer_payment: form.employerPayment ?? "",
      workPeriods: form.workPeriods,
    },
  };
}

const caseCrud = createCalcBackendCrud({
  recordType: YILLIK_KISMI_TYPE,
  isRecordType: isYillikKismiRecordType,
  mapFormFromBackend: mapYillikKismiFormFromBackend,
  buildSaveData,
  localStorageKey: STORAGE_KEY,
});

function mapRecordToSavedCase(record: SavedCaseRecord): YillikSavedCase<YillikKismiForm> | null {
  const form = mapYillikKismiFormFromBackend(record.data, record);
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

async function listCasesFromBackend(): Promise<YillikSavedCase<YillikKismiForm>[]> {
  return listCalcSavedCases(YILLIK_KISMI_TYPE, mapRecordToSavedCase);
}

export const yillikKismiBackend = {
  recordType: YILLIK_KISMI_TYPE,
  caseCrud,
  mapFormFromBackend: mapYillikKismiFormFromBackend,
  listCasesFromBackend,
};

export function kismiYillikSaveGate(result: {
  brutIzin: number;
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

export type KismiSaveResult = CalcSaveResult;
