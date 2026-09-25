/**
 * Hesaplama sayfaları arasında paylaşılan izin / dışlama set havuzu.
 * Kullanıcı hesabına bağlı (API); eski localStorage kayıtları bir defalık migrate edilir.
 */

import {
  deleteUserLibrarySet,
  listUserLibrarySets,
  migrateUserLibrarySets,
  upsertUserLibrarySet,
} from "@/api/userLibrarySets";
import {
  listLocalExclusionSets,
  localExclusionSetsKey,
  type LocalExclusionSet,
  type LocalExclusionSetItem,
} from "@/lib/localExclusionSetsStore";
import { decodeAccessTokenClaims } from "@/auth/session";

export const SHARED_LEAVE_EXCLUSION_POOL_ID = "shared-leave-exclusions";
const KIND = "LEAVE_EXCLUSION" as const;

/** Eski sayfa-özel localExclusionSetsStore moduleId değerleri. */
export const LEGACY_EXCLUSION_MODULE_IDS = [
  "yillik-izin-used-leave",
  "yillik-izin-basin-used-leave",
  "yillik-izin-belirli-used-leave",
  "yillik-izin-kismi-used-leave",
  "yillik-izin-mevsim-used-leave",
  "yillik-izin-gemi-used-leave",
  "yillik-izin-borclar-used-leave",
  "yillik-izin-basin-gunluk-olmayan-used-leave",
  "hafta-tatili",
] as const;

/** Eski FM / UBGT sayfa-özel localStorage anahtarları. */
export const LEGACY_FM_EXCLUSION_STORAGE_KEYS = [
  "bilirkisi-hesap-v35:fm-standart:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-donemsel:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-donemsel-haftalik:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-tanikli:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-haftalik-karma:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-vardiya-24:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-vardiya-48:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-yeralti:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-gemi-724:exclusion-sets:v1",
  "bilirkisi-hesap-v35:fm-gemi-gunluk:exclusion-sets:v1",
  "bilirkisi-hesap-v35:ubgt:exclusion-sets:v1",
] as const;

type LegacyFmSet = {
  id: string;
  name: string;
  data: LocalExclusionSetItem[];
  createdAt?: string;
  updatedAt?: string;
  legacyBackendId?: number;
};

let cache: LocalExclusionSet[] | null = null;
let migratePromise: Promise<void> | null = null;

function scopeIds(): { tenantId: string; userId: string } {
  try {
    const claims = decodeAccessTokenClaims();
    return {
      tenantId: localStorage.getItem("tenant_id") || "0",
      userId: claims?.userId != null ? String(claims.userId) : localStorage.getItem("user_id") || "0",
    };
  } catch {
    return { tenantId: "0", userId: "0" };
  }
}

function apiMigratedKey(): string {
  const { tenantId, userId } = scopeIds();
  return `bilirkisi-hesap-v35:shared-leave-exclusions:api-migrated:v1:t${tenantId}:u${userId}`;
}

/** Eski tek seferlik local birleştirme bayrağı (temizlik için). */
const LEGACY_LOCAL_MERGE_FLAG = "bilirkisi-hesap-v35:shared-leave-exclusions:migrated:v1";

function wasApiMigrated(): boolean {
  try {
    return localStorage.getItem(apiMigratedKey()) === "1";
  } catch {
    return false;
  }
}

function markApiMigrated(): void {
  try {
    localStorage.setItem(apiMigratedKey(), "1");
    localStorage.setItem(LEGACY_LOCAL_MERGE_FLAG, "1");
  } catch {
    /* ignore */
  }
}

