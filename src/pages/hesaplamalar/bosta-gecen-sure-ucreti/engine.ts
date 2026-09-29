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

import { ratesForAccrual, wageTaxKeepingModernTable } from "../shared/historical/laborNet";
import { calculateIncomeTaxForYear, calculateIncomeTaxWithBrackets } from "./incomeTax";
import type { BostaForm, BostaResult, ExtraItem } from "./model";

export const DAMGA_ORAN = 0.00759;
export const BOSTA_CARPAN = 4;

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

/** Son tahakkuk yılı. Tarih yoksa mevcut yıl. */
export function resolveTaxYear(endDateISO?: string): number {
  const day = String(endDateISO ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const year = Number(day.slice(0, 4));
    if (year >= 1996 && year <= 2030) return year;
  }
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
  const accrual = /^\d{4}-\d{2}-\d{2}$/.test(String(form.endDate ?? "").slice(0, 10)) ? form.endDate : year;

  if (!(toplamBrut > 0)) return { ...EMPTY_RESULT, year };

  const brutAmount = round2(toplamBrut * BOSTA_CARPAN);
  const rates = ratesForAccrual(accrual);
  const sgk = round2(brutAmount * rates.sgkOran);
  const issizlik = round2(brutAmount * rates.issizlikOran);
  const gelirVergisiMatrahi = brutAmount - sgk - issizlik;
  const gv = wageTaxKeepingModernTable(rates.tahakkukTarihi, gelirVergisiMatrahi, (taxYear, income) => ({
    tax: calculateIncomeTaxForYear(taxYear, income),
    summary: calculateIncomeTaxWithBrackets(taxYear, income).summary,
  }));
  const gelirVergisi = round2(gv.tax);
  const gelirVergisiDilimleri = gv.summary;
  const damgaVergisi = round2(brutAmount * rates.damgaOran);
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
    damgaOran: rates.damgaOran,
    issizlikOran: rates.issizlikOran,
  };
}
