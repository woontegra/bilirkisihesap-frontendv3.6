/**
 * 48 Saat (24/48) Vardiya — UBGT / yıllık izin düşüm satırı köprüsü.
 * Düşüm günleri 7 günlük pencerelere yerleştirilir; her pencere 1 düşüm bloğu sayılır.
 * Düşüm FM: kalan vardiya günü × 3 (2→6, 3→9 saat).
 */

import type { ExcludedDay } from "./model";
import { normalizeDeductionDays, parseFmDate, type NormalizedDeductionOnDate } from "./deductionDays";
import { getAsgariUcretByDate } from "./asgariUcret";
import { generateWorkDays48 } from "./generateWorkDays48";
import { getAnchorWeekBucketKey, groupWeeks48 } from "./groupWeeks48";
import { isV48TransitionMotorNote } from "./vardiya48TransitionNotes";

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** 24/48 vardiya: haftalık 6 veya 9 saat → vardiya günü başı 3 saat FM. */
export const VARDIYA48_FM_HOURS_PER_WORK_DAY = 3;

export type Vardiya48ExpandRow = {
  id?: string;
  isManual?: boolean;
  rangeLabel?: string;
  weeks: number;
  brut: number;
  katsayi?: number;
  fmHours: number;
  calc225?: number;
  factor?: number;
  fm?: number;
  net?: number;
  startISO: string;
  endISO: string;
  yillikIzinAciklama?: string;
  weekTypeLabel?: string;
};

export type ExpandVardiya48RowsForDeductionsOptions = {
  anchorStartDate: string;
  anchorIsWorkDay: boolean;
  segmentStart: string;
  segmentEnd: string;
};

const LEGACY_ONLY_EXCLUSION_TYPES = new Set(["Rapor", "Diğer", "Puantaj/Bordro"]);

const MOTOR_EXCLUSION_TYPES = new Set(["UBGT", "Yıllık İzin"]);

const EPS = 1e-7;

export interface DeductionWindow {
  startISO: string;
  endISO: string;
  deductions: NormalizedDeductionOnDate[];
  totalDeductionDayUnits: number;
  caption: string;
}

export function exclusionsNeedLegacySplit(exclusions: ExcludedDay[]): boolean {
  if (!exclusions?.length) return false;
  return exclusions.some((ex) => LEGACY_ONLY_EXCLUSION_TYPES.has(String(ex.type || "").trim()));
}

export function partitionVardiya48Exclusions(exclusions: ExcludedDay[] | null | undefined): {
  motor: ExcludedDay[];
  legacy: ExcludedDay[];
} {
  const motor: ExcludedDay[] = [];
  const legacy: ExcludedDay[] = [];
  for (const ex of exclusions || []) {
    const t = String(ex.type || "").trim();
    if (MOTOR_EXCLUSION_TYPES.has(t)) motor.push(ex);
    else legacy.push(ex);
  }
  return { motor, legacy };
}

/** Köprü + motor düşüm satırı (UBGT/yıllık izin caption). */
export function isVardiya48MotorDeductionNote(note?: string): boolean {
  const n = String(note || "").trim();
  if (!n) return false;
  return !isV48TransitionMotorNote(n);
}

