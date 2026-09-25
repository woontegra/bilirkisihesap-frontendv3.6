/**
 * Kullanıcı hesabına bağlı ekstra hesaplama setleri.
 * Eski localStorage kayıtları bir defalık migrate edilir.
 */

import {
  deleteUserLibrarySet,
  listUserLibrarySets,
  migrateUserLibrarySets,
  upsertUserLibrarySet,
} from "@/api/userLibrarySets";
import { decodeAccessTokenClaims } from "@/auth/session";

export type LocalExtraSetItem = {
  id: string;
  name: string;
  value: string;
};

export type LocalExtraSet = {
  id: string;
  name: string;
  data: LocalExtraSetItem[];
  createdAt: string;
  updatedAt: string;
  legacyBackendId?: number;
};

type StorePayload = {
  version: 1;
  sets: LocalExtraSet[];
};

const KIND = "EXTRA_SET" as const;
const cache = new Map<string, LocalExtraSet[]>();
const migrateFlags = new Map<string, boolean>();

function newId(prefix = "set"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

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

export function localExtraSetsKey(moduleId: string): string {
  const { tenantId, userId } = scopeIds();
  return `bilirkisi-hesap-v35:${moduleId}:extra-sets:v1:t${tenantId}:u${userId}`;
}

export function legacyImportFlagKey(moduleId: string): string {
  const { tenantId, userId } = scopeIds();
  return `bilirkisi-hesap-v35:${moduleId}:extra-sets-legacy-imported:v1:t${tenantId}:u${userId}`;
}

function migrateDoneKey(moduleId: string): string {
  const { tenantId, userId } = scopeIds();
  return `bilirkisi-hesap-v35:${moduleId}:extra-sets-api-migrated:v1:t${tenantId}:u${userId}`;
}

function readLocalRaw(moduleId: string): LocalExtraSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(localExtraSetsKey(moduleId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StorePayload>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.sets)) return [];
    return parsed.sets.filter(
      (s): s is LocalExtraSet =>
        !!s && typeof s.id === "string" && typeof s.name === "string" && Array.isArray(s.data),
    );
  } catch {
    return [];
  }
}

function clearLocal(moduleId: string): void {
  try {
    localStorage.removeItem(localExtraSetsKey(moduleId));
  } catch {
    /* ignore */
  }
}

function markApiMigrated(moduleId: string): void {
  try {
    localStorage.setItem(migrateDoneKey(moduleId), "1");
  } catch {
    /* ignore */
  }
}

function wasApiMigrated(moduleId: string): boolean {
  try {
    return localStorage.getItem(migrateDoneKey(moduleId)) === "1";
  } catch {
    return false;
  }
}

function toLocal(dto: {
  id: string;
  name: string;
  data: unknown[];
  createdAt: string;
  updatedAt: string;
  legacyBackendId?: number;
}): LocalExtraSet {
  return {
    id: dto.id,
    name: dto.name,
    data: (Array.isArray(dto.data) ? dto.data : [])
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
      .map((e) => ({
        id: String(e.id || newId("item")),
        name: String(e.name ?? e.label ?? ""),
        value: e.value == null ? "" : String(e.value),
      })),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    legacyBackendId: dto.legacyBackendId,
  };
}

async function migrateLocalIfNeeded(moduleId: string): Promise<void> {
  if (migrateFlags.get(moduleId)) return;
  if (wasApiMigrated(moduleId)) {
    clearLocal(moduleId);
    migrateFlags.set(moduleId, true);
    return;
  }
  const local = readLocalRaw(moduleId);
  if (local.length === 0) {
    markApiMigrated(moduleId);
    migrateFlags.set(moduleId, true);
    return;
  }
  try {
    await migrateUserLibrarySets({
      kind: KIND,
      scopeKey: moduleId,
      sets: local.map((s) => ({
        id: s.id,
        name: s.name,
        data: s.data,
        legacyBackendId: s.legacyBackendId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    });
    markApiMigrated(moduleId);
    clearLocal(moduleId);
    migrateFlags.set(moduleId, true);
  } catch (err) {
    console.warn("[extra-sets] migrate failed", moduleId, err);
  }
}

async function refresh(moduleId: string): Promise<LocalExtraSet[]> {
  await migrateLocalIfNeeded(moduleId);
  const rows = await listUserLibrarySets(KIND, moduleId);
  const sets = rows.map(toLocal).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  cache.set(moduleId, sets);
  return sets;
}

export async function listLocalExtraSets(moduleId: string): Promise<LocalExtraSet[]> {
  return refresh(moduleId);
}

export async function upsertLocalExtraSet(
  moduleId: string,
  name: string,
  items: LocalExtraSetItem[],
): Promise<LocalExtraSet> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Lütfen bir isim girin");
  if (!items.length) throw new Error("Kaydedilecek ekstra hesaplama bulunamadı");
  const data = items.map((it) => ({
    id: it.id || newId("item"),
    name: String(it.name || ""),
    value: it.value == null ? "" : String(it.value),
  }));
  const dto = await upsertUserLibrarySet({
    kind: KIND,
    scopeKey: moduleId,
    name: trimmed,
    data,
  });
  const set = toLocal(dto);
  const prev = cache.get(moduleId) ?? [];
  const next = [...prev.filter((s) => s.id !== set.id && s.name.toLocaleLowerCase("tr") !== trimmed.toLocaleLowerCase("tr")), set].sort(
    (a, b) => a.name.localeCompare(b.name, "tr"),
  );
  cache.set(moduleId, next);
  return set;
}

export async function deleteLocalExtraSet(moduleId: string, id: string): Promise<void> {
  await deleteUserLibrarySet(id);
  cache.set(
    moduleId,
    (cache.get(moduleId) ?? []).filter((s) => s.id !== id),
  );
}

export function wasLegacyImported(moduleId: string): boolean {
  try {
    return localStorage.getItem(legacyImportFlagKey(moduleId)) === "1";
  } catch {
    return false;
  }
}

export function markLegacyImported(moduleId: string): void {
  try {
    localStorage.setItem(legacyImportFlagKey(moduleId), "1");
  } catch {
    /* ignore */
  }
}

export function clearLegacyImportedFlag(moduleId: string): void {
  try {
    localStorage.removeItem(legacyImportFlagKey(moduleId));
  } catch {
    /* ignore */
  }
}

/**
 * Eski global /api/extra-calculations-sets listesini kullanıcı kütüphanesine aktarır.
 * İsim veya legacyBackendId çakışmasında atlar.
 */
export async function mergeLegacyExtraSets(
  moduleId: string,
  legacy: Array<{ id?: number; name?: string; data?: unknown }>,
): Promise<{ imported: number; skipped: number }> {
  await migrateLocalIfNeeded(moduleId);
  const current = await refresh(moduleId);
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
    const data: LocalExtraSetItem[] = Array.isArray(dataRaw)
      ? dataRaw
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => ({
            id: String(e.id || newId("item")),
            name: String(e.name ?? e.label ?? ""),
            value: e.value == null ? "" : String(e.value),
          }))
      : [];
    if (!data.length) {
      skipped++;
      continue;
    }
    try {
      await upsertUserLibrarySet({
        kind: KIND,
        scopeKey: moduleId,
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

  markLegacyImported(moduleId);
  await refresh(moduleId);
  return { imported, skipped };
}
