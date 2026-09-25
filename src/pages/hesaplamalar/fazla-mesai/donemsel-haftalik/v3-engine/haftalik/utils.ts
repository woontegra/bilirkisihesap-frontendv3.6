/**
 * Haftalık Karma - Haftalık FM hesaplama (dayGroups'tan)
 * 4857/68 + Yargıtay: ara dinlenme süreleri
 */

import type { PatternDay } from "./types";
import { parseFmDate } from "../lib/fazlaMesai/deductionPeriodEngine";
import { ceilWeeklyWorkHoursToHalfHour } from "../lib/fazlaMesai/weeklyHoursRounding";
import { resolveDeductionMarginalNetHours } from "./deductionDailyHourStrategy";

const WEEKLY_WORK_LIMIT = 45;

export type WeeklyKarmaFmContext = {
  dayGroups: PatternDay[];
  hasWeeklyHoliday: boolean;
  weeklyHolidayGroup: number;
};

function roundFmHours(h: number): number {
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Number(h.toFixed(2));
}

/** Desen grubunun net günlük çalışma süresi (ara dinlenme düşülmüş). */
export function getPatternGroupNetDaily(group: PatternDay): number {
  if (!group?.startTime || !group?.endTime) return 0;
  const [girH, girM] = group.startTime.split(":").map(Number);
  const [cikH, cikM] = group.endTime.split(":").map(Number);
  const dailyMinutes = (cikH || 0) * 60 + (cikM || 0) - ((girH || 0) * 60 + (girM || 0));
  const dailyHours = dailyMinutes / 60;
  return Math.max(0, dailyHours - calculateLegalBreak(dailyHours));
}

function collectGroupNetDailiesInOrder(dayGroups: PatternDay[]): number[] {
  return (dayGroups || []).map((group) => {
    const days = group.dayCount ?? (group as { days?: number }).days ?? 0;
    if (!group.startTime || !group.endTime || days <= 0) return 0;
    return getPatternGroupNetDaily(group);
  });
}

function computeWeeklyNetHours(
  dayGroups: PatternDay[],
  hasWeeklyHoliday: boolean,
  weeklyHolidayGroup: number,
): number {
  if (!dayGroups?.length) return 0;
  const groupTotals: number[] = [];
  dayGroups.forEach((group, groupIdx) => {
    const days = group.dayCount ?? (group as { days?: number }).days ?? 0;
    if (!group.startTime || !group.endTime || days === 0) return;
    const netDaily = getPatternGroupNetDaily(group);
    const isHolidayGroup = hasWeeklyHoliday && groupIdx + 1 === weeklyHolidayGroup;
    if (isHolidayGroup && days > 0) {
      const normalDays = days - 1;
      const normalTotal = netDaily * normalDays;
      const holidayOvertime = Math.max(0, netDaily - 7.5);
      groupTotals.push(normalTotal + holidayOvertime);
    } else {
      groupTotals.push(netDaily * days);
    }
  });
  return groupTotals.reduce((s, v) => s + v, 0);
}

/**
 * UBGT/yıllık izin düşüm penceresi: `deductionDailyHourStrategy` ile gün başına sabit net saat düşülür.
 * Takvim slotu, haftalık ortalama veya (baseline+45)/hg kullanılmaz.
 */
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
  const marginalPerDay = resolveDeductionMarginalNetHours(
    collectGroupNetDailiesInOrder(dayGroups),
  );
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

