/**
 * Standart fazla mesai: haftada 6 gün + yıllık izin girildiğinde,
 * yalnızca izinle kesişen takvim haftalarını yeniden hesaplar (bilirkişi yuvarlaması, Math.round yok).
 */

import { addDays, startOfDay, startOfWeek } from "date-fns";
import type { ExcludedDay } from "../types/exclusionStorage";
import { countAnnualLeaveCalendarDaysInWindow } from "../lib/fazlaMesai/annualLeaveCalendarDays";
import { resolveStoredManualBrutForStartISO } from "../lib/fazlaMesai/fmManualWageRowOverrides";
import { getAsgariUcretByDate } from "../lib/fazlaMesaiShared";
import type { FazlaMesaiRowBase } from "../lib/fazlaMesaiShared";
import { FAZLA_MESAI_DENOMINATOR, FAZLA_MESAI_KATSAYI, WEEKLY_WORK_LIMIT } from "./constants";
import { DAMGA_VERGISI_ORANI, GELIR_VERGISI_ORANI } from "../lib/fazlaMesai/tableDisplayPipeline";
import {
  isStandartFmDebugEnabled,
  logSixDayCollapse,
  logSixDayWeekChunk,
} from "./standartFmDebugLog";

const EPS = 1e-7;

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

function normalizeWeeksForStandard(startISO: string, endISO: string, rawWeeks: number): number {
  const s = (startISO || "").slice(0, 10);
  const e = (endISO || "").slice(0, 10);
  if (!s || !e) return rawWeeks;
  const sy = s.slice(0, 4);
  const ey = e.slice(0, 4);
  const w = Number(rawWeeks);
  const safeW = Number.isFinite(w) && w > 0 ? w : NaN;
  // Tam yıl / yarım yıl: ham hafta 53 vb. üstten tavan; yıllık izin bölünmesiyle gelen 51 gibi düşük değer korunur (sabit 52 ezilmesin).
  if (sy === ey && s.slice(5) === "01-01" && e.slice(5) === "12-31") {
    return Number.isFinite(safeW) ? Math.min(52, safeW) : 52;
  }
  if (sy === ey && s.slice(5) === "01-01" && e.slice(5) === "06-30") {
    return Number.isFinite(safeW) ? Math.min(26, safeW) : 26;
  }
  if (sy === ey && s.slice(5) === "07-01" && e.slice(5) === "12-31") {
    return Number.isFinite(safeW) ? Math.min(26, safeW) : 26;
  }
  return rawWeeks;
}

/**
 * .5 aynı kalır; .6+ yukarı tam sayı; .4- aşağı tam sayı. Math.round kullanılmaz.
 */
export function bilirkisiRoundWeeklyTotalHours(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const int = Math.floor(value + EPS);
  const frac = value - int;
  if (frac < 0.5 - EPS) return int;
  if (frac > 0.5 + EPS) return int + 1;
  return int + 0.5;
}

function formatLeaveCaptionInt(
  leaveDaysInt: number,
  nIzin: number,
  nUbgt: number,
  nOther: number
): string {
  const n = Math.min(6, Math.max(0, Math.floor(leaveDaysInt)));
  if (nUbgt === 0 && nOther === 0) return `(${n} gün yıllık izin düşülmüştür)`;
  if (nIzin === 0 && nOther === 0) return `(${n} gün UBGT düşülmüştür)`;
  if (nIzin === 0 && nUbgt === 0) return `(${n} gün dışlama düşülmüştür)`;
  return `(${n} gün dışlama düşülmüştür: yıllık izin / UBGT / diğer)`;
}

export type AnnualLeaveWeekChunk = {
  startISO: string;
  endISO: string;
  weeks: number;
  brut: number;
  fmHours: number;
  yillikIzinAciklama?: string;
  workedDays?: number;
  totalDays?: number;
  excludedDays?: number;
};

type WeekChunk = AnnualLeaveWeekChunk;

