/**
 * Boşta Geçen Süre Ücreti — lokal hesaplama motoru.
 * Başka hesaplama sayfasından import yok. Ağ yok.
 *
 * V3/backend (`bostaGecenSure.service`) ile kuruşu kuruşuna:
 *   brutAmount = round2(base*4)
 *   sgk=round2(brut*0.14), issizlik=round2(brut*0.01)
 *   gv=round2(incomeTax(year, brut-sgk-issizlik))
 *   damga=round2(brut*0.00759)
 *   net=round2(brut-sgk-issizlik-gv-damga)
 *   base = brut+prim+ikramiye+yemek+extras (yol dahil edilmez)
 *   year = form endDate yılı veya mevcut yıl
 */

import { calculateIncomeTaxForYear, calculateIncomeTaxWithBrackets } from "./incomeTax";
import type { BostaForm, BostaResult, ExtraItem } from "./model";

export const DAMGA_ORAN = 0.00759;
export const BOSTA_CARPAN = 4;
const SGK_ORAN = 0.14;
const ISSIZLIK_ORAN = 0.01;

export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export function parseNum(v: string): number {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function formatMoney(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
}

export function formatDateTR(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function clampYear(value: string): string {
  if (!value || !value.includes("-")) return value;
  const parts = value.split("-");
  if (parts[0] && parts[0].length > 4) parts[0] = parts[0].substring(0, 4);
  return parts.join("-");
}

/** Gelir vergisi yılı: mevcut yıl (V3 formda tarih alanı yok). */
export function resolveTaxYear(_endDateISO?: string): number {
  return new Date().getFullYear();
}

export function calculateToplamBrut(input: {
  brut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  extras: ExtraItem[];
}): number {
  const brutValue = parseNum(input.brut);
  const primValue = parseNum(input.prim);
  const ikramiyeValue = parseNum(input.ikramiye);
  const yemekValue = parseNum(input.yemek);
  const extrasSum = (input.extras || []).reduce((acc, it) => acc + parseNum(it.value), 0);
  return brutValue + primValue + ikramiyeValue + yemekValue + extrasSum;
}

/** Eklenti: 12 aylık toplam / 360 × 30 (inline — başka modülden import yok). */
export function computeEklentiResult(months: string[]): number {
  const sum = months.reduce((acc, v) => acc + parseNum(v), 0);
  return (sum / 360) * 30;
}

const EMPTY_RESULT: BostaResult = {
  toplamBrut: 0,
  year: new Date().getFullYear(),
  brutAmount: 0,
  sgk: 0,
  issizlik: 0,
  gelirVergisi: 0,
  gelirVergisiDilimleri: "",
  damgaVergisi: 0,
  netAmount: 0,
};

export function computeBostaGecenSure(form: BostaForm): BostaResult {
  const toplamBrut = calculateToplamBrut(form);
  const year = resolveTaxYear(form.endDate);

  if (!(toplamBrut > 0)) return { ...EMPTY_RESULT, year };

  const brutAmount = round2(toplamBrut * BOSTA_CARPAN);
  const sgk = round2(brutAmount * SGK_ORAN);
  const issizlik = round2(brutAmount * ISSIZLIK_ORAN);
  const gelirVergisiMatrahi = brutAmount - sgk - issizlik;
  const gelirVergisi = round2(calculateIncomeTaxForYear(year, gelirVergisiMatrahi));
  const gelirVergisiDilimleri = calculateIncomeTaxWithBrackets(year, gelirVergisiMatrahi).summary;
  const damgaVergisi = round2(brutAmount * DAMGA_ORAN);
  const netAmount = round2(brutAmount - sgk - issizlik - gelirVergisi - damgaVergisi);

  return {
    toplamBrut,
    year,
    brutAmount,
    sgk,
    issizlik,
    gelirVergisi,
    gelirVergisiDilimleri,
    damgaVergisi,
    netAmount,
  };
}
