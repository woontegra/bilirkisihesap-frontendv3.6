/**
 * Eski *:cases:v1 localStorage kayıtlarını /api/saved-cases'e bir defalık aktarır.
 * Hesaplama motoruna dokunmaz; yalnızca kayıt payload'ı taşır.
 */

import { createSavedCase, listSavedCases } from "@/api/savedCases";
import { decodeAccessTokenClaims } from "@/auth/session";

export type LocalCaseLike = {
  id?: string;
  name: string;
  form?: unknown;
  results?: unknown;
  updatedAt?: string;
  version?: number;
};

function currentUserId(): string {
  try {
    const claims = decodeAccessTokenClaims();
    if (claims?.userId != null) return String(claims.userId);
    return localStorage.getItem("user_id") || "0";
  } catch {
    return "0";
  }
}

export function localCasesMigrateFlagKey(storageKey: string): string {
  return `${storageKey}:api-migrated:u${currentUserId()}`;
}

function wasMigrated(storageKey: string): boolean {
  try {
    return localStorage.getItem(localCasesMigrateFlagKey(storageKey)) === "1";
  } catch {
    return false;
  }
}

function markMigrated(storageKey: string): void {
  try {
    localStorage.setItem(localCasesMigrateFlagKey(storageKey), "1");
  } catch {
    /* ignore */
  }
}

export function clearLocalCasesKey(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}

/** Ham localStorage payload'ından case listesi çıkarır (versioned veya düz dizi). */
export function readLocalCasesRaw(storageKey: string): LocalCaseLike[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (c): c is LocalCaseLike => !!c && typeof c === "object" && typeof (c as LocalCaseLike).name === "string",
      );
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { cases?: unknown }).cases)) {
      return ((parsed as { cases: unknown[] }).cases).filter(
        (c): c is LocalCaseLike => !!c && typeof c === "object" && typeof (c as LocalCaseLike).name === "string",
      );
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Local case'leri API'ye aktarır.
 * Aynı type + isim (tr normalize) backend'de varsa atlar.
 * Başarı sonrası local key temizlenir; bayrak set edilir.
 */
export async function migrateLocalSavedCasesOnce(opts: {
  storageKey: string;
  recordType: string;
  buildData: (local: LocalCaseLike) => Record<string, unknown> | null;
}): Promise<{ migrated: number; skipped: number }> {
  const { storageKey, recordType, buildData } = opts;
  if (wasMigrated(storageKey)) {
    clearLocalCasesKey(storageKey);
    return { migrated: 0, skipped: 0 };
  }

  const locals = readLocalCasesRaw(storageKey);
  if (locals.length === 0) {
    markMigrated(storageKey);
    clearLocalCasesKey(storageKey);
    return { migrated: 0, skipped: 0 };
  }

  let existingNames = new Set<string>();
  try {
    const all = await listSavedCases();
    existingNames = new Set(
      all
        .filter((r) => (r.type ?? r.hesaplama_tipi) === recordType)
        .map((r) => String(r.name ?? r.kayit_adi ?? "").trim().toLocaleLowerCase("tr"))
        .filter(Boolean),
    );
  } catch (err) {
    console.warn("[local-cases-migrate] list failed; deferring", storageKey, err);
    return { migrated: 0, skipped: locals.length };
  }

  let migrated = 0;
  let skipped = 0;

  for (const local of locals) {
    const name = String(local.name || "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const nameKey = name.toLocaleLowerCase("tr");
    if (existingNames.has(nameKey)) {
      skipped += 1;
      continue;
    }
    const data = buildData(local);
    if (!data) {
      skipped += 1;
      continue;
    }
    try {
      await createSavedCase({ name, type: recordType, data });
      existingNames.add(nameKey);
      migrated += 1;
    } catch {
      skipped += 1;
    }
  }

  markMigrated(storageKey);
  clearLocalCasesKey(storageKey);
  return { migrated, skipped };
}
