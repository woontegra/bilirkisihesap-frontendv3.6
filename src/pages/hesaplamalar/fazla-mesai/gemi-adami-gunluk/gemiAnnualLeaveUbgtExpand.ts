/**
 * Gemi günlük cetvel — UBGT/izin/rapor/diğer için 7 günlük blok düşümü (V3 `gemiAnnualLeaveUbgtExpand.ts` ile aynı).
 */

import { getAsgariUcretByDate } from "./asgariUcret";
import { countAnnualLeaveCalendarDaysInWindow } from "./annualLeaveCalendarDays";
import {
  FAZLA_MESAI_DENOMINATOR,
  FAZLA_MESAI_KATSAYI,
  GEMI_DAILY_REF_HOURS,
  MODE270_SIMPLE_REDUCTION_HOURS,
  WEEKLY_WORK_LIMIT,
} from "./constants";
import type { ExclusionItem, PeriodRow, SevenDayMode } from "./model";

const EPS = 1e-7;

function bilirkisiRoundWeeklyTotalHours(value: number): number {
  const E = 1e-9;
  if (!Number.isFinite(value) || value <= 0) return 0;
  const int = Math.floor(value + E);
  const frac = value - int;
  if (frac < 0.5 - E) return int;
  if (frac > 0.5 + E) return int + 1;
  return int + 0.5;
}

function calculateFm(weeks: number, brut: number, kats: number, fmHours: number): number {
  const step1 = Number((weeks * brut).toFixed(6));
  const step2 = Number((step1 * kats).toFixed(6));
  const step3 = Number((step2 * fmHours).toFixed(6));
  const step4 = Number((step3 / FAZLA_MESAI_DENOMINATOR).toFixed(6));
  const step5 = Number((step4 * FAZLA_MESAI_KATSAYI).toFixed(6));
  return Number(step5.toFixed(2));
}
const FM_EXCLUSION_TYPES: string[] = ["Yıllık İzin", "UBGT", "Rapor", "Diğer"];
type LeaveBlock = { start: Date; end: Date; anchors: Date[] };

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

function parseLocalDay(value: string): Date | null {
  const s = String(value || "").trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function addLocalDays(d: Date, amount: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + amount);
  return out;
}

function isWorkDay(d: Date, weeklyOffDay: number | null): boolean {
  if (weeklyOffDay == null) return true;
  return d.getDay() !== weeklyOffDay;
}

function formatFmDeductionCaption(
  hg: number,
  leaveDaysInt: number,
  exclusions: ExclusionItem[],
  clipStart: Date,
  clipEnd: Date,
  weeklyOffDay: number | null,
): string {
  const n = Math.min(hg, Math.max(0, Math.floor(leaveDaysInt)));
  const nIzin = countAnnualLeaveCalendarDaysInWindow(clipStart, clipEnd, exclusions, weeklyOffDay, [
    "Yıllık İzin",
  ]);
  const nUbgt = countAnnualLeaveCalendarDaysInWindow(clipStart, clipEnd, exclusions, weeklyOffDay, ["UBGT"]);
  const nOther = countAnnualLeaveCalendarDaysInWindow(clipStart, clipEnd, exclusions, weeklyOffDay, [
    "Rapor",
    "Diğer",
  ]);
  if (nUbgt === 0 && nOther === 0) return `(${n} gün yıllık izin düşülmüştür)`;
  if (nIzin === 0 && nOther === 0) return `(${n} gün UBGT düşülmüştür)`;
  if (nIzin === 0 && nUbgt === 0) return `(${n} gün dışlama düşülmüştür)`;
  return `(${n} gün dışlama düşülmüştür: yıllık izin / UBGT / diğer)`;
}

function materializeAnchors(exclusions: ExclusionItem[], weeklyOffDay: number | null): Date[] {
  const out: Date[] = [];
  for (const ex of exclusions) {
    if (!FM_EXCLUSION_TYPES.includes(ex.type ?? "")) continue;
    const s = parseLocalDay(ex.start);
    const e = parseLocalDay(ex.end);
    if (!s || !e || s > e) continue;
    const cap =
      Number(ex.days) > 0 && Number.isFinite(Number(ex.days)) ? Math.floor(Number(ex.days)) : null;
    let used = 0;
    let cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const end = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    while (cur <= end) {
      if (cap != null && used >= cap) break;
      if (isWorkDay(cur, weeklyOffDay)) {
        out.push(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()));
        if (cap != null) used += 1;
      }
      cur = addLocalDays(cur, 1);
    }
  }
  out.sort((a, b) => a.getTime() - b.getTime());
  const uniq: Date[] = [];
  const seen = new Set<string>();
  for (const d of out) {
    const key = toISODate(d);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(d);
  }
  return uniq;
}

