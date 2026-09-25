/**
 * V3 backend `yeraltiIsci.service.js` — `computeClassic` dönem üretimi (birebir port).
 * Düşümler backend'de uygulanmaz; V3 frontend expand sonrası yapılır.
 */

import { getAsgariUcretByDate } from "../asgariUcret";
import {
  applyYargitayRounding,
  calcRowFm,
  computeBreakHours,
  parseKatsayi,
  parseTimeToHours,
  WEEKLY_LIMIT,
  YARGITAY_270_DEDUCTION_HOURS,
} from "../engine";
import type { FmRow, SevenDayMode, WitnessInput, YeraltiFormSnapshot } from "../model";
import { apply270ToPeriodsUnified } from "./lib/apply270ToPeriodsUnified";
import { normalizeLocalDate, normalizeDate, toISODateLocal } from "./lib/dateHelpers";
import { normalizeWitnessDateRanges, splitByAsgariUcretPeriods } from "./lib/dateSegmentationCore";

const DAILY_REF = 6.25;
const MAX_WEEKS_PER_YEAR = 52;
const HALF_YEAR_DAY_LIMIT = 183;

function normalizeTime(timeStr: string | null | undefined): string | null {
  if (!timeStr) return null;
  const clean = String(timeStr).trim().replace(".", ":");
  const [hs, ms] = clean.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatHoursToTime(hours: number): string {
  const h = Math.floor(hours) % 24;
  const m = Math.round((hours % 1) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Backend `calculateWeekCount` — exclusions=[] (düşüm frontend'de). */
function calculateWeekCountBackend(startDate: Date, endDate: Date): number {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const diffTime = end.getTime() - start.getTime();
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  let totalWeeks = Math.round(totalDays / 7);
  if (totalWeeks === 25 && totalDays <= HALF_YEAR_DAY_LIMIT) totalWeeks = 26;
  if (totalWeeks > MAX_WEEKS_PER_YEAR) totalWeeks = MAX_WEEKS_PER_YEAR;
  return Math.max(1, totalWeeks);
}

function filterWitnessesOverlappingClaim(
  witnesses: WitnessInput[],
  claimStart: Date,
  claimEnd: Date,
): WitnessInput[] {
  const out: WitnessInput[] = [];
  for (const w of witnesses) {
    const s = normalizeDate(w.dateIn);
    const e = normalizeDate(w.dateOut);
    if (!s || !e) continue;
    const start = normalizeLocalDate(s);
    const end = normalizeLocalDate(e);
    if (!start || !end || start > end) continue;
    if (start <= claimEnd && end >= claimStart) out.push(w);
  }
  return out;
}

function createDavaciOnlyWitnessStub(
  davaci: Pick<YeraltiFormSnapshot, "davaciDateIn" | "davaciDateOut" | "davaciIn" | "davaciOut">,
): WitnessInput | null {
  const dateIn = normalizeDate(davaci.davaciDateIn);
  const dateOut = normalizeDate(davaci.davaciDateOut);
  if (!dateIn || !dateOut) return null;
  return {
    id: "__davaci_only__",
    name: "",
    dateIn,
    dateOut,
    in: davaci.davaciIn ?? "",
    out: davaci.davaciOut ?? "",
  };
}

function buildDavaciOnlyNormalizedRanges(davaciStartDate: Date, davaciEndDate: Date) {
  const splits = splitByAsgariUcretPeriods(davaciStartDate, davaciEndDate);
  if (!splits.length) {
    return [
      {
        startDate: toISODateLocal(davaciStartDate),
        endDate: toISODateLocal(davaciEndDate),
        witnessIds: [] as string[],
      },
    ];
  }
  return splits.map((seg) => ({
    startDate: toISODateLocal(seg.start),
    endDate: toISODateLocal(seg.end),
    witnessIds: [] as string[],
  }));
}

type WitnessSegment = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  witnessIds: string[];
};

function calculateWitnessSegments(
  davaci: Pick<YeraltiFormSnapshot, "davaciDateIn" | "davaciDateOut" | "davaciIn" | "davaciOut">,
  witnesses: WitnessInput[],
): WitnessSegment[] {
  const davaciDateIn = normalizeDate(davaci.davaciDateIn);
  const davaciDateOut = normalizeDate(davaci.davaciDateOut);
  const davaciStartTime = normalizeTime(davaci.davaciIn);
  const davaciEndTime = normalizeTime(davaci.davaciOut);
  if (!davaciDateIn || !davaciDateOut || !davaciStartTime || !davaciEndTime) return [];

  const davaciStartDate = normalizeLocalDate(davaciDateIn);
  const davaciEndDate = normalizeLocalDate(davaciDateOut);
  if (!davaciStartDate || !davaciEndDate || davaciStartDate > davaciEndDate) return [];

  const witnessesForSegments = filterWitnessesOverlappingClaim(
    witnesses,
    davaciStartDate,
    davaciEndDate,
  );
  const witnessesForSeg =
    witnessesForSegments.length > 0
      ? witnessesForSegments
      : (() => {
          const stub = createDavaciOnlyWitnessStub(davaci);
          return stub ? [stub] : [];
        })();

  let normalizedRanges = normalizeWitnessDateRanges(witnessesForSeg, davaciStartDate, davaciEndDate);
  const davaciOnlyStub = createDavaciOnlyWitnessStub(davaci);
  if (normalizedRanges.length === 0 && davaciOnlyStub) {
    normalizedRanges = normalizeWitnessDateRanges([davaciOnlyStub], davaciStartDate, davaciEndDate);
  }
  if (normalizedRanges.length === 0) {
    normalizedRanges = buildDavaciOnlyNormalizedRanges(davaciStartDate, davaciEndDate);
  }
  if (normalizedRanges.length === 0) return [];

  const useDavaciSource =
    (witnessesForSeg.length === 1 && witnessesForSeg[0]?.id === "__davaci_only__") ||
    normalizedRanges.every((r) => !r.witnessIds?.length);

  const davaciStartHours = parseTimeToHours(davaciStartTime) ?? 0;
  let davaciEndHours = parseTimeToHours(davaciEndTime) ?? 0;
  if (davaciEndHours === 0 && davaciStartHours > 0) davaciEndHours = 24;

  const result = normalizedRanges.map((range) => {
    const segmentWitnesses = witnessesForSeg.filter((w) => range.witnessIds.includes(w.id));

    if (segmentWitnesses.length === 0 || useDavaciSource) {
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
        witnessIds: range.witnessIds,
        hoursPerDay,
      };
    }

    let latestStartHours = davaciStartHours;
    let earliestEndHours = davaciEndHours;
    for (const witness of segmentWitnesses) {
      const witnessStartTime = normalizeTime(witness.in);
      const witnessEndTime = normalizeTime(witness.out);
      if (!witnessStartTime || !witnessEndTime) continue;
      let witnessStartHours = parseTimeToHours(witnessStartTime) ?? 0;
      let witnessEndHours = parseTimeToHours(witnessEndTime) ?? 0;
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
      witnessIds: range.witnessIds,
      hoursPerDay,
    };
  });

  result.sort((a, b) => {
    const sc = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    if (sc !== 0) return sc;
    return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
  });

  return result.map((s) => ({
    startDate: s.startDate,
    endDate: s.endDate,
    startTime: s.startTime,
    endTime: s.endTime,
    witnessIds: s.witnessIds,
  }));
}

function computeSegFmHours(
  segDaily: number,
  weeklyDays: number,
  sevenDayMode: SevenDayMode,
): number {
  const n = Number(weeklyDays) || 0;
  let segWeeklyCalc = 0;
  if (n === 7 && sevenDayMode === "tatilli") {
    segWeeklyCalc = segDaily * 6 + Math.max(0, segDaily - DAILY_REF);
  } else {
    segWeeklyCalc = segDaily * (n > 0 ? n : 7);
  }
  const roundedSegWeekly = applyYargitayRounding(segWeeklyCalc);
  return Math.max(0, roundedSegWeekly - WEEKLY_LIMIT);
}

/** Backend `computeClassic`: 270 şirket düşümü için davacı FM (Math.round, Yargıtay yuvarlaması yok). */
function computeDavaciFmHoursFor270Backend(
  form: Pick<YeraltiFormSnapshot, "davaciIn" | "davaciOut" | "weeklyDays" | "sevenDayMode">,
): number {
  const davaciStartH = parseTimeToHours(form.davaciIn);
  const davaciEndHRaw = parseTimeToHours(form.davaciOut);
  if (davaciStartH == null || davaciEndHRaw == null) return 0;
  const davaciEndH = davaciEndHRaw === 0 && davaciStartH > 0 ? 24 : davaciEndHRaw;
  let rawDaily = davaciEndH - davaciStartH;
  if (rawDaily < 0) rawDaily += 24;
  if (rawDaily > 24) rawDaily -= 24;
  const daily = Math.max(0, rawDaily - computeBreakHours(rawDaily));
  const n = Number(form.weeklyDays) || 0;
  let weeklyCalc = 0;
  if (n === 7 && form.sevenDayMode === "tatilli") {
    weeklyCalc = daily * 6 + Math.max(0, daily - DAILY_REF);
  } else {
    weeklyCalc = daily * (n > 0 ? n : 7);
  }
  const roundedWeekly = Math.round(weeklyCalc);
  return Math.max(0, roundedWeekly - WEEKLY_LIMIT);
}

/** Backend `computeClassic` → `FmRow[]` (düşümsüz, 270 simple/detailed dahil). */
export function buildClassicPeriodRows(form: YeraltiFormSnapshot): FmRow[] {
  const davaciStartTime = normalizeTime(form.davaciIn);
  const davaciEndTime = normalizeTime(form.davaciOut);
  if (!davaciStartTime || !davaciEndTime) return [];

  const katsayi = parseKatsayi(form.katsayi);
  const segments = calculateWitnessSegments(form, form.witnesses);
  if (segments.length === 0) return [];

  const rows: FmRow[] = [];
  let segIdx = 0;

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
    let segFmHours = computeSegFmHours(segDaily, form.weeklyDays, form.sevenDayMode);

    const au = getAsgariUcretByDate(segment.startDate) ?? 0;
    const yeraltiUcret = au * 2;
    const baseWeeks = calculateWeekCountBackend(segmentStart, segmentEnd);

    rows.push({
      id: `classic-${segIdx++}`,
      startISO: segment.startDate,
      endISO: segment.endDate,
      weeks: baseWeeks,
      brut: yeraltiUcret,
      katsayi,
      fmHours: segFmHours,
      fm: calcRowFm(yeraltiUcret, katsayi, baseWeeks, segFmHours),
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
            const au = getAsgariUcretByDate(newStartISO) ?? 0;
            const yeraltiUcret = au * 2;
            return {
              ...p,
              startISO: newStartISO,
              weeks: w,
              brut: yeraltiUcret,
              fm: calcRowFm(yeraltiUcret, p.katsayi, w, p.fmHours),
            };
          }
          return p;
        })
        .filter((p): p is FmRow => p != null);
    }
  }

  if (form.mode270 === "simple") {
    adjusted = adjusted.map((p) => {
      const fmHours = Math.max(0, (p.fmHours || 0) - YARGITAY_270_DEDUCTION_HOURS);
      return {
        ...p,
        fmHours,
        fm: calcRowFm(p.brut, p.katsayi, p.weeks, fmHours),
      };
    });
  } else if (form.mode270 === "detailed") {
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
        iseGiris: form.davaciDateIn,
        istenCikis: form.davaciDateOut,
        zamanasimiBaslangic: form.zamanasimi?.nihaiBaslangic ?? null,
        fmHours: fmHours270,
        useSuppliedRowWeeks: true,
      });
      adjusted = adjusted.map((p, i) => {
        const weeks = after270[i]?.weeks ?? p.weeks;
        return {
          ...p,
          weeks,
          fm: calcRowFm(p.brut, p.katsayi, weeks, p.fmHours),
        };
      });
    }
  }

  return adjusted.sort((a, b) => a.startISO.localeCompare(b.startISO));
}
