import { storageKeyFor } from "./model";
/**
 * V3/backend kayıt → İcra Takip Brütten Nete form mapping.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildCalcSavePayload,
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../shared/calcBackendCrud";
import { createEmptyForm, type IcraForm, type IcraResults, type IcraVariant, type SavedCase } from "./model";

const VARIANT_TYPES: Record<IcraVariant, string> = {
  damga: "icra_takip_damga_vergisi_kesintili",
  "gelir-damga": "icra_takip_gelir_ve_damga_vergisi_kesintili",
  "istisnali-full": "icra_takip_istisnali_full_kesintili",
  "istisnasiz-full": "icra_takip_istisnasiz_full_kesintili",
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

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function mapIcraFormFromBackend(data: unknown): IcraForm | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    const periodRaw = form.period ?? form.donem;
    const period = periodRaw === 1 || periodRaw === "1" ? 1 : 2;
    const faizRaw = form.faizTuru ?? form.faiz_turu;
    const faizTuru = faizRaw === "en_yuksek_mevduat" ? "en_yuksek_mevduat" : "yasal";
    return {
      grossForNet:
        str(form.grossForNet ?? form.gross_for_net ?? form.brutAlacak ?? form.brut) || empty.grossForNet,
      year: num(form.year ?? form.yil, empty.year),
      period,
      faizBaslangic:
        str(form.faizBaslangic ?? form.faizBaslangicTarihi ?? form.faiz_baslangic) || empty.faizBaslangic,
      icraTakip: str(form.icraTakip ?? form.icraTakipTarihi ?? form.icra_takip) || empty.icraTakip,
      faizTuru,
    };
  } catch {
    return null;
  }
}

function buildFormPayload(form: IcraForm): Record<string, unknown> {
  return {
    ...form,
    grossForNet: form.grossForNet,
    faizBaslangicTarihi: form.faizBaslangic || null,
    icraTakipTarihi: form.icraTakip || null,
    faizTuru: form.faizTuru,
    year: form.year,
    period: form.period,
  };
}

type IcraCaseCrud = ReturnType<typeof createCalcBackendCrud<IcraForm>>;

const crudByVariant = new Map<IcraVariant, IcraCaseCrud>();

export function getIcraCaseCrud(variant: IcraVariant): IcraCaseCrud {
  let crud = crudByVariant.get(variant);
  if (!crud) {
    const recordType = VARIANT_TYPES[variant];
    crud = createCalcBackendCrud<IcraForm>({
      recordType,
      isRecordType: (t) => t === recordType,
      mapFormFromBackend: mapIcraFormFromBackend,
      buildSaveData: (form, result) =>
        buildCalcSavePayload({
          form: buildFormPayload(form),
          result,
          iseGiris: form.faizBaslangic || null,
          istenCikis: form.icraTakip || null,
          extra: {
            start_date: form.faizBaslangic || null,
            end_date: form.icraTakip || null,
            total: result.net,
          },
        }),
      localStorageKey: storageKeyFor(variant),
    });
    crudByVariant.set(variant, crud);
  }
  return crud;
}

export function buildIcraSaveResult(
  grossVal: number,
  results: IcraResults,
): CalcSaveResult {
  return {
    brut: grossVal,
    net: results.takipToplami,
    netTutar: results.netTutar,
    totalInterest: results.totalInterest,
    takipToplami: results.takipToplami,
    totalDays: results.totalDays,
  };
}

function variantFromRecordType(type: string | undefined | null): IcraVariant | null {
  if (!type) return null;
  const entry = Object.entries(VARIANT_TYPES).find(([, v]) => v === type);
  return entry ? (entry[0] as IcraVariant) : null;
}

export function mapIcraRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const variant = variantFromRecordType(record.type ?? record.hesaplama_tipi);
  if (!variant) return null;
  const form = mapIcraFormFromBackend(record.data);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const netTutar = num(results?.netTutar ?? results?.net ?? payload.net_total, 0);
  const totalInterest = num(results?.totalInterest ?? results?.faiz, 0);
  const takipToplami = num(results?.takipToplami ?? payload.total ?? payload.net_total, netTutar);
  const totalDays = num(results?.totalDays ?? results?.gunSayisi, 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    variant,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: { netTutar, totalInterest, takipToplami, totalDays },
  };
}

export async function listIcraCasesFromBackend(variant: IcraVariant): Promise<SavedCase[]> {
  const all = await listCalcSavedCases(VARIANT_TYPES[variant], mapIcraRecordToSavedCase);
  return all.filter((c) => c.variant === variant);
}
