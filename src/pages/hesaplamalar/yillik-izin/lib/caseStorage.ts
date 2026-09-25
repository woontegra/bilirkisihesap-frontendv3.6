/**
 * Yıllık Ücretli İzin — versiyonlu lokal depo (jenerik fabrika).
 * Yalnızca yillik-izin modülü içinde paylaşılır.
 */

export type SavedYillikCase<Form, Results> = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: Form;
  results: Results;
};

export type LoadResult<T> = { ok: true; items: T[] } | { ok: false; items: T[]; reason: string };

export function newLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type CaseStorageApi<Form, Results> = {
  loadCasesSafe: () => LoadResult<SavedYillikCase<Form, Results>>;
  saveCase: (
    name: string,
    form: Form,
    results: Results,
    existingId?: string | null,
  ) => SavedYillikCase<Form, Results> | null;
  deleteCase: (id: string) => void;
  clearCorruptCases: () => void;
};

export function createCaseStorage<Form, Results>(
  storageKey: string,
  normalizeForm: (raw: Form) => Form,
  normalizeResults: (raw: Results) => Results,
  idPrefix: string,
): CaseStorageApi<Form, Results> {
  type Case = SavedYillikCase<Form, Results>;
  type Payload = { version: 1; cases: Case[] };

  function loadCasesSafe(): LoadResult<Case> {
    if (typeof window === "undefined") return { ok: true, items: [] };
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { ok: true, items: [] };
      const parsed = JSON.parse(raw) as Partial<Payload>;
      if (parsed?.version !== 1 || !Array.isArray(parsed.cases)) {
        return { ok: false, items: [], reason: "Desteklenmeyen veya bozuk lokal veri bulundu." };
      }
      const items = parsed.cases
        .filter((c): c is Case => !!c && typeof c.id === "string" && typeof c.name === "string" && !!c.form)
        .map((c) => ({
          ...c,
          form: normalizeForm(c.form),
          results: normalizeResults(c.results),
        }));
      return { ok: true, items };
    } catch {
      return { ok: false, items: [], reason: "Lokal veri okunamadı." };
    }
  }

  function writeCases(cases: Case[]): void {
    if (typeof window === "undefined") return;
    const payload: Payload = { version: 1, cases };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  }

  function saveCase(
    name: string,
    form: Form,
    results: Results,
    existingId?: string | null,
  ): Case | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const cases = loadCasesSafe().items;
    const safeForm = normalizeForm(form);
    const safeResults = normalizeResults(results);

    if (existingId) {
      const idx = cases.findIndex((c) => c.id === existingId);
      if (idx >= 0) {
        const updated: Case = {
          ...cases[idx],
          name: trimmed,
          form: safeForm,
          results: safeResults,
          updatedAt: new Date().toISOString(),
        };
        const next = [...cases];
        next[idx] = updated;
        writeCases(next);
        return updated;
      }
    }

    const entry: Case = {
      id: newLocalId(idPrefix),
      name: trimmed,
      version: 1,
      updatedAt: new Date().toISOString(),
      form: safeForm,
      results: safeResults,
    };
    writeCases([entry, ...cases]);
    return entry;
  }

  function deleteCase(id: string): void {
    writeCases(loadCasesSafe().items.filter((c) => c.id !== id));
  }

  function clearCorruptCases(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(storageKey);
  }

  return { loadCasesSafe, saveCase, deleteCase, clearCorruptCases };
}
