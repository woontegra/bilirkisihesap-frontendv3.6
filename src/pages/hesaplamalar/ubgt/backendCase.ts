/**
 * V3 backend kayıt → UBGT form CRUD (standart / bilirkişi).
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  createCalcBackendCrud,
  listCalcSavedCases,
  unwrapCalcData,
  type CalcSaveResult,
} from "../shared/calcBackendCrud";
import {
  detectUbgtModeFromType,
  mapLegacyExpertUbgtCase,
  mapLegacyStandardUbgtCase,
  resolveSavedCaseDisplayName,
} from "./legacyUbgtCaseAdapter";
import { STORAGE_KEY, type SavedCase, type UbgtForm, type UbgtResults } from "./model";
import { buildStandartUbgtSaveData } from "./standart/buildStandartUbgtSaveData";
import { buildBilirkisiUbgtSaveData } from "./bilirkisi/buildBilirkisiUbgtSaveData";

export const UBGT_STANDART_TYPE = "ubgt_alacagi" as const;
export const UBGT_BILIRKISI_TYPE = "ubgt_bilirkisi" as const;

export function getUbgtRecordType(mode: UbgtForm["mode"]): string {
  return mode === "bilirkisi" ? UBGT_BILIRKISI_TYPE : UBGT_STANDART_TYPE;
}

export function isUbgtRecordType(type: string | undefined | null, mode: UbgtForm["mode"]): boolean {
  return getUbgtRecordType(mode) === type;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function mapUbgtFormFromBackend(
  mode: UbgtForm["mode"],
  data: unknown,
  record?: SavedCaseRecord,
): UbgtForm | null {
  const mapped =
    mode === "bilirkisi"
      ? mapLegacyExpertUbgtCase(data, record)
      : mapLegacyStandardUbgtCase(data, record);
  if (!mapped) return null;
  return { ...mapped.form, mode };
}

function createUbgtCrud(mode: UbgtForm["mode"]) {
  const recordType = getUbgtRecordType(mode);
  return createCalcBackendCrud({
    recordType,
    isRecordType: (t) => isUbgtRecordType(t, mode),
    mapFormFromBackend: (data, record) => mapUbgtFormFromBackend(mode, data, record),
    buildSaveData: (form, result) =>
      mode === "standart"
        ? buildStandartUbgtSaveData(form, result)
        : buildBilirkisiUbgtSaveData(form, result),
    localStorageKey: STORAGE_KEY,
  });
}

export const ubgtStandartCaseCrud = createUbgtCrud("standart");
export const ubgtBilirkisiCaseCrud = createUbgtCrud("bilirkisi");

export function getUbgtCaseCrud(mode: UbgtForm["mode"]) {
  return mode === "bilirkisi" ? ubgtBilirkisiCaseCrud : ubgtStandartCaseCrud;
}

export function buildUbgtSaveResult(results: UbgtResults): CalcSaveResult {
  const netAmount =
    typeof results.toplamNet === "object" && results.toplamNet !== null
      ? Number((results.toplamNet as { netAmount?: number }).netAmount ?? 0)
      : Number(results.toplamNet ?? 0);
  return {
    brut: results.toplamBrut,
    net: netAmount,
    toplamBrut: results.toplamBrut,
    toplamNet: results.toplamNet,
    totalDays: results.totalDays,
  };
}

export function mapUbgtRecordToSavedCase(mode: UbgtForm["mode"], record: SavedCaseRecord): SavedCase | null {
  const form = mapUbgtFormFromBackend(mode, record.data, record);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const toplamBrut = Number(results?.toplamBrut ?? payload.brut_total ?? results?.brut ?? 0);
  const totalDays = Number(results?.totalDays ?? 0);
  const toplamNetRaw = results?.toplamNet ?? results?.net;
  const netAmount =
    typeof toplamNetRaw === "object" && toplamNetRaw !== null
      ? Number((toplamNetRaw as { netAmount?: number }).netAmount ?? 0)
      : Number(toplamNetRaw ?? payload.net_total ?? 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    savedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    results: {
      periods: [],
      ubgtDayEntries: [],
      toplamBrut: Number.isFinite(toplamBrut) ? toplamBrut : 0,
      toplamNet: {
        ssk: 0,
        issizlik: 0,
        gelirVergisi: 0,
        gelirVergisiDilimleri: "",
        damgaVergisi: 0,
        netAmount: Number.isFinite(netAmount) ? netAmount : 0,
      },
      totalDays: Number.isFinite(totalDays) ? totalDays : 0,
    },
  };
}

export async function listUbgtCasesFromBackend(mode: UbgtForm["mode"]): Promise<SavedCase[]> {
  return listCalcSavedCases(getUbgtRecordType(mode), (record) => {
    const detected = detectUbgtModeFromType(record.type ?? record.hesaplama_tipi);
    if (detected && detected !== mode) return null;
    return mapUbgtRecordToSavedCase(mode, record);
  });
}
