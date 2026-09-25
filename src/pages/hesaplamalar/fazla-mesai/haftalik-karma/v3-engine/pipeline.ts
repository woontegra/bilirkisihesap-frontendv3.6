/**
 * V3 HaftalikKarmaPage hesap zinciri — rows + computedDisplayRows useMemo birebir taşınması.
 */

import type { ExcludedDay } from "./types/exclusionStorage";
import {
  segmentOvertimeResult,
  getAsgariUcretByDate,
  calculateWeeksBetweenDates,
  buildMergedWitnessSegments,
  type FazlaMesaiRowBase,
} from "./lib/fazlaMesaiShared";
import { computeDisplayRows } from "./lib/fazlaMesai/tableDisplayPipeline";
import {
  applyResolvedManualBrutToRows,
  applyStoredManualBrutOverridesToRows,
} from "./lib/fazlaMesai/fmManualWageRowOverrides";
import {
  expandHaftalikKarmaRowsForDeductions,
  exclusionsNeedLegacySplit,
} from "./haftalik/expandHaftalikKarmaRowsForDeductions";
import {
  calculateFm,
  calculateRowMoney,
  type TanikliRowWithSegmentFields,
} from "./rules/calculateFm.rule";
import { preserveWeeks } from "./rules/preserveWeeks.rule";
import { clampWitnessGroupsByIndex } from "./haftalik/clampWitnessGroups";
import type { PatternDay } from "./haftalik/types";
import {
  calculateWeeklyFMFromDayGroups,
  calculateWeeklyKarmaDeductionFmHours,
  fallbackDailyNetFromWeeklyFm,
  representativeDailyNetFromDayGroups,
  resolveWeeklyKarmaFmContextForDate,
  sumRegisteredWorkDays,
  witnessWeeklyHolidayFromPlaintiffClaim,
  type WeeklyKarmaFmContext,
} from "./haftalik/utils";

export type Mode270Pipeline = "none" | "simple" | "detailed";

export type HaftalikKarmaWitnessInput = {
  startDateISO: string;
  endDateISO: string;
  dayGroups: PatternDay[];
};

export type HaftalikKarmaPipelineSegment = {
  startISO: string;
  endISO: string;
  fmHours: number;
  dailyNet?: number;
  annualLeaveHg?: number;
  annualLeaveSevenDay?: "tatilli" | "tatilsiz";
};

export type HaftalikKarmaPipelineInput = {
  iseGiris: string;
  istenCikis: string;
  dayGroups: PatternDay[];
  hasWeeklyHoliday: boolean;
  weeklyHolidayGroup: number;
  witnesses: HaftalikKarmaWitnessInput[];
  katSayi: number;
  mode270: Mode270Pipeline;
  zamanasimiBaslangic: string | null;
  exclusions: ExcludedDay[];
  haftaTatiliGunu: number | "";
  rowOverrides: Record<string, Partial<FazlaMesaiRowBase>>;
  manualRows: FazlaMesaiRowBase[];
};

export type HaftalikKarmaPipelineOutput = {
  segments: HaftalikKarmaPipelineSegment[];
  baseRows: FazlaMesaiRowBase[];
  displayRows: FazlaMesaiRowBase[];
  tableDisplayRows: FazlaMesaiRowBase[];
  totalBrut: number;
  davaciWeeklyFM: number;
};

