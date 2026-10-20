/**
 * V3 StandartFazlaMesaiPage hesap zinciri — useMemo bloklarının birebir taşınması.
 * UI/state yok; yalnızca saf hesap.
 */

import type { ExcludedDay } from "./types/exclusionStorage";
import {
  segmentOvertimeResult,
  computeDisplayRows,
  calculateOvertimeWith270AndLimitation,
  getAsgariUcretByDate,
  calculateWeeksBetweenDates,
  DAMGA_VERGISI_ORANI,
  FAZLA_MESAI_DENOMINATOR,
  FAZLA_MESAI_KATSAYI,
  type FazlaMesaiRowBase,
} from "./lib/fazlaMesaiShared";
import {
  applyResolvedManualBrutToRows,
  applyStoredManualBrutOverridesToRows,
} from "./lib/fazlaMesai/fmManualWageRowOverrides";
import { expandStandartRowsForDeductions } from "./standart/expandStandartRowsForDeductions";
import {
  calculateDailyWorkHours,
  computeBreakHours,
  calculateWeeklyFMSaat,
} from "./standart/utils";
import { WEEKLY_WORK_LIMIT } from "./standart/constants";

export type Mode270Pipeline = "none" | "simple" | "detailed";

export type StandartPipelineInput = {
  iseGiris: string;
  istenCikis: string;
  davaciIn: string;
  davaciOut: string;
  weeklyDays: number;
  sevenDayMode: "tatilli" | "tatilsiz";
  haftaTatiliGunu: number | "";
  katSayi: number;
  mode270: Mode270Pipeline;
  exclusions: ExcludedDay[];
  zamanasimiBaslangic: string | null;
  rowOverrides: Record<string, Partial<FazlaMesaiRowBase>>;
  manualRows: FazlaMesaiRowBase[];
};

export type StandartPipelineOutput = {
  dailyGrossHours: number;
  breakHours: number;
  dailyNetHours: number;
  weeklyFMSaat: number;
  baseRows: FazlaMesaiRowBase[];
  displayRows: FazlaMesaiRowBase[];
  tableDisplayRows: FazlaMesaiRowBase[];
  totalBrut: number;
  totalNet: number;
};