function buildSevenDayBlocksForSegment(
  segStart: Date,
  segEnd: Date,
  exclusions: ExclusionItem[],
  weeklyOffDay: number | null,
): LeaveBlock[] {
  const anchors = materializeAnchors(exclusions, weeklyOffDay).filter((d) => d >= segStart && d <= segEnd);
  if (anchors.length === 0) return [];
  const out: LeaveBlock[] = [];
  let i = 0;
  while (i < anchors.length) {
    const start = new Date(anchors[i].getFullYear(), anchors[i].getMonth(), anchors[i].getDate());
    const nominalEnd = addLocalDays(start, 6);
    const end = nominalEnd > segEnd ? segEnd : nominalEnd;
    const group: Date[] = [];
    while (i < anchors.length && anchors[i].getTime() <= end.getTime()) {
      group.push(anchors[i]);
      i += 1;
    }
    out.push({ start, end, anchors: group });
  }
  return out;
}

function weeklyRawHoursForGemiLeaveWeek(
  dailyNet: number,
  hgSafe: number,
  davaciSevenDay: SevenDayMode,
  leaveDaysInt: number,
): number {
  const L = Math.max(0, Math.min(7, Math.floor(leaveDaysInt)));
  if (hgSafe !== 7) {
    return Math.max(0, (hgSafe - L) * dailyNet);
  }
  if (davaciSevenDay === "tatilsiz") {
    return Math.max(0, (7 - L) * dailyNet);
  }
  const holidayExtra = Math.max(0, dailyNet - GEMI_DAILY_REF_HOURS);
  const base = 6 * dailyNet + holidayExtra;
  return Math.max(0, base - L * dailyNet);
}

function countDeclaredOverlapDaysInt(
  clipStart: Date,
  clipEnd: Date,
  exclusions: ExclusionItem[],
  allowedTypes: readonly string[],
): number {
  let total = 0;
  for (const excl of exclusions) {
    if (!allowedTypes.includes(excl.type ?? "")) continue;
    const es = new Date(excl.start);
    const ee = new Date(excl.end);
    if (Number.isNaN(+es) || Number.isNaN(+ee) || es > ee) continue;
    const overlapStart = dateMax(es, clipStart);
    const overlapEnd = dateMin(ee, clipEnd);
    if (overlapStart > overlapEnd) continue;
    total += Math.max(0, Math.floor(Number(excl.days) || 0));
  }
  return total;
}

export type GemiExpandParams = {
  hg: number;
  weeklyOffDay: number | null;
  davaciSevenDay: SevenDayMode;
  applyYargitay270FmDeduction?: boolean;
};

