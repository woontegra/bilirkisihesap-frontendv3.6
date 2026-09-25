/**
 * Haftalık Karma Fazla Mesai — sabitler.
 * Bu modül tamamen izoledir; başka fazla mesai alt türleriyle paylaşım yoktur.
 */

/** Fazla mesai brüt tutarı: (brüt × katsayı × hafta × fmSaat) / 225 × 1.5 */
export const FM_DENOMINATOR = 225;
export const FM_ZAM_KATSAYISI = 1.5;

/** Yasal haftalık çalışma sınırı (saat). */
export const WEEKLY_WORK_LIMIT = 45;

/** Hafta tatili günü kabul edilen günlük referans saat (7,5 saat). */
export const WEEKLY_HOLIDAY_REFERENCE_HOURS = 7.5;

/** Asgari ücret dönem bölünmesinde tam yıl / yarım yıl hafta tavanları. */
export const FULL_YEAR_WEEK_CAP = 52;
export const HALF_YEAR_WEEK_CAP = 26;

/** Düşüm penceresi (UBGT / Yıllık İzin) en fazla kaç günlük dilimlere bölünür. */
export const DEDUCTION_WINDOW_MAX_DAYS = 7;

/** Brütten nete (TOPLAM bazında): SGK işçi payı oranı. */
export const SGK_ORANI = 0.14;
/** Brütten nete (TOPLAM bazında): İşsizlik sigortası işçi payı oranı. */
export const ISSIZLIK_ORANI = 0.01;
/** Brütten nete (TOPLAM bazında): damga vergisi oranı (binde 7,59). */
export const DAMGA_ORAN = 0.00759;

/** "270 gün" uygulamasında basit mod haftalık fazla mesai indirimi (saat). */
export const MODE270_SIMPLE_REDUCTION_HOURS = 5.2;
/** "270 gün" uygulamasında dahil edilen yıllık saat (detaylı mod, işe giriş yılı bazlı). */
export const MODE270_INCLUDED_HOURS = 270;

/** Pandemi hak düşürücü süre uzaması: 13 Mart 2020 – 15 Haziran 2020. */
export const PANDEMI_BASLANGIC = "2020-03-13";
export const PANDEMI_BITIS = "2020-06-15";
/** İşe giriş pandemi öncesiyse sabit gün sayısı. */
export const PANDEMI_SABIT_GUN = 94;
