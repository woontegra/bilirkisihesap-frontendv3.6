/**
 * Haftalık Karma — dayGroups'tan haftalık FM (V3 utils mantığı, izolasyon).
 */

import { WEEKLY_HOLIDAY_REFERENCE_HOURS, WEEKLY_WORK_LIMIT } from "./constants";
import type { WeeklyKarmaFmContext } from "./model";

export type PatternDayLike = {
  dayCount?: number;
  days?: number;
  startTime?: string;
  endTime?: string;
};

export type DeductionDailyHourStrategy = "MIN" | "MAX" | "GROUP_1" | "GROUP_2";
export const deductionDailyHourStrategy: DeductionDailyHourStrategy = "MIN";

export function calculateLegalBreak(dailyHours: number): number {
  if (dailyHours <= 4) return 0.25;
  if (dailyHours <= 7.5) return 0.5;
  if (dailyHours < 11) return 1;
  if (dailyHours < 14) return 1.5;
  if (dailyHours < 15) return 2;
  return 3;
}

export function ceilWeeklyWorkHoursToHalfHour(weeklyTotal: number): number {
  if (!Number.isFinite(weeklyTotal) || weeklyTotal <= 0) return 0;
  const EPS = 1e-7;
  const doubled = weeklyTotal * 2;
  const nearestHalf = Math.round(doubled);
  if (Math.abs(doubled - nearestHalf) < EPS) return nearestHalf / 2;
  return Math.ceil(doubled - EPS) / 2;
}

function groupDays(g: PatternDayLike): number {
  return g.dayCount ?? g.days ?? 0;
}

export function getPatternGroupNetDaily(group: PatternDayLike): number {
  if (!group?.startTime || !group?.endTime) return 0;
  const [girH, girM] = group.startTime.split(":").map(Number);
  const [cikH, cikM] = group.endTime.split(":").map(Number);
  const dailyMinutes = (cikH || 0) * 60 + (cikM || 0) - ((girH || 0) * 60 + (girM || 0));
  const dailyHours = dailyMinutes / 60;
  if (dailyHours <= 0) return 0;
  return Math.max(0, dailyHours - calculateLegalBreak(dailyHours));
}

function collectGroupNetDailiesInOrder(dayGroups: PatternDayLike[]): number[] {
  return (dayGroups || []).map((group) => {
    const days = groupDays(group);
    if (!group.startTime || !group.endTime || days <= 0) return 0;
    return getPatternGroupNetDaily(group);
  });
}

export function resolveDeductionMarginalNetHours(
  groupNetDailiesInOrder: number[],
  strategy: DeductionDailyHourStrategy = deductionDailyHourStrategy,
): number {
  const positive = groupNetDailiesInOrder.filter((n) => Number.isFinite(n) && n > 0);
  switch (strategy) {
    case "MIN":
      return positive.length ? Math.min(...positive) : 0;
    case "MAX":
      return positive.length ? Math.max(...positive) : 0;
    case "GROUP_1":
      return groupNetDailiesInOrder[0] ?? 0;
    case "GROUP_2":
      return groupNetDailiesInOrder[1] ?? 0;
    default:
      return 0;
  }
}

function computeWeeklyNetHours(
  dayGroups: PatternDayLike[],
  hasWeeklyHoliday: boolean,
  weeklyHolidayGroup: number,
): number {
  if (!dayGroups?.length) return 0;
  const groupTotals: number[] = [];
  dayGroups.forEach((group, groupIdx) => {
    const days = groupDays(group);
    if (!group.startTime || !group.endTime || days === 0) return;
    const netDaily = getPatternGroupNetDaily(group);
    const isHolidayGroup = hasWeeklyHoliday && groupIdx + 1 === weeklyHolidayGroup;
    if (isHolidayGroup && days > 0) {
      const normalDays = days - 1;
      const normalTotal = netDaily * normalDays;
      const holidayOvertime = Math.max(0, netDaily - WEEKLY_HOLIDAY_REFERENCE_HOURS);
      groupTotals.push(normalTotal + holidayOvertime);
    } else {
      groupTotals.push(netDaily * days);
    }
  });
  return groupTotals.reduce((s, v) => s + v, 0);
}

function roundFmHours(h: number): number {
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Number(h.toFixed(2));
}

/** dayGroups → haftalık FM saati. */
export function calculateWeeklyFMFromDayGroups(
  dayGroups: PatternDayLike[],
  hasWeeklyHoliday = false,
  weeklyHolidayGroup = 1,
): number {
  if (!dayGroups?.length) return 0;
  const totalNet = computeWeeklyNetHours(dayGroups, hasWeeklyHoliday, weeklyHolidayGroup);
  const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(totalNet);
  return Math.max(0, roundedWeekly - WEEKLY_WORK_LIMIT);
}

