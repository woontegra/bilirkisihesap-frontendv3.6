/**
 * Ayrımcılık Tazminatı — versiyonlu lokal depo.
 * Backend/API yok; bozuk kayıt sayfayı çökertmez.
 */

import type { AyrimcilikForm, SavedCase } from "./model";
import { newLocalId } from "./model";

export const STORAGE_KEY = "bilirkisi-hesap-v35:ayrimcilik-tazminati:cases:v1" as const;

type CasesPayload = { version: 1; cases: SavedCase[] };

export type LoadResult<T> = { ok: true; items: T[] } | { ok: false; items: T[]; reason: string };

function isForm(v: unknown): v is AyrimcilikForm {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.startDate === "string" &&
    typeof f.endDate === "string" &&
    typeof f.brut === "string" &&
    typeof f.brutInputForNet === "string"
  );
}

export function loadCasesSafe(): LoadResult<SavedCase> {
  if (typeof localStorage === "undefined") return { ok: true, items: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ok: true, items: [] };
    const parsed = JSON.parse(raw) as Partial<CasesPayload>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.cases)) {
      return { ok: false, items: [], reason: "Desteklenmeyen veya bozuk lokal veri bulundu." };
    }

    const items = parsed.cases.filter(
      (c): c is SavedCase =>
        !!c && typeof c.id === "string" && typeof c.name === "string" && isForm(c.form),
    );
    return { ok: true, items };
  } catch {
    return { ok: false, items: [], reason: "Lokal veri okunamadı." };
  }
}

function writeCases(cases: SavedCase[]): void {
  if (typeof localStorage === "undefined") return;
  const payload: CasesPayload = { version: 1, cases };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function saveCase(
  name: string,
  form: AyrimcilikForm,
  results: SavedCase["results"],
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
        form: { ...form },
        results: { ...results },
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
    form: { ...form },
    results: { ...results },
  };
  writeCases([entry, ...cases]);
  return entry;
}

export function deleteCase(id: string): void {
  writeCases(loadCasesSafe().items.filter((c) => c.id !== id));
}

export function clearCorruptCases(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