/** Tam / yarım takvim yılı: ham hafta 53 vb. üst tavan. */
export function normalizeWeeksForStandard(startISO: string, endISO: string, rawWeeks: number): number {
  const s = (startISO || "").slice(0, 10);
  const e = (endISO || "").slice(0, 10);
  if (!s || !e) return rawWeeks;
  const sy = s.slice(0, 4);
  const ey = e.slice(0, 4);
  const w = Number(rawWeeks);
  const safeW = Number.isFinite(w) && w > 0 ? w : NaN;
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

function isTableRowVisible(r: FazlaMesaiRowBase): boolean {
  if (r.isManual) return true;
  const fmH = Number(r.fmHours ?? 0);
  const w = Number(r.weeks ?? 0);
  const fmAmt = Number(r.fm ?? 0);
  return fmH !== 0 && w !== 0 && fmAmt !== 0;
}

export function runStandartFmV3Pipeline(input: StandartPipelineInput): StandartPipelineOutput {
  const {
    iseGiris,
    istenCikis,
    davaciIn,
    davaciOut,
    weeklyDays,
    sevenDayMode,
    haftaTatiliGunu,
    katSayi,
    mode270,
    exclusions,
    zamanasimiBaslangic,
    rowOverrides,
    manualRows,
  } = input;

  const rawDaily = calculateDailyWorkHours(davaciIn, davaciOut);
  const dailyGrossHours = Number.isFinite(rawDaily) && rawDaily > 0 ? rawDaily : 0;
  const breakHours = computeBreakHours(dailyGrossHours);
  const dailyNetHours = Math.max(0, dailyGrossHours - breakHours);

  const wd = Number(weeklyDays) || 6;
  const sevenMode = wd === 7 ? sevenDayMode : undefined;
  const weeklyFMSaat = calculateWeeklyFMSaat(dailyNetHours, wd, WEEKLY_WORK_LIMIT, sevenMode);

  const empty: StandartPipelineOutput = {
    dailyGrossHours,
    breakHours,
    dailyNetHours,
    weeklyFMSaat,
    baseRows: [],
    displayRows: [],
    tableDisplayRows: [],
    totalBrut: 0,
    totalNet: 0,
  };

  if (!iseGiris || !istenCikis || !davaciIn || !davaciOut || weeklyFMSaat <= 0) {
    return empty;
  }

  let rows: FazlaMesaiRowBase[] = [];
  try {
    const segments = segmentOvertimeResult({ start: iseGiris, end: istenCikis });
    const tableRows: FazlaMesaiRowBase[] = [];

    segments.forEach((seg) => {
      let startDate = new Date(seg.start);
      let endDate = new Date(seg.end);

      if (zamanasimiBaslangic) {
        const limitDate = new Date(zamanasimiBaslangic);
        if (endDate < limitDate) return;
        if (startDate < limitDate && endDate >= limitDate) {
          startDate = new Date(limitDate);
          seg.start = startDate.toISOString().slice(0, 10);
        }
      }

      const weeks = normalizeWeeksForStandard(
        seg.start,
        seg.end,
        calculateWeeksBetweenDates(seg.start, seg.end) || 1,
      );
      const brut = getAsgariUcretByDate(seg.start) || 0;
      const kats = katSayi || 1;
      const hoursEffective = weeks * weeklyFMSaat;
      const fm = Number(
        (((brut * kats * hoursEffective) / FAZLA_MESAI_DENOMINATOR) * FAZLA_MESAI_KATSAYI).toFixed(2),
      );
      const net = Number((fm * (1 - DAMGA_VERGISI_ORANI - 0.15)).toFixed(2));

      tableRows.push({
        id: `auto-${seg.start}-${seg.end}`,
        startISO: seg.start,
        endISO: seg.end,
        rangeLabel: `${seg.start} – ${seg.end}`,
        weeks,
        originalWeekCount: weeks,
        brut,
        katsayi: kats,
        fmHours: weeklyFMSaat,
        dailyNet: dailyNetHours,
        fm,
        net,
        wage: brut,
        overtimeAmount: fm,
      });
    });

    const weeklyOffDayNum =
      haftaTatiliGunu === "" || haftaTatiliGunu == null ? null : Number(haftaTatiliGunu);
    const weeklyOffDay = Number.isInteger(weeklyOffDayNum) ? weeklyOffDayNum : null;
    const overrideMap = rowOverrides;
    const withManualBrut = (list: FazlaMesaiRowBase[]) =>
      applyResolvedManualBrutToRows(list, overrideMap);
    const workingRows = withManualBrut(tableRows);

    const useDeductionExpand = exclusions.length > 0 && dailyNetHours > 0;
    if (useDeductionExpand) {
      const sevenDayModeForExpand: "tatilli" | "tatilsiz" = wd === 7 ? sevenDayMode : "tatilsiz";
      rows = withManualBrut(
        expandStandartRowsForDeductions({
          rows: workingRows,
          exclusions,
          weeklyDays: wd,
          dailyNet: dailyNetHours,
          baselineWeeklyFm: weeklyFMSaat,
          davaciSevenDay: sevenDayModeForExpand,
          weeklyOffDay,
          rowOverrides: overrideMap,
        }),
      );
    } else {
      rows = workingRows;
    }
  } catch {
    rows = [];
  }

  const effectiveRowOverrides = (() => {
    const baseRows = [...rows, ...manualRows];
    const merged = applyStoredManualBrutOverridesToRows(rowOverrides, baseRows);
    const out: Record<string, Partial<FazlaMesaiRowBase>> = { ...merged };
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    for (const [id, ov] of Object.entries(out)) {
      const base = byId.get(id);
      if (!base || ov.weeks == null) continue;
      out[id] = {
        ...ov,
        weeks: normalizeWeeksForStandard(base.startISO || "", base.endISO || "", Number(ov.weeks)),
      };
    }
    return out;
  })();

  let displayRows: FazlaMesaiRowBase[] = rows;
  try {
    displayRows = computeDisplayRows({
      rows,
      manualRows,
      rowOverrides: effectiveRowOverrides,
      katSayi: katSayi || 1,
      weeklyFMSaat,
      exclusions,
      skipAnnualLeaveExclusions:
        (wd === 5 || wd === 6 || wd === 7) && exclusions.length > 0 && dailyNetHours > 0,
      mode270,
      iseGiris,
      istenCikis,
      zamanasimiBaslangic,
      calculateOvertime270Detailed: calculateOvertimeWith270AndLimitation,
    });
  } catch {
    displayRows = rows;
  }

  const tableDisplayRows = displayRows.filter(isTableRowVisible);
  const totalBrut = tableDisplayRows.reduce((a, r) => a + (r.fm ?? 0), 0);
  const totalNet = tableDisplayRows.reduce((a, r) => a + (r.net ?? 0), 0);

  return {
    dailyGrossHours,
    breakHours,
    dailyNetHours,
    weeklyFMSaat,
    baseRows: rows,
    displayRows,
    tableDisplayRows,
    totalBrut,
    totalNet,
  };
}
