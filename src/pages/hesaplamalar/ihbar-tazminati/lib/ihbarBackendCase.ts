/**
 * İhbar Tazminatı — tüm varyantlar için V3/backend kayıt mapping fabrikası.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildCalcSavePayload,
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../../shared/calcBackendCrud";
import type { ExtraItem, IhbarResultSnapshot } from "./types";

export const IHBAR_30ISCI_TYPE = "ihbar_30isci" as const;
export const IHBAR_KISMI_TYPE = "ihbar_kismi" as const;
export const IHBAR_MEVSIM_TYPE = "ihbar_mevsim" as const;
export const IHBAR_GEMI_TYPE = "ihbar_gemi" as const;
export const IHBAR_BASIN_TYPE = "ihbar_basin" as const;
export const IHBAR_BELIRLI_TYPE = "ihbar_belirli" as const;
export const IHBAR_BORCLAR_TYPE = "ihbar_borclar" as const;

export type IhbarStandardForm = {
  startDate: string;
  endDate: string;
  brut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  extras: ExtraItem[];
};

export type IhbarSavedCase<TForm> = {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  form: TForm;
  results: IhbarResultSnapshot;
};

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

export function resolveIhbarSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function buildIhbarSaveResult(result: {
  toplamBrut: number;
  brut: number;
  gelirVergisi: number;
  damgaVergisi: number;
  net: number;
}): CalcSaveResult {
  return {
    brut: result.brut,
    net: result.net,
    toplamBrut: result.toplamBrut,
    gelirVergisi: result.gelirVergisi,
    damgaVergisi: result.damgaVergisi,
  };
}

function mapStandardFields(
  form: Record<string, unknown>,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): Partial<IhbarStandardForm> {
  return {
    startDate: str(form.startDate ?? form.iseGiris ?? record?.ise_giris),
    endDate: str(form.endDate ?? form.exitDate ?? form.istenCikis ?? record?.isten_cikis),
    brut: str(form.brut ?? form.brutUcret),
    prim: str(form.prim),
    ikramiye: str(form.ikramiye),
    yol: str(form.yol),
    yemek: str(form.yemek),
    extras: Array.isArray(form.extras) ? (form.extras as ExtraItem[]) : [],
  };
}

function toV3CompatibleForm<TForm extends IhbarStandardForm>(form: TForm): Record<string, unknown> {
  return {
    ...form,
    brutUcret: form.brut,
    iseGiris: form.startDate,
    istenCikis: form.endDate,
    exitDate: form.endDate,
  };
}

export function createIhbarVariantBackendCase<TForm extends IhbarStandardForm>(opts: {
  recordType: string;
  normalizeForm: (raw: Partial<TForm> | undefined | null) => TForm;
  normalizeResults: (raw: Partial<IhbarResultSnapshot> | undefined | null) => IhbarResultSnapshot;
  mapExtraFormFields?: (
    form: Record<string, unknown>,
    record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
  ) => Partial<TForm>;
  extendV3Form?: (form: TForm) => Record<string, unknown>;
  localStorageKey?: string;
}) {
  const { recordType, normalizeForm, normalizeResults, mapExtraFormFields, extendV3Form, localStorageKey } =
    opts;

  function mapFormFromBackend(
    data: unknown,
    record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
  ): TForm | null {
    try {
      const payload = unwrapData(data);
      const form = pickForm(payload);
    return normalizeForm({
      ...mapStandardFields(form, record),
      ...(mapExtraFormFields?.(form, record) ?? {}),
    } as Partial<TForm>);
    } catch {
      return null;
    }
  }

  const caseCrud = createCalcBackendCrud({
    recordType,
    isRecordType: (type) => type === recordType,
    mapFormFromBackend,
    buildSaveData: (form, result) =>
      buildCalcSavePayload({
        form: extendV3Form ? extendV3Form(form) : toV3CompatibleForm(form),
        result,
        iseGiris: form.startDate || null,
        istenCikis: form.endDate || null,
      }),
    localStorageKey,
  });

  function mapRecordToSavedCase(record: SavedCaseRecord): IhbarSavedCase<TForm> | null {
    const form = mapFormFromBackend(record.data, record);
    if (!form) return null;
    const payload = unwrapCalcData(record.data);
    const results = asRecord(payload.results);
    const totals = asRecord(results?.totals);
    const brut = Number(results?.brut ?? payload.brut_total ?? payload.brutIhbar ?? 0);
    const net = Number(results?.net ?? payload.net_total ?? payload.netIhbar ?? 0);
    const toplamBrut = Number(totals?.toplam ?? results?.toplamBrut ?? payload.brut_total ?? brut);
    const gelirVergisi = Number(results?.gelirVergisi ?? 0);
    const damgaVergisi = Number(results?.damgaVergisi ?? 0);
    return {
      id: String(record.id),
      name: resolveIhbarSavedCaseDisplayName(record),
      version: 1,
      updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
      form,
      results: normalizeResults({
        toplamBrut: Number.isFinite(toplamBrut) ? toplamBrut : 0,
        brut: Number.isFinite(brut) ? brut : 0,
        gelirVergisi: Number.isFinite(gelirVergisi) ? gelirVergisi : 0,
        damgaVergisi: Number.isFinite(damgaVergisi) ? damgaVergisi : 0,
        net: Number.isFinite(net) ? net : 0,
      }),
    };
  }

  async function listCasesFromBackend(): Promise<IhbarSavedCase<TForm>[]> {
    return listCalcSavedCases(recordType, mapRecordToSavedCase);
  }

  return { recordType, caseCrud, mapFormFromBackend, listCasesFromBackend, mapRecordToSavedCase };
}
