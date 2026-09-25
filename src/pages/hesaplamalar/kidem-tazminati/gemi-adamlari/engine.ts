/**
 * Gemi Adamları kıdem tazminatı hesaplama motoru — %100 lokal, ağ isteği yok.
 * Süre hesabı, İş Kanununa göre kıdem sayfasıyla aynı takvimsel Yıl/Ay/Gün
 * yöntemini kullanır (bitiş tarihine +1 gün eklenmez).
 */

import type { ExtraItem, GemiFormSnapshot, GemiResultSummary } from "./model";
import { findGemiTavan } from "./tavanData";
import { GEMI_DAMGA_ORANI, GEMI_INCOME_TAX_BRACKETS, type GemiTaxBracket } from "./taxData";

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

/* ── Çalışma süresi (takvimsel Yıl/Ay/Gün, +1 gün eklenmez) ── */

export type WorkDuration = {
  years: number;
  months: number;
  days: number;
  label: string;
};

export function computeWorkDuration(startISO: string, endISO: string): WorkDuration {
  if (!startISO || !endISO) return { years: 0, months: 0, days: 0, label: "0 Yıl 0 Ay 0 Gün" };
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(+start) || Number.isNaN(+end) || end < start) {
    return { years: 0, months: 0, days: 0, label: "0 Yıl 0 Ay 0 Gün" };
  }
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days, label: `${years} Yıl ${months} Ay ${days} Gün` };
}

/* ── Eklenti (son 12 ay toplamından günlük paya indirgeme) ── */

/** Eklenti hesaplama: (12 aylık toplam / 360) × 30 — V3 EklentiModal ile aynı */
export function computeEklentiResult(months: string[]): number {
  const sum = months.reduce((acc, v) => acc + parseNum(v), 0);
  return (sum / 360) * 30;
}

/** V3: yıl===0 ve yıl×365+ay×30+gün < 365 ise kıdem hakkı doğmaz */
export function isKidemHakkiYok(duration: WorkDuration): boolean {
  return duration.years === 0 && duration.years * 365 + duration.months * 30 + duration.days < 365;
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
  endISO: string,
): { kullanilacakBrut: number; tavan: number | null; tavanUygulandi: boolean } {
  if (!endISO) return { kullanilacakBrut: toplamAylikBrut, tavan: null, tavanUygulandi: false };
  const endDate = new Date(endISO);
  if (Number.isNaN(+endDate)) return { kullanilacakBrut: toplamAylikBrut, tavan: null, tavanUygulandi: false };
  const tavan = findGemiTavan(endDate);
  if (tavan != null && toplamAylikBrut > tavan) {
    return { kullanilacakBrut: tavan, tavan, tavanUygulandi: true };
  }
  return { kullanilacakBrut: toplamAylikBrut, tavan, tavanUygulandi: false };
}

/* ── Brüt kıdem, damga, muafiyet, gelir vergisi, net ── */

/** Brüt = brüt×yıl + (brüt/12)×ay + (brüt/365)×gün */
export function calculateBrutKidem(kullanilacakBrut: number, duration: WorkDuration): number {
  return (
    kullanilacakBrut * duration.years +
    (kullanilacakBrut / 12) * duration.months +
    (kullanilacakBrut / 365) * duration.days
  );
}

export function calculateDamgaVergisi(brutKidem: number): number {
  return brutKidem * GEMI_DAMGA_ORANI;
}

/** Muafiyet = 24 × çıplak brüt (yalnızca çıplak ücret; diğer kalemler dahil edilmez) */
export function calculateMuafiyetTutari(ciplakBrut: number): number {
  return ciplakBrut * 24;
}

function getBracketsForYear(year: number): GemiTaxBracket[] {
  if (GEMI_INCOME_TAX_BRACKETS[year]) return GEMI_INCOME_TAX_BRACKETS[year];
  const years = Object.keys(GEMI_INCOME_TAX_BRACKETS)
    .map(Number)
    .sort((a, b) => b - a);
  for (const y of years) {
    if (year >= y) return GEMI_INCOME_TAX_BRACKETS[y];
  }
  return GEMI_INCOME_TAX_BRACKETS[2010];
}

