/**
 * Kıdem Tazminatı — Kısmi Süreli / Part Time — hesaplama motoru.
 * %100 lokal, ağ isteği yok. SSK 360 gün kuralları
 * aktuerya-backend/src/services/kidemKismiSureli.service.js ile birebir eşleşecek şekilde
 * bu modüle özel olarak (bağımsız) uygulanmıştır.
 */

import type { ExtraItem, WorkPeriod } from "./model";
import { DAMGA_ORAN, findKidemTavan } from "./tavanData";

/* ── Para yardımcıları ── */

export function parseNum(value: string | number | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
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

export function sanitizeIntTyping(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ── SSK 360 gün kuralı: tek dönem için gün sayısı ── */

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** SSK kuralı: ayın 1'inde başlangıç → ay bozulmamış (30 gün); değilse gerçek gün sayısı. */
function isMonthBroken(day: number): boolean {
  return day !== 1;
}

/** Tek bir dönem için SSK 360 günlük sistemine göre gün sayısı (backend ile birebir aynı). */
export function calculatePeriodDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  try {
    const startParts = startDate.split("-");
    const endParts = endDate.split("-");
    if (startParts.length !== 3 || endParts.length !== 3) return 0;

    const gY = parseInt(startParts[0], 10);
    const gA = parseInt(startParts[1], 10);
    const gG = parseInt(startParts[2], 10);
    const cY = parseInt(endParts[0], 10);
    const cA = parseInt(endParts[1], 10);
    const cG = parseInt(endParts[2], 10);

    if ([gY, gA, gG, cY, cA, cG].some((n) => Number.isNaN(n))) return 0;

    if (gY === cY && gA === cA) {
      return Math.max(0, cG - gG + 1);
    }

    const startMonthBroken = isMonthBroken(gG);
    const startMonthDays = startMonthBroken ? getDaysInMonth(gY, gA) - gG + 1 : 30 - gG + 1;
    let totalDays = startMonthDays;

    let currentYear = gY;
    let currentMonth = gA + 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }

    while (currentYear < cY || (currentYear === cY && currentMonth < cA)) {
      totalDays += 30;
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    totalDays += cG;
    return totalDays > 0 ? totalDays : 0;
  } catch {
    return 0;
  }
}

export type YilAyGun = { yil: number; ay: number; gun: number };

/** Toplam günden yıl/ay/gün dönüştür (360 gün bazlı, backend ile aynı). */
export function convertDaysToYilAyGun(totalDays: number): YilAyGun {
  const d = Math.max(0, Math.floor(totalDays || 0));
  const yil = Math.floor(d / 360);
  const ay = Math.floor((d % 360) / 30);
  const gun = (d % 360) % 30;
  return { yil, ay, gun };
}

export function formatYilAyGun(t: YilAyGun): string {
  return `${t.yil} Yıl ${t.ay} Ay ${t.gun} Gün`;
}

/* ── Dönem yardımcıları ── */

export function sumPeriodsDays(periods: WorkPeriod[]): number {
  return periods.reduce((acc, p) => acc + (p.days || 0), 0);
}

export function earliestPeriodStart(periods: WorkPeriod[]): string {
  const withStart = periods.filter((p) => p.start && p.start.trim() !== "");
  if (withStart.length === 0) return "";
  return [...withStart].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0].start;
}

export function latestPeriodEnd(periods: WorkPeriod[]): string {
  const withEnd = periods.filter((p) => p.end && p.end.trim() !== "");
  if (withEnd.length === 0) return "";
  return [...withEnd].sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0].end;
}

/* ── Ücret bileşenleri (yol diğer'e katılabilir; toplam etkilenmez) ── */

export function calculateTotalBrut(
  ciplakBrut: string,
  prim: string,
  ikramiye: string,
  yemek: string,
  yol: string,
  diger: string,
  extras: ExtraItem[],
): number {
  const extrasSum = extras.reduce((sum, item) => sum + parseNum(item.value), 0);
  return (
    parseNum(ciplakBrut) +
    parseNum(prim) +
    parseNum(ikramiye) +
    parseNum(yemek) +
    parseNum(yol) +
    parseNum(diger) +
    extrasSum
  );
}

/* ── Kıdem tazminatı (360 gün bazlı, tavan uygulanır) ── */

export type KismiResult = {
  yilBrut: number;
  ayBrut: number;
  gunBrut: number;
  yilTutar: number;
  ayTutar: number;
  gunTutar: number;
  toplamTutar: number;
  tavanUygulandi: boolean;
  tavanDegeri: number | null;
  warnings: string[];
};

function parseISODate(iso: string | undefined | null): Date | null {
  const s = (iso || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function calculateKismiKidem(
  toplamBrut: number,
  yil: number,
  ay: number,
  gun: number,
  exitDateISO: string | undefined,
): KismiResult {
  const warnings: string[] = [];
  let yilBrut = toplamBrut;
  let tavanUygulandi = false;
  let tavanDegeri: number | null = null;

  const exitDate = parseISODate(exitDateISO);
  if (exitDate) {
    const tavan = findKidemTavan(exitDate);
    if (tavan && toplamBrut > tavan) {
      yilBrut = tavan;
      tavanUygulandi = true;
      tavanDegeri = tavan;
      warnings.push(
        `Hesaplanan kıdem tazminatı, dönem tavanı olan ${fmtCurrency(tavan)} TL'yi aştığı için tavan seviyesine çekildi.`,
      );
    }
  }

  const ayBrut = yilBrut / 12;
  const gunBrut = yilBrut / 360;
  const yilTutar = yilBrut * yil;
  const ayTutar = ayBrut * ay;
  const gunTutar = gunBrut * gun;
  const toplamTutar = yilTutar + ayTutar + gunTutar;

  return { yilBrut, ayBrut, gunBrut, yilTutar, ayTutar, gunTutar, toplamTutar, tavanUygulandi, tavanDegeri, warnings };
}

export type BrutNetResult = { brut: number; damgaVergisi: number; net: number };

export function deriveBrutNet(brut: number): BrutNetResult {
  const damgaVergisi = round2(brut * DAMGA_ORAN);
  // V3 / backend ile aynı: net = brüt × (1 − damga oranı); damgayı ayrı yuvarlayıp düşmek 1 kuruş sapma yapar.
  const net = round2(brut * (1 - DAMGA_ORAN));
  return { brut: round2(brut), damgaVergisi, net };
}

/** Eklenti hesaplama: 12 aylık toplam / 360 × 30 (V3 ile aynı formül). */
export function computeEklentiResult(months: string[]): number {
  const sum = months.reduce((acc, v) => acc + parseNum(v), 0);
  return (sum / 360) * 30;
}
