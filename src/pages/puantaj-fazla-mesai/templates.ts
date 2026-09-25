/**
 * Puantaj eşleştirme şablonları — kullanıcı hesabına bağlı.
 * Eski localStorage (v1/v2) bir defalık migrate edilir.
 */

import {
  deletePuantajFmTemplate,
  listPuantajFmTemplates,
  migratePuantajFmTemplates,
  savePuantajFmTemplate,
} from "@/api/puantajFmTemplates";
import type { PuantajTemplate } from "./model";
import { id, normalizeText } from "./utils";
import { decodeAccessTokenClaims } from "@/auth/session";

export const TEMPLATE_SCHEMA_VERSION = 2;
const STORAGE_KEY = "puantaj_fm_templates_v2";
const LEGACY_STORAGE_KEY = "puantaj_fm_templates_v1";

let cache: PuantajTemplate[] | null = null;
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
  return `bilirkisi-hesap-v35:puantaj-fm-templates:api-migrated:v1:t${tenantId}:u${userId}`;
}

function safeParse(json: string | null): PuantajTemplate[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json);
    return Array.isArray(data) ? (data as PuantajTemplate[]) : [];
  } catch {
    return [];
  }
}

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function readLocalTemplates(): PuantajTemplate[] {
  if (!hasStorage()) return [];
  const current = safeParse(localStorage.getItem(STORAGE_KEY));
  if (current.length > 0) {
    return current.map((t) => ({
      ...t,
      version: Math.max(t.version ?? 1, TEMPLATE_SCHEMA_VERSION),
    }));
  }
  const legacy = safeParse(localStorage.getItem(LEGACY_STORAGE_KEY));
  return legacy.map((t) => ({
    ...t,
    version: Math.max(t.version ?? 1, TEMPLATE_SCHEMA_VERSION),
  }));
}

function clearLocalTemplates(): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
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

async function migrateLocalIfNeeded(): Promise<void> {
  if (wasApiMigrated()) {
    clearLocalTemplates();
    return;
  }
  const local = readLocalTemplates();
  if (local.length === 0) {
    markApiMigrated();
    clearLocalTemplates();
    return;
  }
  try {
    await migratePuantajFmTemplates(local);
    markApiMigrated();
    clearLocalTemplates();
  } catch (err) {
    console.warn("[puantaj-fm-templates] migrate failed", err);
  }
}

async function ensureReady(): Promise<void> {
  if (!migratePromise) migratePromise = migrateLocalIfNeeded();
  await migratePromise;
}

async function refresh(): Promise<PuantajTemplate[]> {
  await ensureReady();
  cache = await listPuantajFmTemplates();
  return cache;
}

/** Sync cache (ilk await loadTemplatesSafe sonrası dolu). */
export function loadTemplates(): PuantajTemplate[] {
  return cache ? cache.slice() : [];
}

export async function loadTemplatesSafe(): Promise<PuantajTemplate[]> {
  return refresh();
}

export async function saveTemplate(template: PuantajTemplate): Promise<PuantajTemplate> {
  await ensureReady();
  const saved = await savePuantajFmTemplate(template);
  const list = cache ? [...cache] : [];
  const idx = list.findIndex((t) => t.id === saved.id || t.name.toLocaleLowerCase("tr") === saved.name.toLocaleLowerCase("tr"));
  if (idx >= 0) list[idx] = saved;
  else list.push(saved);
  cache = list;
  return saved;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await ensureReady();
  await deletePuantajFmTemplate(templateId);
  cache = (cache ?? []).filter((t) => t.id !== templateId);
}

export async function duplicateTemplate(templateId: string): Promise<PuantajTemplate | null> {
  const list = await refresh();
  const src = list.find((t) => t.id === templateId);
  if (!src) return null;
  const now = new Date().toISOString();
  const copy: PuantajTemplate = {
    ...src,
    id: id("tpl"),
    name: `${src.name} (kopya)`,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  return saveTemplate(copy);
}

/**
 * Belge başlıklarından bir imza üretir (sıra bağımsız, normalize edilmiş).
 * Aynı format tekrar yüklendiğinde uygun şablonu önermek için kullanılır.
 */
export function buildSignature(headers: string[]): string {
  return headers
    .map((h) => normalizeText(h))
    .filter(Boolean)
    .sort()
    .join("|");
}

/** İmzaya göre en uygun şablonu döner (cache üzerinden). */
export function suggestTemplate(headers: string[]): PuantajTemplate | null {
  const sig = buildSignature(headers);
  if (!sig) return null;
  const list = loadTemplates();
  if (list.length === 0) return null;

  const exact = list.find((t) => t.signature === sig);
  if (exact) return exact;

  const headerSet = new Set(sig.split("|"));
  let best: { t: PuantajTemplate; score: number } | null = null;
  for (const t of list) {
    const tokens = t.signature.split("|").filter(Boolean);
    if (tokens.length === 0) continue;
    const overlap = tokens.filter((tok) => headerSet.has(tok)).length;
    const score = overlap / Math.max(tokens.length, headerSet.size);
    if (!best || score > best.score) best = { t, score };
  }
  return best && best.score >= 0.6 ? best.t : null;
}