function newId(prefix = "item"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeItem(raw: Record<string, unknown>): LocalExclusionSetItem {
  const daysNum = Number(String(raw.days ?? "").replace(/\./g, "").replace(",", "."));
  return {
    id: String(raw.id || newId("item")),
    type: raw.type == null || raw.type === "" ? undefined : String(raw.type),
    start: String(raw.start ?? ""),
    end: String(raw.end ?? ""),
    days: Number.isFinite(daysNum) ? daysNum : 0,
  };
}

function toLocal(dto: {
  id: string;
  name: string;
  data: unknown[];
  createdAt: string;
  updatedAt: string;
  legacyBackendId?: number;
}): LocalExclusionSet {
  return {
    id: dto.id,
    name: dto.name,
    data: (Array.isArray(dto.data) ? dto.data : [])
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
      .map((e) => normalizeItem(e)),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    legacyBackendId: dto.legacyBackendId,
  };
}

export function rowFingerprint(item: {
  type?: string;
  start: string;
  end: string;
  days: number | string;
}): string {
  const daysNum = Number(String(item.days ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  return `${String(item.type ?? "").trim().toLowerCase()}|${item.start}|${item.end}|${daysNum}`;
}

export function normalizeLeaveTypeForFm(raw?: string): string {
  const t = String(raw ?? "").trim();
  if (!t || t === "Kullanılan İzin") return "Yıllık İzin";
  return t;
}

export function normalizeLeaveTypeForHaftaTatili(raw?: string): string {
  const t = normalizeLeaveTypeForFm(raw);
  if (t === "Puantaj-Bordro") return "Diğer";
  if (["Yıllık İzin", "Rapor", "Diğer", "UBGT"].includes(t)) return t;
  return "Diğer";
}

export function fmItemsToPoolItems(
  items: Array<{ id?: string; type?: string; start: string; end: string; days: number }>,
): LocalExclusionSetItem[] {
  return items
    .filter((r) => r.start && r.end)
    .map((r) => ({
      id: r.id || newId("item"),
      type: normalizeLeaveTypeForFm(r.type),
      start: r.start,
      end: r.end,
      days: Number(r.days) || 0,
    }));
}

export function poolItemsToFmItems(items: LocalExclusionSetItem[]): Array<{
  id: string;
  type: string;
  start: string;
  end: string;
  days: number;
}> {
  return items.map((it) => ({
    id: it.id || newId("item"),
    type: normalizeLeaveTypeForFm(it.type),
    start: it.start || "",
    end: it.end || "",
    days: Number(it.days) || 0,
  }));
}

function readLegacyFmSets(key: string): LegacyFmSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is LegacyFmSet => !!s && typeof s.name === "string" && Array.isArray(s.data),
    );
  } catch {
    return [];
  }
}

function collectLocalCandidates(): Array<{
  name: string;
  data: LocalExclusionSetItem[];
  legacyBackendId?: number;
  createdAt?: string;
  updatedAt?: string;
  id?: string;
}> {
  const byName = new Map<
    string,
    {
      name: string;
      data: LocalExclusionSetItem[];
      legacyBackendId?: number;
      createdAt?: string;
      updatedAt?: string;
      id?: string;
    }
  >();

  const absorb = (set: {
    id?: string;
    name: string;
    data: LocalExclusionSetItem[];
    legacyBackendId?: number;
    createdAt?: string;
    updatedAt?: string;
  }) => {
    const name = String(set.name || "").trim();
    if (!name || !set.data?.length) return;
    const key = name.toLocaleLowerCase("tr");
    if (byName.has(key)) return;
    byName.set(key, {
      id: set.id,
      name,
      data: set.data.map((d) => normalizeItem(d as unknown as Record<string, unknown>)),
      legacyBackendId: set.legacyBackendId,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
    });
  };

  for (const set of listLocalExclusionSets(SHARED_LEAVE_EXCLUSION_POOL_ID)) absorb(set);
  for (const moduleId of LEGACY_EXCLUSION_MODULE_IDS) {
    for (const set of listLocalExclusionSets(moduleId)) absorb(set);
  }
  for (const key of LEGACY_FM_EXCLUSION_STORAGE_KEYS) {
    for (const set of readLegacyFmSets(key)) {
      absorb({
        id: set.id,
        name: set.name,
        data: fmItemsToPoolItems(set.data),
        createdAt: set.createdAt,
        updatedAt: set.updatedAt,
        legacyBackendId: set.legacyBackendId,
      });
    }
  }
  return [...byName.values()];
}

