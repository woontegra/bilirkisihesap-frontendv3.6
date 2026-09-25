/**
 * Backend `apply270Helper.js` — şirket 270 saat hafta düşümü (yeraltı `useSuppliedRowWeeks: true`).
 */

import { normalizeLocalDate } from "./dateHelpers";
import { calculateOvertimeWeeks } from "./calculateOvertimeWeeks";

export type PeriodFor270 = {
  startDate: string;
  endDate: string;
  weeks: number;
};

export type ExclusionFor270 = {
  start?: string;
  end?: string;
  days?: number;
  type?: string;
};

export function apply270ToPeriodsUnified(params: {
  periods: PeriodFor270[];
  exclusions?: ExclusionFor270[];
  iseGiris: string;
  istenCikis: string;
  zamanasimiBaslangic?: string | null;
  fmHours: number;
  useSuppliedRowWeeks?: boolean;
}): PeriodFor270[] {
  const {
    periods,
    exclusions = [],
    iseGiris,
    istenCikis,
    zamanasimiBaslangic,
    fmHours,
    useSuppliedRowWeeks = false,
  } = params;

  if (!periods.length) return periods;

  const hireDate = normalizeLocalDate(iseGiris);
  const terminationDate = normalizeLocalDate(istenCikis);
  const limitationDate = zamanasimiBaslangic
    ? normalizeLocalDate(zamanasimiBaslangic)
    : hireDate;

  if (!hireDate || !terminationDate || !fmHours || fmHours <= 0) return periods;

  const tableRows = periods.map((p) => {
    const start = normalizeLocalDate(p.startDate);
    const end = normalizeLocalDate(p.endDate);
    const base: { start: Date; end: Date; suppliedWeeks?: number } = {
      start: start!,
      end: end!,
    };
    if (useSuppliedRowWeeks && start && end) {
      const w = Number(p.weeks);
      if (Number.isFinite(w) && w >= 0) base.suppliedWeeks = w;
    }
    return base;
  });

  const annualLeaves = (exclusions || [])
    .filter((e) => e?.type === "Yıllık İzin")
    .map((e) => ({
      start: normalizeLocalDate(e.start ?? "")!,
      end: normalizeLocalDate(e.end ?? "")!,
      days: Number(e.days) || 0,
    }))
    .filter((l) => l.start && l.end);

  const result = calculateOvertimeWeeks({
    hireDate,
    terminationDate,
    limitationDate: limitationDate || hireDate,
    weeklyOvertimeHour: fmHours,
    tableRows,
    annualLeaves,
    skipAnnualLeaveDeduction: useSuppliedRowWeeks,
  });

  return periods.map((p, idx) => ({
    ...p,
    weeks: result[idx]?.week ?? 0,
  }));
}
