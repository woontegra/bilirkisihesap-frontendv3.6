/**
 * Yıllık izin / UBGT dışlama günleri — V3 `annualLeaveCalendarDays.ts` yerel kopyası.
 * date-fns yok; yalnızca bu modül içinde kullanılır.
 */

import type { ExcludedDay } from "./types";

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

function toSafeDay(value: Date): Date | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
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
    return new Date(y, mo - 1, d);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function differenceInCalendarDays(a: Date, b: Date): number {
  const d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((d1.getTime() - d2.getTime()) / 86400000);
}

export function countAnnualLeaveCalendarDaysInWindow(
  winStart: Date,
  winEnd: Date,
  exclusions: ExcludedDay[] | null | undefined,
  ignoredWeekday?: number | null,
  inclusionTypes?: string[] | null,
): number {
  if (!exclusions?.length) return 0;
  const safeWinStart = toSafeDay(winStart);
  const safeWinEnd = toSafeDay(winEnd);
  if (!safeWinStart || !safeWinEnd || safeWinStart > safeWinEnd) return 0;

  const typeFilter = inclusionTypes && inclusionTypes.length > 0 ? new Set(inclusionTypes) : null;
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
    const span = differenceInCalendarDays(overlapEnd, overlapStart) + 1;
    for (let i = 0; i < span; i++) {
      const day = addDays(overlapStart, i);
      if (ignoredWeekday != null && day.getDay() === ignoredWeekday) continue;
      dayKeys.add(toISODate(day));
    }
  }
  return dayKeys.size;
}

export function ubgExtraBalanceDaysInWindow(
  winStart: Date,
  winEnd: Date,
  exclusions: ExcludedDay[] | null | undefined,
): number {
  if (!exclusions?.length) return 0;
  const safeWinStart = toSafeDay(winStart);
  const safeWinEnd = toSafeDay(winEnd);
  if (!safeWinStart || !safeWinEnd || safeWinStart > safeWinEnd) return 0;

  let extra = 0;
  for (const ex of exclusions) {
    if (ex.type !== "UBGT") continue;
    const s = String(ex.start ?? "").slice(0, 10);
    const e = String(ex.end ?? "").slice(0, 10);
    if (!s || s !== e) continue;
    const dnum = Math.floor(Number(ex.days) || 1);
    if (dnum <= 1) continue;
    const d = parseExclusionDate(s);
    if (!d) continue;
    if (d < safeWinStart || d > safeWinEnd) continue;
    extra += dnum - 1;
  }
  return extra;
}
