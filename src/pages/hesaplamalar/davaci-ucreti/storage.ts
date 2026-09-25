/**
 * Davacı Ücreti — legacy local case migrate kaynağı + obsolete key temizliği.
 * Asıl kayıtlar /api/saved-cases üzerinden tutulur.
 */

import type { DavaciFormSnapshot, SavedCase, SavedExtraSet } from "./model";
import { newLocalId } from "./model";

export const DAVACI_CASES_KEY = "bilirkisi-hesap-v35:davaci-ucreti:cases:v1" as const;

/** Eski lokal set / legacy import anahtarları — artık asıl kaynak değil; temizlenir. */
const OBSOLETE_KEYS = [
  "bilirkisi-hesap-v35:davaci-ucreti:extra-sets:v1",
  "bilirkisi-hesap-v35:davaci-ucreti:legacy-import:v1",
] as const;

type CasesPayload = { version: 1; cases: SavedCase[] };

export type LoadResult<T> = { ok: true; items: T[] } | { ok: false; items: []; reason: string };

function safeRead<T>(key: string, pick: (parsed: unknown) => T[] | null): LoadResult<T> {
  if (typeof window === "undefined") return { ok: true, items: [] };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ok: true, items: [] };
    const items = pick(JSON.parse(raw));
    if (!items) {
      return { ok: false, items: [], reason: "Desteklenmeyen veya bozuk lokal veri bulundu." };
    }
    return { ok: true, items };
  } catch {
    return { ok: false, items: [], reason: "Lokal veri okunamadı." };
  }
}

/* ── Hesaplama kayıtları (lokal) ── */

export function loadCasesSafe(): LoadResult<SavedCase> {
  return safeRead<SavedCase>(DAVACI_CASES_KEY, (parsed) => {
    const p = parsed as Partial<CasesPayload>;
    if (p?.version !== 1 || !Array.isArray(p.cases)) return null;
    return p.cases.filter(
      (c): c is SavedCase =>
        !!c && typeof c.id === "string" && typeof c.name === "string" && !!c.form,
    );
  });
}

function writeCases(cases: SavedCase[]): void {
  if (typeof window === "undefined") return;
  const payload: CasesPayload = { version: 1, cases };
  localStorage.setItem(DAVACI_CASES_KEY, JSON.stringify(payload));
}

export function saveCase(
  name: string,
  form: DavaciFormSnapshot,
  results: { totalBrut: number; net: number },
  existingId?: string | null,
): SavedCase | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const cases = loadCasesSafe().items;

  if (existingId) {
    const idx = cases.findIndex((c) => c.id === existingId);
    if (idx >= 0) {
      const updated: SavedCase = {
        ...cases[idx],
        name: trimmed,
        form,
        results,
        updatedAt: new Date().toISOString(),
      };
      const next = [...cases];
      next[idx] = updated;
      writeCases(next);
      return updated;
    }
  }

  const entry: SavedCase = {
    id: newLocalId(),
    name: trimmed,
    version: 1,
    updatedAt: new Date().toISOString(),
    form,
    results,
  };
  writeCases([entry, ...cases]);
  return entry;
}

export function deleteCase(id: string): void {
  writeCases(loadCasesSafe().items.filter((c) => c.id !== id));
}

export function clearCorruptCases(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DAVACI_CASES_KEY);
}

/* ── Ekstra set cache (yalnızca çevrimdışı görüntüleme) ── */

function cacheScope(): { tenantId: string; userId: string } {
  try {
    return {
      tenantId: localStorage.getItem("tenant_id") || "0",
      userId: localStorage.getItem("user_id") || "0",
    };
  } catch {
    return { tenantId: "0", userId: "0" };
  }
}

export function extraSetsCacheKey(): string {
  const { tenantId, userId } = cacheScope();
  return `bilirkisi-hesap-v35:davaci-ucreti:extra-sets-cache:v1:t${tenantId}:u${userId}`;
}

/** Eski lokal set / legacy import anahtarlarını güvenli biçimde kaldırır (mükerrer üretim önlenir). */
export function purgeObsoleteLocalSetStores(): void {
  if (typeof window === "undefined") return;
  for (const key of OBSOLETE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function writeExtraSetsCache(_sets: SavedExtraSet[]): void {
  /* Kalıcı kullanıcı verisi localStorage'da tutulmaz; cache yazımı kaldırıldı. */
  try {
    localStorage.removeItem(extraSetsCacheKey());
  } catch {
    /* ignore */
  }
}

export function readExtraSetsCache(): SavedExtraSet[] {
  try {
    localStorage.removeItem(extraSetsCacheKey());
  } catch {
    /* ignore */
  }
  return [];
}
