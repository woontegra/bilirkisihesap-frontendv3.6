/**
 * Prim Alacağı — lokal hesaplama motoru.
 * Başka hesaplama sayfasından import yok. Ağ yok.
 *
 * V3/backend (`primAlacagi.service.calculatePrim`) ile kuruşu kuruşuna:
 *   amount = max(0, round2(principal × percent / 100))
 *   total  = round2(sum(amounts))
 *   DAMGA_ORAN = 0.00759
 *   brutForNetConversion = brutInputForNet > 0 ? brutInputForNet : total
 *   damgaVergisi = brutForNetConversion × DAMGA_ORAN            (round2 UYGULANMAZ)
 *   netTotal     = brutForNetConversion × (1 − DAMGA_ORAN)      (round2 UYGULANMAZ)
 */

import type { PrimForm, PrimResult, PrimRowResult } from "./model";

/** Backend sabiti — binde 7,59. */
export const DAMGA_ORAN = 0.00759;

/** Backend `round2`. */
export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

/** V3 `parseNum` (prim-alacagi/calculations.ts) — negatif değerleri sıfırlamaz. */
export function parseNum(v: string): number {
  return Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
}

export function formatMoney(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
}

/** Backend `calculatePrimAmount`. */
export function calculatePrimAmount(principal: number, percent: number): number {
  if (!principal || !percent || principal <= 0 || percent <= 0) return 0;
  return Math.max(0, round2((principal * percent) / 100));
}

/** Backend `calculateNetFromBrut`. */
export function calculateNetFromBrut(brut: number): number {
  return brut * (1 - DAMGA_ORAN);
}

/** Backend `calculateDamgaVergisi`. */
export function calculateDamgaVergisi(brut: number): number {
  return brut * DAMGA_ORAN;
}

/** V3 `getBrutForNetConversion`. */
export function getBrutForNetConversion(brutInputForNet: string, total: number): number {
  const inputVal = parseNum(brutInputForNet);
  return inputVal > 0 ? inputVal : total;
}

export function computePrim(form: PrimForm): PrimResult {
  const rows: PrimRowResult[] = form.rows.map((r) => {
    const principal = parseNum(r.principal);
    const percent = parseNum(r.percent);
    return { principal, percent, amount: calculatePrimAmount(principal, percent) };
  });

  const total = round2(rows.reduce((acc, r) => acc + r.amount, 0));

  const brutForNetConversion = getBrutForNetConversion(form.brutInputForNet, total);
  const damgaVergisi = calculateDamgaVergisi(brutForNetConversion);
  const netTotal = calculateNetFromBrut(brutForNetConversion);

  return { rows, total, brutForNetConversion, damgaVergisi, netTotal };
}

/** V3 `validatePrimForm`. */
export function validatePrimForm(form: PrimForm): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!form.rows || form.rows.length === 0) {
    errors.push("En az bir prim kalemi ekleyin");
  } else {
    form.rows.forEach((r, idx) => {
      if (!r.principal || parseNum(r.principal) <= 0) {
        errors.push(`${idx + 1}. satır: Geçerli bir matrah girin`);
      }
      if (!r.percent || parseNum(r.percent) <= 0) {
        errors.push(`${idx + 1}. satır: Geçerli bir oran girin`);
      }
    });
  }
  return { isValid: errors.length === 0, errors };
}
