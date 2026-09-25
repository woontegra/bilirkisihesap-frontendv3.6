/**
 * Fazla Mesai — 24 Saat Vardiya — lokal depolama.
 */

import type { Vardiya24FormSnapshot, SavedCase } from "./model";
import { newLocalId } from "./model";

export const VARDIYA24_CASES_KEY = "bilirkisi-hesap-v35:fm-vardiya-24:cases:v2" as const;

type CasesPayload = { version: 2; cases: SavedCase[] };

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

export function loadCasesSafe(): LoadResult<SavedCase> {
  return safeRead<SavedCase>(VARDIYA24_CASES_KEY, (parsed) => {
    const p = parsed as Partial<CasesPayload>;
    if ((p?.version !== 2 && p?.version !== 1) || !Array.isArray(p.cases)) return null;
    return p.cases.filter(
      (c): c is SavedCase => !!c && typeof c.id === "string" && typeof c.name === "string" && !!c.form,
    );
  });
}

function writeCases(cases: SavedCase[]): void {
  if (typeof window === "undefined") return;
  const payload: CasesPayload = { version: 2, cases };
  localStorage.setItem(VARDIYA24_CASES_KEY, JSON.stringify(payload));
}

export function saveCase(
  name: string,
  form: Vardiya24FormSnapshot,
  result: { toplamFm: number; sonNet: number; rowCount: number },
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
        version: 2,
        form,
        result,
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
    version: 2,
    updatedAt: new Date().toISOString(),
    form,
    result,
  };
  writeCases([entry, ...cases]);
  return entry;
}

export function deleteCase(id: string): void {
  writeCases(loadCasesSafe().items.filter((c) => c.id !== id));
}

export function clearCorruptCases(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(VARDIYA24_CASES_KEY);
}
