/**
 * Lokal exclusion / kullanılan-izin set yardımcıları —
 * UsedLeaveRow ↔ LocalExclusionSetItem ve legacy GET → hesap havuzu.
 */

import { apiClient } from "@/api/client";
import {
  clearExclusionLegacyImportedFlag,
  markExclusionLegacyImported,
  type LocalExclusionSetItem,
  wasExclusionLegacyImported,
} from "@/lib/localExclusionSetsStore";
import {
  mergeLegacyIntoSharedLeavePool,
  SHARED_LEAVE_EXCLUSION_POOL_ID,
} from "@/lib/sharedLeaveExclusionPool";

export type UsedLeaveLike = {
  id: string;
  start: string;
  end: string;
  days: string;
};

function toDays(value: string | number | undefined | null): number {
  return Number(String(value ?? "").replace(/\./g, "").replace(",", ".")) || 0;
}

/** Kaydet: başlangıç+bitiş dolu satırlar (V3 rowsToExcludedDays). */
export function collectExclusionSetItems(rows: UsedLeaveLike[]): LocalExclusionSetItem[] {
  return rows
    .filter((r) => r.start && r.end)
    .map((r) => ({
      id: r.id || `item-${Math.random().toString(36).slice(2, 10)}`,
      type: "Kullanılan İzin",
      start: r.start,
      end: r.end,
      days: toDays(r.days),
    }));
}

/** İçe aktar: LocalExclusionSetItem[] → UsedLeaveRow şekli. */
export function exclusionItemsToUsedRows(items: LocalExclusionSetItem[], minRows = 2): UsedLeaveLike[] {
  if (!items.length) {
    return Array.from({ length: minRows }, () => ({
      id: Math.random().toString(36).slice(2),
      start: "",
      end: "",
      days: "",
    }));
  }
  return items.map((row) => ({
    id: row.id || Math.random().toString(36).slice(2),
    start: row.start || "",
    end: row.end || "",
    days: row.days != null ? String(row.days) : "",
  }));
}

/**
 * Eski global /api/exclusion-sets listesini hesap havuzuna aktarır.
 * force=true → flag temizleyip yeniden tara.
 */
export async function tryMergeLegacyExclusionSets(
  moduleId: string,
  options?: { force?: boolean },
): Promise<{ imported: number; skipped: number } | null> {
  const scope = moduleId || SHARED_LEAVE_EXCLUSION_POOL_ID;
  if (!options?.force && wasExclusionLegacyImported(scope)) return null;
  if (options?.force) clearExclusionLegacyImportedFlag(scope);
  try {
    const raw = await apiClient<unknown>("/api/exclusion-sets", { method: "GET" });
    const list = Array.isArray(raw) ? raw : [];
    const result = await mergeLegacyIntoSharedLeavePool(
      list.filter((e): e is { id?: number; name?: string; data?: unknown } => !!e && typeof e === "object"),
    );
    markExclusionLegacyImported(scope);
    return result;
  } catch {
    return null;
  }
}
