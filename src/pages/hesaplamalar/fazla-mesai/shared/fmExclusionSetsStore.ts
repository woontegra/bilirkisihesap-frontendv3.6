/**
 * Fazla Mesai — paylaşılan izin/dışlama set deposu (tüm FM varyantları).
 * Kullanıcı hesabına bağlı API üzerinden.
 */

import {
  deleteSharedLeaveExclusionSet,
  fmItemsToPoolItems,
  listSharedLeaveExclusionSetsAsync,
  mergeRowsByFingerprint,
  poolItemsToFmItems,
  upsertSharedLeaveExclusionSet,
} from "@/lib/sharedLeaveExclusionPool";

export type FmExclusionItem = {
  id: string;
  type: string;
  start: string;
  end: string;
  days: number;
};

export type SavedExclusionSet = {
  id: string;
  name: string;
  data: FmExclusionItem[];
  createdAt: string;
};

export async function getAllExclusionSets(): Promise<SavedExclusionSet[]> {
  const sets = await listSharedLeaveExclusionSetsAsync();
  return sets.map((set) => ({
    id: set.id,
    name: set.name,
    data: poolItemsToFmItems(set.data) as FmExclusionItem[],
    createdAt: set.createdAt,
  }));
}

export async function saveExclusionSet(name: string, data: FmExclusionItem[]): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const items = fmItemsToPoolItems(data);
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

/** İçe aktarma: UBGT korunur, diğer satırlar birleştirilir, mükerrer eklenmez. */
export function mergeFmExclusionImport<T extends FmExclusionItem>(
  prev: T[],
  loaded: T[],
  newLocalId: () => string,
): T[] {
  const isUbgt = (e: FmExclusionItem) => String(e.type || "").trim() === "UBGT";
  const prevUbgt = prev.filter(isUbgt);
  const loadedUbgt = loaded.filter(isUbgt);
  const loadedOther = loaded.filter((e) => !isUbgt(e));
  const ubgt = prevUbgt.length > 0 ? prevUbgt : loadedUbgt;
  const mergedOther = mergeRowsByFingerprint(
    prev.filter((e) => !isUbgt(e)),
    loadedOther,
    newLocalId,
  );
  return [...ubgt, ...mergedOther] as T[];
}
