/**
 * V3 TanikliStandartPage hesap zinciri — rows + computedDisplayRows useMemo birebir taşınması.
 */

import { startOfDay } from "date-fns";
import type { ExcludedDay } from "./types/exclusionStorage";
import {
  segmentOvertimeResult,
  calculateOvertimeWith270AndLimitation,
  getAsgariUcretByDate,
  calculateWeeksBetweenDates,
  buildMergedWitnessSegments,
  fmHoursAfterYargitay270SimpleForRow,
  type FazlaMesaiRowBase,
} from "./lib/fazlaMesaiShared";
import {
  applyResolvedManualBrutToRows,
  applyStoredManualBrutOverridesToRows,
} from "./lib/fazlaMesai/fmManualWageRowOverrides";
import { expandTanikliRowsForDeductions } from "./tanikli/expandTanikliRowsForDeductions";
import {
  calculateFm,
  calculateRowMoney,
  type TanikliRowWithSegmentFields,
} from "./rules/calculateFm.rule";
import { preserveWeeks, countWeeksBySevenDaySteps } from "./rules/preserveWeeks.rule";
import { computeBreakHours } from "./standart/utils";
import { ceilWeeklyWorkHoursToHalfHour } from "./lib/fazlaMesai/weeklyHoursRounding";
import {
  FAZLA_MESAI_DENOMINATOR,
  FAZLA_MESAI_KATSAYI,
  STANDARD_DAILY_REFERENCE_HOURS,
  WEEKLY_WORK_LIMIT,
} from "./standart/constants";

const DAMGA_VERGISI_ORANI = 0.00759;

export type Mode270Pipeline = "none" | "simple" | "detailed";

export type TanikliWitnessInput = {
  dateIn: string;
  dateOut: string;
  in: string;
  out: string;
  weeklyDays?: number | "";
};

export type TanikliPipelineSegment = {
  startISO: string;
  endISO: string;
  fmHours: number;
  dailyNet?: number;
  weeklyDays?: number;
  annualLeaveSevenDay?: "tatilli" | "tatilsiz";
};

export type TanikliPipelineInput = {
  iseGiris: string;
  istenCikis: string;
  davaciIn: string;
  davaciOut: string;
  weeklyDays: number;
  sevenDayMode: "tatilli" | "tatilsiz";
  haftaTatiliGunu: number | "";
  katSayi: number;
  mode270: Mode270Pipeline;
  zamanasimiBaslangic: string | null;
  exclusions: ExcludedDay[];
  rowOverrides: Record<string, Partial<FazlaMesaiRowBase>>;
  manualRows: FazlaMesaiRowBase[];
  witnesses: TanikliWitnessInput[];
};

export type TanikliPipelineOutput = {
  segments: TanikliPipelineSegment[];
  baseRows: FazlaMesaiRowBase[];
  displayRows: FazlaMesaiRowBase[];
  tableDisplayRows: FazlaMesaiRowBase[];
  totalBrut: number;
  weeklyFMSaatFallback: number;
};

function resolveWitnessWeeklyDays(t: TanikliWitnessInput, davaciHg: number): number {
  const raw = t.weeklyDays;
  if (raw === "" || raw == null) return davaciHg;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 7 ? Math.floor(n) : davaciHg;
}

function isTableRowVisible(r: FazlaMesaiRowBase): boolean {
  if (r.isManual) return true;
  const fmH = Number(r.fmHours ?? 0);
  const w = Number(r.weeks ?? 0);
  const fmAmt = Number(r.fm ?? 0);
  return fmH !== 0 && w !== 0 && fmAmt !== 0;
}