function formatDateTR(iso: string | undefined): string {
  if (!iso) return "";
  const s = iso.slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!d || !m || !y) return s;
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`;
}

function isTableRowVisible(r: FazlaMesaiRowBase): boolean {
  if (r.isManual) return true;
  const fmH = Number(r.fmHours ?? 0);
  const w = Number(r.weeks ?? 0);
  const fmAmt = Number(r.fm ?? 0);
  return fmH !== 0 && w !== 0 && fmAmt !== 0;
}

function buildBaseRows(input: HaftalikKarmaPipelineInput): {
  rows: FazlaMesaiRowBase[];
  segments: HaftalikKarmaPipelineSegment[];
  davaciWeeklyFM: number;
} {
  const {
    iseGiris,
    istenCikis,
    dayGroups: davaciGroups,
    hasWeeklyHoliday: hasHoliday,
    weeklyHolidayGroup: holidayGroup,
    witnesses,
    katSayi,
    zamanasimiBaslangic,
    exclusions,
    haftaTatiliGunu,
    rowOverrides,
  } = input;

  const davaciFM = calculateWeeklyFMFromDayGroups(davaciGroups, hasHoliday, holidayGroup);

  if (!iseGiris || !istenCikis) {
    return { rows: [], segments: [], davaciWeeklyFM: davaciFM };
  }

  const kats = katSayi || 1;
  const davaciFmContext: WeeklyKarmaFmContext = {
    dayGroups: davaciGroups,
    hasWeeklyHoliday: hasHoliday,
    weeklyHolidayGroup: holidayGroup,
  };

  const witnessFmProfiles = witnesses
    .filter((w) => w.startDateISO && w.endDateISO)
    .map((w) => {
      const rawGroups = w.dayGroups?.length ? w.dayGroups : davaciGroups;
      const clampedGroups = clampWitnessGroupsByIndex(rawGroups, davaciGroups);
      const wHt = witnessWeeklyHolidayFromPlaintiffClaim({
        davaciDayGroups: davaciGroups,
        davaciHasWeeklyHoliday: hasHoliday,
        davaciWeeklyHolidayGroup: holidayGroup,
        witnessDayGroups: clampedGroups,
      });
      return {
        startDateISO: w.startDateISO,
        endDateISO: w.endDateISO,
        dayGroups: clampedGroups,
        hasWeeklyHoliday: wHt.hasWeeklyHoliday,
        weeklyHolidayGroup: wHt.weeklyHolidayGroup,
      };
    });

  const validWitnesses = witnesses
    .filter((w) => {
      if (!w.startDateISO || !w.endDateISO) return false;
      return w.dayGroups?.some((g) => (g.dayCount ?? 0) > 0 && g.startTime && g.endTime);
    })
    .map((w) => {
      const rawGroups = w.dayGroups?.length ? w.dayGroups : davaciGroups;
      const clampedGroups = clampWitnessGroupsByIndex(rawGroups, davaciGroups);
      const wHt = witnessWeeklyHolidayFromPlaintiffClaim({
        davaciDayGroups: davaciGroups,
        davaciHasWeeklyHoliday: hasHoliday,
        davaciWeeklyHolidayGroup: holidayGroup,
        witnessDayGroups: clampedGroups,
      });
      const wFM = calculateWeeklyFMFromDayGroups(
        clampedGroups,
        wHt.hasWeeklyHoliday,
        wHt.weeklyHolidayGroup,
      );
      const repNet = representativeDailyNetFromDayGroups(
        clampedGroups,
        wHt.hasWeeklyHoliday,
        wHt.weeklyHolidayGroup,
      );
      const dailyNet =
        repNet ??
        fallbackDailyNetFromWeeklyFm(
          wFM,
          clampedGroups,
          wHt.hasWeeklyHoliday,
          wHt.weeklyHolidayGroup,
        );
      const workDays = sumRegisteredWorkDays(clampedGroups);
      return {
        startMs: new Date(w.startDateISO).getTime(),
        endMs: new Date(w.endDateISO).getTime(),
        fmHours: wFM,
        dailyNet,
        annualLeaveHg: Math.max(1, Math.min(7, workDays || 6)),
        annualLeaveSevenDay: (wHt.hasWeeklyHoliday ? "tatilli" : "tatilsiz") as "tatilli" | "tatilsiz",
      };
    })
    .filter(
      (w) =>
        Number.isFinite(w.startMs) &&
        Number.isFinite(w.endMs) &&
        !Number.isNaN(w.startMs) &&
        !Number.isNaN(w.endMs),
    );

  type MergedSeg = {
    start: string;
    end: string;
    fmHours: number;
    dailyNet?: number;
    annualLeaveHg?: number;
    annualLeaveSevenDay?: "tatilli" | "tatilsiz";
  };

  const buildDavaciOnlyMerged = (): MergedSeg[] => {
    const repNet = representativeDailyNetFromDayGroups(davaciGroups, hasHoliday, holidayGroup);
    const dailyNet =
      repNet ?? fallbackDailyNetFromWeeklyFm(davaciFM, davaciGroups, hasHoliday, holidayGroup);
    const workDays = sumRegisteredWorkDays(davaciGroups);
    const start = String(iseGiris).slice(0, 10);
    const end = String(istenCikis).slice(0, 10);
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const hasUsableDavaciPattern = davaciGroups.some(
      (g) => (g.dayCount ?? 0) > 0 && g.startTime && g.endTime,
    );
    if (
      !hasUsableDavaciPattern ||
      !(davaciFM > 0) ||
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      Number.isNaN(startMs) ||
      Number.isNaN(endMs)
    ) {
      return [];
    }
    return [
      {
        start,
        end,
        fmHours: davaciFM,
        dailyNet,
        annualLeaveHg: Math.max(1, Math.min(7, workDays || 6)),
        annualLeaveSevenDay: hasHoliday ? "tatilli" : "tatilsiz",
      },
    ];
  };

  let merged: MergedSeg[] = [];
  if (validWitnesses.length > 0) {
    merged = buildMergedWitnessSegments(iseGiris, istenCikis, validWitnesses);
  }
  if (merged.length === 0) {
    merged = buildDavaciOnlyMerged();
  }

  const segments: HaftalikKarmaPipelineSegment[] = merged.map((seg) => ({
    startISO: seg.start,
    endISO: seg.end,
    fmHours: seg.fmHours,
    dailyNet: seg.dailyNet,
    annualLeaveHg: seg.annualLeaveHg,
    annualLeaveSevenDay: seg.annualLeaveSevenDay,
  }));

  if (merged.length === 0) {
    return { rows: [], segments, davaciWeeklyFM: davaciFM };
  }

  const generatedRows: FazlaMesaiRowBase[] = [];

  merged.forEach((seg, segIdx) => {
    const periods = segmentOvertimeResult({ start: seg.start, end: seg.end });

    periods.forEach((period: { start: string; end: string }, periodIdx: number) => {
      let startDate = new Date(period.start);
      const endDate = new Date(period.end);

      if (zamanasimiBaslangic) {
        const limitDate = new Date(zamanasimiBaslangic);
        if (endDate < limitDate) return;
        if (startDate < limitDate && endDate >= limitDate) {
          startDate = new Date(limitDate);
          period.start = startDate.toISOString().slice(0, 10);
        }
      }

      const weeks = Math.max(0, calculateWeeksBetweenDates(period.start, period.end));
      const brut = getAsgariUcretByDate(period.start) || 0;

      const karmaFmContext = resolveWeeklyKarmaFmContextForDate(
        period.start,
        witnessFmProfiles,
        davaciFmContext,
      );

      generatedRows.push({
        id: `row-${period.start}-${period.end}-${segIdx}-${periodIdx}`,
        startISO: period.start,
        endISO: period.end,
        rangeLabel: `${formatDateTR(period.start)} – ${formatDateTR(period.end)}`,
        weeks,
        originalWeekCount: weeks,
        brut,
        katsayi: kats,
        fmHours: seg.fmHours,
        dailyNet: seg.dailyNet,
        annualLeaveHg: seg.annualLeaveHg,
        annualLeaveSevenDay: seg.annualLeaveSevenDay,
        karmaFmContext,
      });
    });
  });

  if (generatedRows.length === 0) {
    return { rows: [], segments, davaciWeeklyFM: davaciFM };
  }

  const weeklyOffDayNum =
    haftaTatiliGunu === "" || haftaTatiliGunu == null ? null : Number(haftaTatiliGunu);
  const weeklyOffDay = Number.isInteger(weeklyOffDayNum) ? weeklyOffDayNum : null;
  const originalTotalWeeks = generatedRows.reduce(
    (a, r) => a + Math.max(0, Math.floor(Number(r.weeks) || 0)),
    0,
  );

  let pipeline = expandHaftalikKarmaRowsForDeductions({
    rows: generatedRows,
    exclusions,
    weeklyOffDay,
  });
  pipeline = pipeline.map((r) => calculateFm(r as TanikliRowWithSegmentFields));

  if (exclusions.length > 0 && !exclusionsNeedLegacySplit(exclusions)) {
    pipeline = pipeline.map((r) => {
      const row = r as TanikliRowWithSegmentFields & {
        isExclusionBlock?: boolean;
        karmaFmContext?: WeeklyKarmaFmContext;
        karmaDeductionDates?: Array<{ dateISO: string; dayWeight: number }>;
      };
      if (!row.isExclusionBlock || !row.karmaFmContext) return r;
      const fmHours = calculateWeeklyKarmaDeductionFmHours({
        context: row.karmaFmContext,
        deductionDates: row.karmaDeductionDates ?? [],
      });
      return { ...r, fmHours };
    });
  }

  pipeline = preserveWeeks(pipeline, originalTotalWeeks);
  pipeline = pipeline.map((r) => calculateRowMoney(r, kats));

  const rows = applyResolvedManualBrutToRows(pipeline, rowOverrides);

  return { rows, segments, davaciWeeklyFM: davaciFM };
}

function buildDisplayRows(
  input: HaftalikKarmaPipelineInput,
  rows: FazlaMesaiRowBase[],
  davaciWeeklyFM: number,
  effectiveRowOverrides: Record<string, Partial<FazlaMesaiRowBase>>,
): FazlaMesaiRowBase[] {
  const { katSayi, mode270, iseGiris, istenCikis, zamanasimiBaslangic, manualRows, exclusions } =
    input;

  /** Haftalık Karma: ham takvim haftaları + `apply270RuleFrontend` (Şirket) / Yargıtay 5,2 saat düşümü — Standart `computeDisplayRows` ile aynı motor. */
  return computeDisplayRows({
    rows,
    manualRows,
    rowOverrides: effectiveRowOverrides,
    katSayi: katSayi || 1,
    weeklyFMSaat: davaciWeeklyFM,
    exclusions,
    skipAnnualLeaveExclusions: exclusions.length > 0,
    mode270,
    iseGiris,
    istenCikis,
    zamanasimiBaslangic,
    useRawWeeks: true,
  });
}

export function runHaftalikKarmaV3Pipeline(input: HaftalikKarmaPipelineInput): HaftalikKarmaPipelineOutput {
  const { rows: baseRows, segments, davaciWeeklyFM } = buildBaseRows(input);

  const effectiveRowOverrides = applyStoredManualBrutOverridesToRows(
    input.rowOverrides,
    [...baseRows, ...input.manualRows],
  );

  const displayRows = buildDisplayRows(input, baseRows, davaciWeeklyFM, effectiveRowOverrides);
  const tableDisplayRows = displayRows.filter(isTableRowVisible);
  const totalBrut = tableDisplayRows.reduce((a, r) => a + (r.fm ?? 0), 0);

  return {
    segments,
    baseRows,
    displayRows,
    tableDisplayRows,
    totalBrut,
    davaciWeeklyFM,
  };
}
