/**
 * Mevsimlik İşçi kıdem tazminatı hesaplama motoru — %100 lokal, ağ isteği yok.
 * Birden fazla çalışma dönemi toplam gün üzerinden Yıl/Ay/Gün'e çevrilir
 * (365 gün = 1 yıl, kalan 30 günlük dilim = 1 ay).
 */

import type { ExtraItem, MevsimlikFormSnapshot, MevsimlikResultSummary, WorkPeriod } from "./model";
import { findMevsimlikTavan } from "./tavanData";

/* ── Para yardımcıları ── */

export function parseNum(value: string): number {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n || 0 : 0;
}

export function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value || 0 : 0);
}

export { sanitizeMoneyTyping } from "@/utils/moneyInput";

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ── Dönem gün hesabı: kapsayıcı takvim günü ── */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** İki tarih arasındaki kapsayıcı gün sayısı: floor(ms/gün) + 1 */
export function calculatePeriodDays(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(+start) || Number.isNaN(+end) || end < start) return 0;
  const diff = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  return Math.max(0, diff);
}

export function recalculatePeriodDays(periods: WorkPeriod[]): WorkPeriod[] {
  return periods.map((p) => ({ ...p, days: calculatePeriodDays(p.start, p.end) }));
}

export function sumPeriodsDays(periods: WorkPeriod[]): number {
  return periods.reduce((sum, p) => sum + (Number.isFinite(p.days) ? p.days : 0), 0);
}

/** Dönemlerin en erken başlangıç tarihi (ISO). */
export function earliestPeriodStartISO(periods: WorkPeriod[]): string {
  let earliest: string | null = null;
  for (const p of periods) {
    if (!p.start) continue;
    const d = new Date(p.start);
    if (Number.isNaN(+d)) continue;
    if (!earliest || d < new Date(earliest)) earliest = p.start;
  }
  return earliest ?? "";
}

/** Dönemlerin en geç bitiş tarihi (ISO string). */
export function latestPeriodEndISO(periods: WorkPeriod[]): string {
  let latestISO = "";
  let latestMs = -Infinity;
  for (const p of periods) {
    if (!p.end) continue;
    const d = new Date(p.end);
    if (Number.isNaN(+d)) continue;
    if (d.getTime() > latestMs) {
      latestMs = d.getTime();
      latestISO = p.end;
    }
  }
  return latestISO;
}

/** 12 aylık eklenti: (toplam / 360) × 30 — V3 ile aynı. */
export function computeEklentiResult(months: string[]): number {
  const sum = months.reduce((acc, v) => acc + parseNum(v), 0);
  return (sum / 360) * 30;
}

