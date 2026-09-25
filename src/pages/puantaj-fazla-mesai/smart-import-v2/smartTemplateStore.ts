/**
 * Puantaj akıllı içe aktarma şablonları — kullanıcı hesabına bağlı.
 * Eski localStorage bir defalık migrate edilir.
 */

import {
  deletePuantajSmartImportTemplate,
  listPuantajSmartImportTemplates,
  migratePuantajSmartImportTemplates,
  savePuantajSmartImportTemplate,
} from "@/api/puantajSmartImportTemplates";
import { decodeAccessTokenClaims } from "@/auth/session";
import type { MappableFieldKey } from "../model";
import type { WorkbookFingerprintProfile } from "./workbookFingerprint";
import type { SmartFieldRole } from "./types";
import { fingerprintSimilarity } from "./workbookFingerprint";

export type SmartMappingTemplateEntry = {
  segmentIndex: number;
  logicalGroupIndex: number;
  physicalColumns: string;
  role: SmartFieldRole;
  targetField: MappableFieldKey | null;
  confidence: number;
};

export type SmartImportMappingTemplate = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: WorkbookFingerprintProfile;
  mappings: SmartMappingTemplateEntry[];
  minSimilarity: number;
};

const STORAGE_KEY = "puantaj_smart_import_v2_templates_v1";
export const MIN_APPLY_SIMILARITY = 72;

let cache: SmartImportMappingTemplate[] | null = null;
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

function migrateDoneKey(): string {
  const { tenantId, userId } = scopeIds();
  return `bilirkisi-hesap-v35:puantaj-smart-import:api-migrated:v1:t${tenantId}:u${userId}`;
}

function readLocal(): SmartImportMappingTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SmartImportMappingTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function wasApiMigrated(): boolean {
  try {
    return localStorage.getItem(migrateDoneKey()) === "1";
  } catch {
    return false;
  }
}

function markApiMigrated(): void {
  try {
    localStorage.setItem(migrateDoneKey(), "1");
  } catch {
    /* ignore */
  }
}

function normalize(tpl: SmartImportMappingTemplate): SmartImportMappingTemplate {
  return {
    ...tpl,
    minSimilarity: Number.isFinite(Number(tpl.minSimilarity))
      ? Number(tpl.minSimilarity)
      : MIN_APPLY_SIMILARITY,
    mappings: Array.isArray(tpl.mappings) ? tpl.mappings : [],
  };
}

async function migrateLocalIfNeeded(): Promise<void> {
  if (wasApiMigrated()) {
    clearLocal();
    return;
  }
  const local = readLocal().map(normalize);
  if (local.length === 0) {
    markApiMigrated();
    clearLocal();
    return;
  }
  try {
    await migratePuantajSmartImportTemplates(local);
    markApiMigrated();
    clearLocal();
  } catch (err) {
    console.warn("[puantaj-smart-import] migrate failed", err);
  }
}

async function ensureReady(): Promise<void> {
  if (!migratePromise) migratePromise = migrateLocalIfNeeded();
  await migratePromise;
}

async function refresh(): Promise<SmartImportMappingTemplate[]> {
  await ensureReady();
  cache = (await listPuantajSmartImportTemplates()).map(normalize);
  return cache;
}

/** Sync cache — ilk await loadSmartImportTemplatesSafe sonrası dolu. */
export function loadSmartImportTemplates(): SmartImportMappingTemplate[] {
  return cache ? cache.slice() : [];
}

export async function loadSmartImportTemplatesSafe(): Promise<SmartImportMappingTemplate[]> {
  return refresh();
}

export async function saveSmartImportTemplate(
  template: SmartImportMappingTemplate,
): Promise<SmartImportMappingTemplate> {
  await ensureReady();
  const saved = normalize(await savePuantajSmartImportTemplate(template));
  const list = cache ? [...cache] : [];
  const idx = list.findIndex(
    (t) =>
      t.id === saved.id || t.name.toLocaleLowerCase("tr") === saved.name.toLocaleLowerCase("tr"),
  );
  if (idx >= 0) list[idx] = saved;
  else list.push(saved);
  cache = list;
  return saved;
}

export async function deleteSmartImportTemplate(id: string): Promise<void> {
  await ensureReady();
  await deletePuantajSmartImportTemplate(id);
  cache = (cache ?? []).filter((t) => t.id !== id);
}

export function suggestSmartImportTemplate(
  fingerprint: WorkbookFingerprintProfile,
): { template: SmartImportMappingTemplate; similarity: number } | null {
  let best: { template: SmartImportMappingTemplate; similarity: number } | null = null;
  for (const tpl of loadSmartImportTemplates()) {
    const similarity = fingerprintSimilarity(fingerprint, tpl.fingerprint);
    const threshold = tpl.minSimilarity ?? MIN_APPLY_SIMILARITY;
    if (similarity < threshold) continue;
    if (!best || similarity > best.similarity) best = { template: tpl, similarity };
  }
  return best;
}