function buildBaseRows(input: TanikliPipelineInput): {
  rows: FazlaMesaiRowBase[];
  segments: TanikliPipelineSegment[];
} {
  const {
    iseGiris,
    istenCikis,
    davaciIn,
    davaciOut,
    weeklyDays,
    sevenDayMode: activeTab,
    haftaTatiliGunu,
    katSayi,
    zamanasimiBaslangic,
    exclusions,
    rowOverrides,
    witnesses,
  } = input;

  const davaciDateIn = iseGiris || "";
  const davaciDateOut = istenCikis || "";
  if (!davaciDateIn || !davaciDateOut || !davaciIn || !davaciOut) {
    return { rows: [], segments: [] };
  }
  if (witnesses.length === 0) return { rows: [], segments: [] };

  const hg = Number(weeklyDays) || 6;
  const [dGirH, dGirM] = (davaciIn || "0:0").split(":").map(Number);
  const [dCikH, dCikM] = (davaciOut || "0:0").split(":").map(Number);
  const dGirMinutes = dGirH * 60 + dGirM;
  const dCikMinutes = dCikH * 60 + dCikM;

  const tanikFMData = witnesses
    .filter((t) => t.dateIn && t.dateOut && t.in && t.out)
    .map((t) => {
      const tHg = resolveWitnessWeeklyDays(t, hg);
      const tSeven = activeTab;
      const [tGirH, tGirM] = t.in.split(":").map(Number);
      const [tCikH, tCikM] = t.out.split(":").map(Number);
      const tGirMin = Math.max(tGirH * 60 + tGirM, dGirMinutes);
      const tCikMin = Math.min(tCikH * 60 + tCikM, dCikMinutes);
      const tDailyBrut = Math.max(0, (tCikMin - tGirMin) / 60);
      const tBrk = computeBreakHours(tDailyBrut);
      const tDailyNet = Math.max(0, tDailyBrut - tBrk);
      let tWeeklyFM: number;
      if (tHg === 7 && tSeven === "tatilli") {
        const weeklyNormal = 6 * tDailyNet;
        const holidayOvertime = Math.max(0, tDailyNet - STANDARD_DAILY_REFERENCE_HOURS);
        tWeeklyFM = Math.max(
          0,
          ceilWeeklyWorkHoursToHalfHour(weeklyNormal + holidayOvertime) - WEEKLY_WORK_LIMIT,
        );
      } else {
        tWeeklyFM = Math.max(0, ceilWeeklyWorkHoursToHalfHour(tDailyNet * tHg) - WEEKLY_WORK_LIMIT);
      }
      return {
        fmHours: tWeeklyFM,
        dailyNet: tDailyNet,
        startMs: new Date(t.dateIn).getTime(),
        endMs: new Date(t.dateOut).getTime(),
        annualLeaveHg: tHg,
        annualLeaveSevenDay: tSeven,
      };
    });

  if (tanikFMData.length === 0) return { rows: [], segments: [] };

  const mergedSegments = buildMergedWitnessSegments(davaciDateIn, davaciDateOut, tanikFMData);
  const segments: TanikliPipelineSegment[] = mergedSegments.map((seg) => ({
    startISO: seg.start,
    endISO: seg.end,
    fmHours: seg.fmHours,
    dailyNet: seg.dailyNet,
    weeklyDays: seg.annualLeaveHg,
    annualLeaveSevenDay: seg.annualLeaveSevenDay,
  }));

  const tableRows: FazlaMesaiRowBase[] = [];
  const kats = katSayi || 1;

  mergedSegments.forEach((seg, segIdx) => {
    const periods = segmentOvertimeResult({ start: seg.start, end: seg.end });

    periods.forEach((period, periodIdx) => {
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
      const fm = Number(
        (
          ((brut * kats * weeks * seg.fmHours) / FAZLA_MESAI_DENOMINATOR) * FAZLA_MESAI_KATSAYI
        ).toFixed(2),
      );
      const net = Number((Number(fm) * (1 - DAMGA_VERGISI_ORANI - 0.15)).toFixed(2));

      tableRows.push({
        id: `auto-${period.start}-${period.end}-${segIdx}-${periodIdx}`,
        startISO: period.start,
        endISO: period.end,
        rangeLabel: `${period.start} – ${period.end}`,
        weeks,
        originalWeekCount: weeks,
        brut,
        katsayi: kats,
        fmHours: seg.fmHours,
        dailyNet: seg.dailyNet,
        annualLeaveHg: seg.annualLeaveHg,
        annualLeaveSevenDay: seg.annualLeaveSevenDay,
        fm,
        net,
        wage: brut,
        overtimeAmount: fm,
      });
    });
  });

  const weeklyOffDayNum =
    haftaTatiliGunu === "" || haftaTatiliGunu == null ? null : Number(haftaTatiliGunu);
  const weeklyOff = Number.isInteger(weeklyOffDayNum) ? weeklyOffDayNum : null;

  const originalTotalWeeks = tableRows.reduce(
    (a, r) => a + Math.max(0, Math.floor(Number(r.weeks) || 0)),
    0,
  );

  let pipeline = expandTanikliRowsForDeductions({
    rows: tableRows,
    exclusions,
    weeklyOffDay: weeklyOff,
  });
  pipeline = pipeline.map((r) => calculateFm(r as TanikliRowWithSegmentFields));
  pipeline = preserveWeeks(pipeline, originalTotalWeeks);
  pipeline = pipeline.map((r) => calculateRowMoney(r, kats));

  const overrideMap = rowOverrides;
  const rows = applyResolvedManualBrutToRows(pipeline, overrideMap);

  return { rows, segments };
}

