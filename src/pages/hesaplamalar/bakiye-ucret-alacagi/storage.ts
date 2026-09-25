/**
 * Bakiye Ücret Alacağı — versiyonlu lokal depo (API yok).
 */

import {
  STORAGE_KEY,
  createEmptyForm,
  newLocalId,
  type BakiyeForm,
  type BakiyeResults,
  type SavedCase,
} from "./model";

type CasesPayload = { version: 1; cases: SavedCase[] };
export type LoadResult<T> = { ok: true; items: T[] } | { ok: false; items: T[]; reason: string };

function normalizeForm(raw: Partial<BakiyeForm> | undefined | null): BakiyeForm {
  const empty = createEmptyForm();
  if (!raw || typeof raw !== "object") return empty;
  return {
    startDate: String(raw.startDate ?? ""),
    endDate: String(raw.endDate ?? ""),
    resignDate: String(raw.resignDate ?? ""),
    brut: String(raw.brut ?? ""),
    extras: Array.isArray(raw.extras)
      ? raw.extras.map((e) => ({
          id: String(e?.id || newLocalId("extra")),
          label: String(e?.label ?? ""),
          value: String(e?.value ?? ""),
        }))
      : empty.extras,
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
          rows: Array.isArray(c.results?.rows) ? c.results.rows : [],
          monthRows: Array.isArray(c.results?.monthRows) ? c.results.monthRows : [],
          totalAmount: Number(c.results?.totalAmount) || 0,
          monthly: Number(c.results?.monthly) || 0,
        },
      }));
    return { ok: true, items };
  } catch {
    return { ok: false, items: [], reason: "Lokal veri okunamadı." };
  }
}

function writeCases(cases: SavedCase[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, cases } satisfies CasesPayload));
}

export function saveCase(
  name: string,
  form: BakiyeForm,
  results: BakiyeResults,
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
        savedAt: new Date().toISOString(),
      };
      const next = [...cases];
      next[idx] = updated;
      writeCases(next);
      return updated;
    }
  }
  const entry: SavedCase = {
    id: newLocalId("bakiye"),
    name: trimmed,
    savedAt: new Date().toISOString(),
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
