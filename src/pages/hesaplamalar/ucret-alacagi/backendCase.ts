import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Ücret Alacağı form mapping.
 * Yalnızca form alanlarını doldurur; sonucu backend'den almaz (lokal motor yeniden hesaplar).
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../shared/calcBackendCrud";
import { applyNetCetvelFromCetvelRows } from "./engine";
import { buildUcretAlacagiSaveData } from "./buildUcretAlacagiSaveData";
import type { CetvelRow, HesaplamaTab, SavedCase, UcretAlacagiForm } from "./model";
import { createEmptyForm, newLocalId } from "./model";

export const UCRET_ALACAGI_TYPE = "ucret_alacagi" as const;

export function isUcretAlacagiRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === UCRET_ALACAGI_TYPE || t === "ucret alacagi" || t.includes("ucret_alacagi");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function resolveFormSource(payload: Record<string, unknown>): Record<string, unknown> {
  const dataNested = asRecord(payload.data);
  const formFromData = asRecord(dataNested?.form);
  const formTop = asRecord(payload.form);
  const formInner = asRecord(formTop?.form);
  return formInner ?? formFromData ?? formTop ?? dataNested ?? payload;
}

function mapRows(raw: unknown): CetvelRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const rec = asRecord(r) ?? {};
      const startISO = str(rec.startISO ?? rec.start ?? "");
      const endISO = str(rec.endISO ?? rec.end ?? "");
      return {
        id: str(rec.id || newLocalId("row")),
        rangeLabel: str(rec.rangeLabel ?? ""),
        startISO,
        endISO,
        katsayi: Number(rec.katsayi ?? 1) || 1,
        ucret: Number(rec.ucret ?? 0) || 0,
        gunSayisi: Number(rec.gunSayisi ?? rec.days ?? 0) || 0,
        ayGunSayisi: Number(rec.ayGunSayisi ?? 30) || 30,
        ucretManual: Boolean(rec.ucretManual),
        odenenUcret: Number(rec.odenenUcret ?? rec.odenen_ucret ?? 0) || 0,
        netVerisiYok: rec.netVerisiYok != null ? Boolean(rec.netVerisiYok) : undefined,
      } as CetvelRow;
    })
    .filter((r) => !!r.startISO);
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

/** Backend data → lokal form. Bozuksa null. */
export function mapUcretAlacagiFormFromBackend(
  data: unknown,
  _record?: SavedCaseRecord,
): UcretAlacagiForm | null {
  try {
    const payload = unwrapCalcData(data);
    const formSource = resolveFormSource(payload);
    const results = asRecord(payload.results) ?? asRecord(asRecord(payload.data)?.results);
    const empty = createEmptyForm();

    const activeTab: HesaplamaTab = formSource.activeTab === "net" ? "net" : "brut";
    const globalKatsayi = Number(formSource.globalKatsayi ?? 1) || 1;
    const netGlobalKatsayi = Number(formSource.netGlobalKatsayi ?? 1) || 1;

    let cetvelRows = mapRows(formSource.cetvelRows ?? formSource.rows);
    if (cetvelRows.length === 0) {
      cetvelRows = mapRows(results?.rows);
    }

    let netCetvelRows = mapRows(formSource.netCetvelRows);
    if (netCetvelRows.length === 0 && cetvelRows.length > 0) {
      netCetvelRows = applyNetCetvelFromCetvelRows([], cetvelRows, netGlobalKatsayi);
    }

    return {
      startDate: str(formSource.startDate) || empty.startDate,
      endDate: str(formSource.endDate) || empty.endDate,
      activeTab,
      cetvelRows,
      netCetvelRows,
      globalKatsayi,
      netGlobalKatsayi,
      hasCustomKatsayi: globalKatsayi !== 1,
      netHasCustomKatsayi: netGlobalKatsayi !== 1,
      netForGross: empty.netForGross,
      netTabGrossForNet: empty.netTabGrossForNet,
    };
  } catch {
    return null;
  }
}

export const ucretAlacagiCaseCrud = createCalcBackendCrud({
  recordType: UCRET_ALACAGI_TYPE,
  isRecordType: isUcretAlacagiRecordType,
  mapFormFromBackend: mapUcretAlacagiFormFromBackend,
  buildSaveData: (form, result) => buildUcretAlacagiSaveData(form, result),
  localStorageKey: STORAGE_KEY,
});

export function buildUcretAlacagiSaveResult(totalBrut: number, totalNet: number): CalcSaveResult {
  return { brut: totalBrut, net: totalNet, totalBrut, totalNet };
}

export function mapUcretAlacagiRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapUcretAlacagiFormFromBackend(record.data, record);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const totalBrut = Number(payload.brut_total ?? results?.brut ?? results?.totalBrut ?? 0);
  const totalNet = Number(payload.net_total ?? results?.net ?? results?.totalNet ?? 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: {
      totalBrut: Number.isFinite(totalBrut) ? totalBrut : 0,
      totalNet: Number.isFinite(totalNet) ? totalNet : 0,
    },
  };
}

export async function listUcretAlacagiCasesFromBackend(): Promise<SavedCase[]> {
  return listCalcSavedCases(UCRET_ALACAGI_TYPE, mapUcretAlacagiRecordToSavedCase);
}
