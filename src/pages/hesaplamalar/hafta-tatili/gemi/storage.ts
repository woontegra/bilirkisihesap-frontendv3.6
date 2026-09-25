import type { DateRange, ExcludedDay, TableRow } from "../lib/types";
import { newLocalId } from "../lib/money";
import { createEmptyForm, type GemiForm, type SavedCase } from "./model";

export const STORAGE_KEY = "bilirkisi-hesap-v35:hafta-tatili-gemi:cases:v1" as const;

type CasesPayload = { version: 1; cases: SavedCase[] };

export type LoadResult<T> = { ok: true; items: T[] } | { ok: false; items: T[]; reason: string };

function normalizeRanges(raw: unknown): DateRange[] {
  if (!Array.isArray(raw)) return createEmptyForm().dateRanges;
  return raw.map((x) => {
    const rec = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return { id: String(rec.id || newLocalId("dr")), start: String(rec.start ?? ""), end: String(rec.end ?? "") };
  });
}

function normalizeExcluded(raw: unknown): ExcludedDay[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    const rec = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const type = String(rec.type ?? "Diğer") as ExcludedDay["type"];
    return {
      id: String(rec.id || newLocalId("ex")),
      type: type === "Yıllık İzin" || type === "Rapor" || type === "UBGT" || type === "Diğer" ? type : "Diğer",
      start: String(rec.start ?? ""),
      end: String(rec.end ?? ""),
      days: Number(rec.days) || 0,
    };
  });
}

function normalizeRows(raw: unknown): TableRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    const rec = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return {
      id: String(rec.id || newLocalId("row")),
      period: String(rec.period ?? ""),
      startISO: String(rec.startISO ?? ""),
      endISO: String(rec.endISO ?? ""),
      weekCount: Number(rec.weekCount) || 0,
      wage: Number(rec.wage) || 0,
      coefficient: Number(rec.coefficient) || 1,
      dailyWage: Number(rec.dailyWage) || 0,
      daily50: Number(rec.daily50) || 0,
      haftaTatiliDays: Number(rec.haftaTatiliDays) || 0,
      haftaTatiliTotal: Number(rec.haftaTatiliTotal) || 0,
      manual: !!rec.manual,
      manualWeekCount: !!rec.manualWeekCount,
      brutManual: !!rec.brutManual,
    };
  });
}

function normalizeForm(raw: Partial<GemiForm> | undefined | null): GemiForm {
  const empty = createEmptyForm();
  if (!raw || typeof raw !== "object") return empty;
  return {
    dateRanges: normalizeRanges(raw.dateRanges).length ? normalizeRanges(raw.dateRanges) : empty.dateRanges,
    excludedDays: normalizeExcluded(raw.excludedDays),
    expiryStart: raw.expiryStart ? String(raw.expiryStart) : null,
    selectedHolidayIds: Array.isArray(raw.selectedHolidayIds) ? raw.selectedHolidayIds.map(String) : [],
    rows: normalizeRows(raw.rows),
    settleAmount: String(raw.settleAmount ?? ""),
    globalCoefficient: Number(raw.globalCoefficient) || 1,
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
    return {
      ok: true,
      items: parsed.cases
        .filter((c): c is SavedCase => !!c && typeof c.id === "string" && typeof c.name === "string")
        .map((c) => ({
          ...c,
          form: normalizeForm(c.form),
          results: { totalBrut: Number(c.results?.totalBrut) || 0, netAmount: Number(c.results?.netAmount) || 0 },
        })),
    };
  } catch {
    return { ok: false, items: [], reason: "Lokal veri okunamadı." };
  }
}

function writeCases(cases: SavedCase[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, cases } satisfies CasesPayload));
}

export function saveCase(name: string, form: GemiForm, results: SavedCase["results"], existingId?: string | null): SavedCase | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const cases = loadCasesSafe().items;
  const safeForm = normalizeForm(form);
  if (existingId) {
    const idx = cases.findIndex((c) => c.id === existingId);
    if (idx >= 0) {
      const updated: SavedCase = { ...cases[idx], name: trimmed, form: { ...safeForm }, results: { ...results }, updatedAt: new Date().toISOString() };
      const next = [...cases];
      next[idx] = updated;
      writeCases(next);
      return updated;
    }
  }
  const entry: SavedCase = { id: newLocalId(), name: trimmed, version: 1, updatedAt: new Date().toISOString(), form: { ...safeForm }, results: { ...results } };
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
