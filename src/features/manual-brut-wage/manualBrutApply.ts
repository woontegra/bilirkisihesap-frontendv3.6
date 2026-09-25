/**
 * Ortak: Hızlı Araçlar > Manuel Brüt Ücret şablonunu cetvel satırlarına uygulama.
 * FM / UBGT / ücret / hafta tatili bu modülü paylaşır (çapraz sayfa import yok).
 */

import {
  formatPeriodRangeLabel,
  getManuelBrutPeriodCatalog,
  periodStorageKey,
} from "@/pages/araclar/manuel-brut-ucret/periodCatalog";
import {
  getCachedTemplates,
  getTemplateById,
  loadTemplatesSafe,
} from "@/pages/araclar/manuel-brut-ucret/storage";
import type { ManuelBrutPeriodsMap, ManuelBrutTemplate } from "@/pages/araclar/manuel-brut-ucret/model";

export type ManualBrutRowStub = { id: string; startISO: string };

export async function loadManualBrutTemplates(): Promise<ManuelBrutTemplate[]> {
  const result = await loadTemplatesSafe();
  return result.templates;
}

export function hasManualBrutTemplates(): boolean {
  return getCachedTemplates().length > 0;
}

export async function getManualBrutTemplate(id: string): Promise<ManuelBrutTemplate | undefined> {
  return getTemplateById(id);
}

export function countFilledPeriods(periods: ManuelBrutPeriodsMap): number {
  return Object.values(periods).filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0).length;
}

export function formatManualPeriodLabel(periodKey: string): string {
  return formatPeriodRangeLabel(periodKey);
}

function findFloorPeriodForStartISO(isoDate: string): { start: string; end: string; floorBrut: number } | null {
  const d = String(isoDate).trim().slice(0, 10);
  if (d.length < 10) return null;
  for (const yearCat of getManuelBrutPeriodCatalog()) {
    for (const p of yearCat.periods) {
      if (d >= p.start.slice(0, 10) && d <= p.end.slice(0, 10)) {
        return { start: p.start, end: p.end, floorBrut: p.floorBrut };
      }
    }
  }
  return null;
}

/** Satır başlangıç tarihinin asgari dönemine göre şablon brütünü uygular. */
export function applyManualWagePeriodsToRowBruts(
  periods: ManuelBrutPeriodsMap,
  rows: ManualBrutRowStub[],
): { brutById: Record<string, number>; applied: number; skipped: number } {
  const brutById: Record<string, number> = {};
  let applied = 0;
  let skipped = 0;
  for (const r of rows) {
    const start = String(r.startISO ?? "").trim();
    if (!r.id || start.length < 10) {
      skipped += 1;
      continue;
    }
    const floor = findFloorPeriodForStartISO(start);
    if (!floor) {
      skipped += 1;
      continue;
    }
    const key = periodStorageKey(floor.start, floor.end);
    const wage = periods[key];
    if (wage == null || !(wage > 0) || wage < floor.floorBrut) {
      skipped += 1;
      continue;
    }
    brutById[r.id] = wage;
    applied += 1;
  }
  return { brutById, applied, skipped };
}
