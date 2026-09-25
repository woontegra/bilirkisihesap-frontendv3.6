/**
 * UBGT günü türü bazlı dışlama – sadece liste filtreler, hesaplama yapmaz.
 * V3 `filterExcludedUbgtHolidays.ts` ile birebir.
 */

export type UbgtHolidayType =
  | "OCT_28_HALF"
  | "OCT_29"
  | "APR_23"
  | "MAY_19"
  | "AUG_30"
  | "JAN_1"
  | "MAY_1"
  | "JUL_15"
  | "RAMADAN_AREFE_HALF"
  | "RAMADAN_1"
  | "RAMADAN_2"
  | "RAMADAN_3"
  | "KURBAN_AREFE_HALF"
  | "KURBAN_1"
  | "KURBAN_2"
  | "KURBAN_3"
  | "KURBAN_4";

export interface UbgtDayEntryTyped {
  holidayType: UbgtHolidayType;
  date: string;
  days: number;
  periodIndex?: number;
  holidayId?: string;
}

export interface UbgtExclusionRule {
  startYear: number;
  endYear: number;
  excludedHolidayTypes: UbgtHolidayType[];
}

export const UBGT_HOLIDAY_TYPES: { value: UbgtHolidayType; label: string }[] = [
  { value: "OCT_28_HALF", label: "28 Ekim - 0.5 gün" },
  { value: "OCT_29", label: "29 Ekim - 1 gün" },
  { value: "APR_23", label: "23 Nisan" },
  { value: "MAY_19", label: "19 Mayıs" },
  { value: "AUG_30", label: "30 Ağustos" },
  { value: "JAN_1", label: "Yılbaşı" },
  { value: "MAY_1", label: "1 Mayıs" },
  { value: "JUL_15", label: "15 Temmuz" },
  { value: "RAMADAN_AREFE_HALF", label: "Ramazan Arife - 0.5 gün" },
  { value: "RAMADAN_1", label: "Ramazan 1. Gün" },
  { value: "RAMADAN_2", label: "Ramazan 2. Gün" },
  { value: "RAMADAN_3", label: "Ramazan 3. Gün" },
  { value: "KURBAN_AREFE_HALF", label: "Kurban Arife - 0.5 gün" },
  { value: "KURBAN_1", label: "Kurban 1. Gün" },
  { value: "KURBAN_2", label: "Kurban 2. Gün" },
  { value: "KURBAN_3", label: "Kurban 3. Gün" },
  { value: "KURBAN_4", label: "Kurban 4. Gün" },
];

export const UBGT_HOLIDAY_DAYS: Record<UbgtHolidayType, number> = {
  OCT_28_HALF: 0.5,
  OCT_29: 1,
  APR_23: 1,
  MAY_19: 1,
  AUG_30: 1,
  JAN_1: 1,
  MAY_1: 1,
  JUL_15: 1,
  RAMADAN_AREFE_HALF: 0.5,
  RAMADAN_1: 1,
  RAMADAN_2: 1,
  RAMADAN_3: 1,
  KURBAN_AREFE_HALF: 0.5,
  KURBAN_1: 1,
  KURBAN_2: 1,
  KURBAN_3: 1,
  KURBAN_4: 1,
};

export function getYearsFromDateRange(rangeStart: string, rangeEnd: string): number[] {
  if (!rangeStart || !rangeEnd) return [];
  const y1 = parseInt(rangeStart.slice(0, 4), 10);
  const y2 = parseInt(rangeEnd.slice(0, 4), 10);
  if (y1 > y2) return [];
  const years: number[] = [];
  for (let y = y1; y <= y2; y++) years.push(y);
  return years;
}

export const BACKEND_ID_TO_UBGT_TYPE: Record<string, UbgtHolidayType> = {
  "28-ekim": "OCT_28_HALF",
  "29-ekim": "OCT_29",
  "23-nisan": "APR_23",
  "19-mayis": "MAY_19",
  "30-agustos": "AUG_30",
  "1-ocak": "JAN_1",
  "1-mayis": "MAY_1",
  "15-temmuz": "JUL_15",
  "ramazan-arife": "RAMADAN_AREFE_HALF",
  "ramazan-1": "RAMADAN_1",
  "ramazan-2": "RAMADAN_2",
  "ramazan-3": "RAMADAN_3",
  "kurban-arife": "KURBAN_AREFE_HALF",
  "kurban-1": "KURBAN_1",
  "kurban-2": "KURBAN_2",
  "kurban-3": "KURBAN_3",
  "kurban-4": "KURBAN_4",
};

export function filterExcludedUbgtHolidays<T extends UbgtDayEntryTyped>(
  ubgtDays: T[],
  excludedUbgtHolidays: UbgtHolidayType[],
): T[] {
  if (!excludedUbgtHolidays || excludedUbgtHolidays.length === 0) {
    return ubgtDays;
  }
  const set = new Set(excludedUbgtHolidays);
  return ubgtDays.filter((d) => !set.has(d.holidayType));
}

/**
 * Yıl aralığı bazlı kurallara göre günleri filtreler.
 * Bir gün: yılı herhangi bir rule'un startYear–endYear aralığındaysa VE
 * holidayType o rule'un excludedHolidayTypes içindeyse → listeden çıkarılır.
 */
export function filterExcludedUbgtHolidaysByRules<T extends UbgtDayEntryTyped>(
  ubgtDays: T[],
  rules: UbgtExclusionRule[],
): T[] {
  if (!rules || rules.length === 0) {
    return ubgtDays;
  }
  return ubgtDays.filter((d) => {
    const year = parseInt(d.date.slice(0, 4), 10);
    const shouldExclude = rules.some(
      (r) =>
        year >= r.startYear &&
        year <= r.endYear &&
        r.excludedHolidayTypes.length > 0 &&
        r.excludedHolidayTypes.includes(d.holidayType),
    );
    return !shouldExclude;
  });
}
