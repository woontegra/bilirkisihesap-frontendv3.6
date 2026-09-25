/**
 * Dönemsel Haftalık Fazla Mesai — sabitler (izolasyon).
 */

export const FM_DENOMINATOR = 225;
export const FM_ZAM_KATSAYISI = 1.5;
export const WEEKLY_WORK_LIMIT = 45;
export const WEEKLY_HOLIDAY_REFERENCE_HOURS = 7.5;

export const SGK_ORANI = 0.14;
export const ISSIZLIK_ORANI = 0.01;
export const DAMGA_ORAN = 0.00759;

export const MODE270_SIMPLE_REDUCTION_HOURS = 5.2;
export const MODE270_INCLUDED_HOURS = 270;

export const PANDEMI_BASLANGIC = "2020-03-13";
export const PANDEMI_BITIS = "2020-06-15";
export const PANDEMI_SABIT_GUN = 94;

/** V3 MONTHS — kısa etiketler. */
export const MONTH_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
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

export const DEFAULT_SUMMER_MONTHS = [4, 5, 6, 7, 8, 9];
export const DEFAULT_WINTER_MONTHS = [1, 2, 3, 10, 11, 12];

/** Hafta tatili günü (Date.getDay()). */
export const WEEKLY_HOLIDAY_GETDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: "Pazartesi" },
  { value: 2, label: "Salı" },
  { value: 3, label: "Çarşamba" },
  { value: 4, label: "Perşembe" },
  { value: 5, label: "Cuma" },
  { value: 6, label: "Cumartesi" },
  { value: 0, label: "Pazar" },
];
