/**
 * V3 `/api/saved-cases` kayıt CRUD — tüm FM alt türleri için ortak fabrika.
 */

import {
  createSavedCase,
  deleteSavedCase,
  getSavedCase,
  listSavedCases,
  updateSavedCase,
  type SavedCaseRecord,
} from "@/api/savedCases";
import { migrateLocalSavedCasesOnce } from "../../shared/localCasesMigration";

export type FmSaveResult = {
  toplamFm: number;
  sonNet: number;
  rowCount: number;
};

export type FmSavedCaseListItem = {
  id: string;
  name: string;
  updatedAt: string;
  result: FmSaveResult;
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

export function unwrapFmData(data: unknown): Record<string, unknown> {
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

export function mapFmRecordToListItem(record: SavedCaseRecord): FmSavedCaseListItem {
  const payload = unwrapFmData(record.data);
  const brut =
    toNumberOr(payload.brut_total, 0) || toNumberOr(asRecord(payload.results)?.brut, 0);
  const net =
    toNumberOr(payload.net_total, 0) || toNumberOr(asRecord(payload.results)?.net, 0);
  const name = record.name ?? record.kayit_adi;
  return {
    id: String(record.id),
    name: name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`,
    updatedAt: str(record.createdAt ?? record.created_at) || new Date().toISOString(),
    result: {
      toplamFm: brut,
      sonNet: net,
      rowCount: 0,
    },
  };
}

/** V3 `kaydetServisi` payload sarmalayıcısı. */
export function buildFmBaseSavePayload(opts: {
  form: Record<string, unknown>;
  result: FmSaveResult;
  iseGiris?: string | null;
  istenCikis?: string | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const { form, result, iseGiris, istenCikis, extra } = opts;
  return {
    form,
    formValues: form,
    ...extra,
    brut_total: result.toplamFm,
    net_total: result.sonNet,
    ise_giris: iseGiris ?? null,
    isten_cikis: istenCikis ?? null,
    totals: { toplam: result.toplamFm },
    results: {
      totals: { toplam: result.toplamFm },
      brut: result.toplamFm,
      net: result.sonNet,
    },
  };
}

export function createFmBackendCrud<TForm>(opts: {
  recordType: string;
  isRecordType: (type: string | undefined) => boolean;
  mapFormFromBackend: (
    data: unknown,
    record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
  ) => TForm | null;
  buildSaveData: (form: TForm, result: FmSaveResult) => Record<string, unknown>;
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
          const toplamFm = Number(results.toplamFm ?? results.brut ?? results.total ?? 0) || 0;
          const sonNet = Number(results.sonNet ?? results.net ?? results.netTotal ?? 0) || 0;
          const rowCount = Number(results.rowCount ?? 0) || 0;
          try {
            return buildSaveData(local.form as TForm, { toplamFm, sonNet, rowCount });
          } catch {
            return null;
          }
        },
      });
    } catch (err) {
      console.warn("[fmBackendCrud] local migrate failed", recordType, err);
    }
  }

  async function listCases(): Promise<FmSavedCaseListItem[]> {
    await ensureLocalMigrated();
    const all = await listSavedCases();
    return all
      .filter((r) => isRecordType(r.type ?? r.hesaplama_tipi))
      .map(mapFmRecordToListItem);
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
    return { record, form };
  }

  async function saveCase(
    name: string,
    form: TForm,
    result: FmSaveResult,
    existingId?: string | null,
  ): Promise<SavedCaseRecord> {
    const data = buildSaveData(form, result);
    const payload = { name: name.trim(), type: recordType, data };
    const numericId = existingId ? Number(existingId) : NaN;
    if (Number.isFinite(numericId) && numericId > 0) {
      return updateSavedCase(numericId, payload);
    }
    return createSavedCase(payload);
  }

  async function removeCase(id: string | number): Promise<void> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      throw new Error("Geçersiz kayıt kimliği");
    }
    await deleteSavedCase(numericId);
  }

  return { listCases, loadCase, saveCase, removeCase };
}
