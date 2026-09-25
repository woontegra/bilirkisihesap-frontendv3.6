/**
 * Hafta tatili gününe denk gelen dışlama takvim günlerini motordan önce çıkarır (Standart FM pilot).
 */

import { addDays } from "date-fns";
import type { ExcludedDay } from "../../types/exclusionStorage";
import { parseFmDate } from "./deductionPeriodEngine";

const UBGT_ALIASES = new Set(["UBGT", "ubgt"]);
const YILLIK_IZIN_ALIASES = new Set([
  "Yıllık İzin",
  "Yillik Izin",
  "YILLIK_IZIN",
  "yillik_izin",
]);

function isFmDeductionExclusionType(type: string): boolean {
  const t = String(type ?? "").trim();
  if (UBGT_ALIASES.has(t) || t.toUpperCase() === "UBGT") return true;
  if (YILLIK_IZIN_ALIASES.has(t)) return true;
  if (/yıllık\s*izin/i.test(t) || /yillik\s*izin/i.test(t)) return true;
  return false;
}

/** 0=Pazar … 5=Cuma — hafta tatili seçilmemişse tüm günler sayılır. */
export function shouldCountExclusionAnchorDay(date: Date, weeklyOffDay: number | null): boolean {
  if (weeklyOffDay == null || !Number.isInteger(weeklyOffDay)) return true;
  return date.getDay() !== weeklyOffDay;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function exclusionDayWeight(ex: ExcludedDay): number {
  const explicit = Number(ex.days);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit >= 1 ? 1 : 0.5;
  }
  return 1;
}

/**
 * Tek kayıttan hafta tatili hariç anchor günlerini üretir (motor `normalizeDeductionDays` cap sırasıyla uyumlu).
 */
function anchorDaysForOneExclusion(ex: ExcludedDay, weeklyOffDay: number): Date[] {
  const exStart = parseFmDate(ex.start ?? "");
  const exEnd = parseFmDate(ex.end ?? "");
  if (!exStart || !exEnd || exStart > exEnd) return [];

  const explicitCap =
    Number(ex.days) > 0 && Number.isFinite(Number(ex.days)) ? Math.floor(Number(ex.days)) : null;

  const anchors: Date[] = [];
  let used = 0;
  let cur = exStart;
  while (cur <= exEnd) {
    if (explicitCap != null && used >= explicitCap) break;
    if (shouldCountExclusionAnchorDay(cur, weeklyOffDay)) {
      anchors.push(cur);
    }
    used += 1;
    cur = addDays(cur, 1);
  }
  return anchors;
}

/**
 * Motora gidecek exclusion listesi — hafta tatiline denk günler çıkarılır; diğer günler tek günlük kayıt olarak kalır.
 */
export function filterExclusionsForWeeklyOff(
  exclusions: ExcludedDay[],
  weeklyOffDay: number | null | undefined,
): ExcludedDay[] {
  if (weeklyOffDay == null || !Number.isInteger(weeklyOffDay)) {
    return exclusions;
  }

  const out: ExcludedDay[] = [];

  for (const ex of exclusions) {
    if (!isFmDeductionExclusionType(String(ex.type ?? ""))) {
      out.push(ex);
      continue;
    }

    const anchors = anchorDaysForOneExclusion(ex, weeklyOffDay);
    const weight = exclusionDayWeight(ex);
    for (const d of anchors) {
      const iso = toISODate(d);
      out.push({
        ...ex,
        start: iso,
        end: iso,
        days: weight,
      });
    }
  }

  return out;
}
