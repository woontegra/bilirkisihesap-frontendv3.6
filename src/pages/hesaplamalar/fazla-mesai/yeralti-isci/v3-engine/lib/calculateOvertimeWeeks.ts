/**
 * Backend `calculateOvertimeWeeks.js` — işe giriş yılı bazlı 270 saat (şirket) hafta düşümü.
 */

export type OvertimeWeekRow = {
  start: Date;
  end: Date;
  suppliedWeeks?: number;
};

export type AnnualLeaveInput = {
  start: Date;
  end: Date;
  days: number;
};

function distributeIntegerByWeights(totalW: number, weights: number[]): number[] {
  if (totalW <= 0) return weights.map(() => 0);
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sumW) * totalW);
  const out = raw.map((x) => Math.floor(x));
  let rem = totalW - out.reduce((a, b) => a + b, 0);
  const idxs = raw
    .map((x, i) => ({ i, frac: x - out[i] }))
    .sort((a, b) => b.frac - a.frac);
  let qi = 0;
  while (rem > 0 && idxs.length > 0) {
    out[idxs[qi % idxs.length].i] += 1;
    rem -= 1;
    qi += 1;
  }
  return out;
}

export function calculateOvertimeWeeks(params: {
  hireDate: Date;
  terminationDate: Date;
  limitationDate: Date;
  weeklyOvertimeHour: number;
  tableRows: OvertimeWeekRow[];
  annualLeaves?: AnnualLeaveInput[];
  mode270?: "simple" | "detailed";
  skipAnnualLeaveDeduction?: boolean;
}): Array<{ start: Date; end: Date; week: number }> {
  const {
    hireDate,
    terminationDate,
    limitationDate,
    weeklyOvertimeHour,
    tableRows,
    annualLeaves = [],
    mode270 = "detailed",
    skipAnnualLeaveDeduction = false,
  } = params;

  if (!hireDate || !terminationDate || !weeklyOvertimeHour || weeklyOvertimeHour <= 0) {
    return tableRows.map((r) => ({ start: r.start, end: r.end, week: 0 }));
  }

  const dropWeeks =
    mode270 === "simple" ? 0 : Math.round(270 / weeklyOvertimeHour);

  const hireYear = hireDate.getFullYear();
  const hireMonth = hireDate.getMonth();
  const hireDay = hireDate.getDate();

  const pools: Array<{
    start: Date;
    end: Date;
    remainingDropWeeks: number;
    weeks: Array<{
      originalRow: OvertimeWeekRow;
      weeks: number;
      start: Date;
      end: Date;
      afterDrop?: number;
    }>;
  }> = [];

  let currentYearStart = new Date(hireYear, hireMonth, hireDay);
  while (currentYearStart < terminationDate) {
    const nextYearStart = new Date(currentYearStart);
    nextYearStart.setFullYear(nextYearStart.getFullYear() + 1);
    const poolEnd = nextYearStart < terminationDate ? nextYearStart : terminationDate;
    pools.push({
      start: new Date(currentYearStart),
      end: new Date(poolEnd),
      remainingDropWeeks: dropWeeks,
      weeks: [],
    });
    currentYearStart = nextYearStart;
  }

  for (const row of tableRows) {
    const rowStart = new Date(row.start);
    const rowEnd = new Date(row.end);
    const days = Math.floor((rowEnd.getTime() - rowStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const useSupplied =
      row.suppliedWeeks != null && Number.isFinite(row.suppliedWeeks) && row.suppliedWeeks >= 0;
    const totalWeeks = useSupplied ? Math.round(Number(row.suppliedWeeks)) : Math.floor(days / 7);
    if (totalWeeks <= 0) continue;

    if (useSupplied) {
      const parts: Array<{
        pool: (typeof pools)[0];
        overlapDays: number;
        overlapStart: Date;
        overlapEnd: Date;
      }> = [];
      for (const pool of pools) {
        if (rowEnd < pool.start || rowStart >= pool.end) continue;
        const overlapStart = rowStart > pool.start ? rowStart : pool.start;
        const overlapEnd = rowEnd < pool.end ? rowEnd : pool.end;
        if (overlapStart >= overlapEnd) continue;
        const overlapDays =
          Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (overlapDays <= 0) continue;
        parts.push({ pool, overlapDays, overlapStart, overlapEnd });
      }
      if (parts.length === 0) continue;
      const weights = parts.map((p) => p.overlapDays);
      const allocated = distributeIntegerByWeights(totalWeeks, weights);
      for (let i = 0; i < parts.length; i++) {
        const ow = allocated[i];
        if (ow <= 0) continue;
        const { pool, overlapStart, overlapEnd } = parts[i];
        pool.weeks.push({
          originalRow: row,
          weeks: ow,
          start: new Date(overlapStart),
          end: new Date(overlapEnd),
        });
      }
      continue;
    }

    for (const pool of pools) {
      if (rowEnd < pool.start || rowStart >= pool.end) continue;
      const overlapStart = rowStart > pool.start ? rowStart : pool.start;
      const overlapEnd = rowEnd < pool.end ? rowEnd : pool.end;
      if (overlapStart >= overlapEnd) continue;
      const overlapDays =
        Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const overlapWeeks = Math.floor(overlapDays / 7);
      if (overlapWeeks > 0) {
        pool.weeks.push({
          originalRow: row,
          weeks: overlapWeeks,
          start: new Date(overlapStart),
          end: new Date(overlapEnd),
        });
      }
    }
  }

  for (const pool of pools) {
    pool.weeks.sort((a, b) => a.start.getTime() - b.start.getTime());
    let dropped = 0;
    for (const w of pool.weeks) {
      if (dropped >= pool.remainingDropWeeks) {
        w.afterDrop = w.weeks;
        continue;
      }
      const canDrop = Math.min(w.weeks, pool.remainingDropWeeks - dropped);
      dropped += canDrop;
      w.afterDrop = w.weeks - canDrop;
    }
  }

  const resultMap = new Map<string, { start: Date; end: Date; week: number }>();
  for (const pool of pools) {
    for (const w of pool.weeks) {
      const key = `${w.originalRow.start.getTime()}_${w.originalRow.end.getTime()}`;
      if (!resultMap.has(key)) {
        resultMap.set(key, {
          start: w.originalRow.start,
          end: w.originalRow.end,
          week: 0,
        });
      }
      resultMap.get(key)!.week += w.afterDrop ?? 0;
    }
  }

  const limitDate = limitationDate || hireDate;
  for (const result of resultMap.values()) {
    if (result.end < limitDate) result.week = 0;
  }

  if (!skipAnnualLeaveDeduction) {
    for (const result of resultMap.values()) {
      if (result.week <= 0) continue;
      let totalLeaveDays = 0;
      for (const leave of annualLeaves) {
        if (leave.end < result.start || leave.start > result.end) continue;
        const overlapStart = leave.start > result.start ? leave.start : result.start;
        const overlapEnd = leave.end < result.end ? leave.end : result.end;
        if (overlapStart <= overlapEnd) totalLeaveDays += leave.days || 0;
      }
      if (totalLeaveDays > 0) {
        const leaveWeeks = Math.round(totalLeaveDays / 6);
        result.week = Math.max(0, result.week - leaveWeeks);
      }
    }
  }

  const finalResults = Array.from(resultMap.values()).map((r) => ({
    start: r.start,
    end: r.end,
    week: Math.max(0, Math.round(r.week)),
  }));

  return tableRows.map((row) => {
    const found = finalResults.find(
      (r) => r.start.getTime() === row.start.getTime() && r.end.getTime() === row.end.getTime(),
    );
    return found || { start: row.start, end: row.end, week: 0 };
  });
}
