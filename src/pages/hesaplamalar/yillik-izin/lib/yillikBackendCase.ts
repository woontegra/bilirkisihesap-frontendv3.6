/**
 * Yıllık Ücretli İzin — V3/backend kayıt mapping fabrikası.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../../shared/calcBackendCrud";
import { normalizeUsedRows } from "./core";
import type { UsedLeaveRow, YillikResultSnapshot } from "./types";

export const YILLIK_STANDART_TYPE = "yillik_izin_standart" as const;

export type YillikSavedCase<TForm> = {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  form: TForm;
  results: YillikResultSnapshot;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function unwrapYillikBackendData(data: unknown): Record<string, unknown> {
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

export function pickYillikBackendForm(payload: Record<string, unknown>): Record<string, unknown> {
  return asRecord(payload.form) ?? asRecord(payload.formValues) ?? payload;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** YYYY-MM-DD veya GG.AA.YYYY → YYYY-MM-DD */
export function normalizeDateInput(value: unknown): string {
  const v = str(value).trim();
  if (!v) return "";
  const iso = v.includes("T") ? v.split("T")[0] : v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  if (iso.includes(".")) {
    const [gun, ay, yil] = iso.split(".");
    if (gun && ay && yil && yil.length === 4) {
      return `${yil}-${ay.padStart(2, "0")}-${gun.padStart(2, "0")}`;
    }
  }
  return iso;
}

export function mapUsedRows(raw: unknown): UsedLeaveRow[] {
  if (!Array.isArray(raw)) return normalizeUsedRows([], 7);
  return normalizeUsedRows(
    raw.map((row) => {
      const r = asRecord(row);
      return {
        id: str(r?.id) || Math.random().toString(36).slice(2),
        start: normalizeDateInput(r?.start),
        end: normalizeDateInput(r?.end),
        days: r?.days != null ? String(r.days) : "",
      };
    }),
    7,
  );
}

export function resolveYillikSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function isYillikStandartRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === YILLIK_STANDART_TYPE || (t.includes("yillik") && t.includes("standart"));
}

export const YILLIK_BORCLAR_TYPE = "yillik_izin_borclar" as const;

export type YillikStandartSaveResult = CalcSaveResult & {
  breakdown?: Record<string, unknown>;
  usedTotal?: number;
  remainingDays?: number;
  totalEntitlement?: number;
  sgk?: number;
  issizlik?: number;
  gelirVergisi?: number;
  damgaVergisi?: number;
};

export function buildYillikStandartSaveResult(result: {
  brutIzin: number;
  netIzin: number;
  totalEntitlement: number;
  remainingDays: number;
  usedTotal: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  damgaVergisi: number;
  breakdown?: Record<string, unknown>;
}): YillikStandartSaveResult {
  return {
    brut: result.brutIzin,
    net: result.netIzin,
    brutIzin: result.brutIzin,
    netIzin: result.netIzin,
    totalEntitlement: result.totalEntitlement,
    remainingDays: result.remainingDays,
    usedTotal: result.usedTotal,
    sgk: result.sgk,
    issizlik: result.issizlik,
    gelirVergisi: result.gelirVergisi,
    damgaVergisi: result.damgaVergisi,
    breakdown: result.breakdown,
  };
}

export function isYillikBorclarRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === YILLIK_BORCLAR_TYPE || (t.includes("yillik") && t.includes("borclar"));
}

export function createYillikBackendCase<
  TForm extends {
    startDate: string;
    endDate: string;
    brut: string;
    usedRows: UsedLeaveRow[];
    employerPayment?: string;
    is18Or50: boolean;
    isUnderground?: boolean;
  },
>(opts: {
  recordType: string;
  isRecordType: (type: string | undefined | null) => boolean;
  hesaplamaTipi?: string;
  normalizeForm: (raw: Partial<TForm> | null | undefined) => TForm;
  normalizeResults: (raw: Partial<YillikResultSnapshot> | null | undefined) => YillikResultSnapshot;
  toV3Form?: (form: TForm) => Record<string, unknown>;
  localStorageKey?: string;
}) {
  const { recordType, isRecordType, normalizeForm, normalizeResults, localStorageKey } = opts;
  const hesaplamaTipi = opts.hesaplamaTipi ?? "Yıllık Ücretli İzin";

  function defaultToV3Form(form: TForm): Record<string, unknown> {
    const base: Record<string, unknown> = {
      iseGiris: form.startDate,
      istenCikis: form.endDate,
      brutUcret: form.brut,
      rows: form.usedRows,
      employerPayment: form.employerPayment ?? "",
      is18Or50: form.is18Or50,
      startDate: form.startDate,
      endDate: form.endDate,
      brut: form.brut,
      usedRows: form.usedRows,
    };
    if ("isUnderground" in form) {
      base.isUnderground = !!(form as { isUnderground?: boolean }).isUnderground;
    }
    return base;
  }

  const toV3Form = opts.toV3Form ?? defaultToV3Form;

  function mapFormFromBackend(
    data: unknown,
    record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
  ): TForm | null {
    try {
      const payload = unwrapYillikBackendData(data);
      const form = pickYillikBackendForm(payload);
      const eklentiler = asRecord(payload.eklentiler);
      return normalizeForm({
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
        is18Or50: !!(form.is18Or50 ?? form.is_18_or_50),
        isUnderground: !!(form.isUnderground ?? form.is_underground),
      } as Partial<TForm>);
    } catch {
      return null;
    }
  }

  function toV3FormLocal(form: TForm): Record<string, unknown> {
    return toV3Form(form);
  }

  function buildSaveData(form: TForm, result: YillikStandartSaveResult): Record<string, unknown> {
    return {
      form: toV3FormLocal(form),
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
      hesaplama_tipi: hesaplamaTipi,
      brut_toplam: result.brut,
      net_toplam: result.net,
      ise_giris: form.startDate || null,
      isten_cikis: form.endDate || null,
      eklentiler: { employer_payment: form.employerPayment ?? "" },
    };
  }

  const caseCrud = createCalcBackendCrud({
    recordType,
    isRecordType,
    mapFormFromBackend,
    buildSaveData,
    localStorageKey,
  });

  function mapRecordToSavedCase(record: SavedCaseRecord): YillikSavedCase<TForm> | null {
    const form = mapFormFromBackend(record.data, record);
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

  async function listCasesFromBackend(): Promise<YillikSavedCase<TForm>[]> {
    return listCalcSavedCases(recordType, mapRecordToSavedCase);
  }

  return { recordType, caseCrud, mapFormFromBackend, listCasesFromBackend, mapRecordToSavedCase };
}

/** @deprecated use createYillikBackendCase */
export const createYillikStandartBackendCase = createYillikBackendCase;