/** UBGT/yıllık izin düşüm: MIN strateji ile gün başına marjinal net saat. */
export function calculateWeeklyKarmaDeductionFmHours(opts: {
  context: WeeklyKarmaFmContext;
  deductionDates: Array<{ dateISO: string; dayWeight: number }>;
}): number {
  const { context, deductionDates } = opts;
  const { dayGroups, hasWeeklyHoliday, weeklyHolidayGroup } = context;
  if (!dayGroups?.length || !deductionDates?.length) {
    return calculateWeeklyFMFromDayGroups(dayGroups, hasWeeklyHoliday, weeklyHolidayGroup);
  }

  let weeklyNet = computeWeeklyNetHours(dayGroups, hasWeeklyHoliday, weeklyHolidayGroup);
  const marginalPerDay = resolveDeductionMarginalNetHours(collectGroupNetDailiesInOrder(dayGroups));
  if (marginalPerDay <= 0) {
    return calculateWeeklyFMFromDayGroups(dayGroups, hasWeeklyHoliday, weeklyHolidayGroup);
  }

  const seen = new Set<string>();
  for (const item of deductionDates) {
    const dateISO = String(item.dateISO || "").slice(0, 10);
    if (!dateISO || seen.has(dateISO)) continue;
    seen.add(dateISO);
    const weight = Math.max(0, Math.min(1, Number(item.dayWeight) || 1));
    weeklyNet = Math.max(0, weeklyNet - marginalPerDay * weight);
  }

  const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(weeklyNet);
  return roundFmHours(Math.max(0, roundedWeekly - WEEKLY_WORK_LIMIT));
}

export function sumRegisteredWorkDays(dayGroups: PatternDayLike[]): number {
  let total = 0;
  for (const g of dayGroups || []) {
    const days = groupDays(g);
    if (!g.startTime || !g.endTime || days <= 0) continue;
    total += days;
  }
  return total;
}

export function witnessWeeklyHolidayFromPlaintiffClaim(opts: {
  davaciDayGroups: PatternDayLike[];
  davaciHasWeeklyHoliday: boolean;
  davaciWeeklyHolidayGroup: number;
  witnessDayGroups: PatternDayLike[];
}): { hasWeeklyHoliday: boolean; weeklyHolidayGroup: number } {
  const davaciGun = sumRegisteredWorkDays(opts.davaciDayGroups);
  const tanikGun = sumRegisteredWorkDays(opts.witnessDayGroups);
  const apply = davaciGun === 7 && !!opts.davaciHasWeeklyHoliday && tanikGun === 7;
  return {
    hasWeeklyHoliday: apply,
    weeklyHolidayGroup: apply ? opts.davaciWeeklyHolidayGroup : 1,
  };
}

