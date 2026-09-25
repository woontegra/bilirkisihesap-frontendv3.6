/**
 * Yıllık izin: kesir/oran yok — pencere içindeki takvim günleri tekilleştirilerek tam gün sayılır.
 */

import { addDays, differenceInCalendarDays, isValid, parseISO, startOfDay } from "date-fns";
import type { ExcludedDay } from "../../types/exclusionStorage";

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
  if (!(value instanceof Date) || !isValid(value)) return null;
  return startOfDay(value);
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
    return startOfDay(dt);
  }
  const parsed = parseISO(value);
  if (!isValid(parsed)) return null;
  return startOfDay(parsed);
}

/**
 * [winStart, winEnd] kapsayan her takvim günü için, exclusions ile kesişen günleri bir kez sayar.
 * Dönüş: tam sayı (0 veya pozitif).
 */
export function countAnnualLeaveCalendarDaysInWindow(
  winStart: Date,
  winEnd: Date,
  exclusions: ExcludedDay[] | null | undefined,
  ignoredWeekday?: number | null,
  /** Verilmezse veya boşsa tüm türler; aksi halde sadece bu `type` değerleri sayılır. */
  inclusionTypes?: string[] | null
): number {
  if (!exclusions?.length) return 0;
  const safeWinStart = toSafeDay(winStart);
  const safeWinEnd = toSafeDay(winEnd);
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
    const span = differenceInCalendarDays(overlapEnd, overlapStart) + 1;
    for (let i = 0; i < span; i++) {
      const day = addDays(overlapStart, i);
      if (ignoredWeekday != null && day.getDay() === ignoredWeekday) continue;
      dayKeys.add(toISODate(day));
    }
  }
  return dayKeys.size;
}

/**
 * Tek takvim gününe (`start === end`) yazılmış UBGT kayıtlarında `days > 1` ise, takvim tekilliğine eklenen
 * FM gün bilançosu (`days - 1`) — `applyAnnualLeaveExclusions` içindeki `ubgExtraBalanceDays` ile aynı mantık.
 */
export function ubgExtraBalanceDaysInWindow(
  winStart: Date,
  winEnd: Date,
  exclusions: ExcludedDay[] | null | undefined
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
