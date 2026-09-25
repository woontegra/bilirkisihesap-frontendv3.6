import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Boşta Geçen Süre Ücreti form mapping.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildCalcSavePayload,
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../shared/calcBackendCrud";
import type { BostaForm, ExtraItem, SavedCase } from "./model";
import { createEmptyForm, newLocalId } from "./model";

export const BOSTA_GECEN_SURE_TYPE = "bosta_gecen_sure_ucreti" as const;

export function isBostaGecenSureRecordType(type: string | undefined | null): boolean {
  return type === BOSTA_GECEN_SURE_TYPE;
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

function mapExtras(raw: unknown): ExtraItem[] {
  const empty = createEmptyForm().extras;
  if (!Array.isArray(raw)) return empty;
  const mapped = raw
    .map((item, index) => {
      const row = asRecord(item);
      if (!row) return null;
      const label = str(row.label ?? row.name);
      const value = str(row.value);
      if (!label && !value) return null;
      return {
        id: str(row.id) || newLocalId(`extra-${index}`),
        label: label || "Kalem",
        value,
      };
    })
    .filter((row): row is ExtraItem => row !== null);
  return mapped.length ? mapped : empty;
}

function buildFormPayload(form: BostaForm): Record<string, unknown> {
  return {
    ...form,
    istenCikis: form.endDate,
    extraItems: form.extras.map((e) => ({ id: e.id, name: e.label, value: e.value })),
  };
}

export function mapBostaFormFromBackend(data: unknown): BostaForm | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    const extras = mapExtras(form.extras ?? form.extraItems);
    return {
      endDate: str(form.endDate ?? form.istenCikis) || empty.endDate,
      brut: str(form.brut ?? form.brutUcret) || empty.brut,
      prim: str(form.prim) || empty.prim,
      ikramiye: str(form.ikramiye) || empty.ikramiye,
      yol: str(form.yol) || empty.yol,
      yemek: str(form.yemek) || empty.yemek,
      extras,
    };
  } catch {
    return null;
  }
}

export const bostaGecenSureCaseCrud = createCalcBackendCrud({
  recordType: BOSTA_GECEN_SURE_TYPE,
  isRecordType: isBostaGecenSureRecordType,
  mapFormFromBackend: mapBostaFormFromBackend,
  buildSaveData: (form, result) =>
    buildCalcSavePayload({
      form: buildFormPayload(form),
      result,
      istenCikis: form.endDate || null,
    }),
  localStorageKey: STORAGE_KEY,
});

export function buildBostaGecenSureSaveResult(result: {
  toplamBrut: number;
  brutAmount: number;
  netAmount: number;
}): CalcSaveResult {
  return {
    brut: result.brutAmount,
    net: result.netAmount,
    toplamBrut: result.toplamBrut,
    brutAmount: result.brutAmount,
    netAmount: result.netAmount,
  };
}

export function mapBostaGecenSureRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapBostaFormFromBackend(record.data);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const toplamBrut = Number(results?.toplamBrut ?? payload.brut_total ?? 0);
  const brutAmount = Number(results?.brutAmount ?? results?.brut ?? payload.brut_total ?? 0);
  const netAmount = Number(results?.netAmount ?? results?.net ?? payload.net_total ?? 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: {
      toplamBrut: Number.isFinite(toplamBrut) ? toplamBrut : 0,
      brutAmount: Number.isFinite(brutAmount) ? brutAmount : 0,
      netAmount: Number.isFinite(netAmount) ? netAmount : 0,
    },
  };
}

export async function listBostaGecenSureCasesFromBackend(): Promise<SavedCase[]> {
  return listCalcSavedCases(BOSTA_GECEN_SURE_TYPE, mapBostaGecenSureRecordToSavedCase);
}
