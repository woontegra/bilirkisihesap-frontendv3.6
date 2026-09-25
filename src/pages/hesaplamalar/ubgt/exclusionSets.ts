/**
 * UBGT dışlanabilir gün aralıkları — paylaşılan izin/dışlama havuzu (hesap API).
 */

import {
  deleteSharedLeaveExclusionSet,
  fmItemsToPoolItems,
  listSharedLeaveExclusionSetsAsync,
  mergeRowsByFingerprint,
  poolItemsToFmItems,
  upsertSharedLeaveExclusionSet,
} from "@/lib/sharedLeaveExclusionPool";
import type { UbgtExcludedDayRow } from "./model";

export type SavedUbgtExclusionSet = {
  id: string;
  name: string;
  data: UbgtExcludedDayRow[];
  createdAt: string;
};

const UBGT_INCOMPATIBLE_TYPES = new Set(["UBGT", "Puantaj/Bordro", "Puantaj-Bordro"]);

function toUbgtRows(items: ReturnType<typeof poolItemsToFmItems>): UbgtExcludedDayRow[] {
  return items
    .filter((it) => !UBGT_INCOMPATIBLE_TYPES.has(it.type))
    .map((it) => ({
      id: it.id,
      type: (["Yıllık İzin", "Rapor", "Diğer"].includes(it.type)
        ? it.type
        : "Diğer") as UbgtExcludedDayRow["type"],
      start: it.start,
      end: it.end,
      days: it.days,
    }));
}

/** İçe aktarma: mevcut satırları korur, mükerrer eklemez. */
export function mergeUbgtExclusionImport(
  prev: UbgtExcludedDayRow[],
  loaded: UbgtExcludedDayRow[],
  createId: () => string,
): UbgtExcludedDayRow[] {
  const normalize = (row: UbgtExcludedDayRow): UbgtExcludedDayRow & { id: string; days: number } => ({
    ...row,
    id: row.id ?? createId(),
    days: Number(row.days) || 0,
  });
  return mergeRowsByFingerprint(prev.map(normalize), loaded.map(normalize), createId);
}

export async function getAllExclusionSets(): Promise<SavedUbgtExclusionSet[]> {
  const sets = await listSharedLeaveExclusionSetsAsync();
  return sets.map((set) => ({
    id: set.id,
    name: set.name,
    data: toUbgtRows(poolItemsToFmItems(set.data)),
    createdAt: set.createdAt,
  }));
}

export async function saveExclusionSet(name: string, data: UbgtExcludedDayRow[]): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const items = fmItemsToPoolItems(
    data.map((d) => ({
      id: d.id,
      type: d.type,
      start: d.start,
      end: d.end,
      days: Number(d.days) || 0,
    })),
  );
  if (!items.length) return false;
  try {
    await upsertSharedLeaveExclusionSet(trimmed, items);
    return true;
  } catch {
    return false;
  }
}

export async function deleteExclusionSet(id: string): Promise<boolean> {
  try {
    await deleteSharedLeaveExclusionSet(id);
    return true;
  } catch {
    return false;
  }
}
