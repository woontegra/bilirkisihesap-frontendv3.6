import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Prim Alacağı form mapping.
 * Yalnızca form alanlarını doldurur; sonucu backend'den almaz (lokal motor yeniden hesaplar).
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildCalcSavePayload,
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../shared/calcBackendCrud";
import type { PrimForm, PrimRow, SavedCase } from "./model";
import { createEmptyForm, newLocalId } from "./model";

export const PRIM_ALACAGI_TYPE = "prim_alacagi" as const;

export function isPrimAlacagiRecordType(type: string | undefined | null): boolean {
  return type === PRIM_ALACAGI_TYPE;
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

function mapRows(raw: unknown): PrimRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((r) => {
    const rec = asRecord(r) ?? {};
    return {
      id: str(rec.id) || newLocalId(),
      principal: str(rec.principal),
      percent: str(rec.percent),
    };
  });
}

/** Backend data → lokal form. Bozuksa null. */
export function mapPrimFormFromBackend(data: unknown): PrimForm | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    const rows = mapRows(form.rows);
    return {
      rows: rows.length > 0 ? rows : empty.rows,
      brutInputForNet: str(form.brutInputForNet) || empty.brutInputForNet,
    };
  } catch {
    return null;
  }
}

export const primAlacagiCaseCrud = createCalcBackendCrud({
  recordType: PRIM_ALACAGI_TYPE,
  isRecordType: isPrimAlacagiRecordType,
  mapFormFromBackend: mapPrimFormFromBackend,
  buildSaveData: (form, result) => buildCalcSavePayload({ form, result }),
  localStorageKey: STORAGE_KEY,
});

export function buildPrimAlacagiSaveResult(total: number, netTotal: number): CalcSaveResult {
  return { brut: total, net: netTotal, total, netTotal };
}

export function mapPrimAlacagiRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapPrimFormFromBackend(record.data);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const total = Number(results?.total ?? payload.brut_total ?? results?.brut ?? 0);
  const netTotal = Number(results?.netTotal ?? results?.net ?? payload.net_total ?? 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: {
      total: Number.isFinite(total) ? total : 0,
      netTotal: Number.isFinite(netTotal) ? netTotal : 0,
    },
  };
}

export async function listPrimAlacagiCasesFromBackend(): Promise<SavedCase[]> {
  return listCalcSavedCases(PRIM_ALACAGI_TYPE, mapPrimAlacagiRecordToSavedCase);
}
