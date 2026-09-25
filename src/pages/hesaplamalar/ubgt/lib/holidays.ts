/**
 * UBGT tatil günleri — backend `ubgt.standard.service.js` extractHolidaysInRange + getUbgtDaysForPeriod.
 */
import { generalHolidays } from "./data/general-holidays";
import { nationalDays } from "./data/national-days";
import { officialHolidays } from "./data/official-holidays";
import { religiousHolidays } from "./data/religious-holidays";

export type StaticHoliday = { id: string; name: string; days: number };

export const STATIC_HOLIDAYS = {
  national: [
    { id: "28-ekim", name: "28 Ekim", days: 0.5 },
    { id: "29-ekim", name: "29 Ekim", days: 1 },
  ],
  official: [
    { id: "23-nisan", name: "23 Nisan", days: 1 },
    { id: "19-mayis", name: "19 Mayıs", days: 1 },
    { id: "30-agustos", name: "30 Ağustos", days: 1 },
  ],
  general: [
    { id: "1-ocak", name: "Yılbaşı", days: 1 },
    { id: "1-mayis", name: "1 Mayıs", days: 1 },
    { id: "15-temmuz", name: "15 Temmuz", days: 1 },
  ],
  religious: [
    { id: "ramazan-arife", name: "Ramazan Arife", days: 0.5 },
    { id: "ramazan-1", name: "Ramazan 1. Gün", days: 1 },
    { id: "ramazan-2", name: "Ramazan 2. Gün", days: 1 },
    { id: "ramazan-3", name: "Ramazan 3. Gün", days: 1 },
    { id: "kurban-arife", name: "Kurban Arife", days: 0.5 },
    { id: "kurban-1", name: "Kurban 1. Gün", days: 1 },
    { id: "kurban-2", name: "Kurban 2. Gün", days: 1 },
    { id: "kurban-3", name: "Kurban 3. Gün", days: 1 },
    { id: "kurban-4", name: "Kurban 4. Gün", days: 1 },
  ],
} as const;

const FIXED_HOLIDAY_MAP: Record<string, { month: number; day: number }> = {
  "1-ocak": { month: 0, day: 1 },
  "23-nisan": { month: 3, day: 23 },
  "1-mayis": { month: 4, day: 1 },
  "19-mayis": { month: 4, day: 19 },
  "15-temmuz": { month: 6, day: 15 },
  "30-agustos": { month: 7, day: 30 },
  "28-ekim": { month: 9, day: 28 },
  "29-ekim": { month: 9, day: 29 },
};

const HOLIDAY_RULES: Record<string, (year: number) => boolean> = {
  "1-mayis": (year) => year >= 2009,
  "15-temmuz": (year) => year >= 2017,
  "1-ocak": () => true,
  "23-nisan": () => true,
  "19-mayis": () => true,
  "30-agustos": () => true,
  "29-ekim": () => true,
  "28-ekim": () => true,
  "ramazan-1": () => true,
  "ramazan-2": () => true,
  "ramazan-3": () => true,
  "kurban-1": () => true,
  "kurban-2": () => true,
  "kurban-3": () => true,
  "kurban-4": () => true,
  "ramazan-arife": () => true,
  "kurban-arife": () => true,
};

type HolidayRecord = { date: string; name: string; type: string };

export type UbgtExcludedDay = { start: string; end: string };
export type UbgtDayEntry = { date: string; holidayId: string; days: number; periodIndex?: number };
export type ExcludedWeekdayHoliday = { date: string; name: string; duration: number; dayOfWeek: number };

