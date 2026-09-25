/**
 * UBGT — versiyonlu lokal depo (API yok).
 */

import { STORAGE_KEY, createEmptyForm, newLocalId, type SavedCase, type UbgtForm, type UbgtResults } from "./model";

type CasesPayload = { version: 1; cases: SavedCase[] };
export type LoadResult<T> = { ok: true; items: T[] } | { ok: false; items: T[]; reason: string };

function normalizeForm(raw: Partial<UbgtForm> | undefined | null, mode: UbgtForm["mode"]): UbgtForm {
  const empty = createEmptyForm(mode);
  if (!raw || typeof raw !== "object") return empty;
  return {
    mode: raw.mode === "bilirkisi" ? "bilirkisi" : mode,
    dateRanges: Array.isArray(raw.dateRanges) && raw.dateRanges.length
      ? raw.dateRanges.map((r) => ({
          id: String(r?.id || newLocalId("range")),
          start: String(r?.start ?? ""),
          end: String(r?.end ?? ""),
          person: r?.person ? String(r.person) : mode === "bilirkisi" ? "Davacı" : undefined,
          selectedHolidayIds: Array.isArray(r?.selectedHolidayIds) ? r.selectedHolidayIds.map(String) : mode === "bilirkisi" ? [] : undefined,
        }))
      : empty.dateRanges,
    witnesses: Array.isArray(raw.witnesses)
      ? raw.witnesses.map((w) => ({
          id: String(w?.id || newLocalId("tanik")),
          name: String(w?.name ?? "Tanık"),
          start: String(w?.start ?? ""),
          end: String(w?.end ?? ""),
          selectedHolidayIds: Array.isArray(w?.selectedHolidayIds) ? w.selectedHolidayIds.map(String) : [],
        }))
      : empty.witnesses,
    selectedHolidayIds: Array.isArray(raw.selectedHolidayIds) ? raw.selectedHolidayIds.map(String) : [],
    ubgtExcludedDays: Array.isArray(raw.ubgtExcludedDays)
      ? raw.ubgtExcludedDays.map((d) => ({
          id: String((d as { id?: string })?.id || newLocalId("ex")),
          type: ((d as { type?: string })?.type as UbgtForm["ubgtExcludedDays"][0]["type"]) || "Yıllık İzin",
          start: String((d as { start?: string })?.start ?? ""),
          end: String((d as { end?: string })?.end ?? ""),
          days: Number((d as { days?: number })?.days) || 0,
        }))
      : [],
    ubgtExclusionRules: Array.isArray(raw.ubgtExclusionRules)
      ? (raw.ubgtExclusionRules as UbgtForm["ubgtExclusionRules"])
      : [],
    ubgtExpiryStart: String(raw.ubgtExpiryStart ?? ""),
    excludedWeekdays: Array.isArray(raw.excludedWeekdays) ? raw.excludedWeekdays.map(Number) : [],
    year: Number(raw.year) || empty.year,
    settleAmount: String(raw.settleAmount ?? ""),
    mahsuplasamaData:
      raw.mahsuplasamaData && typeof raw.mahsuplasamaData === "object" ? { ...raw.mahsuplasamaData } : {},
    periodOverrides:
      raw.periodOverrides && typeof raw.periodOverrides === "object" ? { ...raw.periodOverrides } : {},
    manualPeriodRows: Array.isArray(raw.manualPeriodRows)
      ? raw.manualPeriodRows.map((r) => ({
          id: String(r?.id || newLocalId("period")),
          insertAfterId: String(r?.insertAfterId ?? ""),
          startISO: String(r?.startISO ?? ""),
          endISO: String(r?.endISO ?? ""),
          wage: String(r?.wage ?? "0"),
          coefficient: String(r?.coefficient ?? "1"),
          ubgtDays: String(r?.ubgtDays ?? "0"),
        }))
      : [],
    hiddenPeriodIds: Array.isArray(raw.hiddenPeriodIds) ? raw.hiddenPeriodIds.map(String) : [],
    manualDayRows: Array.isArray(raw.manualDayRows)
      ? raw.manualDayRows.map((r) => ({
          id: String(r?.id || newLocalId("day")),
          insertAfterKey: String(r?.insertAfterKey ?? ""),
          date: String(r?.date ?? ""),
          holidayLabel: String(r?.holidayLabel ?? "Manuel"),
          days: Number(r?.days) === 0.5 ? 0.5 : 1,
        }))
      : [],
  };
}

export function loadCasesSafe(mode: UbgtForm["mode"]): LoadResult<SavedCase> {
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
        form: normalizeForm(c.form, mode),
        results: {
          periods: Array.isArray(c.results?.periods) ? c.results.periods : [],
          ubgtDayEntries: Array.isArray(c.results?.ubgtDayEntries) ? c.results.ubgtDayEntries : [],
          toplamBrut: Number(c.results?.toplamBrut) || 0,
          toplamNet: c.results?.toplamNet || {
            ssk: 0,
            issizlik: 0,
            gelirVergisi: 0,
            damgaVergisi: 0,
            netAmount: 0,
            gelirVergisiDilimleri: "",
          },
          totalDays: Number(c.results?.totalDays) || 0,
        },
      }))
      .filter((c) => c.form.mode === mode);
    return { ok: true, items };
  } catch {
    return { ok: false, items: [], reason: "Lokal veri okunamadı." };
  }
}

function writeAll(cases: SavedCase[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, cases } satisfies CasesPayload));
}

function loadAllRaw(): SavedCase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<CasesPayload>;
    return Array.isArray(parsed.cases) ? (parsed.cases as SavedCase[]) : [];
  } catch {
    return [];
  }
}

export function saveCase(
  mode: UbgtForm["mode"],
  name: string,
  form: UbgtForm,
  results: UbgtResults,
  existingId?: string | null,
): SavedCase | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const all = loadAllRaw();
  const safeForm = normalizeForm(form, mode);
  if (existingId) {
    const idx = all.findIndex((c) => c.id === existingId);
    if (idx >= 0) {
      const updated: SavedCase = {
        ...all[idx],
        name: trimmed,
        form: { ...safeForm, mode },
        results: { ...results },
        savedAt: new Date().toISOString(),
      };
      const next = [...all];
      next[idx] = updated;
      writeAll(next);
      return updated;
    }
  }
  const entry: SavedCase = {
    id: newLocalId("ubgt"),
    name: trimmed,
    savedAt: new Date().toISOString(),
    form: { ...safeForm, mode },
    results: { ...results },
  };
  writeAll([entry, ...all]);
  return entry;
}

export function deleteCase(id: string): void {
  writeAll(loadAllRaw().filter((c) => c.id !== id));
}

export function clearCorruptCases(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
