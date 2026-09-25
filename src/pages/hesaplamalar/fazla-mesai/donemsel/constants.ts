/**
 * Dönemsel Fazla Mesai — sabitler.
 * Bu modül tamamen izoledir; başka fazla mesai alt türleriyle paylaşım yoktur.
 */

export const FM_DENOMINATOR = 225;
export const FM_ZAM_KATSAYISI = 1.5;
export const WEEKLY_WORK_LIMIT = 45;
export const WEEKLY_HOLIDAY_REFERENCE_HOURS = 7.5;

export const FULL_YEAR_WEEK_CAP = 52;
export const HALF_YEAR_WEEK_CAP = 26;

export const DEDUCTION_WINDOW_MAX_DAYS = 7;

/** "270 gün" uygulamasında basit mod haftalık fazla mesai indirimi (saat). */
export const MODE270_SIMPLE_REDUCTION_HOURS = 5.2;
/** "270 gün" uygulamasında dahil edilen yıllık saat (detaylı mod). */
export const MODE270_INCLUDED_HOURS = 270;

/** Pandemi hak düşürücü süre uzaması: 13 Mart 2020 – 15 Haziran 2020. */
export const PANDEMI_BASLANGIC = "2020-03-13";
export const PANDEMI_BITIS = "2020-06-15";
/** İşe giriş pandemi öncesiyse sabit gün sayısı (13 Mart 2020 – 15 Haziran 2020 aralığı). */
export const PANDEMI_SABIT_GUN = 94;

/** Brütten nete (TOPLAM bazında): SGK işçi payı oranı. */
export const SGK_ORANI = 0.14;
/** Brütten nete (TOPLAM bazında): İşsizlik sigortası işçi payı oranı. */
export const ISSIZLIK_ORANI = 0.01;
/** Brütten nete (TOPLAM bazında): damga vergisi oranı (binde 7,59). */
export const DAMGA_ORAN = 0.00759;

/** Yaz ayları varsayılanı (Nisan–Eylül); kış = geri kalan tüm aylar. */
export const DEFAULT_SUMMER_MONTHS = [4, 5, 6, 7, 8, 9];

/** V3 MONTHS — kısa etiket (metin hesabı + ay butonları). */
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

/** V3 SEASONAL_WEEKLY_HOLIDAY_GETDAY_OPTIONS. */
export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: "Pazartesi" },
  { value: 2, label: "Salı" },
  { value: 3, label: "Çarşamba" },
  { value: 4, label: "Perşembe" },
  { value: 5, label: "Cuma" },
  { value: 6, label: "Cumartesi" },
  { value: 0, label: "Pazar" },
];
