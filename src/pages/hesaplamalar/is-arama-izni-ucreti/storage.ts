/**
 * İş Arama İzni Ücreti — versiyonlu lokal depo.
 * Backend/API yok; bozuk kayıt sayfayı çökertmez.
 */

import type { ExtraItem, IsAramaForm, SavedCase, TarihAralikDusum } from "./model";
import { createEmptyForm, newLocalId } from "./model";

export const STORAGE_KEY = "bilirkisi-hesap-v35:is-arama-izni-ucreti:cases:v1" as const;

type CasesPayload = { version: 1; cases: SavedCase[] };

export type LoadResult<T> = { ok: true; items: T[] } | { ok: false; items: T[]; reason: string };

function normalizeExtras(raw: unknown): ExtraItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      const rec = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return { id: String(rec.id || newLocalId("extra")), label: String(rec.label ?? ""), value: String(rec.value ?? "") };
    })
    .filter((x) => !!x.id);
}

function normalizeDusumler(raw: unknown): TarihAralikDusum[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      const rec = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        id: String(rec.id || newLocalId("dusum")),
        baslangic: String(rec.baslangic ?? ""),
        bitis: String(rec.bitis ?? ""),
        gunlukSaat: String(rec.gunlukSaat ?? ""),
      };
    })
    .filter((x) => !!x.id);
}

function normalizeForm(raw: Partial<IsAramaForm> | undefined | null): IsAramaForm {
  const empty = createEmptyForm();
  if (!raw || typeof raw !== "object") return empty;
  const haftalik = String(raw.haftalikCalismaGunu ?? empty.haftalikCalismaGunu);
  return {
    startDate: String(raw.startDate ?? empty.startDate),
    endDate: String(raw.endDate ?? empty.endDate),
    brut: String(raw.brut ?? empty.brut),
    prim: String(raw.prim ?? empty.prim),
    ikramiye: String(raw.ikramiye ?? empty.ikramiye),
    yol: String(raw.yol ?? empty.yol),
    yemek: String(raw.yemek ?? empty.yemek),
    extras: normalizeExtras(raw.extras),
    haftalikCalismaGunu: ["5", "6", "7"].includes(haftalik) ? haftalik : "5",
    kullandirilanIzinGun: String(raw.kullandirilanIzinGun ?? empty.kullandirilanIzinGun),
    tarihAralikDusumler: normalizeDusumler(raw.tarihAralikDusumler),
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
          toplamBrut: Number(c.results?.toplamBrut) || 0,
          brut: Number(c.results?.brut) || 0,
          net: Number(c.results?.net) || 0,
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
  form: IsAramaForm,
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
