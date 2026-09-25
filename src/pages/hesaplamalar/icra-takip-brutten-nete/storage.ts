/**
 * İcra Takip — varyant başına izole lokal depo.
 */

import {
  createEmptyForm,
  newLocalId,
  storageKeyFor,
  type IcraForm,
  type IcraResults,
  type IcraVariant,
  type SavedCase,
} from "./model";

type CasesPayload = { version: 1; cases: SavedCase[] };

export type LoadResult<T> = { ok: true; items: T[] } | { ok: false; items: T[]; reason: string };

function normalizeForm(raw: Partial<IcraForm> | undefined | null): IcraForm {
  const empty = createEmptyForm();
  if (!raw || typeof raw !== "object") return empty;
  const period = raw.period === 1 ? 1 : 2;
  const faizTuru = raw.faizTuru === "en_yuksek_mevduat" ? "en_yuksek_mevduat" : "yasal";
  return {
    grossForNet: String(raw.grossForNet ?? empty.grossForNet),
    year: Number(raw.year) || empty.year,
    period,
    faizBaslangic: String(raw.faizBaslangic ?? empty.faizBaslangic),
    icraTakip: String(raw.icraTakip ?? empty.icraTakip),
    faizTuru,
  };
}

export function loadCasesSafe(variant: IcraVariant): LoadResult<SavedCase> {
  if (typeof window === "undefined") return { ok: true, items: [] };
  try {
    const raw = localStorage.getItem(storageKeyFor(variant));
    if (!raw) return { ok: true, items: [] };
    const parsed = JSON.parse(raw) as Partial<CasesPayload>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.cases)) {
      return { ok: false, items: [], reason: "Desteklenmeyen veya bozuk lokal veri bulundu." };
    }
    const items = parsed.cases
      .filter((c): c is SavedCase => !!c && typeof c.id === "string" && typeof c.name === "string")
      .map((c) => ({
        ...c,
        variant,
        form: normalizeForm(c.form),
        results: {
          netTutar: Number(c.results?.netTutar) || 0,
          totalInterest: Number(c.results?.totalInterest) || 0,
          takipToplami: Number(c.results?.takipToplami) || 0,
          totalDays: Number(c.results?.totalDays) || 0,
        },
      }));
    return { ok: true, items };
  } catch {
    return { ok: false, items: [], reason: "Lokal veri okunamadı." };
  }
}

function writeCases(variant: IcraVariant, cases: SavedCase[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKeyFor(variant), JSON.stringify({ version: 1, cases } satisfies CasesPayload));
}

export function saveCase(
  variant: IcraVariant,
  name: string,
  form: IcraForm,
  results: IcraResults,
  existingId?: string | null,
): SavedCase | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const cases = loadCasesSafe(variant).items;
  const safeForm = normalizeForm(form);

  if (existingId) {
    const idx = cases.findIndex((c) => c.id === existingId);
    if (idx >= 0) {
      const updated: SavedCase = {
        ...cases[idx],
        name: trimmed,
        variant,
        form: { ...safeForm },
        results: { ...results },
        updatedAt: new Date().toISOString(),
      };
      const next = [...cases];
      next[idx] = updated;
      writeCases(variant, next);
      return updated;
    }
  }

  const entry: SavedCase = {
    id: newLocalId(),
    name: trimmed,
    version: 1,
    variant,
    updatedAt: new Date().toISOString(),
    form: { ...safeForm },
    results: { ...results },
  };
  writeCases(variant, [entry, ...cases]);
  return entry;
}

export function deleteCase(variant: IcraVariant, id: string): void {
  writeCases(
    variant,
    loadCasesSafe(variant).items.filter((c) => c.id !== id),
  );
}

export function clearCorruptCases(variant: IcraVariant): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKeyFor(variant));
}
