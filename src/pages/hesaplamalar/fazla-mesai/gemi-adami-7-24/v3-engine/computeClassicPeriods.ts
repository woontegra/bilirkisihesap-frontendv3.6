/**
 * V3 backend `gemiFullCrew24FM.service.js` — `computeClassic` dönem üretimi.
 * Hafta sayısı: exclusions ile backend calculateWeekCount; UBGT/yıllık izin satır bölme expand'de.
 */

import { getAsgariUcretByDate, getAsgariUcretPeriodsInRange } from "../asgariUcret";
import type { ExclusionItem, Gemi724FormSnapshot, PeriodRow, WitnessInput } from "../model";
import { newLocalId } from "../model";
import { MODE270_SIMPLE_REDUCTION_HOURS } from "../../shared/mode270Core";
import { apply270ToPeriodsUnified } from "./lib/apply270ToPeriodsUnified";
import { normalizeDate, normalizeLocalDate, toISODateLocal } from "./lib/dateHelpers";
import { normalizeWitnessDateRanges } from "./lib/dateSegmentationCore";

const MAX_WEEKS_PER_YEAR = 52;
const HALF_YEAR_DAY_LIMIT = 183;
const DAILY_NET_HOURS = 13;
const FIXED_FM_HOURS = 35;
const DENOM = 240;
const FACTOR = 1.25;
const DAMGA_ORANI = 0.00759;
const GELIR_VERGISI_ORANI = 0.15;

function computeFmMoney(weeks: number, brut: number, katsayi: number, fmHours: number): { fm: number; net: number } {
  const step1 = Number((weeks * brut).toFixed(6));
  const step2 = Number((step1 * katsayi).toFixed(6));
  const step3 = Number((step2 * fmHours).toFixed(6));
  const step4 = Number((step3 / DENOM).toFixed(6));
  const step5 = Number((step4 * FACTOR).toFixed(6));
  const fm = Number(step5.toFixed(2));
  const net = Number((fm * (1 - DAMGA_ORANI - GELIR_VERGISI_ORANI)).toFixed(2));
  return { fm, net };
}

type ExclusionRange = { start: string; end: string };

function exclusionsForBackendWeeks(exclusions: ExclusionItem[]): ExclusionRange[] {
  return exclusions
    .filter((e) => e?.start && e?.end)
    .map((e) => ({
      start: String(e.start).slice(0, 10),
      end: String(e.end || e.start).slice(0, 10),
    }));
}

function getExcludedDaysInPeriod(periodStart: Date, periodEnd: Date, excludedDays: ExclusionRange[]): number {
  if (!excludedDays.length) return 0;
  const periodStartDate = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
  const periodEndDate = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());
  let excludedDaysInPeriod = 0;
  for (const exclude of excludedDays) {
    const excludeStart = normalizeLocalDate(exclude.start);
    const excludeEnd = normalizeLocalDate(exclude.end);
    if (!excludeStart || !excludeEnd) continue;
    const overlapStart = excludeStart > periodStartDate ? excludeStart : periodStartDate;
    const overlapEnd = excludeEnd < periodEndDate ? excludeEnd : periodEndDate;
    if (overlapStart <= overlapEnd) {
      const overlapTime = overlapEnd.getTime() - overlapStart.getTime();
      excludedDaysInPeriod += Math.max(0, Math.floor(overlapTime / (1000 * 60 * 60 * 24)) + 1);
    }
  }
  return excludedDaysInPeriod;
}

/** Backend `calculateWeekCount` — exclusions takvim günü kesişimi ile hafta düşümü. */
function calculateWeekCountBackend(startDate: Date, endDate: Date, excludedDays: ExclusionRange[]): number {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const diffTime = end.getTime() - start.getTime();
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  let totalWeeks = Math.round(totalDays / 7);
  if (totalWeeks === 25 && totalDays <= HALF_YEAR_DAY_LIMIT) totalWeeks = 26;

  const excludedDaysTotal = getExcludedDaysInPeriod(start, end, excludedDays);
  const weeksFrac = excludedDaysTotal / 7;
  const full = Math.floor(weeksFrac);
  const fraction = weeksFrac - full;
  const excludedWeeks = fraction < 0.5 ? full : full + 1;

  let weeksResult = Math.max(0, totalWeeks - excludedWeeks);
  if (weeksResult > MAX_WEEKS_PER_YEAR) weeksResult = MAX_WEEKS_PER_YEAR;
  if (weeksResult < 1) weeksResult = 1;
  return weeksResult;
}

function resolveWitnessesForApi(form: Gemi724FormSnapshot): WitnessInput[] {
  const valid = form.witnesses.filter((w) => w.dateIn && w.dateOut);
  if (valid.length > 0) return valid;
  if (!form.iseGiris || !form.istenCikis) return [];
  return [
    {
      id: "synthetic-davaci-period",
      name: "Davacı dönemi",
      dateIn: form.iseGiris,
      dateOut: form.istenCikis,
    },
  ];
}

