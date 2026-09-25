/**
 * Yıllık izin / UBGT — pencere içi takvim günü sayımı (V3 `annualLeaveCalendarDays.ts` ile aynı mantık).
 */

import type { ExclusionItem } from "./model";

function dateMax(a: Date, b: Date): Date {
  return a > b ? a : b;
}

function dateMin(a: Date, b: Date): Date {
  return a < b ? a : b;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addLocalDays(d: Date, amount: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + amount);
  return out;
}

function parseExclusionDate(value: string): Date | null {
  if (!value) return null;
  const head = String(value).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function calendarDaysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * [winStart, winEnd] kapsayan her takvim günü için, exclusions ile kesişen günleri bir kez sayar.
 */
export function countAnnualLeaveCalendarDaysInWindow(
  winStart: Date,
  winEnd: Date,
  exclusions: ExclusionItem[] | null | undefined,
  ignoredWeekday?: number | null,
  inclusionTypes?: string[] | null,
): number {
  if (!exclusions?.length) return 0;
  const safeWinStart = parseExclusionDate(toISODate(winStart));
  const safeWinEnd = parseExclusionDate(toISODate(winEnd));
  if (!safeWinStart || !safeWinEnd || safeWinStart > safeWinEnd) return 0;

  const typeFilter =
    inclusionTypes && inclusionTypes.length > 0 ? new Set(inclusionTypes) : null;

  const dayKeys = new Set<string>();
  for (const excl of exclusions) {
    if (typeFilter) {
      const t = excl.type ?? "";
      if (!typeFilter.has(t)) continue;
    }
    const exclStart = parseExclusionDate(excl.start);
    const exclEnd = parseExclusionDate(excl.end);
    if (!exclStart || !exclEnd || exclStart > exclEnd) continue;
    const overlapStart = dateMax(exclStart, safeWinStart);
    const overlapEnd = dateMin(exclEnd, safeWinEnd);
    if (overlapStart > overlapEnd) continue;
    const span = calendarDaysBetween(overlapStart, overlapEnd);
    for (let i = 0; i < span; i++) {
      const day = addLocalDays(overlapStart, i);
      if (ignoredWeekday != null && day.getDay() === ignoredWeekday) continue;
      dayKeys.add(toISODate(day));
    }
  }
  return dayKeys.size;
}
