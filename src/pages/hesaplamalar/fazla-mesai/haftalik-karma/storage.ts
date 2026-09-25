/**
 * Haftalık Karma Fazla Mesai — lokal depolama.
 */

import type { HaftalikKarmaFormSnapshot, SavedHaftalikKarmaCase } from "./model";
import { newLocalId } from "./model";

export const HAFTALIK_KARMA_CASES_KEY = "bilirkisi-hesap-v35:fm-haftalik-karma:cases:v1" as const;

type CasesPayload = { version: 1; cases: SavedHaftalikKarmaCase[] };

export type LoadResult<T> = { ok: true; items: T[] } | { ok: false; items: []; reason: string };

export function loadCasesSafe(): LoadResult<SavedHaftalikKarmaCase> {
  if (typeof window === "undefined") return { ok: true, items: [] };
  try {
    const raw = localStorage.getItem(HAFTALIK_KARMA_CASES_KEY);
    if (!raw) return { ok: true, items: [] };
    const parsed = JSON.parse(raw) as Partial<CasesPayload>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.cases)) {
      return { ok: false, items: [], reason: "Desteklenmeyen veya bozuk lokal veri bulundu." };
    }
    const items = parsed.cases.filter(
      (c): c is SavedHaftalikKarmaCase =>
        !!c && typeof c.id === "string" && typeof c.name === "string" && !!c.form,
    );
    return { ok: true, items };
  } catch {
    return { ok: false, items: [], reason: "Lokal veri okunamadı." };
  }
}

function writeCases(cases: SavedHaftalikKarmaCase[]): void {
  if (typeof window === "undefined") return;
  const payload: CasesPayload = { version: 1, cases };
  localStorage.setItem(HAFTALIK_KARMA_CASES_KEY, JSON.stringify(payload));
}

export function saveCase(
  name: string,
  form: HaftalikKarmaFormSnapshot,
  results: { totalMoney: number; weeklyFmHours: number; sonNet: number },
  existingId?: string | null,
): SavedHaftalikKarmaCase | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const cases = loadCasesSafe().items;

  if (existingId) {
    const idx = cases.findIndex((c) => c.id === existingId);
    if (idx >= 0) {
      const updated: SavedHaftalikKarmaCase = {
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

  const entry: SavedHaftalikKarmaCase = {
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
  localStorage.removeItem(HAFTALIK_KARMA_CASES_KEY);
}