function extractHolidaysInRange(
  periodStart: string,
  periodEnd: string,
  selectedHolidayIds: string[],
  allHolidays: HolidayRecord[],
) {
  if (selectedHolidayIds.length === 0) return [] as Array<{ date: string; name: string; duration: number; holidayId: string }>;

  const periodStartDate = new Date(periodStart);
  const periodEndDate = new Date(periodEnd);
  const startNormalized = new Date(periodStartDate.getFullYear(), periodStartDate.getMonth(), periodStartDate.getDate());
  const endNormalized = new Date(periodEndDate.getFullYear(), periodEndDate.getMonth(), periodEndDate.getDate());
  const startYear = startNormalized.getFullYear();
  const endYear = endNormalized.getFullYear();
  const holidayList: Array<{ date: string; name: string; duration: number; holidayId: string }> = [];

  for (const selectedId of selectedHolidayIds) {
    const allStatic = [
      ...STATIC_HOLIDAYS.national,
      ...STATIC_HOLIDAYS.official,
      ...STATIC_HOLIDAYS.general,
      ...STATIC_HOLIDAYS.religious,
    ];
    const staticHoliday = allStatic.find((h) => h.id === selectedId);
    if (!staticHoliday) continue;

    let typeToMatch: string | null = null;
    if (STATIC_HOLIDAYS.national.some((h) => h.id === selectedId)) typeToMatch = "national";
    else if (STATIC_HOLIDAYS.official.some((h) => h.id === selectedId)) typeToMatch = "official";
    else if (STATIC_HOLIDAYS.general.some((h) => h.id === selectedId)) typeToMatch = "general";
    else if (STATIC_HOLIDAYS.religious.some((h) => h.id === selectedId)) typeToMatch = "religious";
    if (!typeToMatch) continue;

    for (let year = startYear; year <= endYear; year++) {
      const holidayRule = HOLIDAY_RULES[selectedId];
      if (holidayRule && !holidayRule(year)) continue;

      let holidayDate: Date | null = null;

      if (typeToMatch === "national" || typeToMatch === "official" || typeToMatch === "general") {
        const fixedHoliday = FIXED_HOLIDAY_MAP[selectedId];
        if (fixedHoliday) holidayDate = new Date(year, fixedHoliday.month, fixedHoliday.day);
      } else if (typeToMatch === "religious") {
        const holidayName = staticHoliday.name.toLowerCase();
        const isRamazan = holidayName.includes("ramazan");
        const isKurban = holidayName.includes("kurban");
        const isArife = holidayName.includes("arife");

        const yearHolidays = allHolidays.filter((h) => {
          const hYear = new Date(h.date).getFullYear();
          if (hYear !== year) return false;
          if (h.type !== "religious") return false;
          const hName = h.name.toLowerCase();
          if (isRamazan && !hName.includes("ramazan")) return false;
          if (isKurban && !hName.includes("kurban")) return false;
          if (isArife && !hName.includes("arife")) return false;
          if (!isArife && hName.includes("arife")) return false;
          if (!isArife) {
            if (selectedId === "ramazan-1" && !hName.includes("1. gün")) return false;
            if (selectedId === "ramazan-2" && !hName.includes("2. gün")) return false;
            if (selectedId === "ramazan-3" && !hName.includes("3. gün")) return false;
            if (selectedId === "kurban-1" && !hName.includes("1. gün")) return false;
            if (selectedId === "kurban-2" && !hName.includes("2. gün")) return false;
            if (selectedId === "kurban-3" && !hName.includes("3. gün")) return false;
            if (selectedId === "kurban-4" && !hName.includes("4. gün")) return false;
          }
          return true;
        });

        if (yearHolidays.length > 0) holidayDate = new Date(yearHolidays[0].date);
      }

      if (holidayDate) {
        const holidayDateNormalized = new Date(holidayDate.getFullYear(), holidayDate.getMonth(), holidayDate.getDate());
        if (holidayDateNormalized >= startNormalized && holidayDateNormalized <= endNormalized) {
          const dateStr = `${year}-${String(holidayDate.getMonth() + 1).padStart(2, "0")}-${String(holidayDate.getDate()).padStart(2, "0")}`;
          holidayList.push({
            date: dateStr,
            name: staticHoliday.name,
            duration: staticHoliday.days,
            holidayId: selectedId,
          });
        }
      }
    }
  }

  return holidayList;
}

/** Backend getUbgtDaysForPeriod — ubgt.standard.service.js */
export function getUbgtDaysForPeriod(
  periodStart: string,
  periodEnd: string,
  selectedHolidayIds: string[],
  excludedDays: UbgtExcludedDay[] = [],
  excludedWeekdays: number[] = [],
): { ubgtDays: number; excludedWeekdayHolidays: ExcludedWeekdayHoliday[]; dayEntries: UbgtDayEntry[] } {
  if (!selectedHolidayIds || selectedHolidayIds.length === 0) {
    return { ubgtDays: 0, excludedWeekdayHolidays: [], dayEntries: [] };
  }

  const allHolidays: HolidayRecord[] = [...nationalDays, ...officialHolidays, ...generalHolidays, ...religiousHolidays];

  const holidayList = extractHolidaysInRange(periodStart, periodEnd, selectedHolidayIds, allHolidays);

  const excludedDatesSet = new Set<string>();
  for (const excluded of excludedDays) {
    if (excluded.start && excluded.end) {
      const startDate = new Date(excluded.start);
      const endDate = new Date(excluded.end);
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        excludedDatesSet.add(dateStr);
      }
    }
  }

  const uniqueHolidayDates = new Map<string, { duration: number; name: string; holidayId: string }>();
  for (const holiday of holidayList) {
    const existing = uniqueHolidayDates.get(holiday.date);
    if (!existing) {
      uniqueHolidayDates.set(holiday.date, {
        duration: holiday.duration,
        name: holiday.name,
        holidayId: holiday.holidayId,
      });
    } else if (holiday.duration > existing.duration) {
      uniqueHolidayDates.set(holiday.date, {
        duration: holiday.duration,
        name: holiday.name,
        holidayId: holiday.holidayId,
      });
    }
  }

  let ubgtDays = 0;
  const excludedWeekdayHolidays: ExcludedWeekdayHoliday[] = [];
  const dayEntries: UbgtDayEntry[] = [];

  for (const [date, holidayInfo] of uniqueHolidayDates) {
    if (!excludedDatesSet.has(date)) {
      const holidayDate = new Date(date);
      const dayOfWeek = holidayDate.getDay();
      if (excludedWeekdays && excludedWeekdays.includes(dayOfWeek)) {
        excludedWeekdayHolidays.push({
          date,
          name: holidayInfo.name,
          duration: holidayInfo.duration,
          dayOfWeek,
        });
      } else {
        ubgtDays += holidayInfo.duration;
        if (holidayInfo.holidayId) {
          dayEntries.push({ date, holidayId: holidayInfo.holidayId, days: holidayInfo.duration });
        }
      }
    }
  }

  return { ubgtDays, excludedWeekdayHolidays, dayEntries };
}

export const ALL_STATIC_HOLIDAY_IDS = [
  ...STATIC_HOLIDAYS.national,
  ...STATIC_HOLIDAYS.official,
  ...STATIC_HOLIDAYS.general,
  ...STATIC_HOLIDAYS.religious,
].map((h) => h.id);
