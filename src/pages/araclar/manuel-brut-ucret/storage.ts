/**
 * Manuel Brüt Ücret şablonları — hesap bazlı API depolama.
 * Eski localStorage kayıtları bir defalık migrate edilir ve ardından silinir.
 */

import { ApiError } from "@/api/client";
import {
  createManuelBrutWageTemplate,
  deleteManuelBrutWageTemplate,
  listManuelBrutWageTemplates,
  migrateManuelBrutWageTemplates,
  updateManuelBrutWageTemplate,
} from "@/api/manuelBrutWageTemplates";
import { decodeAccessTokenClaims } from "@/auth/session";
import type { ManuelBrutPeriodsMap, ManuelBrutTemplate } from "./model";
import { findFloorViolations } from "./validation";

/** Eski cihaz kaydı (yalnızca bir defalık migrate için okunur) */
export const MANUEL_BRUT_STORAGE_KEY = "bilirkisi-hesap-v35:manuel-brut-ucret:templates:v1" as const;
const MIGRATE_FLAG_PREFIX = "bilirkisi-hesap-v35:manuel-brut-ucret:migrated-user:" as const;

type PayloadV1 = {
  version: 1;
  templates: ManuelBrutTemplate[];
};

export type StorageLoadResult =
  | { ok: true; templates: ManuelBrutTemplate[] }
  | { ok: false; templates: ManuelBrutTemplate[]; reason: string };

let cache: ManuelBrutTemplate[] | null = null;
let loadPromise: Promise<StorageLoadResult> | null = null;

function normalizeName(s: string): string {
  return String(s).trim().toLowerCase();
}

function cleanPeriods(periods: ManuelBrutPeriodsMap): ManuelBrutPeriodsMap {
  const cleaned: ManuelBrutPeriodsMap = {};
  for (const [k, v] of Object.entries(periods)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

function currentUserId(): string | null {
  const claims = decodeAccessTokenClaims();
  if (claims?.userId != null) return String(claims.userId);
  try {
    return localStorage.getItem("user_id");
  } catch {
    return null;
  }
}

function migrateFlagKey(userId: string): string {
  return `${MIGRATE_FLAG_PREFIX}${userId}`;
}

function readLocalTemplates(): ManuelBrutTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MANUEL_BRUT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<PayloadV1>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.templates)) return [];
    return parsed.templates.filter(
      (t): t is ManuelBrutTemplate =>
        !!t &&
        typeof t.id === "string" &&
        typeof t.name === "string" &&
        !!t.periods &&
        typeof t.periods === "object",
    );
  } catch {
    return [];
  }
}

function clearLocalTemplates(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(MANUEL_BRUT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function markMigrated(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(migrateFlagKey(userId), "1");
  } catch {
    /* ignore */
  }
}

function alreadyMigrated(userId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(migrateFlagKey(userId)) === "1";
  } catch {
    return false;
  }
}

async function migrateLocalIfNeeded(): Promise<void> {
  const userId = currentUserId();
  if (!userId || alreadyMigrated(userId)) {
    // Migrate tamamlanmış olsa bile eski anahtar kalmış olabilir — temizle
    if (userId && alreadyMigrated(userId)) clearLocalTemplates();
    return;
  }

  const local = readLocalTemplates();
  if (local.length === 0) {
    markMigrated(userId);
    clearLocalTemplates();
    return;
  }

  try {
    await migrateManuelBrutWageTemplates(local);
    markMigrated(userId);
    clearLocalTemplates();
  } catch (err) {
    // Aktarım başarısızsa local kaydı tut; sonraki açılışta yeniden dener
    console.warn("[manuel-brut] local migrate failed", err);
  }
}

function setCache(templates: ManuelBrutTemplate[]): void {
  cache = templates;
}

/** Senkron önbellek (önceden yüklenmişse). */
export function getCachedTemplates(): ManuelBrutTemplate[] {
  return cache ?? [];
}

export async function loadTemplatesSafe(): Promise<StorageLoadResult> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      await migrateLocalIfNeeded();
      const templates = await listManuelBrutWageTemplates();
      setCache(templates);
      return { ok: true, templates };
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message || "Şablonlar yüklenemedi."
          : err instanceof Error
            ? err.message
            : "Şablonlar yüklenemedi.";
      setCache([]);
      return { ok: false, templates: [], reason: message };
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export async function getTemplateById(id: string): Promise<ManuelBrutTemplate | undefined> {
  if (!cache) await loadTemplatesSafe();
  return (cache ?? []).find((t) => t.id === id);
}

export async function findByNameCaseInsensitive(
  name: string,
  excludeId?: string,
): Promise<ManuelBrutTemplate | undefined> {
  const n = normalizeName(name);
  if (!n) return undefined;
  if (!cache) await loadTemplatesSafe();
  return (cache ?? []).find((t) => normalizeName(t.name) === n && t.id !== excludeId);
}

export async function addTemplate(
  name: string,
  periods: ManuelBrutPeriodsMap,
): Promise<ManuelBrutTemplate | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (await findByNameCaseInsensitive(trimmed)) return null;
  const cleaned = cleanPeriods(periods);
  if (Object.keys(cleaned).length === 0) return null;
  if (findFloorViolations(cleaned).length > 0) return null;

  try {
    const created = await createManuelBrutWageTemplate({ name: trimmed, periods: cleaned });
    const next = [created, ...(cache ?? []).filter((t) => t.id !== created.id)];
    setCache(next);
    return created;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return null;
    throw err;
  }
}

export async function updateTemplate(
  id: string,
  name: string,
  periods: ManuelBrutPeriodsMap,
): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const cleaned = cleanPeriods(periods);
  if (Object.keys(cleaned).length === 0) return false;
  if (findFloorViolations(cleaned).length > 0) return false;
  if (await findByNameCaseInsensitive(trimmed, id)) return false;

  try {
    const updated = await updateManuelBrutWageTemplate(id, { name: trimmed, periods: cleaned });
    setCache((cache ?? []).map((t) => (t.id === id ? updated : t)));
    return true;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 409 || err.status === 404)) return false;
    throw err;
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteManuelBrutWageTemplate(id);
  setCache((cache ?? []).filter((t) => t.id !== id));
}

/** Bozuk lokal depo temizliği (eski davranış); API yolunda no-op + local temizler. */
export function clearCorruptStorage(): void {
  clearLocalTemplates();
  cache = null;
}
