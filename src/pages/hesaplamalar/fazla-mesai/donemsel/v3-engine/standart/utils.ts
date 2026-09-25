/** Standart Fazla Mesai - yardımcı fonksiyonlar */
import { ceilWeeklyWorkHoursToHalfHour } from "../lib/fazlaMesai/weeklyHoursRounding";
import { STANDARD_DAILY_REFERENCE_HOURS } from "./constants";

export function calculateDailyWorkHours(startTime: string, endTime: string): number {
  const startMatch = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(startTime || "");
  const endMatch = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(endTime || "");
  if (!startMatch || !endMatch) return 0;
  const startMins = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  let endMins = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (endMins < startMins) endMins += 24 * 60;
  return (endMins - startMins) / 60;
}

export function computeBreakHours(dailyGross: number): number {
  if (!Number.isFinite(dailyGross) || dailyGross <= 0) return 0;
  if (dailyGross <= 4) return 0.25;
  if (dailyGross <= 7.5) return 0.5;
  if (dailyGross < 11) return 1;
  if (dailyGross < 14) return 1.5;
  if (dailyGross < 15) return 2;
  return 3;
}

/** 7 gün seçiliyken: "tatilsiz" = 7 gün çalışma; "tatilli" = 6 gün + hafta tatili mesaisi */
export function calculateWeeklyFMSaat(
  dailyNetHours: number,
  weeklyDays: number,
  weeklyLimit = 45,
  sevenDayMode?: "tatilsiz" | "tatilli"
): number {
  if (!dailyNetHours || dailyNetHours <= 0) return 0;
  const n = Number(weeklyDays) || 0;
  let weeklyHours = 0;
  if (n === 7) {
    if (sevenDayMode === "tatilsiz") {
      weeklyHours = dailyNetHours * 7;
    } else {
      const extra = Math.max(0, dailyNetHours - STANDARD_DAILY_REFERENCE_HOURS);
      weeklyHours = dailyNetHours * 6 + extra;
    }
  } else if (n >= 1 && n <= 6) {
    weeklyHours = dailyNetHours * n;
  }
  const rounded = ceilWeeklyWorkHoursToHalfHour(weeklyHours);
  return Math.max(0, rounded - weeklyLimit);
}
