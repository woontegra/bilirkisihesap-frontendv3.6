/**
 * Dönemsel Fazla Mesai - Tip tanımları
 * Yaz/Kış desen modeli
 */

export interface SeasonalPattern {
  months: number[];
  startTime: string;
  endTime: string;
  /** Klasik dönemsel: haftalık gün (1–7). Dönemsel haftalıkta grup günleri kullanılır. */
  workDays?: number;
  /** Klasik dönemsel: haftada 7 gün iken tatilli / tatilsiz (yaz ve kış ayrı). */
  sevenDayMode?: "tatilli" | "tatilsiz";
  /**
   * Hafta tatilinin olduğu takvim günü (`Date.getDay()` — 0 Pazar … 6 Cumartesi). Yıllık izin / UBGT takviminde bu gün atlanır.
   * Klasik dönemsel: 7 gün + hafta tatilli iken. Dönemsel haftalık (davacı): toplam 7 gün + «Hafta tatili var» iken.
   */
  weeklyHolidayWeekday?: number;
  /** Dönemsel haftalık — Grup 1 */
  days1?: number;
  /** Dönemsel haftalık — Grup 2 */
  days2?: number;
  startTime2?: string;
  endTime2?: string;
  /** Toplam gün 7 iken: hafta tatili var mı */
  hasWeeklyHoliday?: boolean;
  /** Hafta tatili hangi grupta sayılsın (1 veya 2) */
  weeklyHolidayRow?: 1 | 2;
}

export interface DonemselWitness {
  id: number;
  name?: string;
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalPattern;
  winterPattern: SeasonalPattern;
}

export interface DonemselState {
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalPattern;
  winterPattern: SeasonalPattern;
  witnessesSeasons: DonemselWitness[];
}

/** Hafta tatili günü seçenekleri (JS `Date.getDay()`). */
export const SEASONAL_WEEKLY_HOLIDAY_GETDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: "Pazartesi" },
  { value: 2, label: "Salı" },
  { value: 3, label: "Çarşamba" },
  { value: 4, label: "Perşembe" },
  { value: 5, label: "Cuma" },
  { value: 6, label: "Cumartesi" },
  { value: 0, label: "Pazar" },
];

export const DEFAULT_SUMMER_PATTERN: SeasonalPattern = {
  months: [4, 5, 6, 7, 8, 9],
  startTime: "",
  endTime: "",
  workDays: 6,
  sevenDayMode: "tatilsiz",
  weeklyHolidayWeekday: 0,
};

export const DEFAULT_WINTER_PATTERN: SeasonalPattern = {
  months: [1, 2, 3, 10, 11, 12],
  startTime: "",
  endTime: "",
  workDays: 6,
  sevenDayMode: "tatilsiz",
  weeklyHolidayWeekday: 0,
};

/** Dönemsel haftalık — gün sayıları boş başlar; toplam 7 olunca hafta tatili seçilebilir */
export const DEFAULT_SUMMER_PATTERN_HAFTALIK: SeasonalPattern = {
  months: [4, 5, 6, 7, 8, 9],
  startTime: "",
  endTime: "",
  startTime2: "",
  endTime2: "",
  hasWeeklyHoliday: false,
  weeklyHolidayRow: 2,
};

export const DEFAULT_WINTER_PATTERN_HAFTALIK: SeasonalPattern = {
  months: [1, 2, 3, 10, 11, 12],
  startTime: "",
  endTime: "",
  startTime2: "",
  endTime2: "",
  hasWeeklyHoliday: false,
  weeklyHolidayRow: 2,
};

export const MONTHS = [
  { value: 1, label: "Oca" },
  { value: 2, label: "Şub" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Nis" },
  { value: 5, label: "May" },
  { value: 6, label: "Haz" },
  { value: 7, label: "Tem" },
  { value: 8, label: "Ağu" },
  { value: 9, label: "Eyl" },
  { value: 10, label: "Eki" },
  { value: 11, label: "Kas" },
  { value: 12, label: "Ara" },
];