function expandOneGemiRow(
  row: PeriodRow,
  exclusions: ExclusionItem[],
  rowIdx: number,
  hg: number,
  weeklyOffDay: number | null,
  davaciSevenDay: SevenDayMode,
  applyYargitay270FmDeduction: boolean,
): PeriodRow[] {
  const startISO = row.startISO;
  const endISO = row.endISO;
  const W0 = row.weeks ?? 0;
  if (!startISO || !endISO || W0 <= 0) return [row];

  const rowWithWeekly = row as PeriodRow & { annualLeaveWeeklyIgnoredWeekday?: number | null };
  const effectiveWeeklyOff =
    "annualLeaveWeeklyIgnoredWeekday" in rowWithWeekly
      ? rowWithWeekly.annualLeaveWeeklyIgnoredWeekday ?? null
      : weeklyOffDay;

  const segStartRaw = new Date(startISO);
  const segEndRaw = new Date(endISO);
  if (Number.isNaN(+segStartRaw) || Number.isNaN(+segEndRaw)) return [row];
  const segStart = new Date(segStartRaw.getFullYear(), segStartRaw.getMonth(), segStartRaw.getDate());
  const segEnd = new Date(segEndRaw.getFullYear(), segEndRaw.getMonth(), segEndRaw.getDate());
  if (segEnd < segStart) return [row];

  const kats = row.katsayi ?? 1;
  const baselineFm = row.fmHours ?? 0;
  const brutPeriod = row.brut ?? (getAsgariUcretByDate(startISO) || 0);
  const hgFromCaller = Math.max(1, Math.min(7, Math.floor(Number(hg)) || 6));
  const rowHgRaw = row.annualLeaveHg;
  const hgSafe =
    rowHgRaw != null && Number.isFinite(rowHgRaw)
      ? Math.max(1, Math.min(7, Math.floor(Number(rowHgRaw))))
      : hgFromCaller;
  const sevenDayForRow = row.annualLeaveSevenDay ?? davaciSevenDay;

  let dailyNet = row.dailyNet != null && Number.isFinite(Number(row.dailyNet)) ? Number(row.dailyNet) : NaN;
  if (!Number.isFinite(dailyNet) || dailyNet <= 0) {
    const fm = Number(baselineFm);
    if (hgSafe > 0 && Number.isFinite(fm) && fm >= 0) {
      dailyNet = (fm + WEEKLY_WORK_LIMIT) / hgSafe;
    }
  }
  if (!Number.isFinite(dailyNet) || dailyNet <= 0) return [row];

  type LeaveHit = { clipStart: Date; clipEnd: Date; leaveDaysInt: number };
  const leaveHits: LeaveHit[] = [];
  const blocks = buildSevenDayBlocksForSegment(segStart, segEnd, exclusions, effectiveWeeklyOff);
  for (const blk of blocks) {
    const clipStart = dateMax(segStart, blk.start);
    const clipEnd = dateMin(segEnd, blk.end);
    if (clipStart <= clipEnd) {
      let leaveDaysInt = Math.min(hgSafe, blk.anchors.length);
      if (leaveDaysInt <= 0) {
        leaveDaysInt = Math.min(
          hgSafe,
          countAnnualLeaveCalendarDaysInWindow(clipStart, clipEnd, exclusions, effectiveWeeklyOff, FM_EXCLUSION_TYPES),
        );
      }
      if (leaveDaysInt <= 0) {
        const declaredDays = countDeclaredOverlapDaysInt(clipStart, clipEnd, exclusions, FM_EXCLUSION_TYPES);
        if (declaredDays > 0) leaveDaysInt = Math.min(hgSafe, declaredDays);
      }
      if (leaveDaysInt >= 1) leaveHits.push({ clipStart, clipEnd, leaveDaysInt });
    }
  }
  leaveHits.sort((a, b) => a.clipStart.getTime() - b.clipStart.getTime());

  if (leaveHits.length === 0) return [row];

  let H = 0;
  const leavePositiveRows: PeriodRow[] = [];

  leaveHits.forEach((hit, j) => {
    const rawTotal = weeklyRawHoursForGemiLeaveWeek(dailyNet, hgSafe, sevenDayForRow, hit.leaveDaysInt);
    const totalRounded = bilirkisiRoundWeeklyTotalHours(rawTotal);
    let fmWeek = Math.max(0, totalRounded - WEEKLY_WORK_LIMIT);
    if (applyYargitay270FmDeduction) {
      fmWeek = Math.max(0, fmWeek - MODE270_SIMPLE_REDUCTION_HOURS);
    }
    if (fmWeek <= EPS) {
      H += 1;
      return;
    }
    const brutW = getAsgariUcretByDate(toISODate(hit.clipStart)) || 0;
    const caption = formatFmDeductionCaption(
      hgSafe,
      hit.leaveDaysInt,
      exclusions,
      hit.clipStart,
      hit.clipEnd,
      effectiveWeeklyOff,
    );
    leavePositiveRows.push({
      ...row,
      id: `gemi-yl-${rowIdx}-${j}-${toISODate(hit.clipStart)}`,
      startISO: toISODate(hit.clipStart),
      endISO: toISODate(hit.clipEnd),
      weeks: 1,
      brut: brutW,
      katsayi: kats,
      fmHours: fmWeek,
      fm: calculateFm(1, brutW, kats, fmWeek),
      isDeductionRow: true,
      yillikIzinAciklama: caption,
      note: caption,
    });
  });

  const lp = leavePositiveRows.length;
  const normalWeeks = Math.max(0, W0 - H - lp);
  const out: PeriodRow[] = [];

  if (normalWeeks > 0) {
    const { dailyNet: _omitDaily, ...rowBase } = row;
    out.push({
      ...rowBase,
      id: `gemi-yl-base-${rowIdx}-${startISO}-${endISO}`,
      startISO,
      endISO,
      weeks: normalWeeks,
      brut: brutPeriod,
      katsayi: kats,
      fmHours: baselineFm,
      fm: calculateFm(normalWeeks, brutPeriod, kats, baselineFm),
      isDeductionRow: false,
      yillikIzinAciklama: undefined,
      note: undefined,
    });
  }

  out.push(...leavePositiveRows);
  if (out.length === 0) return [];
  return out;
}

/** Rapor/Diğer/Puantaj varsa V3 `expandGemiRowsAnnualLeaveUbgt` yolu. */
export function expandGemiRowsAnnualLeaveUbgt(
  rows: PeriodRow[],
  exclusions: ExclusionItem[] | null | undefined,
  params: GemiExpandParams,
): PeriodRow[] {
  if (!exclusions?.length) return rows;
  const { hg, weeklyOffDay, davaciSevenDay, applyYargitay270FmDeduction = false } = params;

  const out: PeriodRow[] = [];
  rows.forEach((row, i) => {
    if (row.isManual) {
      out.push(row);
      return;
    }
    const expanded = expandOneGemiRow(
      row,
      exclusions,
      i,
      hg,
      weeklyOffDay,
      davaciSevenDay,
      applyYargitay270FmDeduction,
    );
    if (expanded.length) out.push(...expanded);
    else out.push(row);
  });
  return out;
}