function buildDisplayRows(
  input: TanikliPipelineInput,
  rows: FazlaMesaiRowBase[],
  weeklyFMSaatFallback: number,
): FazlaMesaiRowBase[] {
  const {
    manualRows,
    rowOverrides,
    katSayi,
    mode270,
    iseGiris,
    istenCikis,
    zamanasimiBaslangic,
  } = input;
  const kats = katSayi || 1;

  const effectiveRowOverrides = (() => {
    const baseRows = [...rows, ...manualRows];
    return applyStoredManualBrutOverridesToRows(rowOverrides, baseRows);
  })();

  const autoRows = rows
    .filter((row) => !(effectiveRowOverrides[row.id] as { hidden?: boolean } | undefined)?.hidden)
    .map((row) => {
      const override = effectiveRowOverrides[row.id] as Partial<FazlaMesaiRowBase> | undefined;
      const merged = (override ? { ...row, ...override } : { ...row }) as FazlaMesaiRowBase;
      const startISO = merged.startISO ?? row.startISO;
      const endISO = merged.endISO ?? row.endISO;
      const hasDateOverride =
        !!override && (override.startISO !== undefined || override.endISO !== undefined);
      let weeksFromDates: number | undefined;
      if (hasDateOverride && startISO && endISO) {
        const a = startOfDay(new Date(startISO));
        const b = startOfDay(new Date(endISO));
        if (!Number.isNaN(+a) && !Number.isNaN(+b) && b >= a) {
          weeksFromDates = countWeeksBySevenDaySteps(a, b);
        }
      }
      let effectiveWeeks =
        (override?.weeks as number | undefined) ?? weeksFromDates ?? merged.weeks ?? row.weeks;
      if (
        typeof effectiveWeeks === "number" &&
        effectiveWeeks <= 0 &&
        ((weeksFromDates ?? merged.weeks ?? row.weeks ?? 0) as number) > 0
      ) {
        effectiveWeeks = (weeksFromDates ?? merged.weeks ?? row.weeks ?? 0) as number;
      }
      if (
        override &&
        (override.weeks !== undefined ||
          override.startISO !== undefined ||
          override.endISO !== undefined ||
          override.brut !== undefined ||
          override.fmHours !== undefined ||
          weeksFromDates !== undefined)
      ) {
        merged.weeks = Math.max(0, Math.floor(Number(effectiveWeeks) || 0));
        merged.originalWeekCount = (override.originalWeekCount as number | undefined) ?? merged.weeks;
        if (override.brut != null) merged.brut = override.brut;
        if (override.fmHours != null) merged.fmHours = override.fmHours;
      }
      return calculateRowMoney(merged, kats);
    });

  const manualWithOverrides = manualRows.map((row) => {
    const override = effectiveRowOverrides[row.id] as Partial<FazlaMesaiRowBase> | undefined;
    const merged = (override ? { ...row, ...override } : { ...row }) as FazlaMesaiRowBase;
    const startISO = merged.startISO ?? row.startISO;
    const endISO = merged.endISO ?? row.endISO;
    let weeksFromDates: number | undefined;
    if (startISO && endISO) {
      const sd = startOfDay(new Date(startISO));
      const ed = startOfDay(new Date(endISO));
      if (!Number.isNaN(+sd) && !Number.isNaN(+ed) && ed >= sd) {
        weeksFromDates = countWeeksBySevenDaySteps(sd, ed);
      }
    }
    let weeks = (merged.weeks as number | undefined) ?? weeksFromDates ?? 0;
    if (weeks <= 0 && ((weeksFromDates ?? merged.weeks ?? 0) as number) > 0) {
      weeks = (weeksFromDates ?? merged.weeks ?? 0) as number;
    }
    merged.weeks = Math.max(0, Math.floor(Number(weeks) || 0));
    merged.originalWeekCount = merged.originalWeekCount ?? merged.weeks;
    merged.fmHours = merged.fmHours ?? weeklyFMSaatFallback;
    merged.brut = merged.brut ?? 0;
    return calculateRowMoney(merged, kats);
  });

  const mergedList: FazlaMesaiRowBase[] = [];
  for (const autoRow of autoRows) {
    mergedList.push(autoRow);
    const manualAfter = manualWithOverrides.filter(
      (m) => (m as FazlaMesaiRowBase).insertAfter === autoRow.id,
    );
    mergedList.push(...manualAfter);
  }
  const insertedManualIds = new Set(mergedList.filter((r) => r.isManual).map((r) => r.id));
  mergedList.push(...manualWithOverrides.filter((m) => !insertedManualIds.has(m.id)));

  let with270: FazlaMesaiRowBase[] = mergedList.map((r) => ({
    ...r,
    originalWeekCount: r.originalWeekCount ?? r.weeks,
  }));

  if (mode270 === "simple") {
    with270 = with270.map((r) => ({
      ...r,
      fmHours: fmHoursAfterYargitay270SimpleForRow(r as FazlaMesaiRowBase, Number(r.fmHours) || 0),
    }));
  } else if (mode270 === "detailed") {
    const valid = with270.filter((r) => r.startISO && r.endISO);
    const weeklyFM = valid[0]?.fmHours ?? weeklyFMSaatFallback;
    const tabloSatirlari = valid.map((r) => ({
      baslangic: new Date(r.startISO!),
      bitis: new Date(r.endISO!),
    }));
    if (tabloSatirlari.length > 0 && iseGiris && istenCikis && weeklyFM > 0) {
      const sonuclar = calculateOvertimeWith270AndLimitation({
        iseGirisTarihi: new Date(iseGiris),
        istenCikisTarihi: new Date(istenCikis),
        haftalikFazlaMesaiSaati: weeklyFM,
        zamanaSimiTarihi: zamanasimiBaslangic ? new Date(zamanasimiBaslangic) : undefined,
        yillikIzinler: [],
        tabloSatirlari,
      });
      with270 = with270.map((r) => {
        const j = valid.findIndex((v) => v.id === r.id);
        if (j >= 0 && sonuclar[j] != null) {
          const rawWeeks = r.originalWeekCount ?? r.weeks ?? 0;
          const adjusted = sonuclar[j].fmHafta;
          const isManual = !!r.isManual;
          const newWeeks = Number.isFinite(adjusted)
            ? isManual && adjusted <= 0
              ? Math.max(1, rawWeeks)
              : adjusted > 0
                ? adjusted
                : rawWeeks
            : rawWeeks;
          return {
            ...r,
            weeks: newWeeks > 0 ? newWeeks : rawWeeks,
            originalWeekCount: r.originalWeekCount ?? r.weeks,
          } as FazlaMesaiRowBase;
        }
        return r;
      });
    }
  }

  return with270.map((r) => calculateRowMoney(r, kats));
}

export function runTanikliFmV3Pipeline(input: TanikliPipelineInput): TanikliPipelineOutput {
  const { rows: baseRows, segments } = buildBaseRows(input);
  const weeklyFMSaatFallback =
    baseRows.length > 0 && baseRows[0].fmHours != null ? baseRows[0].fmHours : 0;
  const displayRows = buildDisplayRows(input, baseRows, weeklyFMSaatFallback);
  const tableDisplayRows = displayRows.filter(isTableRowVisible);
  const totalBrut = tableDisplayRows.reduce((a, r) => a + (r.fm ?? 0), 0);

  return {
    segments,
    baseRows,
    displayRows,
    tableDisplayRows,
    totalBrut,
    weeklyFMSaatFallback,
  };
}
