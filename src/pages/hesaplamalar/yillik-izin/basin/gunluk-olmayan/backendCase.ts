import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Yıllık Ücretli İzin (Basın — Günlük Olmayan).
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../../../shared/calcBackendCrud";
import {
  buildYillikStandartSaveResult,
  mapUsedRows,
  normalizeDateInput,
  pickYillikBackendForm,
  resolveYillikSavedCaseDisplayName,
  unwrapYillikBackendData,
  type YillikSavedCase,
  type YillikStandartSaveResult,
} from "../../lib/yillikBackendCase";
import { normalizeForm, normalizeResults, type YillikBasinGunlukOlmayanForm } from "./model";

export const YILLIK_BASIN_GUNLUK_OLMAYAN_TYPE = "yillik_izin_basin_gunluk_olmayan" as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function isYillikBasinGunlukOlmayanRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return (
    t === YILLIK_BASIN_GUNLUK_OLMAYAN_TYPE ||
    (t.includes("yillik") && t.includes("basin") && t.includes("gunluk") && t.includes("olmayan"))
  );
}

export function mapYillikBasinGunlukOlmayanFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): YillikBasinGunlukOlmayanForm | null {
  try {
    const payload = unwrapYillikBackendData(data);
    const form = pickYillikBackendForm(payload);
    const eklentiler = asRecord(payload.eklentiler);
    const meslegeBaslangic = normalizeDateInput(
      form.meslegeBaslangic ??
        form.meslege_baslangic ??
        form.iseGiris ??
        form.ise_giris ??
        eklentiler?.meslege_baslangic ??
        record?.ise_giris,
    );
    const endDate = normalizeDateInput(
      form.endDate ??
        form.exitDate ??
        form.istenCikis ??
        form.isten_cikis ??
        record?.isten_cikis,
    );
    return normalizeForm({
      meslegeBaslangic,
      startDate: meslegeBaslangic,
      endDate,
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

function toV3Form(form: YillikBasinGunlukOlmayanForm): Record<string, unknown> {
  return {
    meslegeBaslangic: form.meslegeBaslangic,
    istenCikis: form.endDate,
    iseGiris: form.meslegeBaslangic,
    brutUcret: form.brut,
    rows: form.usedRows,
    employerPayment: form.employerPayment,
    brut: form.brut,
    usedRows: form.usedRows,
  };
}

function buildSaveData(
  form: YillikBasinGunlukOlmayanForm,
  result: YillikStandartSaveResult,
): Record<string, unknown> {
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
    ise_giris: form.meslegeBaslangic || null,
    isten_cikis: form.endDate || null,
    meslege_baslangic: form.meslegeBaslangic || null,
    eklentiler: {
      employer_payment: form.employerPayment ?? "",
      meslege_baslangic: form.meslegeBaslangic ?? "",
      gazete_turu: "gunluk_olmayan",
    },
  };
}

const caseCrud = createCalcBackendCrud({
  recordType: YILLIK_BASIN_GUNLUK_OLMAYAN_TYPE,
  isRecordType: isYillikBasinGunlukOlmayanRecordType,
  mapFormFromBackend: mapYillikBasinGunlukOlmayanFormFromBackend,
  buildSaveData,
  localStorageKey: STORAGE_KEY,
});

function mapRecordToSavedCase(
  record: SavedCaseRecord,
): YillikSavedCase<YillikBasinGunlukOlmayanForm> | null {
  const form = mapYillikBasinGunlukOlmayanFormFromBackend(record.data, record);
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
      totalEntitlement: Number(results?.totalEntitlement ?? izinHesaplama?.izinGun ?? 0),
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

async function listCasesFromBackend(): Promise<YillikSavedCase<YillikBasinGunlukOlmayanForm>[]> {
  return listCalcSavedCases(YILLIK_BASIN_GUNLUK_OLMAYAN_TYPE, mapRecordToSavedCase);
}

export const yillikBasinGunlukOlmayanBackend = {
  recordType: YILLIK_BASIN_GUNLUK_OLMAYAN_TYPE,
  caseCrud,
  mapFormFromBackend: mapYillikBasinGunlukOlmayanFormFromBackend,
  listCasesFromBackend,
};

export function basinGunlukOlmayanSaveGate(result: {
  brutIzin: number;
  remainingDays: number;
  startDate: string;
  endDate: string;
}): { ok: true } | { ok: false; message: string } {
  if (!result.startDate?.trim()) {
    return { ok: false, message: "Mesleğe başlangıç tarihi gerekli" };
  }
  if (!result.endDate?.trim()) {
    return { ok: false, message: "İşten çıkış tarihi gerekli" };
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

export type BasinGunlukOlmayanSaveResult = CalcSaveResult;
