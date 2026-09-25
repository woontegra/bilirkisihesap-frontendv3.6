/**
 * V3 DonemselFazlaMesaiCore (haftalikMode=true) — rows + computedDisplayRows zinciri.
 */

import { startOfDay } from "date-fns";
import type { ExcludedDay } from "./types/exclusionStorage";
import type { FazlaMesaiRowBase } from "./lib/fazlaMesaiShared";
import {
  applyResolvedManualBrutToRows,
  applyStoredManualBrutOverridesToRows,
} from "./lib/fazlaMesai/fmManualWageRowOverrides";
import { apply270RuleFrontend } from "./lib/fazlaMesai/tableDisplayPipeline";
import {
  buildDonemselRows,
  calcFmHoursPerWeekHaftalik,
  weeklyIgnoredWeekdayFromSeasonalPattern,
} from "./donemsel/utils";
import {
  applyDonemselHaftalikDeductionFmOverride,
  expandDonemselHaftalikRowsForDeductions,
} from "./donemsel-haftalik/expandDonemselHaftalikRowsForDeductions";
import type { DonemselWitness, SeasonalPattern } from "./donemsel/types";
import {
  calculateFm,
  calculateRowMoney,
  type TanikliRowWithSegmentFields,
} from "./rules/calculateFm.rule";
import { preserveWeeks, countWeeksBySevenDaySteps } from "./rules/preserveWeeks.rule";

export type Mode270Pipeline = "none" | "simple" | "detailed";

const YARGITAY_270_FM_DROP = 5.2;

export type DonemselHaftalikPipelineInput = {
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalPattern;
  winterPattern: SeasonalPattern;
  witnesses: DonemselWitness[];
  katSayi: number;
  mode270: Mode270Pipeline;
  zamanasimiBaslangic: string | null;
  exclusions: ExcludedDay[];
  rowOverrides: Record<string, Partial<FazlaMesaiRowBase>>;
  manualRows: FazlaMesaiRowBase[];
};

export type DonemselHaftalikPipelineOutput = {
  yazFmHours: number;
  kisFmHours: number;
  davaciWeeklyFM: number;
  baseRows: FazlaMesaiRowBase[];
  displayRows: FazlaMesaiRowBase[];
  tableDisplayRows: FazlaMesaiRowBase[];
  totalBrut: number;
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

function buildBaseRows(input: DonemselHaftalikPipelineInput): {
  rows: FazlaMesaiRowBase[];
  yazFmHours: number;
  kisFmHours: number;
  davaciWeeklyFM: number;
} {
  const {
    dateIn,
    dateOut,
    summerPattern,
    winterPattern,
    witnesses,
    katSayi,
    zamanasimiBaslangic,
    exclusions,
    rowOverrides,
  } = input;

  const yazFmHours = calcFmHoursPerWeekHaftalik(summerPattern);
  const kisFmHours = calcFmHoursPerWeekHaftalik(winterPattern);
  const davaciWeeklyFM = yazFmHours;

  if (!dateIn || !dateOut) {
    return { rows: [], yazFmHours, kisFmHours, davaciWeeklyFM };
  }

  const kats = katSayi || 1;
  const raw = buildDonemselRows({
    dateIn,
    dateOut,
    summerPattern,
    winterPattern,
    witnesses,
    katSayi: kats,
    haftalikMode: true,
  }) as FazlaMesaiRowBase[];

  const afterZaman = (() => {
    if (!zamanasimiBaslangic) return raw;
    const zDate = new Date(zamanasimiBaslangic);
    return raw
      .map((r) => {
        if (!r.startISO || !r.endISO) return r;
        const rEnd = new Date(r.endISO);
        const rStart = new Date(r.startISO);
        if (rEnd < zDate) return null;
        if (rStart < zDate && rEnd >= zDate) {
          const diffMs = rEnd.getTime() - zDate.getTime();
          const diffDays = Math.round(diffMs / 86400000) + 1;
          const adjWeeks = Math.round(diffDays / 7);
          return {
            ...r,
            startISO: zamanasimiBaslangic,
            rangeLabel: `${formatDateTR(zamanasimiBaslangic)} – ${formatDateTR(r.endISO)}`,
            weeks: adjWeeks,
            originalWeekCount: adjWeeks,
          };
        }
        return r;
      })
      .filter(Boolean) as FazlaMesaiRowBase[];
  })();

  const davaciWeeklyOffFallback = weeklyIgnoredWeekdayFromSeasonalPattern(summerPattern, true);
  const originalTotalWeeks = afterZaman.reduce(
    (a, r) => a + Math.max(0, Math.floor(Number(r.weeks) || 0)),
    0,
  );

  let pipeline = expandDonemselHaftalikRowsForDeductions({
    rows: afterZaman,
    exclusions,
    weeklyOffDay: davaciWeeklyOffFallback,
    seasonalDeductionContext: {
      summerPattern,
      winterPattern,
      summerMonths: summerPattern.months ?? [],
    },
  });
  pipeline = pipeline.map((r) => calculateFm(r as TanikliRowWithSegmentFields));
  pipeline = pipeline.map((r) =>
    applyDonemselHaftalikDeductionFmOverride(r as TanikliRowWithSegmentFields),
  );
  pipeline = preserveWeeks(pipeline, originalTotalWeeks);
  pipeline = pipeline.map((r) => calculateRowMoney(r, kats));

  const rows = applyResolvedManualBrutToRows(pipeline, rowOverrides);

  return { rows, yazFmHours, kisFmHours, davaciWeeklyFM };
}

function buildDisplayRows(
  input: DonemselHaftalikPipelineInput,
  rows: FazlaMesaiRowBase[],
  davaciWeeklyFM: number,
  effectiveRowOverrides: Record<string, Partial<FazlaMesaiRowBase>>,
): FazlaMesaiRowBase[] {
  const { katSayi, mode270, manualRows } = input;
  const kats = katSayi || 1;

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
        merged.originalWeekCount =
          (override.originalWeekCount as number | undefined) ?? merged.weeks;
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
    merged.fmHours = merged.fmHours ?? davaciWeeklyFM;
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
    with270 = with270.map((r) => {
      const raw = Math.max(0, (Number(r.fmHours) || 0) - YARGITAY_270_FM_DROP);
      const fmHours = Math.round(raw * 1e4) / 1e4;
      return { ...r, fmHours };
    });
  } else if (mode270 === "detailed") {
    with270 = apply270RuleFrontend(with270) as typeof with270;
  }

  return with270.map((r) => calculateRowMoney(r, kats));
}

export function runDonemselHaftalikV3Pipeline(
  input: DonemselHaftalikPipelineInput,
): DonemselHaftalikPipelineOutput {
  const { rows: baseRows, yazFmHours, kisFmHours, davaciWeeklyFM } = buildBaseRows(input);

  const effectiveRowOverrides = applyStoredManualBrutOverridesToRows(
    input.rowOverrides,
    [...baseRows, ...input.manualRows],
  );

  const displayRows = buildDisplayRows(input, baseRows, davaciWeeklyFM, effectiveRowOverrides);
  const tableDisplayRows = displayRows.filter(isTableRowVisible);
  const totalBrut = tableDisplayRows.reduce((a, r) => a + (r.fm ?? 0), 0);

  return {
    yazFmHours,
    kisFmHours,
    davaciWeeklyFM,
    baseRows,
    displayRows,
    tableDisplayRows,
    totalBrut,
  };
}