/** Dönemlerin en geç bitiş tarihi — tavan sorgusu için "çıkış" kabul edilir. */
export function latestPeriodEndDate(periods: WorkPeriod[]): Date | null {
  let latest: Date | null = null;
  for (const p of periods) {
    if (!p.end) continue;
    const d = new Date(p.end);
    if (Number.isNaN(+d)) continue;
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

/** Toplam takvim gününden Yıl/Ay/Gün: 365 gün = 1 yıl, kalan 30 günlük dilim = 1 ay. */
export function convertDaysToYilAyGun(totalDays: number): { yil: number; ay: number; gun: number } {
  const d = Math.max(0, Math.floor(totalDays));
  const yil = Math.floor(d / 365);
  const kalanGun = d % 365;
  const ay = Math.floor(kalanGun / 30);
  const gun = kalanGun % 30;
  return { yil, ay, gun };
}

export function formatYilAyGun(totals: { yil: number; ay: number; gun: number }): string {
  return `${totals.yil} Yıl ${totals.ay} Ay ${totals.gun} Gün`;
}

/* ── Aylık brüt bileşenleri ── */

export function calculateToplamAylikBrut(form: {
  ciplakBrut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  diger: string;
  extras: ExtraItem[];
}): number {
  const base =
    parseNum(form.ciplakBrut) +
    parseNum(form.prim) +
    parseNum(form.ikramiye) +
    parseNum(form.yol) +
    parseNum(form.yemek) +
    parseNum(form.diger);
  const extrasSum = form.extras.reduce((sum, item) => sum + parseNum(item.value), 0);
  return base + extrasSum;
}

/* ── Tavan ── */

export function resolveKullanilacakBrut(
  toplamAylikBrut: number,
  exitDate: Date | null,
): { kullanilacakBrut: number; tavan: number | null; tavanUygulandi: boolean } {
  if (!exitDate || Number.isNaN(+exitDate)) {
    return { kullanilacakBrut: toplamAylikBrut, tavan: null, tavanUygulandi: false };
  }
  const tavan = findMevsimlikTavan(exitDate);
  if (tavan != null && toplamAylikBrut > tavan) {
    return { kullanilacakBrut: tavan, tavan, tavanUygulandi: true };
  }
  return { kullanilacakBrut: toplamAylikBrut, tavan, tavanUygulandi: false };
}

/* ── Brüt kıdem, damga, net ── */

/** Brüt = brüt×yıl + (brüt/12)×ay + (brüt/360)×gün (gün payı 360'tır) */
export function calculateBrutKidem(kullanilacakBrut: number, totals: { yil: number; ay: number; gun: number }): number {
  return (
    kullanilacakBrut * totals.yil +
    (kullanilacakBrut / 12) * totals.ay +
    (kullanilacakBrut / 360) * totals.gun
  );
}

export const MEVSIMLIK_DAMGA_ORANI = 0.00759;

export function calculateDamgaVergisi(brutKidem: number): number {
  return brutKidem * MEVSIMLIK_DAMGA_ORANI;
}

export function calculateNetKidem(brutKidem: number, damgaVergisi: number): number {
  return brutKidem - damgaVergisi;
}

/* ── Türetilmiş özet ── */

export function resolveEffectiveTotalDays(form: MevsimlikFormSnapshot): { toplamGun: number; manualOverrideActive: boolean } {
  const manual = parseNum(form.manualTotalDaysOverride);
  if (form.manualTotalDaysOverride.trim() && manual > 0) {
    return { toplamGun: Math.floor(manual), manualOverrideActive: true };
  }
  return { toplamGun: sumPeriodsDays(form.periods), manualOverrideActive: false };
}

export function deriveMevsimlikResult(form: MevsimlikFormSnapshot): MevsimlikResultSummary {
  const { toplamGun, manualOverrideActive } = resolveEffectiveTotalDays(form);
  const totals = convertDaysToYilAyGun(toplamGun);
  const toplamAylikBrut = calculateToplamAylikBrut(form);
  const exitDate = latestPeriodEndDate(form.periods);
  const { kullanilacakBrut, tavan, tavanUygulandi } = resolveKullanilacakBrut(toplamAylikBrut, exitDate);
  const yilTutar = kullanilacakBrut * totals.yil;
  const ayTutar = (kullanilacakBrut / 12) * totals.ay;
  const gunTutar = (kullanilacakBrut / 360) * totals.gun;
  const brutKidem = round2(calculateBrutKidem(kullanilacakBrut, totals));
  const damgaVergisi = round2(calculateDamgaVergisi(brutKidem));
  const netKidem = round2(calculateNetKidem(brutKidem, damgaVergisi));

  return {
    toplamGun,
    manualOverrideActive,
    yil: totals.yil,
    ay: totals.ay,
    gun: totals.gun,
    toplamAylikBrut: round2(toplamAylikBrut),
    kullanilacakBrut: round2(kullanilacakBrut),
    tavan: tavan != null ? round2(tavan) : null,
    tavanUygulandi,
    yilTutar: round2(yilTutar),
    ayTutar: round2(ayTutar),
    gunTutar: round2(gunTutar),
    brutKidem,
    damgaVergisi,
    netKidem,
  };
}

/** Form düzeyindeki uyarılar (dönem tarihi / manuel gün). Kıdem tavan/360 uyarıları sayfada üretilir. */
export function deriveWarnings(form: MevsimlikFormSnapshot): string[] {
  const warnings: string[] = [];
  for (const p of form.periods) {
    if (p.start && p.end) {
      const s = new Date(p.start);
      const e = new Date(p.end);
      if (!Number.isNaN(+s) && !Number.isNaN(+e) && e < s) {
        warnings.push("Bir çalışma döneminde bitiş tarihi, başlangıç tarihinden önce olamaz.");
      }
    }
  }

  const { manualOverrideActive } = resolveEffectiveTotalDays(form);
  if (manualOverrideActive) {
    warnings.push("Toplam gün sayısı için manuel değer kullanılıyor; dönem tarihlerinden hesaplanan toplam yok sayıldı.");
  }

  return warnings;
}
