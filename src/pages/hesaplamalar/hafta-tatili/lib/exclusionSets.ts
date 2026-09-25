/**
 * Hafta Tatili — dışlama seti ↔ ExcludedDay dönüşümleri.
 */

import type { LocalExclusionSetItem } from "../../../../lib/localExclusionSetsStore";
import { SHARED_LEAVE_EXCLUSION_POOL_ID } from "@/lib/sharedLeaveExclusionPool";
import { newLocalId } from "./money";
import type { ExcludedDay } from "./types";

const EXCLUDE_TYPES: ExcludedDay["type"][] = ["Yıllık İzin", "Rapor", "Diğer", "UBGT"];

function normalizeType(raw?: string): ExcludedDay["type"] {
  const t = String(raw ?? "").trim();
  if ((EXCLUDE_TYPES as string[]).includes(t)) return t as ExcludedDay["type"];
  return "Diğer";
}

export function excludedDaysToSetItems(days: ExcludedDay[]): LocalExclusionSetItem[] {
  return days
    .filter((d) => d.start && d.end)
    .map((d) => ({
      id: d.id || newLocalId("ex"),
      type: d.type,
      start: d.start,
      end: d.end,
      days: Number(d.days) || 0,
    }));
}

export function setItemsToExcludedDays(items: LocalExclusionSetItem[]): ExcludedDay[] {
  return items.map((it) => ({
    id: it.id || newLocalId("ex"),
    type: normalizeType(it.type),
    start: it.start || "",
    end: it.end || "",
    days: Number(it.days) || 0,
  }));
}

export const HT_EXCLUSION_SETS_MODULE_ID = SHARED_LEAVE_EXCLUSION_POOL_ID;