export function parseWeekTypeLabelDays(row: Vardiya48ExpandRow): number {
  const m = /^([\d]+(?:[.,]5)?)\s*gün/i.exec(String(row.weekTypeLabel || "").trim());
  if (m) {
    const n = parseFloat(m[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const fm = Number(row.fmHours) || 0;
  if (fm > EPS) return Math.round(fm / VARDIYA48_FM_HOURS_PER_WORK_DAY);
  return 0;
}

/** Normal satır hafta tipi: 2 vardiya günü→6 saat, 3 vardiya günü→9 saat. */
export function rowBaseWeekDaysFromFm(row: Vardiya48ExpandRow): number {
  const fromLabel = parseWeekTypeLabelDays(row);
  if (fromLabel === 2 || fromLabel === 3) return fromLabel;
  const fm = Math.round(Number(row.fmHours) || 0);
  if (fm === 6) return 2;
  if (fm === 9) return 3;
  if (fm > EPS) {
    const inferred = Math.round(fm / VARDIYA48_FM_HOURS_PER_WORK_DAY);
    if (inferred === 2 || inferred === 3) return inferred;
  }
  return fromLabel;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayUnits(n: number): string {
  if (Math.abs(n - 0.5) < 1e-6) return "0,5";
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return String(n).replace(".", ",");
}

function formatWindowCaption(deductions: NormalizedDeductionOnDate[]): string {
  if (deductions.length === 0) return "";
  const ubgtUnits = deductions.filter((d) => d.kind === "UBGT").reduce((s, d) => s + d.dayWeight, 0);
  const izinUnits = deductions.filter((d) => d.kind === "YILLIK_IZIN").reduce((s, d) => s + d.dayWeight, 0);
  const parts: string[] = [];
  if (ubgtUnits > 0) parts.push(`${formatDayUnits(ubgtUnits)} gün UBGT`);
  if (izinUnits > 0) parts.push(`${formatDayUnits(izinUnits)} gün yıllık izin`);
  if (parts.length === 0) return "";
  if (parts.length === 1) return `(${parts[0]} düşülmüştür)`;
  return `(${parts.join(" + ")} düşülmüştür)`;
}

/** Düşüm günlerini 7 günlük pencerelere böler; bitişik pencereler birleştirilmez. */
function buildSevenDayWindows(
  normalizedDays: NormalizedDeductionOnDate[],
  periodEnd: Date,
): DeductionWindow[] {
  if (normalizedDays.length === 0) return [];
  const sorted = [...normalizedDays].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const windows: DeductionWindow[] = [];
  let i = 0;
  while (i < sorted.length) {
    const firstDay = parseFmDate(sorted[i].dateISO);
    if (!firstDay) { i++; continue; }
    const windowEnd = addDays(firstDay, 6);
    const group: NormalizedDeductionOnDate[] = [];
    while (i < sorted.length) {
      const d = parseFmDate(sorted[i].dateISO);
      if (!d || d > windowEnd) break;
      group.push(sorted[i]);
      i++;
    }
    const clippedEnd = windowEnd > periodEnd ? periodEnd : windowEnd;
    windows.push({
      startISO: toISODate(firstDay),
      endISO: toISODate(clippedEnd),
      deductions: group,
      totalDeductionDayUnits: group.reduce((s, d) => s + d.dayWeight, 0),
      caption: formatWindowCaption(group),
    });
  }
  return windows;
}

/**
 * Düşüm penceresinin denk geldiği bloğun vardiya çalışma günü (2 veya 3).
 * calculate48System ile aynı: generateWorkDays48 + groupWeeks48.
 */
export function resolveBaseWeekDaysForDeductionWindow(
  win: DeductionWindow,
  opts: ExpandVardiya48RowsForDeductionsOptions,
  normalRows: Vardiya48ExpandRow[],
): number {
  const triggerDate =
    win.deductions.find((d) => d.dateISO)?.dateISO?.slice(0, 10) ||
    win.startISO.slice(0, 10);

  const generated = generateWorkDays48({
    startDate: opts.segmentStart,
    endDate: opts.segmentEnd,
    anchorStartDate: opts.anchorStartDate,
    anchorIsWorkDay: opts.anchorIsWorkDay,
  });

  const weeks = groupWeeks48(generated, {
    periodStart: opts.anchorStartDate,
    periodEnd: opts.segmentEnd,
  });

  const bucketKey = getAnchorWeekBucketKey(triggerDate, opts.anchorStartDate);
  let workDayCount = 0;
  if (bucketKey) {
    const byBucket = weeks.find((w) => w.weekStartMonday === bucketKey);
    if (byBucket) workDayCount = byBucket.workDayCount;
  }
  if (workDayCount <= 0) {
    const byRange = weeks.find(
      (w) => triggerDate >= w.startDate.slice(0, 10) && triggerDate <= w.endDate.slice(0, 10),
    );
    if (byRange) workDayCount = byRange.workDayCount;
  }

  const standardWeek = weeks.find(
    (w) =>
      w.workDayCount >= 2 &&
      w.workDayCount <= 3 &&
      triggerDate >= w.startDate.slice(0, 10) &&
      triggerDate <= w.endDate.slice(0, 10),
  );
  if (standardWeek) return standardWeek.workDayCount;

  if (workDayCount >= 2 && workDayCount <= 3) return workDayCount;

  const fmTarget = workDayCount > 0 ? workDayCount * VARDIYA48_FM_HOURS_PER_WORK_DAY : 0;
  const matchRow = normalRows.find((r) => {
    const days = rowBaseWeekDaysFromFm(r);
    if (workDayCount > 0 && days === workDayCount) return true;
    if (fmTarget > 0 && Math.round(Number(r.fmHours) || 0) === fmTarget) return true;
    return false;
  });
  if (matchRow) return rowBaseWeekDaysFromFm(matchRow);

  const three = normalRows.find((r) => rowBaseWeekDaysFromFm(r) === 3);
  if (three) return 3;
  const two = normalRows.find((r) => rowBaseWeekDaysFromFm(r) === 2);
  if (two) return 2;

  return workDayCount > 0 ? Math.min(3, Math.max(2, workDayCount)) : 3;
}

export function vardiya48DeductionWeeklyFmHours(baseWeekDays: number, excludedDays: number): number {
  const base = Math.max(0, Number(baseWeekDays) || 0);
  const excl = Math.max(0, Number(excludedDays) || 0);
  const remaining = Math.max(0, base - excl);
  return Number((remaining * VARDIYA48_FM_HOURS_PER_WORK_DAY).toFixed(2));
}

function formatRemainingDayLabel(remainingDays: number): string {
  const n = Math.round(remainingDays * 100) / 100;
  if (Math.abs(n - Math.round(n)) < 0.001) {
    return `${Math.round(n)} gün`;
  }
  return `${String(n).replace(".", ",")} gün`;
}

function periodKey(row: Vardiya48ExpandRow): string {
  return `${(row.startISO || "").slice(0, 10)}|${(row.endISO || "").slice(0, 10)}`;
}

function isDeductionLikeRow(row: Vardiya48ExpandRow): boolean {
  const note = (row.yillikIzinAciklama || "").trim();
  if (!note) return false;
  return isVardiya48MotorDeductionNote(note);
}

function subtractOneWeekFromWeekType(
  rows: Vardiya48ExpandRow[],
  baseWeekDays: number,
): Vardiya48ExpandRow[] {
  const targetFm = baseWeekDays * VARDIYA48_FM_HOURS_PER_WORK_DAY;
  const out = rows.map((r) => ({ ...r }));

  let idx = out.findIndex((r) => rowBaseWeekDaysFromFm(r) === baseWeekDays);
  if (idx < 0) {
    idx = out.findIndex((r) => Math.round(Number(r.fmHours) || 0) === targetFm);
  }
  if (idx < 0) {
    idx = out.reduce((best, r, i) => {
      if (best < 0) return i;
      if (rowBaseWeekDaysFromFm(r) === baseWeekDays) return i;
      if (rowBaseWeekDaysFromFm(out[best]) === baseWeekDays) return best;
      return (Number(r.weeks) || 0) > (Number(out[best].weeks) || 0) ? i : best;
    }, -1);
  }

  if (idx >= 0) {
    const prev = Math.round(Number(out[idx].weeks) || 0);
    out[idx] = {
      ...out[idx],
      weeks: Math.max(0, prev - 1),
    };
  }

  return out.filter((r) => (Number(r.weeks) || 0) > 0);
}

function mapWindowToVardiyaRow(
  win: DeductionWindow,
  template: Vardiya48ExpandRow,
  baseWeekDays: number,
  excludedDays: number,
  rowIdx: number,
  winIdx: number,
): Vardiya48ExpandRow | null {
  const remainingDays = Math.max(0, baseWeekDays - excludedDays);
  if (remainingDays <= EPS) return null;

  const fmHours = vardiya48DeductionWeeklyFmHours(baseWeekDays, excludedDays);
  const brut = getAsgariUcretByDate(win.startISO) ?? template.brut ?? 0;

  return {
    ...template,
    id: `v48-ded-${rowIdx}-${winIdx}-${win.startISO}`,
    isManual: false,
    startISO: win.startISO,
    endISO: win.endISO,
    rangeLabel: `${win.startISO} – ${win.endISO}`,
    weeks: 1,
    brut,
    katsayi: template.katsayi ?? 1,
    fmHours,
    calc225: template.calc225 ?? 225,
    factor: template.factor ?? 1.5,
    fm: 0,
    net: 0,
    weekTypeLabel: formatRemainingDayLabel(remainingDays),
    yillikIzinAciklama: win.caption || undefined,
  };
}

function expandPeriodGroup(
  groupRows: Vardiya48ExpandRow[],
  exclusions: ExcludedDay[],
  opts: ExpandVardiya48RowsForDeductionsOptions,
  rowIdx: number,
): Vardiya48ExpandRow[] {
  const normalRows = groupRows.filter((r) => !isDeductionLikeRow(r));
  if (!normalRows.length) return groupRows;

  const periodStart = normalRows[0].startISO;
  const periodEnd = normalRows[0].endISO;
  if (!periodStart || !periodEnd) return groupRows;

  const periodStartDate = parseFmDate(periodStart);
  const periodEndDate = parseFmDate(periodEnd);
  if (!periodStartDate || !periodEndDate || periodEndDate < periodStartDate) {
    return groupRows;
  }

  const allNormalized = normalizeDeductionDays(exclusions);
  const daysInPeriod = allNormalized.filter((d) => {
    const dd = parseFmDate(d.dateISO);
    return dd && dd >= periodStartDate && dd <= periodEndDate;
  });

  if (daysInPeriod.length === 0) return groupRows;

  const windows = buildSevenDayWindows(daysInPeriod, periodEndDate);
  if (!windows.length) return groupRows;

  const template = normalRows[0];
  let workingNormals = normalRows.map((r) => ({ ...r }));
  const deductionRows: Vardiya48ExpandRow[] = [];

  windows.forEach((win, winIdx) => {
    const baseWeekDays = resolveBaseWeekDaysForDeductionWindow(win, opts, normalRows);
    const excludedDays = win.totalDeductionDayUnits;

    workingNormals = subtractOneWeekFromWeekType(workingNormals, baseWeekDays);

    const dedRow = mapWindowToVardiyaRow(
      win,
      template,
      baseWeekDays,
      excludedDays,
      rowIdx,
      winIdx,
    );
    if (dedRow) deductionRows.push(dedRow);
  });

  return [...workingNormals, ...deductionRows];
}

/**
 * Ücret dönemi: düşüm haftası ilgili vardiya tipinden düşülür;
 * düşüm satırı FM = (baseWeekDays − excludedDays) × 3.
 */
export function expandVardiya48RowsForDeductions(
  rows: Vardiya48ExpandRow[],
  exclusions: ExcludedDay[] | null | undefined,
  options: ExpandVardiya48RowsForDeductionsOptions,
): Vardiya48ExpandRow[] {
  if (!rows.length || !exclusions?.length) return rows;

  const manual = rows.filter((r) => r.isManual);
  const auto = rows.filter((r) => !r.isManual);
  if (!auto.length) return rows;

  const groups = new Map<string, Vardiya48ExpandRow[]>();
  auto.forEach((r) => {
    const key = periodKey(r);
    const arr = groups.get(key) || [];
    arr.push(r);
    groups.set(key, arr);
  });

  const expanded: Vardiya48ExpandRow[] = [];
  let rowIdx = 0;
  groups.forEach((groupRows) => {
    expanded.push(...expandPeriodGroup(groupRows, exclusions, options, rowIdx));
    rowIdx += 1;
  });

  expanded.sort((a, b) => {
    const c = (a.startISO || "").localeCompare(b.startISO || "");
    if (c !== 0) return c;
    const an = (a.yillikIzinAciklama || "").length > 0 ? 1 : 0;
    const bn = (b.yillikIzinAciklama || "").length > 0 ? 1 : 0;
    if (an !== bn) return an - bn;
    return (Number(b.weekTypeLabel?.split(" ")[0]) || 0) - (Number(a.weekTypeLabel?.split(" ")[0]) || 0);
  });

  return [...expanded, ...manual];
}
