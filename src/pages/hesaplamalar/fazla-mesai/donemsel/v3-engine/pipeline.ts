/**
 * V3 DonemselFazlaMesaiCore (klasik, haftalikMode=false) — rows + computedDisplayRows zinciri.
 */

import { startOfDay } from "date-fns";
import type { ExcludedDay } from "./types/exclusionStorage";
import {
  calculateOvertimeWith270AndLimitation,
  type FazlaMesaiRowBase,
} from "./lib/fazlaMesaiShared";
import {
  applyResolvedManualBrutToRows,
  applyStoredManualBrutOverridesToRows,
} from "./lib/fazlaMesai/fmManualWageRowOverrides";
import {
  buildDonemselRows,
  calcFmHoursPerWeek,
  sevenModeFromPattern,
  weeklyIgnoredWeekdayFromSeasonalPattern,
  workDaysFromPattern,
} from "./donemsel/utils";
import { expandDonemselRowsForDeductions } from "./donemsel/expandDonemselRowsForDeductions";
import type { DonemselWitness, SeasonalPattern } from "./donemsel/types";
import {
  calculateFm,
  calculateRowMoney,
  type TanikliRowWithSegmentFields,
} from "./rules/calculateFm.rule";
import { preserveWeeks, countWeeksBySevenDaySteps } from "./rules/preserveWeeks.rule";

export type Mode270Pipeline = "none" | "simple" | "detailed";

const YARGITAY_270_FM_DROP = 5.2;

export type DonemselPipelineInput = {
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

export type DonemselPipelineOutput = {
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

function buildBaseRows(input: DonemselPipelineInput): {
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

  const yazFmHours = calcFmHoursPerWeek(
    summerPattern,
    workDaysFromPattern(summerPattern),
    sevenModeFromPattern(summerPattern),
  );
  const kisFmHours = calcFmHoursPerWeek(
    winterPattern,
    workDaysFromPattern(winterPattern),
    sevenModeFromPattern(winterPattern),
  );
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
    haftalikMode: false,
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

  const davaciWeeklyOffFallback = weeklyIgnoredWeekdayFromSeasonalPattern(summerPattern, false);
  const originalTotalWeeks = afterZaman.reduce(
    (a, r) => a + Math.max(0, Math.floor(Number(r.weeks) || 0)),
    0,
  );

  let pipeline = expandDonemselRowsForDeductions({
    rows: afterZaman,
    exclusions,
    weeklyOffDay: davaciWeeklyOffFallback,
  });
  pipeline = pipeline.map((r) => calculateFm(r as TanikliRowWithSegmentFields));
  pipeline = preserveWeeks(pipeline, originalTotalWeeks);
  pipeline = pipeline.map((r) => calculateRowMoney(r, kats));

  const rows = applyResolvedManualBrutToRows(pipeline, rowOverrides);

  return { rows, yazFmHours, kisFmHours, davaciWeeklyFM };
}

function buildDisplayRows(
  input: DonemselPipelineInput,
  rows: FazlaMesaiRowBase[],
  davaciWeeklyFM: number,
  effectiveRowOverrides: Record<string, Partial<FazlaMesaiRowBase>>,
): FazlaMesaiRowBase[] {
  const { katSayi, mode270, dateIn, dateOut, zamanasimiBaslangic, manualRows } = input;
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
    const valid = with270.filter((r) => r.startISO && r.endISO);
    const weeklyFM = valid[0]?.fmHours ?? davaciWeeklyFM;
    const tabloSatirlari = valid.map((r) => ({
      baslangic: new Date(r.startISO!),
      bitis: new Date(r.endISO!),
    }));
    if (tabloSatirlari.length > 0 && dateIn && dateOut && weeklyFM > 0) {
      const sonuclar = calculateOvertimeWith270AndLimitation({
        iseGirisTarihi: new Date(dateIn),
        istenCikisTarihi: new Date(dateOut),
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

export function runDonemselV3Pipeline(input: DonemselPipelineInput): DonemselPipelineOutput {
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