function calculateIncomeTax(year: number, matrah: number): number {
  if (matrah <= 0) return 0;
  const brackets = getBracketsForYear(year);
  for (const b of brackets) {
    if (b.limit === null || matrah <= b.limit) {
      return b.baseTax + (matrah - b.baseLimit) * b.rate;
    }
  }
  return 0;
}

export function incomeTaxBracketSummary(year: number, matrah: number): string {
  if (matrah <= 0) return "";
  const brackets = getBracketsForYear(year);
  const applied: number[] = [];
  for (const b of brackets) {
    const pct = Math.round(b.rate * 100);
    if (!applied.includes(pct)) applied.push(pct);
    if (b.limit === null || matrah <= b.limit) break;
  }
  return applied.length > 0 ? `(${applied.map((r) => `%${r}`).join(", ")})` : "";
}

/** Gelir vergisi: brüt kıdem, 24 aylık çıplak muafiyetini aşarsa aşan kısım çıkış yılı tarifesine göre vergilendirilir. */
export function calculateGelirVergisiKidem(
  brutKidem: number,
  muafiyetTutari: number,
  exitYear: number,
): { matrah: number; vergi: number } {
  if (brutKidem <= muafiyetTutari) return { matrah: 0, vergi: 0 };
  const matrah = brutKidem - muafiyetTutari;
  return { matrah, vergi: round2(calculateIncomeTax(exitYear, matrah)) };
}

export function calculateNetKidem(brutKidem: number, damgaVergisi: number, gelirVergisi: number): number {
  return brutKidem - damgaVergisi - gelirVergisi;
}

/* ── Türetilmiş özet ── */

export function deriveGemiResult(form: GemiFormSnapshot): GemiResultSummary {
  const toplamAylikBrut = calculateToplamAylikBrut(form);
  const { kullanilacakBrut, tavanUygulandi } = resolveKullanilacakBrut(toplamAylikBrut, form.endDate);
  const duration = computeWorkDuration(form.startDate, form.endDate);
  const brutKidem = round2(calculateBrutKidem(kullanilacakBrut, duration));
  const damgaVergisi = round2(calculateDamgaVergisi(brutKidem));
  const ciplakBrut = parseNum(form.ciplakBrut);
  const muafiyetTutari = round2(calculateMuafiyetTutari(ciplakBrut));
  const exitYear = form.endDate ? new Date(form.endDate).getFullYear() : new Date().getFullYear();
  const { matrah, vergi } = calculateGelirVergisiKidem(brutKidem, muafiyetTutari, exitYear);
  const netKidem = round2(calculateNetKidem(brutKidem, damgaVergisi, vergi));

  return {
    toplamAylikBrut: round2(toplamAylikBrut),
    kullanilacakBrut: round2(kullanilacakBrut),
    tavanUygulandi,
    brutKidem,
    damgaVergisi,
    muafiyetTutari,
    gelirVergisiMatrahi: round2(matrah),
    gelirVergisi: vergi,
    netKidem,
  };
}

export function deriveDateError(form: GemiFormSnapshot): string | null {
  if (!form.startDate || !form.endDate) return null;
  const start = new Date(form.startDate);
  const end = new Date(form.endDate);
  if (!Number.isNaN(+start) && !Number.isNaN(+end) && end < start) {
    return "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.";
  }
  return null;
}

/** Tavan uyarısı — V3 metni birebir */
export function deriveWarnings(form: GemiFormSnapshot): string[] {
  const warnings: string[] = [];
  if (deriveDateError(form)) return warnings;
  const toplamAylikBrut = calculateToplamAylikBrut(form);
  const { tavan, tavanUygulandi } = resolveKullanilacakBrut(toplamAylikBrut, form.endDate);
  if (tavanUygulandi && tavan != null) {
    warnings.push(
      `Aylık brüt ücret, dönem tavanı olan ${fmtCurrency(tavan)}₺'yi aştığı için tavan seviyesine çekilmiştir. Hesaplamalar tavan değeri üzerinden yapılmıştır.`,
    );
  }
  return warnings;
}
