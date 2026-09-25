/**
 * Hafta Tatili — brütten nete (V3/backend `haftaTatili.service` ile uyumlu).
 * SGK %14, işsizlik %1, GV, damga binde 7,59.
 */

import { calculateIncomeTaxForYear, calculateIncomeTaxWithBrackets } from "./incomeTax";
import { round2 } from "./money";
import type { NetBreakdown } from "./types";

const SGK_ORAN = 0.14;
const ISSIZLIK_ORAN = 0.01;
const DAMGA_ORAN = 0.00759;

export { DAMGA_ORAN, SGK_ORAN, ISSIZLIK_ORAN };

export function calculateNetFromBrut(brutAmount: number, year: number): NetBreakdown {
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

  const ssk = round2(brutAmount * SGK_ORAN);
  const issizlik = round2(brutAmount * ISSIZLIK_ORAN);
  const gelirVergisiMatrahi = Math.max(0, brutAmount - ssk - issizlik);
  const gelirVergisi = round2(calculateIncomeTaxForYear(year, gelirVergisiMatrahi));
  const gvResult = calculateIncomeTaxWithBrackets(year, gelirVergisiMatrahi);
  const gelirVergisiDilimleri = gvResult.summary || "";
  const damgaVergisi = round2(brutAmount * DAMGA_ORAN);
  const netAmount = round2(Math.max(0, brutAmount - ssk - issizlik - gelirVergisi - damgaVergisi));

  return { ssk, issizlik, gelirVergisi, gelirVergisiDilimleri, damgaVergisi, netAmount };
}

export function resolveTaxYear(dateRanges: { end: string }[]): number {
  const exits = dateRanges
    .map((r) => r.end)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (exits.length > 0) {
    const yr = exits.reduce((a, b) => (b > a ? b : a)).getFullYear();
    if (yr >= 2010 && yr <= 2035) return yr;
  }
  return new Date().getFullYear();
}

export function calcHakkaniyet(brut: number): number {
  return round2(brut / 3);
}

export function calcMahsupSonuc(brut: number, settleAmount: string): number {
  const hakkaniyet = calcHakkaniyet(brut);
  const mahsup = Number(String(settleAmount ?? "").replace(/\./g, "").replace(",", ".").replace("₺", "").trim()) || 0;
  return round2(Math.max(0, brut - hakkaniyet - mahsup));
}
