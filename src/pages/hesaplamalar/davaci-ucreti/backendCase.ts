/**
 * V3 backend kayıt → Davacı Ücreti form mapping.
 * Yalnızca form alanlarını doldurur; sonuçları backend'den almaz.
 */

import {
  createSavedCase,
  deleteSavedCase,
  listSavedCases,
  updateSavedCase,
  type SavedCaseRecord,
} from "@/api/savedCases";
import { createDefaultExtraItems, newLocalId, type DavaciFormSnapshot, type ExtraItem, type NetFromGrossData, type Period, type SavedCase } from "./model";
import { hasTwoPeriods } from "./engine";

export const DAVACI_UCRETI_TYPE = "davaci_ucreti" as const;

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

function mapExtraItems(raw: unknown): ExtraItem[] {
  if (!Array.isArray(raw)) return createDefaultExtraItems();
  const items = raw
    .map((row) => {
      const r = asRecord(row);
      if (!r) return null;
      return {
        id: str(r.id) || newLocalId(),
        name: str(r.name ?? r.label),
        value: r.value === null || r.value === undefined ? "" : String(r.value),
      } satisfies ExtraItem;
    })
    .filter((x): x is ExtraItem => !!x);
  return items.length > 0 ? items : createDefaultExtraItems();
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function isDavaciRecordType(type: string | undefined | null): boolean {
  return type === DAVACI_UCRETI_TYPE;
}

function normalizeExtraItemsForSave(items: DavaciFormSnapshot["extraItems"]): ExtraItem[] {
  return items.map((item) => ({
    id: item.id || newLocalId(),
    name: String(item.name ?? ""),
    value: item.value === undefined || item.value === null ? "" : String(item.value),
  }));
}

/** V3 `prepareSaveData` ile uyumlu backend payload. */
export function buildDavaciSavePayload(
  form: DavaciFormSnapshot,
  totalBrut: number,
  netFromGross: NetFromGrossData,
): Record<string, unknown> {
  const normalizedForm = {
    ciplakBrut: String(form.ciplakBrut ?? ""),
    extraItems: normalizeExtraItemsForSave(form.extraItems),
    selectedYear: form.selectedYear,
    selectedPeriod: form.selectedPeriod,
    notes: String(form.notes ?? ""),
  };

  return {
    form: normalizedForm,
    formValues: normalizedForm,
    results: {
      totals: { totalBrut },
      brut: totalBrut,
      net: netFromGross.net || 0,
    },
    netFromGross: {
      gross: netFromGross.gross || 0,
      sgk: netFromGross.sgk || 0,
      issizlik: netFromGross.issizlik || 0,
      gelirVergisi: netFromGross.gelirVergisi || 0,
      gelirVergisiDilimleri: String(netFromGross.gelirVergisiDilimleri || ""),
      damgaVergisi: netFromGross.damgaVergisi || 0,
      net: netFromGross.net || 0,
      gelirVergisiBrut: netFromGross.gelirVergisiBrut,
      gelirVergisiIstisna: netFromGross.gelirVergisiIstisna,
      damgaVergisiBrut: netFromGross.damgaVergisiBrut,
      damgaVergisiIstisna: netFromGross.damgaVergisiIstisna,
    },
    brut_total: totalBrut,
    net_total: netFromGross.net || 0,
  };
}

export function mapDavaciRecordToSavedCase(record: SavedCaseRecord, fallbackYear: number): SavedCase | null {
  const mapped = mapDavaciFormFromBackend(record.data, fallbackYear);
  if (!mapped) return null;
  const payload = unwrapData(record.data);
  const results = asRecord(payload.results);
  const totalBrut = Number(payload.brut_total ?? results?.brut ?? 0);
  const net = Number(payload.net_total ?? results?.net ?? 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form: mapped,
    results: {
      totalBrut: Number.isFinite(totalBrut) ? totalBrut : 0,
      net: Number.isFinite(net) ? net : 0,
    },
  };
}

export async function listDavaciCasesFromBackend(fallbackYear: number): Promise<SavedCase[]> {
  const { migrateLocalSavedCasesOnce } = await import("../shared/localCasesMigration");
  const { DAVACI_CASES_KEY } = await import("./storage");
  await migrateLocalSavedCasesOnce({
    storageKey: DAVACI_CASES_KEY,
    recordType: DAVACI_UCRETI_TYPE,
    buildData: (local) => {
      if (!local.form || typeof local.form !== "object") return null;
      const form = local.form as DavaciFormSnapshot;
      const results =
        local.results && typeof local.results === "object"
          ? (local.results as { totalBrut?: number; net?: number })
          : {};
      const totalBrut = Number(results.totalBrut ?? 0) || 0;
      const net = Number(results.net ?? 0) || 0;
      try {
        return buildDavaciSavePayload(form, totalBrut, {
          gross: totalBrut,
          sgk: 0,
          issizlik: 0,
          gelirVergisi: 0,
          gelirVergisiDilimleri: "",
          damgaVergisi: 0,
          net,
          gelirVergisiBrut: 0,
          gelirVergisiIstisna: 0,
          damgaVergisiBrut: 0,
          damgaVergisiIstisna: 0,
        });
      } catch {
        return null;
      }
    },
  });
  const all = await listSavedCases();
  return all
    .filter((r) => isDavaciRecordType(r.type ?? r.hesaplama_tipi))
    .map((r) => mapDavaciRecordToSavedCase(r, fallbackYear))
    .filter((c): c is SavedCase => !!c);
}

export async function saveDavaciCaseToBackend(
  name: string,
  form: DavaciFormSnapshot,
  totalBrut: number,
  netFromGross: NetFromGrossData,
  existingId?: string | null,
): Promise<SavedCaseRecord> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Kayıt adı gerekli");

  const data = buildDavaciSavePayload(form, totalBrut, netFromGross);
  const payload = { name: trimmed, type: DAVACI_UCRETI_TYPE, data };
  const numericId = existingId ? Number(existingId) : NaN;

  if (Number.isFinite(numericId) && numericId > 0) {
    return updateSavedCase(numericId, payload);
  }
  return createSavedCase(payload);
}

export async function deleteDavaciCaseFromBackend(id: string): Promise<void> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error("Geçersiz kayıt kimliği");
  }
  await deleteSavedCase(numericId);
}

/** Backend data → lokal form snapshot. Bozuksa null. */
export function mapDavaciFormFromBackend(data: unknown, fallbackYear: number): DavaciFormSnapshot | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const year = Number(form.selectedYear);
    const selectedYear = Number.isFinite(year) && year > 0 ? year : fallbackYear;
    const periodRaw = Number(form.selectedPeriod);
    const selectedPeriod: Period = !hasTwoPeriods(selectedYear)
      ? 2
      : periodRaw === 1 || periodRaw === 2
        ? periodRaw
        : 2;

    return {
      ciplakBrut: str(form.ciplakBrut),
      extraItems: mapExtraItems(form.extraItems),
      selectedYear,
      selectedPeriod,
      notes: str(form.notes),
    };
  } catch {
    return null;
  }
}
