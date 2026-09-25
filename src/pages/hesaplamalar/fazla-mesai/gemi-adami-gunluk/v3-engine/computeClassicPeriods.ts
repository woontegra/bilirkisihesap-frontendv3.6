/**
 * V3 backend `gemiFM.service.js` — `computeClassic` dönem üretimi (birebir port).
 * UBGT/yıllık izin düşümü frontend expand'de; backend hafta sayısı exclusions=[] ile.
 */

import { getAsgariUcretByDate } from "../asgariUcret";
import {
  calculateFm,
  computeBreakHours,
  parseKatsayi,
  parseTimeToHours,
  normalizeTimeStr,
  WEEKLY_WORK_LIMIT,
} from "../engine";
import { GEMI_DAILY_REF_HOURS, MODE270_SIMPLE_REDUCTION_HOURS } from "../constants";
import type { GemiGunlukFormSnapshot, PeriodRow, SevenDayMode, Witness } from "../model";
import { newLocalId } from "../model";
import { apply270ToPeriodsUnified } from "./lib/apply270ToPeriodsUnified";
import { normalizeDate, normalizeLocalDate, toISODateLocal } from "./lib/dateHelpers";
import { normalizeWitnessDateRanges } from "./lib/dateSegmentationCore";

const MAX_WEEKS_PER_YEAR = 52;
const HALF_YEAR_DAY_LIMIT = 183;

function normalizeTime(timeStr: string | null | undefined): string | null {
  return normalizeTimeStr(timeStr ?? "");
}

