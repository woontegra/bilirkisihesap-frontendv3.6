/**
 * V3/backend kayıt → Standart Hafta Tatili CRUD.
 */
import type { SavedCaseRecord } from "@/api/savedCases";
import {
  createCalcBackendCrud,
  listCalcSavedCases,
  type CalcSaveResult,
} from "../../shared/calcBackendCrud";
import type { TableRow } from "../lib/types";
import { buildStandartHtSaveData } from "./buildStandartHtSaveData";
import {
  mapLegacyStandardHaftaTatiliCase,
  resolveSavedCaseDisplayName,
} from "./legacyHaftaTatiliCaseAdapter";
import type { StandardForm } from "./model";
import { STORAGE_KEY } from "./storage";

export const HT_STANDART_TYPE = "hafta_tatili_standart" as const;

export function isHtStandartRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t === HT_STANDART_TYPE || (t.includes("hafta") && t.includes("standart"));
}

export function mapHtStandartFormFromBackend(
  data: unknown,
  record?: SavedCaseRecord,
): StandardForm | null {
  return mapLegacyStandardHaftaTatiliCase(data, record);
}

export const htStandartCaseCrud = createCalcBackendCrud<StandardForm>({
  recordType: HT_STANDART_TYPE,
  isRecordType: isHtStandartRecordType,
  mapFormFromBackend: mapHtStandartFormFromBackend,
  buildSaveData: (form, result) => buildStandartHtSaveData(form, result),
  localStorageKey: STORAGE_KEY,
});

export function buildHtStandartSaveResult(opts: {
  totalBrut: number;
  netAmount: number;
  rows: TableRow[];
  hakkaniyet: number;
  settleAmount: string;
  net: {
    ssk: number;
    issizlik: number;
    gelirVergisi: number;
    gelirVergisiDilimleri: string;
    damgaVergisi: number;
    netAmount: number;
  };
  globalCoefficient: number;
  rowOverrides?: Record<string, unknown>;
}): CalcSaveResult {
  return {
    brut: opts.totalBrut,
    net: opts.netAmount,
    toplamBrut: opts.totalBrut,
    v3Periods: opts.rows,
    katsayi: opts.globalCoefficient,
    totalDays: 0,
    rowOverrides: opts.rowOverrides,
    netConversion: {
      brut: opts.totalBrut,
      ssk: opts.net.ssk,
      issizlik: opts.net.issizlik,
      gelir: opts.net.gelirVergisi,
      gelirDilimleri: opts.net.gelirVergisiDilimleri,
      damga: opts.net.damgaVergisi,
      net: opts.net.netAmount,
      hakkaniyet: opts.hakkaniyet,
      settleAmount: opts.settleAmount,
    },
  };
}

export function mapHtStandartRecordToSavedCase(record: SavedCaseRecord): {
  id: string;
  name: string;
  form: StandardForm;
  updatedAt: string;
} | null {
  const form = mapHtStandartFormFromBackend(record.data, record);
  if (!form) return null;
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    form,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
  };
}

export async function listHtStandartCasesFromBackend(): Promise<
  { id: string; name: string; form: StandardForm; updatedAt: string }[]
> {
  return listCalcSavedCases(HT_STANDART_TYPE, (record) => mapHtStandartRecordToSavedCase(record));
}

export function buildRowOverridesFromRows(rows: TableRow[]): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  rows.forEach((row, index) => {
    if (row.brutManual && row.wage > 0) {
      out[String(index)] = { brut: row.wage, wage: row.wage, brutManual: true };
    }
  });
  return Object.keys(out).length > 0 ? out : undefined;
}