/** Dönem tarihine göre tanık deseni; yoksa davacı deseni. */
export function resolveWeeklyKarmaFmContextForDate(
  dateISO: string,
  witnesses: Array<{
    startDateISO: string;
    endDateISO: string;
    dayGroups: PatternDay[];
    hasWeeklyHoliday: boolean;
    weeklyHolidayGroup: number;
  }>,
  fallback: WeeklyKarmaFmContext,
): WeeklyKarmaFmContext {
  const t = parseFmDate(dateISO)?.getTime();
  if (t == null || !Number.isFinite(t)) return fallback;
  for (const w of witnesses) {
    const s = parseFmDate(w.startDateISO)?.getTime();
    const e = parseFmDate(w.endDateISO)?.getTime();
    if (s == null || e == null || !Number.isFinite(s) || !Number.isFinite(e)) continue;
    if (t >= s && t <= e) {
      return {
        dayGroups: w.dayGroups,
        hasWeeklyHoliday: w.hasWeeklyHoliday,
        weeklyHolidayGroup: w.weeklyHolidayGroup,
      };
    }
  }
  return fallback;
}

/** FM / metin hesabında dâhil edilen toplam iş günü (saatleri dolu gruplar). */
export function sumRegisteredWorkDays(
  dayGroups: Array<{ dayCount?: number; days?: number; startTime?: string; endTime?: string }>
): number {
  let total = 0;
  for (const g of dayGroups || []) {
    const days = g.dayCount ?? g.days ?? 0;
    if (!g.startTime || !g.endTime || days <= 0) continue;
    total += days;
  }
  return total;
}

/**
 * Taleple bağlılık: Hafta tatili FM satırı tanığa ancak davacı 7 gün + hafta tatili talebinde iken
 * ve tanık da toplam 7 gün çalıştığını bildiriyorsa uygulanır (6 gün tanıkta hafta tatili yok).
 */
export function witnessWeeklyHolidayFromPlaintiffClaim(opts: {
  davaciDayGroups: Array<{ dayCount?: number; days?: number; startTime?: string; endTime?: string }>;
  davaciHasWeeklyHoliday: boolean;
  davaciWeeklyHolidayGroup: number;
  witnessDayGroups: Array<{ dayCount?: number; days?: number; startTime?: string; endTime?: string }>;
}): { hasWeeklyHoliday: boolean; weeklyHolidayGroup: number } {
  const davaciGun = sumRegisteredWorkDays(opts.davaciDayGroups);
  const tanikGun = sumRegisteredWorkDays(opts.witnessDayGroups);
  const apply =
    davaciGun === 7 && !!opts.davaciHasWeeklyHoliday && tanikGun === 7;
  return {
    hasWeeklyHoliday: apply,
    weeklyHolidayGroup: apply ? opts.davaciWeeklyHolidayGroup : 1,
  };
}

function calculateLegalBreak(dailyHours: number): number {
  if (dailyHours <= 4) return 0.25;
  if (dailyHours <= 7.5) return 0.5;
  if (dailyHours < 11) return 1;
  if (dailyHours < 14) return 1.5;
  if (dailyHours < 15) return 2;
  return 3;
}

/**
 * dayGroups'tan haftalık fazla mesai saati hesaplar
 */
export function calculateWeeklyFMFromDayGroups(
  dayGroups: PatternDay[],
  hasWeeklyHoliday = false,
  weeklyHolidayGroup = 1
): number {
  if (!dayGroups?.length) return 0;

  const groupTotals: number[] = [];

  dayGroups.forEach((group, groupIdx) => {
    const days = (group as { dayCount?: number; days?: number }).dayCount ?? (group as { dayCount?: number; days?: number }).days ?? 0;
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
      const holidayOvertime = Math.max(0, netDaily - 7.5);
      groupTotals.push(normalTotal + holidayOvertime);
    } else {
      groupTotals.push(netDaily * days);
    }
  });

  const totalNet = groupTotals.reduce((s, v) => s + v, 0);
  const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(totalNet);
  return Math.max(0, roundedWeekly - WEEKLY_WORK_LIMIT);
}

/**
 * Tanıklı Standart yıllık izin V2 için temsilî günlük net süre (çoklu gün grubunda ağırlıklı ortalama).
 * `calculateWeeklyFMFromDayGroups` ile aynı grup/hafta tatili mantığı.
 */