/** Tanık saatlerini davacı grup indeksine göre kısıtla (max giriş, min çıkış). */
export function clampWitnessGroupsByIndex(
  witnessGroups: PatternDayLike[],
  davaciGroups: PatternDayLike[],
): Array<{ dayCount: number; startTime: string; endTime: string }> {
  const toMins = (t: string) => {
    const [h, m] = (t || "0:0").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const toTime = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

  return witnessGroups.map((group, groupIdx) => {
    const dayCount = groupDays(group);
    const davaciGroup = davaciGroups[groupIdx];
    if (!davaciGroup?.startTime || !davaciGroup?.endTime) {
      return { dayCount, startTime: group.startTime || "", endTime: group.endTime || "" };
    }
    const kesikGir = Math.max(toMins(group.startTime || ""), toMins(davaciGroup.startTime));
    const kesikCik = Math.min(toMins(group.endTime || ""), toMins(davaciGroup.endTime));
    return { dayCount, startTime: toTime(kesikGir), endTime: toTime(kesikCik) };
  });
}

export function representativeDailyNetFromDayGroups(
  dayGroups: PatternDayLike[],
  hasWeeklyHoliday = false,
  weeklyHolidayGroup = 1,
): number | undefined {
  if (!dayGroups?.length) return undefined;
  let sumHours = 0;
  let sumDays = 0;
  dayGroups.forEach((group, groupIdx) => {
    const days = groupDays(group);
    if (!group.startTime || !group.endTime || days <= 0) return;
    const netDaily = getPatternGroupNetDaily(group);
    const isHolidayGroup = hasWeeklyHoliday && groupIdx + 1 === weeklyHolidayGroup;
    if (isHolidayGroup && days > 0) {
      const normalDays = days - 1;
      const normalTotal = netDaily * normalDays;
      const holidayOvertime = Math.max(0, netDaily - WEEKLY_HOLIDAY_REFERENCE_HOURS);
      sumHours += normalTotal + holidayOvertime;
      sumDays += days;
    } else {
      sumHours += netDaily * days;
      sumDays += days;
    }
  });
  if (sumDays <= 0) return undefined;
  return sumHours / sumDays;
}

export function fallbackDailyNetFromWeeklyFm(
  weeklyFmHours: number,
  dayGroups: PatternDayLike[],
): number {
  let sumDays = 0;
  dayGroups.forEach((group) => {
    const days = groupDays(group);
    if (!group.startTime || !group.endTime || days <= 0) return;
    sumDays += days;
  });
  if (sumDays <= 0) return 7.5;
  const roundedWeekly = Math.max(0, weeklyFmHours) + 45;
  return Math.max(0.25, roundedWeekly / sumDays);
}

/** V3 generateWeeklyText formatı. */
export function generateWeeklyText(
  dayGroups: PatternDayLike[],
  title: string,
  hasWeeklyHoliday = false,
  weeklyHolidayGroup = 1,
): { label: string; text: string; weeklyFMHours: number } | null {
  if (!dayGroups?.length) return null;

  const fmt = (n: number) => n.toFixed(2).replace(".", ",");
  const textLines: string[] = [];
  const groupTotals: number[] = [];

  textLines.push(`${title}:`);

  dayGroups.forEach((group, groupIdx) => {
    const days = groupDays(group);
    if (!group.startTime || !group.endTime || days === 0) return;

    const [girH, girM] = group.startTime.split(":").map(Number);
    const [cikH, cikM] = group.endTime.split(":").map(Number);
    const dailyMinutes = (cikH || 0) * 60 + (cikM || 0) - ((girH || 0) * 60 + (girM || 0));
    const dailyHours = dailyMinutes / 60;
    const breakPerDay = calculateLegalBreak(dailyHours);
    const netDaily = dailyHours - breakPerDay;
    const isHolidayGroup = hasWeeklyHoliday && groupIdx + 1 === weeklyHolidayGroup;

    if (isHolidayGroup && days > 0) {
      const normalDays = days - 1;
      const normalTotal = netDaily * normalDays;
      const holidayOvertime = Math.max(0, netDaily - WEEKLY_HOLIDAY_REFERENCE_HOURS);
      const groupTotal = normalTotal + holidayOvertime;
      groupTotals.push(groupTotal);
      if (normalDays > 0) {
        textLines.push(
          `${normalDays} gün ${group.startTime} - ${group.endTime} = ${dailyHours.toFixed(2)} saat çalışma ${fmt(breakPerDay)} saat ara dinlenme = ${fmt(netDaily)} saat,`,
        );
        textLines.push(`${normalDays} gün X ${fmt(netDaily)} saat = ${fmt(normalTotal)} saat`);
      }
      textLines.push(
        `${fmt(netDaily)} - 7,5 saat (hafta tatili) = ${fmt(holidayOvertime)} saat hafta tatili fazla mesai,`,
      );
      textLines.push(
        `${fmt(normalTotal)} saat + ${fmt(holidayOvertime)} saat (hafta tatili) = ${fmt(groupTotal)} saat`,
      );
      textLines.push("");
    } else {
      const groupTotal = netDaily * days;
      groupTotals.push(groupTotal);
      textLines.push(
        `${days} gün ${group.startTime} - ${group.endTime} = ${dailyHours.toFixed(2)} saat çalışma ${fmt(breakPerDay)} saat ara dinlenme = ${fmt(netDaily)} saat,`,
      );
      textLines.push(`${days} Gün X ${fmt(netDaily)} saat = ${fmt(groupTotal)} saat,`);
      textLines.push("");
    }
  });

  if (groupTotals.length === 0 && !hasWeeklyHoliday) return null;

  const totalNet = groupTotals.reduce((s, v) => s + v, 0);
  const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(totalNet);
  const weeklyOvertime = Math.max(0, roundedWeekly - WEEKLY_WORK_LIMIT);
  const groupSums = groupTotals.map((g) => `${fmt(g)} saat`).join(" + ");
  textLines.push(`Toplam çalışma = ${groupSums} = ${fmt(roundedWeekly)} saat`);
  textLines.push(`Net haftalık çalışma = ${fmt(roundedWeekly)} saat,`);
  textLines.push(
    `${fmt(roundedWeekly)} – 45 saat yasal haftalık çalışma = ${fmt(weeklyOvertime)} saat haftalık fazla mesai`,
  );

  return { label: title, text: textLines.join("\n"), weeklyFMHours: weeklyOvertime };
}

export function toNumericDayGroups(
  groups: Array<{ dayCount: string; startTime: string; endTime: string }>,
): Array<{ dayCount: number; startTime: string; endTime: string }> {
  return groups.map((g) => ({
    dayCount: Math.max(0, Math.floor(Number(String(g.dayCount).replace(",", ".")) || 0)),
    startTime: g.startTime,
    endTime: g.endTime,
  }));
}
