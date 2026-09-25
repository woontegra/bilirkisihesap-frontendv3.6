/**
 * Standart Fazla Mesai — sabitler (İş Kanunu md. 41 ve ilgili yönetmelik).
 * Bu dosya yalnızca `fazla-mesai/standart` klasörüne aittir; başka bir fazla
 * mesai alt türüyle veya kıdem/davacı motorlarıyla paylaşılmaz.
 */

/** Haftalık yasal çalışma süresi (saat) — bu sınırın üstü fazla mesaidir. */
export const WEEKLY_WORK_LIMIT = 45;

/** Günlük referans çalışma süresi (7 gün/tatilli hesaplarda kullanılır). */
export const STANDARD_DAILY_REFERENCE_HOURS = 7.5;

/** Fazla mesai ücreti formülündeki bölen (aylık ortalama çalışma saati). */
export const FAZLA_MESAI_DENOMINATOR = 225;

/** Fazla mesai zam katsayısı (%50 zamlı). */
export const FAZLA_MESAI_KATSAYI = 1.5;

/** Damga vergisi oranı: binde 7,59 — TOPLAM brüt üzerinden (satır bazlı değil). */
export const DAMGA_ORAN = 0.00759;

/** SGK işçi payı oranı — TOPLAM brüt üzerinden. */
export const SGK_ORANI = 0.14;

/** İşsizlik sigortası işçi payı oranı — TOPLAM brüt üzerinden. */
export const ISSIZLIK_ORANI = 0.01;

/** "270 gün" uygulamasında basit mod haftalık fazla mesai indirimi (saat). */
export const MODE270_SIMPLE_REDUCTION_HOURS = 5.2;

/** "270 gün" uygulamasında dahil edilen yıllık saat (detaylı mod, işe giriş yılı bazlı). */
export const MODE270_INCLUDED_HOURS = 270;

/** Düşüm penceresi uzunluğu: her düşüm günü için 7 takvim günü. */
export const DEDUCTION_WINDOW_DAYS = 7;

/** Pandemi hak düşürücü süre uzaması: 13 Mart 2020 – 15 Haziran 2020. */
export const PANDEMI_BASLANGIC = "2020-03-13";
export const PANDEMI_BITIS = "2020-06-15";
/** İşe giriş pandemi öncesiyse sabit gün sayısı (13 Mart 2020 – 15 Haziran 2020 aralığı). */
export const PANDEMI_SABIT_GUN = 94;