export function representativeDailyNetFromDayGroups(
  dayGroups: PatternDay[],
  hasWeeklyHoliday = false,
  weeklyHolidayGroup = 1
): number | undefined {
  if (!dayGroups?.length) return undefined;
  let sumHours = 0;
  let sumDays = 0;
  dayGroups.forEach((group, groupIdx) => {
    const days = (group as { dayCount?: number; days?: number }).dayCount ?? (group as { dayCount?: number; days?: number }).days ?? 0;
    if (!group.startTime || !group.endTime || days <= 0) return;
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
      const holidayOvertime = Math.max(0, netDaily - 7.5);
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

/**
 * `representativeDailyNetFromDayGroups` boş döndüğünde: haftalık FM ve toplam gün sayısından günlük net tahmini
 * (yıllık izin V2'nin çalışması için — bilirkişi yuvarlamasına yakın).
 */
export function fallbackDailyNetFromWeeklyFm(
  weeklyFmHours: number,
  dayGroups: PatternDay[],
  _hasWeeklyHoliday = false,
  _weeklyHolidayGroup = 1
): number {
  let sumDays = 0;
  dayGroups.forEach((group) => {
    const days =
      (group as { dayCount?: number; days?: number }).dayCount ??
      (group as { dayCount?: number; days?: number }).days ??
      0;
    if (!group.startTime || !group.endTime || days <= 0) return;
    sumDays += days;
  });
  if (sumDays <= 0) return 7.5;
  const roundedWeekly = Math.max(0, weeklyFmHours) + 45;
  return Math.max(0.25, roundedWeekly / sumDays);
}

/** Metin Hesaplaması için gün gruplarından metin üretir */
export function generateWeeklyText(
  dayGroups: Array<{ dayCount?: number; days?: number; startTime: string; endTime: string }>,
  title: string,
  hasWeeklyHoliday = false,
  weeklyHolidayGroup = 1
): { label: string; text: string; weeklyFMHours: number } | null {
  if (!dayGroups?.length) return null;

  const fmt = (n: number) => n.toFixed(2).replace(".", ",");
  const textLines: string[] = [];
  const groupTotals: number[] = [];

  textLines.push(`${title}:`);

  dayGroups.forEach((group, groupIdx) => {
    const days = group.dayCount ?? group.days ?? 0;
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
      const holidayOvertime = Math.max(0, netDaily - 7.5);
      const groupTotal = normalTotal + holidayOvertime;
      groupTotals.push(groupTotal);
      if (normalDays > 0) {
        textLines.push(`${normalDays} gün ${group.startTime} - ${group.endTime} = ${dailyHours.toFixed(2)} saat çalışma ${fmt(breakPerDay)} saat ara dinlenme = ${fmt(netDaily)} saat,`);
        textLines.push(`${normalDays} gün X ${fmt(netDaily)} saat = ${fmt(normalTotal)} saat`);
      }
      textLines.push(`${fmt(netDaily)} - 7,5 saat (hafta tatili) = ${fmt(holidayOvertime)} saat hafta tatili fazla mesai,`);
      textLines.push(`${fmt(normalTotal)} saat + ${fmt(holidayOvertime)} saat (hafta tatili) = ${fmt(groupTotal)} saat`);
      textLines.push("");
    } else {
      const groupTotal = netDaily * days;
      groupTotals.push(groupTotal);
      textLines.push(`${days} gün ${group.startTime} - ${group.endTime} = ${dailyHours.toFixed(2)} saat çalışma ${fmt(breakPerDay)} saat ara dinlenme = ${fmt(netDaily)} saat,`);
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
  textLines.push(`${fmt(roundedWeekly)} – 45 saat yasal haftalık çalışma = ${fmt(weeklyOvertime)} saat haftalık fazla mesai`);

  return {
    label: title,
    text: textLines.join("\n"),
    weeklyFMHours: weeklyOvertime,
  };
}
