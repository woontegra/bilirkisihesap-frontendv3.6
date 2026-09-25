/**
 * V3/backend kayıt → Bakiye Ücret Alacağı form mapping.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildCalcSavePayload,
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../shared/calcBackendCrud";
import { STORAGE_KEY, createEmptyForm, newLocalId, type BakiyeForm, type BakiyeResults, type ExtraItem, type SavedCase } from "./model";
import { parseNum } from "./engine";

export const BAKIYE_UCRET_TYPE = "bakiye_ucret" as const;

export function isBakiyeUcretRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === BAKIYE_UCRET_TYPE || t.includes("bakiye");
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

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function mapBakiyeFormFromBackend(data: unknown): BakiyeForm | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    const extras = mapExtras(form.extras ?? form.extraItems);
    return {
      startDate: str(form.startDate ?? form.start_date) || empty.startDate,
      endDate: str(form.endDate ?? form.end_date) || empty.endDate,
      resignDate: str(form.resignDate ?? form.resign_date) || empty.resignDate,
      brut: str(form.brut ?? form.brutUcret ?? payload.brut_total) || empty.brut,
      extras,
    };
  } catch {
    return null;
  }
}

function buildFormPayload(form: BakiyeForm, monthly: number): Record<string, unknown> {
  return {
    ...form,
    monthly,
    extraItems: form.extras.map((e) => ({ id: e.id, name: e.label, value: e.value })),
  };
}

function monthlyFromForm(form: BakiyeForm): number {
  const base = parseNum(form.brut);
  const extras = form.extras.reduce((acc, item) => acc + parseNum(item.value), 0);
  return base + extras;
}

export const bakiyeUcretCaseCrud = createCalcBackendCrud({
  recordType: BAKIYE_UCRET_TYPE,
  isRecordType: isBakiyeUcretRecordType,
  mapFormFromBackend: mapBakiyeFormFromBackend,
  buildSaveData: (form, result) => {
    const monthly = monthlyFromForm(form);
    return buildCalcSavePayload({
      form: buildFormPayload(form, monthly),
      result,
      iseGiris: form.startDate || null,
      istenCikis: form.endDate || null,
      extra: {
        start_date: form.startDate || null,
        end_date: form.endDate || null,
        resign_date: form.resignDate || null,
        monthly,
        brut: form.brut,
        extraItems: form.extras.map((e) => ({ id: e.id, name: e.label, value: e.value })),
      },
    });
  },
  localStorageKey: STORAGE_KEY,
});

export function buildBakiyeSaveResult(
  results: BakiyeResults,
  opts: { netTotal?: number } = {},
): CalcSaveResult {
  const brut = results.totalAmount;
  const net = opts.netTotal ?? brut;
  return {
    brut,
    net,
    total: brut,
    totalAmount: brut,
    rows: results.rows,
    monthRows: results.monthRows,
    monthly: results.monthly,
    daily: results.monthly / 30,
    brutTotal: brut,
    netTotal: net,
  };
}

export function mapBakiyeRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapBakiyeFormFromBackend(record.data);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const monthly = Number(results?.monthly ?? payload.monthly ?? 0);
  const totalAmount = Number(results?.totalAmount ?? results?.total ?? payload.brut_total ?? 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    savedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: {
      rows: Array.isArray(results?.rows) ? (results.rows as BakiyeResults["rows"]) : [],
      monthRows: Array.isArray(results?.monthRows) ? (results.monthRows as BakiyeResults["monthRows"]) : [],
      totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
      monthly: Number.isFinite(monthly) ? monthly : 0,
    },
  };
}

export async function listBakiyeUcretCasesFromBackend(): Promise<SavedCase[]> {
  return listCalcSavedCases(BAKIYE_UCRET_TYPE, mapBakiyeRecordToSavedCase);
}