function clearAllLocalExclusionSources(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(localExclusionSetsKey(SHARED_LEAVE_EXCLUSION_POOL_ID));
    for (const moduleId of LEGACY_EXCLUSION_MODULE_IDS) {
      localStorage.removeItem(localExclusionSetsKey(moduleId));
    }
    for (const key of LEGACY_FM_EXCLUSION_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

async function migrateLocalIfNeeded(): Promise<void> {
  if (wasApiMigrated()) {
    clearAllLocalExclusionSources();
    return;
  }
  const candidates = collectLocalCandidates();
  if (candidates.length === 0) {
    markApiMigrated();
    clearAllLocalExclusionSources();
    return;
  }
  try {
    await migrateUserLibrarySets({
      kind: KIND,
      scopeKey: SHARED_LEAVE_EXCLUSION_POOL_ID,
      sets: candidates,
    });
    markApiMigrated();
    clearAllLocalExclusionSources();
  } catch (err) {
    console.warn("[shared-leave-exclusions] migrate failed", err);
  }
}

async function ensureReady(): Promise<void> {
  if (!migratePromise) {
    migratePromise = migrateLocalIfNeeded().finally(() => {
      /* keep promise resolved for reuse */
    });
  }
  await migratePromise;
}

async function refresh(): Promise<LocalExclusionSet[]> {
  await ensureReady();
  const rows = await listUserLibrarySets(KIND, SHARED_LEAVE_EXCLUSION_POOL_ID);
  cache = rows.map(toLocal).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  return cache;
}

/** @deprecated Prefer listSharedLeaveExclusionSetsAsync — sync cache may be empty until first await. */
export function listSharedLeaveExclusionSets(): LocalExclusionSet[] {
  return cache ? cache.slice() : [];
}

export async function listSharedLeaveExclusionSetsAsync(): Promise<LocalExclusionSet[]> {
  return refresh();
}

export async function upsertSharedLeaveExclusionSet(
  name: string,
  items: LocalExclusionSetItem[],
): Promise<LocalExclusionSet> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Lütfen bir isim girin");
  if (!items.length) throw new Error("Kaydedilecek satır bulunamadı");
  await ensureReady();
  const data = items.map((it) => normalizeItem(it as unknown as Record<string, unknown>));
  const dto = await upsertUserLibrarySet({
    kind: KIND,
    scopeKey: SHARED_LEAVE_EXCLUSION_POOL_ID,
    name: trimmed,
    data,
  });
  const set = toLocal(dto);
  const prev = cache ?? [];
  cache = [
    ...prev.filter(
      (s) => s.id !== set.id && s.name.toLocaleLowerCase("tr") !== trimmed.toLocaleLowerCase("tr"),
    ),
    set,
  ].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  return set;
}

export async function deleteSharedLeaveExclusionSet(id: string): Promise<void> {
  await ensureReady();
  await deleteUserLibrarySet(id);
  cache = (cache ?? []).filter((s) => s.id !== id);
}

/**
 * Eski global /api/exclusion-sets listesini kullanıcı havuzuna aktarır.
 */
export async function mergeLegacyIntoSharedLeavePool(
  legacy: Array<{ id?: number; name?: string; data?: unknown }>,
): Promise<{ imported: number; skipped: number }> {
  await ensureReady();
  const current = await refresh();
  const byLegacy = new Set(
    current.map((s) => s.legacyBackendId).filter((x): x is number => typeof x === "number"),
  );
  const byName = new Set(current.map((s) => s.name.toLocaleLowerCase("tr")));
  let imported = 0;
  let skipped = 0;

  for (const raw of legacy) {
    const name = String(raw?.name || "").trim();
    const backendId = Number(raw?.id);
    if (!name) {
      skipped++;
      continue;
    }
    if (Number.isFinite(backendId) && backendId > 0 && byLegacy.has(backendId)) {
      skipped++;
      continue;
    }
    if (byName.has(name.toLocaleLowerCase("tr"))) {
      skipped++;
      continue;
    }
    let dataRaw = raw.data;
    if (typeof dataRaw === "string") {
      try {
        dataRaw = JSON.parse(dataRaw);
      } catch {
        dataRaw = [];
      }
    }
    const data: LocalExclusionSetItem[] = Array.isArray(dataRaw)
      ? dataRaw
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => normalizeItem(e))
      : [];
    if (!data.length) {
      skipped++;
      continue;
    }
    try {
      await upsertUserLibrarySet({
        kind: KIND,
        scopeKey: SHARED_LEAVE_EXCLUSION_POOL_ID,
        name,
        data,
        legacyBackendId: Number.isFinite(backendId) && backendId > 0 ? backendId : undefined,
      });
      byName.add(name.toLocaleLowerCase("tr"));
      if (Number.isFinite(backendId) && backendId > 0) byLegacy.add(backendId);
      imported++;
    } catch {
      skipped++;
    }
  }
  await refresh();
  return { imported, skipped };
}

/** Eski sync migrate çağrıları için no-op uyumluluk (async ensureReady sayfalarda çağrılır). */
export function ensureSharedLeaveExclusionPoolMigrated(): void {
  void ensureReady();
}

export function mergeRowsByFingerprint<
  T extends { id: string; start: string; end: string; days: number | string; type?: string },
>(existing: T[], imported: T[], createId: () => string, mapRow?: (row: T) => T): T[] {
  const seen = new Set(existing.filter((r) => r.start && r.end).map((r) => rowFingerprint(r)));
  const merged = [...existing];
  for (const raw of imported) {
    if (!raw.start || !raw.end) continue;
    const row = mapRow ? mapRow(raw) : raw;
    const fp = rowFingerprint(row);
    if (seen.has(fp)) continue;
    seen.add(fp);
    merged.push({ ...row, id: createId() });
  }
  return merged;
}
