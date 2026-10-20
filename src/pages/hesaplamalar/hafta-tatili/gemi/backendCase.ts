import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Gemi Adamı Hafta Tatili CRUD.
 */
import type { SavedCaseRecord } from "@/api/savedCases";
import {
  createCalcBackendCrud,
  listCalcSavedCases,
  type CalcSaveResult,
} from "../../shared/calcBackendCrud";
import type { TableRow } from "../lib/types";
import { buildRowOverridesFromRows } from "../standard/backendCase";
import { buildGemiHtSaveData } from "./buildGemiHtSaveData";
import {
  mapLegacyGemiHaftaTatiliCase,
  resolveSavedCaseDisplayName,
} from "./legacyHaftaTatiliGemiCaseAdapter";
import type { GemiForm } from "./model";

export const HT_GEMI_TYPE = "hafta_tatili_gemi_adami" as const;

export function isHtGemiRecordType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return (
    t === HT_GEMI_TYPE ||
    t === "hafta_tatili_gemi" ||
    (t.includes("hafta") && t.includes("gemi"))
  );
}

export function mapHtGemiFormFromBackend(
  data: unknown,
  record?: SavedCaseRecord,
): GemiForm | null {
  return mapLegacyGemiHaftaTatiliCase(data, record);
}

export const htGemiCaseCrud = createCalcBackendCrud<GemiForm>({
  recordType: HT_GEMI_TYPE,
  isRecordType: isHtGemiRecordType,
  mapFormFromBackend: mapHtGemiFormFromBackend,
  localStorageKey: STORAGE_KEY,
  buildSaveData: (form, result) => buildGemiHtSaveData(form, result),
});

export function buildHtGemiSaveResult(opts: {
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

export function mapHtGemiRecordToSavedCase(record: SavedCaseRecord): {
  id: string;
  name: string;
  form: GemiForm;
  updatedAt: string;
} | null {
  const form = mapHtGemiFormFromBackend(record.data, record);
  if (!form) return null;
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    form,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
  };
}

export async function listHtGemiCasesFromBackend(): Promise<
  { id: string; name: string; form: GemiForm; updatedAt: string }[]
> {
  return listCalcSavedCases(HT_GEMI_TYPE, (record) => mapHtGemiRecordToSavedCase(record));
}

export { buildRowOverridesFromRows };
