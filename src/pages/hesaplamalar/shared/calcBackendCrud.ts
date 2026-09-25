/**
 * V3 `/api/saved-cases` kayıt CRUD — tüm hesaplama sayfaları için ortak fabrika.
 */

import {
  createSavedCase,
  deleteSavedCase,
  getSavedCase,
  listSavedCases,
  updateSavedCase,
  type SavedCaseRecord,
} from "@/api/savedCases";
import { writeBoundCaseId } from "@/utils/calculationCaseBinding";
import { migrateLocalSavedCasesOnce } from "./localCasesMigration";

export type CalcSaveResult = {
  brut: number;
  net: number;
  rowCount?: number;
  [key: string]: unknown;
};

export type CalcSavedCaseListItem = {
  id: string;
  name: string;
  updatedAt: string;
  result: CalcSaveResult;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNumberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function unwrapCalcData(data: unknown): Record<string, unknown> {
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

export function buildCalcSavePayload(opts: {
  form: Record<string, unknown>;
  result: CalcSaveResult;
  iseGiris?: string | null;
  istenCikis?: string | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const { form, result, iseGiris, istenCikis, extra } = opts;
  const { brut, net, ...resultRest } = result;
  return {
    form,
    formValues: form,
    ...extra,
    brut_total: brut,
    net_total: net,
    ise_giris: iseGiris ?? null,
    isten_cikis: istenCikis ?? null,
    results: {
      brut,
      net,
      totals: { brut, net, totalBrut: brut },
      ...resultRest,
    },
  };
}

export function mapCalcRecordToListItem(record: SavedCaseRecord): CalcSavedCaseListItem {
  const payload = unwrapCalcData(record.data);
  const results = asRecord(payload.results);
  const brut =
    toNumberOr(payload.brut_total, 0) ||
    toNumberOr(results?.brut, 0) ||
    toNumberOr(results?.brutKidem, 0) ||
    toNumberOr(results?.toplamBrut, 0);
  const net =
    toNumberOr(payload.net_total, 0) ||
    toNumberOr(results?.net, 0) ||
    toNumberOr(results?.netKidem, 0);
  const name = record.name ?? record.kayit_adi;
  return {
    id: String(record.id),
    name: name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`,
    updatedAt: str(record.createdAt ?? record.created_at) || new Date().toISOString(),
    result: { brut, net, rowCount: 0 },
  };
}

export function createCalcBackendCrud<TForm>(opts: {
  recordType: string;
  isRecordType: (type: string | undefined) => boolean;
  mapFormFromBackend: (data: unknown, record?: SavedCaseRecord) => TForm | null;
  buildSaveData: (form: TForm, result: CalcSaveResult) => Record<string, unknown>;
  /** Varsa *:cases:v1 local kayıtlar bir defalık API'ye aktarılır ve silinir */
  localStorageKey?: string;
}) {
  const { recordType, isRecordType, mapFormFromBackend, buildSaveData, localStorageKey } = opts;

  async function ensureLocalMigrated(): Promise<void> {
    if (!localStorageKey) return;
    try {
      await migrateLocalSavedCasesOnce({
        storageKey: localStorageKey,
        recordType,
        buildData: (local) => {
          if (!local.form) return null;
          const results =
            local.results && typeof local.results === "object"
              ? (local.results as Record<string, unknown>)
              : {};
          const brut =
            Number(
              results.brut ??
                results.total ??
                results.toplamBrut ??
                results.brutKidem ??
                results.totalBrut ??
                0,
            ) || 0;
          const net =
            Number(results.net ?? results.netTotal ?? results.netKidem ?? results.netAmount ?? 0) || 0;
          try {
            return buildSaveData(local.form as TForm, { brut, net, ...results });
          } catch {
            return null;
          }
        },
      });
    } catch (err) {
      console.warn("[calcBackendCrud] local migrate failed", recordType, err);
    }
  }

  async function listCases(): Promise<CalcSavedCaseListItem[]> {
    await ensureLocalMigrated();
    const all = await listSavedCases();
    return all.filter((r) => isRecordType(r.type ?? r.hesaplama_tipi)).map(mapCalcRecordToListItem);
  }

  async function loadCase(id: number): Promise<{ record: SavedCaseRecord; form: TForm }> {
    const record = await getSavedCase(id);
    const form = mapFormFromBackend(record.data, record);
    if (!form) {
      throw new Error("Kayıt verisi okunamadı");
    }
    if (!isRecordType(record.type ?? record.hesaplama_tipi)) {
      throw new Error(`Bu kayıt beklenen türde değil (${record.type ?? record.hesaplama_tipi})`);
    }
    writeBoundCaseId(window.location.pathname, String(record.id));
    return { record, form };
  }

  async function saveCase(
    name: string,
    form: TForm,
    result: CalcSaveResult,
    existingId?: string | null,
  ): Promise<SavedCaseRecord> {
    const data = buildSaveData(form, result);
    const payload = { name: name.trim(), type: recordType, data };
    const numericId = existingId ? Number(existingId) : NaN;
    let record: SavedCaseRecord;
    if (Number.isFinite(numericId) && numericId > 0) {
      record = await updateSavedCase(numericId, payload);
    } else {
      record = await createSavedCase(payload);
    }
    writeBoundCaseId(window.location.pathname, String(record.id));
    return record;
  }

  async function removeCase(id: string | number): Promise<void> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      throw new Error("Geçersiz kayıt kimliği");
    }
    await deleteSavedCase(numericId);
  }

  return { listCases, loadCase, saveCase, removeCase, recordType, isRecordType };
}

/** Backend kayıtlarını sayfa `SavedCase` tipine map eder. */
export async function listCalcSavedCases<T>(
  recordType: string,
  mapRecord: (record: SavedCaseRecord) => T | null,
): Promise<T[]> {
  const all = await listSavedCases();
  return all
    .filter((r) => (r.type ?? r.hesaplama_tipi) === recordType)
    .map(mapRecord)
    .filter((item): item is T => item != null);
}
