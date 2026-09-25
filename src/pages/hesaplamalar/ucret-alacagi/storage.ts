/**
 * Ücret Alacağı — versiyonlu lokal depo.
 * Backend/API yok; bozuk kayıt sayfayı çökertmez.
 */

import type { CetvelRow, HesaplamaTab, SavedCase, UcretAlacagiForm } from "./model";
import { createEmptyForm, newLocalId } from "./model";

export const STORAGE_KEY = "bilirkisi-hesap-v35:ucret-alacagi:cases:v1" as const;

type CasesPayload = { version: 1; cases: SavedCase[] };

export type LoadResult<T> = { ok: true; items: T[] } | { ok: false; items: T[]; reason: string };

function normalizeRows(raw: unknown): CetvelRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      const rec = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const startISO = String(rec.startISO ?? "");
      const endISO = String(rec.endISO ?? "");
      return {
        id: String(rec.id || newLocalId("row")),
        rangeLabel: String(rec.rangeLabel ?? ""),
        startISO,
        endISO,
        katsayi: Number(rec.katsayi) || 1,
        ucret: Number(rec.ucret) || 0,
        gunSayisi: Number(rec.gunSayisi) || 0,
        ayGunSayisi: Number(rec.ayGunSayisi) || 30,
        ucretManual: Boolean(rec.ucretManual),
        odenenUcret: Number(rec.odenenUcret) || 0,
        netVerisiYok: rec.netVerisiYok != null ? Boolean(rec.netVerisiYok) : undefined,
      } as CetvelRow;
    })
    .filter((r) => !!r.id);
}

function normalizeForm(raw: Partial<UcretAlacagiForm> | undefined | null): UcretAlacagiForm {
  const empty = createEmptyForm();
  if (!raw || typeof raw !== "object") return empty;
  const activeTab: HesaplamaTab = raw.activeTab === "net" ? "net" : "brut";
  return {
    startDate: String(raw.startDate ?? empty.startDate),
    endDate: String(raw.endDate ?? empty.endDate),
    activeTab,
    cetvelRows: normalizeRows(raw.cetvelRows),
    netCetvelRows: normalizeRows(raw.netCetvelRows),
    globalKatsayi: Number(raw.globalKatsayi) || 1,
    netGlobalKatsayi: Number(raw.netGlobalKatsayi) || 1,
    hasCustomKatsayi: Boolean(raw.hasCustomKatsayi),
    netHasCustomKatsayi: Boolean(raw.netHasCustomKatsayi),
    netForGross: String(raw.netForGross ?? empty.netForGross),
    netTabGrossForNet: String(raw.netTabGrossForNet ?? empty.netTabGrossForNet),
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
          totalBrut: Number(c.results?.totalBrut) || 0,
          totalNet: Number(c.results?.totalNet) || 0,
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
  form: UcretAlacagiForm,
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
