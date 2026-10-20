import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Basın İş Hafta Tatili CRUD.
 */
import type { SavedCaseRecord } from "@/api/savedCases";
import {
  createCalcBackendCrud,
  listCalcSavedCases,
  type CalcSaveResult,
} from "../../shared/calcBackendCrud";
import type { TableRow } from "../lib/types";
import { buildRowOverridesFromRows } from "../standard/backendCase";
import { buildBasinHtSaveData } from "./buildBasinHtSaveData";
import {
  mapLegacyBasinHaftaTatiliCase,
  resolveSavedCaseDisplayName,
} from "./legacyHaftaTatiliBasinCaseAdapter";
import type { BasinForm } from "./model";

export const HT_BASIN_TYPE = "hafta_tatili_basin_is" as const;

export function isHtBasinRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return (
    t === HT_BASIN_TYPE ||
    t === "hafta_tatili_basin" ||
    (t.includes("hafta") && t.includes("basin"))
  );
}

export function mapHtBasinFormFromBackend(
  data: unknown,
  record?: SavedCaseRecord,
): BasinForm | null {
  return mapLegacyBasinHaftaTatiliCase(data, record);
}

export const htBasinCaseCrud = createCalcBackendCrud<BasinForm>({
  recordType: HT_BASIN_TYPE,
  isRecordType: isHtBasinRecordType,
  mapFormFromBackend: mapHtBasinFormFromBackend,
  localStorageKey: STORAGE_KEY,
  buildSaveData: (form, result) => buildBasinHtSaveData(form, result),
});

export function buildHtBasinSaveResult(opts: {
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

export function mapHtBasinRecordToSavedCase(record: SavedCaseRecord): {
  id: string;
  name: string;
  form: BasinForm;
  updatedAt: string;
} | null {
  const form = mapHtBasinFormFromBackend(record.data, record);
  if (!form) return null;
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    form,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
  };
}

export async function listHtBasinCasesFromBackend(): Promise<
  { id: string; name: string; form: BasinForm; updatedAt: string }[]
> {
  return listCalcSavedCases(HT_BASIN_TYPE, (record) => mapHtBasinRecordToSavedCase(record));
}

export { buildRowOverridesFromRows };