function calculateWitnessSegments(form: Gemi724FormSnapshot): Array<{ startDate: string; endDate: string }> {
  const davaciDateIn = normalizeDate(form.iseGiris);
  const davaciDateOut = normalizeDate(form.istenCikis);
  if (!davaciDateIn || !davaciDateOut) return [];

  const davaciStartDate = normalizeLocalDate(davaciDateIn);
  const davaciEndDate = normalizeLocalDate(davaciDateOut);
  if (!davaciStartDate || !davaciEndDate || davaciStartDate > davaciEndDate) return [];

  const witnesses = resolveWitnessesForApi(form);
  const hasValidWitnesses = witnesses.some((w) => w.dateIn && w.dateOut);
  if (!hasValidWitnesses) {
    return [{ startDate: davaciDateIn, endDate: davaciDateOut }];
  }

  const normalizedRanges = normalizeWitnessDateRanges(witnesses, davaciStartDate, davaciEndDate);
  if (normalizedRanges.length === 0) {
    return [{ startDate: davaciDateIn, endDate: davaciDateOut }];
  }

  return normalizedRanges
    .map((r) => ({ startDate: r.startDate, endDate: r.endDate }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
}

function splitSegmentByAsgari(startISO: string, endISO: string): Array<{ start: string; end: string; brut: number }> {
  const periods = getAsgariUcretPeriodsInRange(startISO, endISO);
  if (periods.length === 0) {
    return [{ start: startISO, end: endISO, brut: getAsgariUcretByDate(startISO) ?? 0 }];
  }
  return periods.map((p) => ({ start: p.start, end: p.end, brut: p.brut }));
}

/** V3 `/api/fm/gemi-full-crew24` computeClassic çıktısı. */
export function buildClassicPeriodRows(form: Gemi724FormSnapshot): PeriodRow[] {
  const katsayi = Number(form.katSayi) > 0 ? Number(form.katSayi) : 1;
  const fmHours = FIXED_FM_HOURS;
  const exRanges = exclusionsForBackendWeeks(form.exclusions);
  const segments = calculateWitnessSegments(form);
  if (segments.length === 0) return [];

  const rows: PeriodRow[] = [];
  for (const segment of segments) {
    const segmentStart = normalizeLocalDate(segment.startDate);
    const segmentEnd = normalizeLocalDate(segment.endDate);
    if (!segmentStart || !segmentEnd || segmentStart > segmentEnd) continue;

    for (const sub of splitSegmentByAsgari(segment.startDate, segment.endDate)) {
      const subStart = normalizeLocalDate(sub.start)!;
      const subEnd = normalizeLocalDate(sub.end)!;
      const subEndExclusive = new Date(subEnd);
      subEndExclusive.setDate(subEndExclusive.getDate() + 1);
      const w = calculateWeekCountBackend(subStart, subEndExclusive, exRanges);
      const { fm, net } = computeFmMoney(w, sub.brut, katsayi, fmHours);
      rows.push({
        id: newLocalId("row"),
        startISO: sub.start,
        endISO: sub.end,
        weeks: w,
        brut: sub.brut,
        katsayi,
        fmHours,
        fm,
        net,
        dailyNet: DAILY_NET_HOURS,
        annualLeaveHg: 7,
        annualLeaveSevenDay: "tatilsiz",
        isDeductionRow: false,
      });
    }
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
            const newStart = normalizeLocalDate(newStartISO)!;
            const rowEndExclusive = new Date(rowEnd);
            rowEndExclusive.setDate(rowEndExclusive.getDate() + 1);
            const w = calculateWeekCountBackend(newStart, rowEndExclusive, exRanges);
            const brut = getAsgariUcretByDate(newStartISO) ?? p.brut;
            const { fm, net } = computeFmMoney(w, brut, katsayi, p.fmHours);
            return { ...p, startISO: newStartISO, weeks: w, brut, fm, net };
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
        const nextFm = Math.max(0, (p.fmHours || 0) - MODE270_SIMPLE_REDUCTION_HOURS);
        const { fm, net } = computeFmMoney(p.weeks, p.brut, p.katsayi, nextFm);
        return { ...p, fmHours: nextFm, fm, net };
      });
    } else {
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
        fmHours: FIXED_FM_HOURS,
        useSuppliedRowWeeks: true,
      });
      adjusted = adjusted.map((p, i) => {
        const weeks = after270[i]?.weeks ?? p.weeks;
        const { fm, net } = computeFmMoney(weeks, p.brut, p.katsayi, p.fmHours);
        return { ...p, weeks, fm, net };
      });
    }
  }

  return adjusted.sort((a, b) => a.startISO.localeCompare(b.startISO));
}