function mergeNormalWeekChunks(chunks: WeekChunk[]): WeekChunk[] {
  if (chunks.length === 0) return [];
  const out: WeekChunk[] = [];
  for (const c of chunks) {
    const last = out[out.length - 1];
    if (
      last &&
      !last.yillikIzinAciklama &&
      !c.yillikIzinAciklama &&
      last.fmHours === c.fmHours &&
      last.brut === c.brut
    ) {
      last.endISO = c.endISO;
      last.weeks += c.weeks;
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

/** Düşüm haftaları araya girince kalan normal haftaları tek satırda toplar (ör. 43+1). */
export function collapseNormalChunksAroundDeductions(chunks: WeekChunk[], originalWeeks: number): WeekChunk[] {
  const merged = mergeNormalWeekChunks(chunks);
  const deduction = merged.filter((c) => c.yillikIzinAciklama);
  const normal = merged.filter((c) => !c.yillikIzinAciklama);
  if (deduction.length === 0) {
    if (originalWeeks > 0 && merged.length === 1) {
      merged[0].weeks = originalWeeks;
    }
    return merged;
  }
  if (normal.length === 0) {
    return deduction;
  }
  const deductionWeeks = deduction.reduce((sum, c) => sum + c.weeks, 0);
  const budgetWeeks = originalWeeks > 0 ? originalWeeks : normal.reduce((sum, c) => sum + c.weeks, 0);
  const combinedNormal: WeekChunk = {
    startISO: normal[0].startISO,
    endISO: normal[normal.length - 1].endISO,
    weeks: Math.max(0, budgetWeeks - deductionWeeks),
    brut: normal[0].brut,
    fmHours: normal[0].fmHours,
  };
  return [combinedNormal, ...deduction].sort((a, b) => a.startISO.localeCompare(b.startISO));
}

/**
 * Tek asgari segment satırını (çok haftalı) izin etkisine göre haftalık satırlara böler.
 */
export function expandStandartSegmentForSixDayAnnualLeave(
  row: FazlaMesaiRowBase,
  exclusions: ExcludedDay[],
  dailyNet: number,
  baselineWeeklyFm: number,
  segmentIndex: number,
  weeklyOffDay: number | null,
  rowOverrides?: Record<string, Partial<FazlaMesaiRowBase>>,
): FazlaMesaiRowBase[] {
  const startISO = row.startISO;
  const endISO = row.endISO;
  if (!startISO || !endISO || exclusions.length === 0) return [row];

  const segStartRaw = new Date(startISO);
  const segEndRaw = new Date(endISO);
  if (Number.isNaN(+segStartRaw) || Number.isNaN(+segEndRaw)) return [row];
  // UTC parse kaynaklı gün kaymasını önlemek için yerel gün başına normalize edilir.
  const segStart = startOfDay(segStartRaw);
  const segEnd = startOfDay(segEndRaw);
  if (segEnd < segStart) return [row];

  const kats = row.katsayi ?? 1;
  const chunks: WeekChunk[] = [];

  let weekMon = startOfWeek(segStart, { weekStartsOn: 1 });
  const lastMon = startOfWeek(segEnd, { weekStartsOn: 1 });

  while (weekMon <= lastMon) {
    const weekSun = addDays(weekMon, 6);
    const clipStart = dateMax(segStart, weekMon);
    const clipEnd = dateMin(segEnd, weekSun);
    if (clipStart <= clipEnd) {
      const clipStartISO = toISODate(clipStart);
      const asgariBrut = getAsgariUcretByDate(clipStartISO) || 0;
      const leaveDaysInt = Math.min(
        6,
        countAnnualLeaveCalendarDaysInWindow(
          clipStart,
          clipEnd,
          exclusions,
          weeklyOffDay,
          ["Yıllık İzin", "UBGT", "Rapor", "Diğer"]
        )
      );
      const affected = leaveDaysInt >= 1;
      const brut = rowOverrides
        ? resolveStoredManualBrutForStartISO(clipStartISO, rowOverrides, asgariBrut).brut
        : (row as { brutManual?: boolean }).brutManual && row.brut
          ? row.brut
          : asgariBrut;
      let fmHours: number;
      let note: string | undefined;
      let nIzin = 0;
      let nUbgt = 0;
      let nOther = 0;
      let workedDays = 6;
      let rawTotal = 0;
      let totalRounded = 0;
      if (affected) {
        nIzin = countAnnualLeaveCalendarDaysInWindow(
          clipStart,
          clipEnd,
          exclusions,
          weeklyOffDay,
          ["Yıllık İzin"]
        );
        nUbgt = countAnnualLeaveCalendarDaysInWindow(
          clipStart,
          clipEnd,
          exclusions,
          weeklyOffDay,
          ["UBGT"]
        );
        nOther = countAnnualLeaveCalendarDaysInWindow(
          clipStart,
          clipEnd,
          exclusions,
          weeklyOffDay,
          ["Rapor", "Diğer"]
        );
        workedDays = Math.max(0, 6 - leaveDaysInt);
        rawTotal = workedDays * dailyNet;
        totalRounded = bilirkisiRoundWeeklyTotalHours(rawTotal);
        fmHours = Math.max(0, totalRounded - WEEKLY_WORK_LIMIT);
        note = formatLeaveCaptionInt(leaveDaysInt, nIzin, nUbgt, nOther);
      } else {
        fmHours = baselineWeeklyFm;
      }
      if (affected) {
        logSixDayWeekChunk({
          segmentIndex,
          clipStart: clipStartISO,
          clipEnd: toISODate(clipEnd),
          leaveDaysInt,
          nIzin,
          nUbgt,
          fmHours,
          affected: true,
        });
      }
      chunks.push({
        startISO: toISODate(clipStart),
        endISO: toISODate(clipEnd),
        weeks: 1,
        brut,
        fmHours,
        yillikIzinAciklama: note,
      });
    }
    weekMon = addDays(weekMon, 7);
  }

  if (chunks.length === 0) return [row];

  const originalWeeks = Math.max(0, Number(row.weeks ?? row.originalWeekCount ?? 0));
  const merged = collapseNormalChunksAroundDeductions(chunks, originalWeeks);

  if (isStandartFmDebugEnabled()) {
    const deductionWeeks = merged
      .filter((c) => c.yillikIzinAciklama)
      .reduce((sum, c) => sum + c.weeks, 0);
    logSixDayCollapse({
      segmentIndex,
      originalWeeks,
      deductionWeeks,
      combinedNormalWeeks: merged.find((c) => !c.yillikIzinAciklama)?.weeks,
      chunkCountAfter: merged.length,
    });
  }

  return merged.map((c, j) => {
    const weeks = normalizeWeeksForStandard(c.startISO, c.endISO, c.weeks);
    const fm = Number(
      (((c.brut * kats * weeks * c.fmHours) / FAZLA_MESAI_DENOMINATOR) * FAZLA_MESAI_KATSAYI).toFixed(2)
    );
    const net = Number((fm * (1 - DAMGA_VERGISI_ORANI - GELIR_VERGISI_ORANI)).toFixed(2));
    return {
      ...row,
      id: `auto-${c.startISO}-${c.endISO}-yl6-${segmentIndex}-${j}`,
      startISO: c.startISO,
      endISO: c.endISO,
      rangeLabel: `${c.startISO} – ${c.endISO}`,
      weeks,
      originalWeekCount: weeks,
      brut: c.brut,
      katsayi: kats,
      fmHours: c.fmHours,
      fm: Number(fm),
      net,
      wage: c.brut,
      overtimeAmount: Number(fm),
      yillikIzinAciklama: c.yillikIzinAciklama,
    } as FazlaMesaiRowBase;
  });
}

export function expandStandartRowsForSixDayAnnualLeave(
  rows: FazlaMesaiRowBase[],
  exclusions: ExcludedDay[] | null | undefined,
  dailyNet: number,
  baselineWeeklyFm: number,
  weeklyOffDay: number | null,
  rowOverrides?: Record<string, Partial<FazlaMesaiRowBase>>,
): FazlaMesaiRowBase[] {
  if (!exclusions?.length || rows.length === 0) return rows;
  const out: FazlaMesaiRowBase[] = [];
  rows.forEach((row, i) => {
    out.push(
      ...expandStandartSegmentForSixDayAnnualLeave(
        row,
        exclusions,
        dailyNet,
        baselineWeeklyFm,
        i,
        weeklyOffDay,
        rowOverrides,
      )
    );
  });
  return out;
}
