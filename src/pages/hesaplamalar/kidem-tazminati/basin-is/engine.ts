/**
 * Kıdem Tazminatı — Basın İş — hesaplama motoru.
 * %100 lokal, ağ isteği yok. date-fns'e ihtiyaç duymadan
 * differenceInYears/Months/Days davranışı elle üretilir (v1 ile bire bir uyum).
 */

import type { ExtraItem } from "./model";
import { DAMGA_ORAN, INCOME_TAX_BRACKETS, type TaxBracket } from "./taxData";

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

/* ── Tarih farkı: date-fns differenceInYears/Months/Days davranışı ── */

export type YilAyGun = { yil: number; ay: number; gun: number };

function parseISODate(iso: string | undefined | null): Date | null {
  const s = (iso || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** date-fns differenceInYears: yıl dönümüne henüz erişilmediyse bir tam yıl düşer. */
function diffFullYears(end: Date, start: Date): number {
  let years = end.getFullYear() - start.getFullYear();
  const anniv = new Date(start);
  anniv.setFullYear(start.getFullYear() + years);
  if (anniv.getTime() > end.getTime()) years -= 1;
  return years;
}

/** date-fns differenceInMonths: ay dönümüne henüz erişilmediyse bir tam ay düşer. */
function diffFullMonths(end: Date, start: Date): number {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const anniv = new Date(start);
  anniv.setMonth(start.getMonth() + months);
  if (anniv.getTime() > end.getTime()) months -= 1;
  return months;
}

/** date-fns differenceInDays: tam gün sayısı (taban). */
function diffFullDays(end: Date, start: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function periodFromDates(start: Date, end: Date): YilAyGun {
  if (end.getTime() < start.getTime()) return { yil: 0, ay: 0, gun: 0 };
  const yil = diffFullYears(end, start);
  const afterYears = new Date(start);
  afterYears.setFullYear(afterYears.getFullYear() + yil);
  const ay = diffFullMonths(end, afterYears);
  const afterMonths = new Date(afterYears);
  afterMonths.setMonth(afterMonths.getMonth() + ay);
  const gun = Math.max(0, diffFullDays(end, afterMonths));
  return { yil, ay, gun };
}

export function computePeriodYilAyGun(startISO: string, endISO: string): YilAyGun {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (!start || !end) return { yil: 0, ay: 0, gun: 0 };
  return periodFromDates(start, end);
}

/** Deneme süresi: 0–90 gün arasında kelepçelenir. */
export function clampDenemeSuresi(raw: string | number | undefined): number {
  const n = Math.floor(Number(raw) || 0);
  return Math.min(90, Math.max(0, n));
}

/** Kıdem süresi: (mesleğe başlangıç || işe giriş) + deneme günü → işten çıkış */
export function computeKidemSuresi(
  meslegeBaslangic: string,
  iseGiris: string,
  istenCikis: string,
  denemeSuresiGunRaw: string | number,
): YilAyGun {
  const baseStr = (meslegeBaslangic || "").trim() || (iseGiris || "").trim();
  const start = parseISODate(baseStr);
  const end = parseISODate(istenCikis);
  if (!start || !end) return { yil: 0, ay: 0, gun: 0 };
  const den = clampDenemeSuresi(denemeSuresiGunRaw);
  if (den > 0) start.setDate(start.getDate() + den);
  return periodFromDates(start, end);
}

/** Çalışma süresi: işe giriş → işten çıkış (mesleğe başlangıçtan bağımsız) */
export function computeCalismaSuresi(iseGiris: string, istenCikis: string): YilAyGun {
  return computePeriodYilAyGun(iseGiris, istenCikis);
}

/* ── 5 yıl / 6 ay kuralları ── */

/** Mesleğe başlangıç girilmişse ve kıdem yılı 5'ten az ise tazminat hakkı doğmaz. */
export function kidemHakkiYok(meslegeBaslangic: string, kidemYil: number): boolean {
  if ((meslegeBaslangic || "").trim() !== "") return kidemYil < 5;
  return false;
}

/** Tam 5 yıl sonrası 6 aydan az süre, yıl/ay/gün hesabına dahil edilmez. */
export function adjustedTenure(kidem: YilAyGun, hakYok: boolean): YilAyGun {
  if (hakYok) return { yil: 0, ay: 0, gun: 0 };
  let { yil, ay, gun } = kidem;
  if (yil === 5 && ay < 6) {
    ay = 0;
    gun = 0;
  }
  return { yil, ay, gun };
}

/** Brüt kıdem: günlük pay 365 (Basın İş kuralı, tavan uygulanmaz). */
export function computeBrutKidem(toplamBrut: number, h: YilAyGun): number {
  if (!toplamBrut || toplamBrut <= 0) return 0;
  return Math.max(0, toplamBrut * h.yil + (toplamBrut / 12) * h.ay + (toplamBrut / 365) * h.gun);
}

/* ── Ücret bileşenleri ── */

export function calculateTotalBrut(
  ciplakBrut: string,
  prim: string,
  ikramiye: string,
  yol: string,
  yemek: string,
  diger: string,
  extras: ExtraItem[],
): number {
  const extrasSum = extras.reduce((sum, item) => sum + parseNum(item.value), 0);
  return (
    parseNum(ciplakBrut) +
    parseNum(prim) +
    parseNum(ikramiye) +
    parseNum(yol) +
    parseNum(yemek) +
    parseNum(diger) +
    extrasSum
  );
}

/* ── Gelir vergisi (GVK 25/7 istisnası aşıldığında) ── */

function getRatesForYear(year: number): TaxBracket[] {
  if (INCOME_TAX_BRACKETS[year]) return INCOME_TAX_BRACKETS[year];
  const years = Object.keys(INCOME_TAX_BRACKETS)
    .map(Number)
    .sort((a, b) => b - a);
  for (const y of years) {
    if (year >= y) return INCOME_TAX_BRACKETS[y];
  }
  return INCOME_TAX_BRACKETS[years[years.length - 1]] ?? [];
}

export function calculateIncomeTaxForYear(year: number, income: number): number {
  if (income <= 0) return 0;
  const brackets = getRatesForYear(year);
  for (const b of brackets) {
    if (b.limit === null || income <= b.limit) {
      return Math.max(0, b.baseTax + (income - b.baseLimit) * b.rate);
    }
  }
  return 0;
}

/* ── Brütten nete (damga + koşullu gelir vergisi) ── */

export type BrutNetResult = {
  brut: number;
  esikDeger: number;
  gelirVergisiUygulanacak: boolean;
  matrah: number;
  gelirVergisi: number;
  damgaVergisi: number;
  net: number;
};

export function deriveBrutNet(brut: number, ciplakBrut: number, exitYear: number): BrutNetResult {
  const esikDeger = ciplakBrut * 24;
  const gelirVergisiUygulanacak = brut > esikDeger && esikDeger > 0;
  const matrah = gelirVergisiUygulanacak ? Math.max(0, brut - esikDeger) : 0;
  const gelirVergisi = gelirVergisiUygulanacak ? round2(calculateIncomeTaxForYear(exitYear, matrah)) : 0;
  const damgaVergisi = round2(brut * DAMGA_ORAN);
  const net = round2(brut - damgaVergisi - gelirVergisi);
  return { brut: round2(brut), esikDeger: round2(esikDeger), gelirVergisiUygulanacak, matrah: round2(matrah), gelirVergisi, damgaVergisi, net };
}

export function resolveExitYear(istenCikis: string): number {
  const d = parseISODate(istenCikis);
  const y = d ? d.getFullYear() : new Date().getFullYear();
  if (Number.isNaN(y) || y < 2000 || y > 2100) return new Date().getFullYear();
  return y;
}

/** Eklenti hesaplama: 12 aylık toplam / 360 × 30 (V3 ile aynı formül). */
export function computeEklentiResult(months: string[]): number {
  const sum = months.reduce((acc, v) => acc + parseNum(v), 0);
  return (sum / 360) * 30;
}

export function formatYilAyGun(t: YilAyGun): string {
  return `${t.yil} Yıl ${t.ay} Ay ${t.gun} Gün`;
}
