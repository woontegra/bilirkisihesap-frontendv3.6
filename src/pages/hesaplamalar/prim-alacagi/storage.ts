/**
 * Prim Alacağı — versiyonlu lokal depo.
 * Backend/API yok; bozuk kayıt sayfayı çökertmez.
 */

import type { PrimForm, PrimRow, SavedCase } from "./model";
import { createEmptyRow, newLocalId } from "./model";

export const STORAGE_KEY = "bilirkisi-hesap-v35:prim-alacagi:cases:v1" as const;

type CasesPayload = { version: 1; cases: SavedCase[] };

export type LoadResult<T> = { ok: true; items: T[] } | { ok: false; items: T[]; reason: string };

function isRow(v: unknown): v is PrimRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.principal === "string" && typeof r.percent === "string";
}

function normalizeForm(raw: PrimForm): PrimForm {
  const rows = Array.isArray(raw.rows) ? raw.rows.filter(isRow) : [];
  return {
    rows: rows.length > 0 ? rows : [createEmptyRow()],
    brutInputForNet: raw.brutInputForNet ?? "",
  };
}

export function loadCasesSafe(): LoadResult<SavedCase> {
  if (typeof window === "undefined") return { ok: true, items: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ok: true, items: [] };
    const parsed = JSON.parse(raw) as Partial<CasesPayload>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.cases)) {
      return { ok: false, items: [], reason: "Desteklenmeyen veya bozuk lokal veri bulundu." };
    }
    const items = parsed.cases
      .filter((c): c is SavedCase => !!c && typeof c.id === "string" && typeof c.name === "string")
      .map((c) => ({
        ...c,
        form: normalizeForm(c.form),
        results: {
          total: Number(c.results?.total) || 0,
          netTotal: Number(c.results?.netTotal) || 0,
        },
      }));
    return { ok: true, items };
  } catch {
    return { ok: false, items: [], reason: "Lokal veri okunamadı." };
  }
}

function writeCases(cases: SavedCase[]): void {
  if (typeof window === "undefined") return;
  const payload: CasesPayload = { version: 1, cases };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function saveCase(
  name: string,
  form: PrimForm,
  results: SavedCase["results"],
  existingId?: string | null,
): SavedCase | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const cases = loadCasesSafe().items;
  const safeForm = normalizeForm(form);

  if (existingId) {
    const idx = cases.findIndex((c) => c.id === existingId);
    if (idx >= 0) {
      const updated: SavedCase = {
        ...cases[idx],
        name: trimmed,
        form: { ...safeForm },
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
    form: { ...safeForm },
    results: { ...results },
  };
  writeCases([entry, ...cases]);
  return entry;
}

export function deleteCase(id: string): void {
  writeCases(loadCasesSafe().items.filter((c) => c.id !== id));
}

export function clearCorruptCases(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
