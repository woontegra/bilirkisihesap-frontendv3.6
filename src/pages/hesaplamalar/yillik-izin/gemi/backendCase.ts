import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Yıllık Ücretli İzin (Gemi Adamları).
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import { newLocalId } from "../lib/caseStorage";
import {
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../../shared/calcBackendCrud";
import type { GemiWorkPeriod } from "../lib/types";
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
import { createEmptyPeriod, normalizeForm, normalizeResults, type YillikGemiForm } from "./model";

export const YILLIK_GEMI_TYPE = "yillik_izin_gemi" as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function isYillikGemiRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === YILLIK_GEMI_TYPE || (t.includes("yillik") && t.includes("gemi"));
}

function mapWorkPeriods(raw: unknown): GemiWorkPeriod[] {
  if (!Array.isArray(raw) || raw.length === 0) return [createEmptyPeriod()];
  return raw.map((item) => {
    const p = asRecord(item);
    return {
      id: str(p?.id) || newLocalId("period"),
      iseGiris: normalizeDateInput(p?.iseGiris ?? p?.ise_giris),
      istenCikis: normalizeDateInput(p?.istenCikis ?? p?.isten_cikis),
      gunSayisi: p?.gunSayisi != null ? Number(p.gunSayisi) : undefined,
    };
  });
}

export function mapYillikGemiFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): YillikGemiForm | null {
  try {
    const payload = unwrapYillikBackendData(data);
    const form = pickYillikBackendForm(payload);
    const eklentiler = asRecord(payload.eklentiler);
    const workPeriods = mapWorkPeriods(form.workPeriods ?? eklentiler?.workPeriods);
    const lastPeriod = workPeriods[workPeriods.length - 1];
    return normalizeForm({
      workPeriods,
      brut: str(form.brut ?? form.brutUcret ?? form.brut_ucret),
      usedRows: mapUsedRows(form.usedRows ?? form.rows),
      employerPayment: str(
        form.employerPayment ??
          form.employer_payment ??
          eklentiler?.employer_payment ??
          payload.employer_payment,
      ),
      endDate: normalizeDateInput(lastPeriod?.istenCikis ?? record?.isten_cikis),
    });
  } catch {
    return null;
  }
}

function toV3Form(form: YillikGemiForm): Record<string, unknown> {
  return {
    workPeriods: form.workPeriods,
    brutUcret: form.brut,
    rows: form.usedRows,
    employerPayment: form.employerPayment,
    brut: form.brut,
    usedRows: form.usedRows,
  };
}

function buildSaveData(form: YillikGemiForm, result: YillikStandartSaveResult): Record<string, unknown> {
  const first = form.workPeriods[0];
  const last = form.workPeriods[form.workPeriods.length - 1];
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
    ise_giris: first?.iseGiris || null,
    isten_cikis: last?.istenCikis || null,
    eklentiler: { employer_payment: form.employerPayment ?? "", workPeriods: form.workPeriods },
  };
}

const caseCrud = createCalcBackendCrud({
  recordType: YILLIK_GEMI_TYPE,
  isRecordType: isYillikGemiRecordType,
  mapFormFromBackend: mapYillikGemiFormFromBackend,
  buildSaveData,
  localStorageKey: STORAGE_KEY,
});

function mapRecordToSavedCase(record: SavedCaseRecord): YillikSavedCase<YillikGemiForm> | null {
  const form = mapYillikGemiFormFromBackend(record.data, record);
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

async function listCasesFromBackend(): Promise<YillikSavedCase<YillikGemiForm>[]> {
  return listCalcSavedCases(YILLIK_GEMI_TYPE, mapRecordToSavedCase);
}

export const yillikGemiBackend = {
  recordType: YILLIK_GEMI_TYPE,
  caseCrud,
  mapFormFromBackend: mapYillikGemiFormFromBackend,
  listCasesFromBackend,
};

export const yillikGemiCaseCrud = caseCrud;

export function gemiYillikSaveGate(result: {
  brutIzin: number;
  totalEntitlement: number;
  remainingDays: number;
  startDate: string;
  endDate: string;
}): { ok: true } | { ok: false; message: string } {
  if (!result.startDate || !result.endDate) {
    return { ok: false, message: "Lütfen çalışma dönemlerini girin" };
  }
  if (result.remainingDays == null || result.remainingDays < 0) {
    return { ok: false, message: "Kalan izin günü hesaplanamadı" };
  }
  if (!(result.brutIzin > 0) && !(result.totalEntitlement > 0)) {
    return { ok: false, message: "Geçerli tarih ve brüt ücret giriniz" };
  }
  return { ok: true };
}

export { buildYillikStandartSaveResult };

export type GemiSaveResult = CalcSaveResult;