function formatHoursToTime(hours: number): string {
  const h = Math.floor(hours) % 24;
  const m = Math.round((hours % 1) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Backend `calculateWeekCount` — exclusions=[] (düşüm frontend expand'de). */
function calculateWeekCountBackend(startDate: Date, endDate: Date): number {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  if (end < start) return 1;
  const diffTime = end.getTime() - start.getTime();
  const totalDays = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
  let totalWeeks = Math.round(totalDays / 7);
  if (totalWeeks === 25 && totalDays <= HALF_YEAR_DAY_LIMIT) totalWeeks = 26;
  if (totalDays <= 370 && totalWeeks > MAX_WEEKS_PER_YEAR) totalWeeks = MAX_WEEKS_PER_YEAR;
  if (totalWeeks < 1) totalWeeks = 1;
  return totalWeeks;
}

type WitnessSegment = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  witnessIds: string[];
};

function resolveWitnessesForApi(form: GemiGunlukFormSnapshot): Witness[] {
  const valid = form.witnesses.filter(
    (w) => w.dateIn && w.dateOut && normalizeTimeStr(w.in) && normalizeTimeStr(w.out),
  );
  if (valid.length > 0) return valid;
  const tin = normalizeTimeStr(form.davaciIn);
  const tout = normalizeTimeStr(form.davaciOut);
  if (!form.iseGiris || !form.istenCikis || !tin || !tout) return [];
  return [
    {
      id: "synthetic-davaci-period",
      name: "Davacı dönemi",
      dateIn: form.iseGiris,
      dateOut: form.istenCikis,
      in: tin,
      out: tout,
    },
  ];
}

/** Backend `calculateWitnessSegments` — gemiFM.service.js */
function calculateWitnessSegments(form: GemiGunlukFormSnapshot): WitnessSegment[] {
  const davaciDateIn = normalizeDate(form.iseGiris);
  const davaciDateOut = normalizeDate(form.istenCikis);
  const davaciStartTime = normalizeTime(form.davaciIn);
  const davaciEndTime = normalizeTime(form.davaciOut);
  if (!davaciDateIn || !davaciDateOut || !davaciStartTime || !davaciEndTime) return [];

  const davaciStartDate = normalizeLocalDate(davaciDateIn);
  const davaciEndDate = normalizeLocalDate(davaciDateOut);
  if (!davaciStartDate || !davaciEndDate || davaciStartDate > davaciEndDate) return [];

  const witnesses = resolveWitnessesForApi(form);
  const normalizedRanges = normalizeWitnessDateRanges(witnesses, davaciStartDate, davaciEndDate);
  if (normalizedRanges.length === 0) return [];

  const toHours = (timeStr: string) => parseTimeToHours(timeStr) ?? 0;
  let davaciStartHours = toHours(davaciStartTime);
  let davaciEndHours = toHours(davaciEndTime);
  if (davaciEndHours === 0 && davaciStartHours > 0) davaciEndHours = 24;

  const result = normalizedRanges.map((range) => {
    const segmentWitnesses = witnesses.filter((w) => range.witnessIds.includes(w.id));

    if (segmentWitnesses.length === 0) {
      let dailyHours = davaciEndHours - davaciStartHours;
      if (dailyHours < 0) dailyHours += 24;
      if (dailyHours > 24) dailyHours -= 24;
      const brk = computeBreakHours(dailyHours);
      const hoursPerDay = Math.max(0, dailyHours - brk);
      return {
        startDate: range.startDate,
        endDate: range.endDate,
        startTime: formatHoursToTime(davaciStartHours),
        endTime: formatHoursToTime(davaciEndHours),
        hoursPerDay,
        witnessIds: range.witnessIds,
      };
    }

    let latestStartHours = davaciStartHours;
    let earliestEndHours = davaciEndHours;

    for (const witness of segmentWitnesses) {
      const witnessStartTime = normalizeTime(witness.in);
      const witnessEndTime = normalizeTime(witness.out);
      if (!witnessStartTime || !witnessEndTime) continue;
      let witnessStartHours = toHours(witnessStartTime);
      let witnessEndHours = toHours(witnessEndTime);
      if (witnessEndHours === 0 && witnessStartHours > 0) witnessEndHours = 24;
      const clippedStartHours = Math.max(witnessStartHours, davaciStartHours);
      const clippedEndHours = Math.min(witnessEndHours, davaciEndHours);
      if (clippedStartHours > latestStartHours) latestStartHours = clippedStartHours;
      if (clippedEndHours < earliestEndHours) earliestEndHours = clippedEndHours;
    }

    if (latestStartHours >= earliestEndHours) {
      latestStartHours = davaciStartHours;
      earliestEndHours = davaciEndHours;
    }

    let dailyHours = earliestEndHours - latestStartHours;
    if (dailyHours < 0) dailyHours += 24;
    if (dailyHours > 24) dailyHours -= 24;
    const brk = computeBreakHours(dailyHours);
    const hoursPerDay = Math.max(0, dailyHours - brk);

    return {
      startDate: range.startDate,
      endDate: range.endDate,
      startTime: formatHoursToTime(latestStartHours),
      endTime: formatHoursToTime(earliestEndHours),
      hoursPerDay,
      witnessIds: range.witnessIds,
    };
  });

  result.sort((a, b) => {
    const startCompare = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    if (startCompare !== 0) return startCompare;
    return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
  });

  return result.map((r) => ({
    startDate: r.startDate,
    endDate: r.endDate,
    startTime: r.startTime,
    endTime: r.endTime,
    witnessIds: r.witnessIds,
  }));
}

function computeSegWeeklyCalc(
  segDaily: number,
  weeklyDays: number,
  sevenDayMode: SevenDayMode,
): number {
  const n = Number(weeklyDays) || 0;
  if (n === 7 && sevenDayMode === "tatilli") {
    const weeklyWork = segDaily * 6;
    const extra = Math.max(0, segDaily - GEMI_DAILY_REF_HOURS);
    return weeklyWork + extra;
  }
  const daysWork = n > 0 ? n : 7;
  return segDaily * daysWork;
}

/** Backend davacı FM — 270 şirket için (yuvarlama yok). */
function computeDavaciFmHoursFor270Backend(form: GemiGunlukFormSnapshot): number {
  const davaciStartH = parseTimeToHours(form.davaciIn);
  const davaciEndHRaw = parseTimeToHours(form.davaciOut);
  if (davaciStartH == null || davaciEndHRaw == null) return 0;
  const davaciEndH = davaciEndHRaw === 0 && davaciStartH > 0 ? 24 : davaciEndHRaw;
  let rawDaily = davaciEndH - davaciStartH;
  if (rawDaily < 0) rawDaily += 24;
  if (rawDaily > 24) rawDaily -= 24;
  const daily = Math.max(0, rawDaily - computeBreakHours(rawDaily));
  const weeklyCalc = computeSegWeeklyCalc(daily, form.weeklyDays, form.sevenDayMode);
  return Math.max(0, weeklyCalc - WEEKLY_WORK_LIMIT);
}

/** V3 backend `computeClassic` → cetvel satırları. */
export function buildClassicPeriodRows(form: GemiGunlukFormSnapshot): PeriodRow[] {
  const davaciStartTime = normalizeTime(form.davaciIn);
  const davaciEndTime = normalizeTime(form.davaciOut);
  if (!davaciStartTime || !davaciEndTime) return [];

  const katsayi = parseKatsayi(form.katSayi);
  const segments = calculateWitnessSegments(form);
  if (segments.length === 0) return [];

  const n = Number(form.weeklyDays) || 0;
  const haftalikGunSayisi = n > 0 ? n : form.sevenDayMode === "tatilli" ? 6 : 7;

  const rows: PeriodRow[] = [];

  for (const segment of segments) {
    const segmentStart = normalizeLocalDate(segment.startDate);
    const segmentEnd = normalizeLocalDate(segment.endDate);
    if (!segmentStart || !segmentEnd || segmentStart > segmentEnd) continue;

    const segmentStartHours = parseTimeToHours(segment.startTime) ?? 0;
    const segmentEndHours = parseTimeToHours(segment.endTime) ?? 0;
    let segRawDailyHours = segmentEndHours - segmentStartHours;
    if (segRawDailyHours < 0) segRawDailyHours += 24;
    if (segRawDailyHours > 24) segRawDailyHours -= 24;
    const segBrk = computeBreakHours(segRawDailyHours);
    const segDaily = Math.max(0, segRawDailyHours - segBrk);
    const segWeeklyCalc = computeSegWeeklyCalc(segDaily, form.weeklyDays, form.sevenDayMode);
    const segFmHours = Math.max(0, segWeeklyCalc - WEEKLY_WORK_LIMIT);

    const w = calculateWeekCountBackend(segmentStart, segmentEnd);
    const brut = getAsgariUcretByDate(segment.startDate) || 0;

    rows.push({
      id: newLocalId("row"),
      startISO: segment.startDate,
      endISO: segment.endDate,
      weeks: w,
      brut,
      katsayi,
      fmHours: segFmHours,
      fm: calculateFm(w, brut, katsayi, segFmHours),
      dailyNet: segDaily,
      annualLeaveHg: haftalikGunSayisi,
      annualLeaveSevenDay: n === 7 ? form.sevenDayMode : "tatilsiz",
      isDeductionRow: false,
    });
  }

  let adjusted = rows;
  const nihai = form.zamanasimi?.nihaiBaslangic;
  if (nihai) {
    const zamanasimiDate = normalizeLocalDate(nihai);
    if (zamanasimiDate) {
      adjusted = rows
        .map((p) => {
          const rowStart = normalizeLocalDate(p.startISO);
          const rowEnd = normalizeLocalDate(p.endISO);
          if (!rowStart || !rowEnd) return null;
          if (rowEnd < zamanasimiDate) return null;
          if (rowStart < zamanasimiDate) {
            const newStartISO = toISODateLocal(zamanasimiDate);
            const w = calculateWeekCountBackend(zamanasimiDate, rowEnd);
            const brut = getAsgariUcretByDate(newStartISO) || 0;
            return {
              ...p,
              startISO: newStartISO,
              weeks: w,
              brut,
              fm: calculateFm(w, brut, p.katsayi, p.fmHours),
            };
          }
          return p;
        })
        .filter((p): p is PeriodRow => p != null);
    }
  }

  const include270 = form.mode270 !== "none";
  if (include270 && adjusted.length > 0) {
    if (form.mode270 === "simple") {
      adjusted = adjusted.map((p) => {
        const fmHours = Math.max(0, (p.fmHours || 0) - MODE270_SIMPLE_REDUCTION_HOURS);
        return {
          ...p,
          fmHours,
          fm: calculateFm(p.weeks, p.brut, p.katsayi, fmHours),
        };
      });
    } else {
      const fmHours270 = computeDavaciFmHoursFor270Backend(form);
      if (fmHours270 > 0) {
        const periodPayload = adjusted.map((p) => ({
          startDate: p.startISO,
          endDate: p.endISO,
          weeks: p.weeks,
        }));
        const after270 = apply270ToPeriodsUnified({
          periods: periodPayload,
          exclusions: form.exclusions.map((e) => ({
            start: e.start,
            end: e.end,
            days: e.days,
            type: e.type,
          })),
          iseGiris: form.iseGiris,
          istenCikis: form.istenCikis,
          zamanasimiBaslangic: form.zamanasimi?.nihaiBaslangic ?? null,
          fmHours: fmHours270,
          useSuppliedRowWeeks: true,
        });
        adjusted = adjusted.map((p, i) => {
          const weeks = after270[i]?.weeks ?? p.weeks;
          return {
            ...p,
            weeks,
            fm: calculateFm(weeks, p.brut, p.katsayi, p.fmHours),
          };
        });
      }
    }
  }

  return adjusted.sort((a, b) => a.startISO.localeCompare(b.startISO));
}
