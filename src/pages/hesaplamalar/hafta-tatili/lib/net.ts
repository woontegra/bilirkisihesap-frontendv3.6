/**
 * Hafta Tatili — brütten nete (V3/backend `haftaTatili.service` ile uyumlu).
 * SGK %14, işsizlik %1, GV, damga binde 7,59.
 */

import { ratesForAccrual, wageTaxKeepingModernTable } from "../../shared/historical/laborNet";
import { calculateIncomeTaxForYear, calculateIncomeTaxWithBrackets } from "./incomeTax";
import { round2 } from "./money";
import type { NetBreakdown } from "./types";

const SGK_ORAN = 0.14;
const ISSIZLIK_ORAN = 0.01;
const DAMGA_ORAN = 0.00759;

export { DAMGA_ORAN, SGK_ORAN, ISSIZLIK_ORAN };

export function calculateNetFromBrut(brutAmount: number, accrual: number | string): NetBreakdown {
  if (!brutAmount || brutAmount <= 0) {
    return {
      ssk: 0,
      issizlik: 0,
      gelirVergisi: 0,
      gelirVergisiDilimleri: "",
      damgaVergisi: 0,
      netAmount: 0,
    };
  }

  const rates = ratesForAccrual(accrual);
  const ssk = round2(brutAmount * rates.sgkOran);
  const issizlik = round2(brutAmount * rates.issizlikOran);
  const gelirVergisiMatrahi = Math.max(0, brutAmount - ssk - issizlik);
  const gv = wageTaxKeepingModernTable(rates.tahakkukTarihi, gelirVergisiMatrahi, (year, income) => ({
    tax: calculateIncomeTaxForYear(year, income),
    summary: calculateIncomeTaxWithBrackets(year, income).summary,
  }));
  const gelirVergisi = round2(gv.tax);
  const damgaVergisi = round2(brutAmount * rates.damgaOran);
  const netAmount = round2(Math.max(0, brutAmount - ssk - issizlik - gelirVergisi - damgaVergisi));

  return {
    ssk,
    issizlik,
    gelirVergisi,
    gelirVergisiDilimleri: gv.summary || "",
    damgaVergisi,
    netAmount,
    damgaOran: rates.damgaOran,
    issizlikOran: rates.issizlikOran,
  };
}

/** Aralık bitişlerinin en geç günü. Yıl sonuna yuvarlanmaz. */
export function resolveTaxAccrualIso(dateRanges: { end?: string | null }[]): string | null {
  const ends = dateRanges
    .map((r) => String(r.end ?? "").slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!ends.length) return null;
  return ends.reduce((a, b) => (a > b ? a : b));
}

export function resolveTaxYear(dateRanges: { end: string }[]): number {
  const exits = dateRanges
    .map((r) => r.end)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (exits.length > 0) {
    const yr = exits.reduce((a, b) => (b > a ? b : a)).getFullYear();
    if (yr >= 1996 && yr <= 2035) return yr;
  }
  return new Date().getFullYear();
}

export function calcHakkaniyet(brut: number): number {
  return round2(brut / 3);
}

export function parseSettleAmount(settleAmount: string): number {
  return Number(String(settleAmount ?? "").replace(/\./g, "").replace(",", ".").replace("₺", "").trim()) || 0;
}

export function calcMahsupSonuc(brut: number, settleAmount: string): number {
  const hakkaniyet = calcHakkaniyet(brut);
  const mahsup = parseSettleAmount(settleAmount);
  return round2(Math.max(0, brut - hakkaniyet - mahsup));
}
