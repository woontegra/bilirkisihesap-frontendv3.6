/**
 * Kıdem Tazminatı (İş Kanununa Göre) hesaplama motoru — %100 lokal, network
 * isteği yok. Bu dosya yalnızca bu klasördeki model.ts / tavanData.ts'e
 * bağımlıdır; başka bir kıdem türüne veya davacı-ucreti / manuel-brut
 * motorlarına referans vermez.
 */

import type { DurationParts, ExtraItem, IsKanunuFormSnapshot, IsKanunuResult } from "./model";
import { findTavanForIsoDate } from "./tavanData";

/** Damga vergisi oranı: binde 7,59 */
export const DAMGA_ORAN = 0.00759;

/* ── Para yardımcıları ── */

/** "1.234,56" → 1234.56. Nokta binlik ayraç, virgül ondalık ayraçtır. */
export function parseMoneyInput(value: string): number {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n || 0 : 0;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value || 0 : 0);
}

/** Yazım sırasında binlik nokta ve ondalık virgül uygular. */
export { sanitizeMoneyTyping } from "@/utils/moneyInput";

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/* ── Tarih yardımcıları (yerel takvim günü; saat dilimi kaymasız) ── */

type DateParts = { y: number; m: number; d: number };

/** "YYYY-MM-DD" metnini saat dilimi kaymasına yol açmadan parçalarına ayırır. */
export function parseIsoDateParts(iso: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function comparableKey(p: DateParts): number {
  return p.y * 10000 + p.m * 100 + p.d;
}

/**
 * İki takvim tarihi arasındaki Yıl/Ay/Gün farkını, +1 gün dahil etmeden
 * (yani bitiş günü sayılmadan) hesaplar. years = bitişYılı - başlangıçYılı;
 * ay/gün negatif çıkarsa bir önceki birimden ödünç alınır.
 * Geçersiz tarih veya bitiş < başlangıç durumunda null döner.
 */
export function calcDurationParts(startIso: string, endIso: string): DurationParts | null {
  const start = parseIsoDateParts(startIso);
  const end = parseIsoDateParts(endIso);
  if (!start || !end) return null;
  if (comparableKey(end) < comparableKey(start)) return null;

  let years = end.y - start.y;
  let months = end.m - start.m;
  let days = end.d - start.d;

  if (days < 0) {
    const borrowMonthRaw = end.m - 1;
    const borrowYear = borrowMonthRaw === 0 ? end.y - 1 : end.y;
    const borrowMonth = borrowMonthRaw === 0 ? 12 : borrowMonthRaw;
    days += daysInMonth(borrowYear, borrowMonth);
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }
  return { years, months, days };
}

export function formatDurationLabel(duration: DurationParts | null): string {
  if (!duration) return "—";
  return `${duration.years} Yıl ${duration.months} Ay ${duration.days} Gün`;
}

/** Tarih aralığı geçersizse (çıkış < giriş) kullanıcıya gösterilecek mesajı döner. */
export function validateDateRange(startIso: string, endIso: string): string | null {
  if (!startIso || !endIso) return null;
  const duration = calcDurationParts(startIso, endIso);
  if (!duration) return "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.";
  return null;
}

/* ── Eklenti (son 12 ay toplamından günlük paya indirgeme) ── */

/** Eklenti hesaplama: (12 aylık toplam / 360) × 30 */
export function computeEklentiResult(months: string[]): number {
  const sum = months.reduce((acc, v) => acc + parseMoneyInput(v), 0);
  return (sum / 360) * 30;
}

/* ── Giydirilmiş aylık ücret ── */

type WageFields = Pick<IsKanunuFormSnapshot, "ciplakBrut" | "prim" | "ikramiye" | "yol" | "yemek" | "extras">;

export function computeGiydirilmisAylik(form: WageFields): number {
  const base =
    parseMoneyInput(form.ciplakBrut) +
    parseMoneyInput(form.prim) +
    parseMoneyInput(form.ikramiye) +
    parseMoneyInput(form.yol) +
    parseMoneyInput(form.yemek);
  const extrasSum = form.extras.reduce((sum: number, item: ExtraItem) => sum + parseMoneyInput(item.value), 0);
  return round2(base + extrasSum);
}

/* ── Ana hesap ── */

function emptyResult(): IsKanunuResult {
  return {
    duration: null,
    durationLabel: formatDurationLabel(null),
    giydirilmisAylik: 0,
    tavan: null,
    tavanApplied: false,
    esasAylik: 0,
    brutKidem: 0,
    damgaVergisi: 0,
    netKidem: 0,
    shortTenureWarning: false,
  };
}

/**
 * Uçtan uca kıdem tazminatı hesabı:
 * 1) Giriş/çıkış tarihlerinden takvim süresi (yıl/ay/gün),
 * 2) Çıplak brüt + prim + ikramiye + yol + yemek + ek kalemlerden giydirilmiş aylık,
 * 3) Çıkış tarihine göre tavan kontrolü (giydirilmiş aylık tavanı aşarsa tavan esas alınır),
 * 4) Brüt kıdem = esas aylık × yıl + (esas aylık/12) × ay + (esas aylık/365) × gün,
 * 5) Damga vergisi = brüt × 0,00759; Net (ekran) = brüt − damga.
 */
export function computeIsKanunuResult(form: IsKanunuFormSnapshot): IsKanunuResult {
  const giydirilmisAylik = computeGiydirilmisAylik(form);
  if (!form.iseGirisTarihi && !form.istenCikisTarihi && giydirilmisAylik <= 0) {
    return emptyResult();
  }

  const duration = calcDurationParts(form.iseGirisTarihi, form.istenCikisTarihi);
  const durationLabel = formatDurationLabel(duration);
  const tavan = form.istenCikisTarihi ? findTavanForIsoDate(form.istenCikisTarihi) : null;
  const tavanApplied = tavan != null && giydirilmisAylik > tavan;
  const esasAylik = tavanApplied && tavan != null ? tavan : giydirilmisAylik;

  let brutKidem = 0;
  if (duration && esasAylik > 0) {
    brutKidem = round2(
      esasAylik * duration.years + (esasAylik / 12) * duration.months + (esasAylik / 365) * duration.days,
    );
  }

  const damgaVergisi = round2(brutKidem * DAMGA_ORAN);
  const netKidem = round2(brutKidem - damgaVergisi);
  const shortTenureWarning =
    !!duration &&
    duration.years === 0 &&
    duration.years * 365 + duration.months * 30 + duration.days < 365;

  return {
    duration,
    durationLabel,
    giydirilmisAylik,
    tavan,
    tavanApplied,
    esasAylik,
    brutKidem,
    damgaVergisi,
    netKidem,
    shortTenureWarning,
  };
}
