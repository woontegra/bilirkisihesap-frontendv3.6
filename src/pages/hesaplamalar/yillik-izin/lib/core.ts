/**
 * Yıllık Ücretli İzin — ortak formül çekirdeği.
 * `aktuerya-backend/src/services/yillikIzin.service.js` ile birebir:
 *
 *   SGK 14%, issizlik 1%, damga 0.00759
 *   brutIzin = (brut/30) * remainingDays
 *   net = brutIzin - sgk - issizlik - gelirVergisi - damgaVergisi
 *
 * Entitlement (standart):
 *   1-5 yıl → 14 gün/yıl, 5-15 → 20, 15+ → 26
 *   yeraltı: +4 gün; 18-/50+: min 20 gün
 * Borçlar: 14 gün/yıl (18-/50+: 21)
 */

import { calculateIncomeTaxForYear, calculateIncomeTaxWithBrackets } from "./incomeTax";
import { parseNum, round2 } from "./money";
import type { UsedLeaveRow } from "./types";

export const SGK_ORANI = 0.14;
export const ISSIZLIK_ORANI = 0.01;
export const DAMGA_ORANI = 0.00759;

export type Breakdown = {
  y1: number;
  y2: number;
  y3: number;
  d1: number;
  d2: number;
  d3: number;
  total: number;
  daysPerYear1: number;
  daysPerYear2: number;
  daysPerYear3: number;
};

export type YillikCoreInput = {
  years?: number;
  brutUcret?: string | number;
  usedRows?: UsedLeaveRow[];
  exitYear: number;
  is18Or50?: boolean;
  isUnderground?: boolean;
  isBorclarKanunu?: boolean;
  totalEntitlement?: number;
};

export type YillikCoreResult = {
  breakdown: Breakdown;
  usedTotal: number;
  remainingDays: number;
  totalEntitlement: number;
  brutIzin: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netIzin: number;
  error?: string;
};

const EMPTY_BREAKDOWN: Breakdown = {
  y1: 0,
  y2: 0,
  y3: 0,
  d1: 0,
  d2: 0,
  d3: 0,
  total: 0,
  daysPerYear1: 14,
  daysPerYear2: 20,
  daysPerYear3: 26,
};

export function toDays(value: string | number | undefined | null): number {
  return Number(String(value ?? "").replace(/\./g, "").replace(",", ".")) || 0;
}

/** Backend `calculateBreakdown`. */
export function calculateBreakdown(
  years: number,
  is18Or50 = false,
  isUnderground = false,
  isBorclarKanunu = false,
): Breakdown {
  const y = Math.max(0, years || 0);
  const y1 = Math.min(5, y);
  const y2 = Math.min(Math.max(y - 5, 0), 9);
  const y3 = Math.max(y - 14, 0);

  let daysPerYear1 = 14;
  let daysPerYear2 = 20;
  let daysPerYear3 = 26;

  if (isBorclarKanunu) {
    daysPerYear1 = 14;
    daysPerYear2 = 14;
    daysPerYear3 = 14;
    if (is18Or50) {
      daysPerYear1 = 21;
      daysPerYear2 = 21;
      daysPerYear3 = 21;
    }
  } else {
    if (isUnderground) {
      daysPerYear1 += 4;
      daysPerYear2 += 4;
      daysPerYear3 += 4;
    }
    if (is18Or50) {
      daysPerYear1 = Math.max(20, daysPerYear1);
      daysPerYear2 = Math.max(20, daysPerYear2);
      daysPerYear3 = Math.max(20, daysPerYear3);
    }
  }

  const d1 = y1 * daysPerYear1;
  const d2 = y2 * daysPerYear2;
  const d3 = y3 * daysPerYear3;

  return {
    y1,
    y2,
    y3,
    d1,
    d2,
    d3,
    total: d1 + d2 + d3,
    daysPerYear1,
    daysPerYear2,
    daysPerYear3,
  };
}

export function calculateUsedTotal(rows: UsedLeaveRow[] = []): number {
  return rows.reduce((acc, row) => acc + toDays(row.days), 0);
}

export function calculateRemainingDays(totalEntitlement: number, usedDays: number): number {
  return Math.max(0, (totalEntitlement || 0) - (usedDays || 0));
}

export function calculateBrutIzin(brutUcret: string | number, remainingDays: number): number {
  const brut = typeof brutUcret === "number" ? brutUcret : parseNum(String(brutUcret));
  return (brut / 30) * remainingDays;
}

export type NetIzinMode = "brackets" | "forYear";

/** Backend `calculateNetIzin` — standart yol `brackets`, basın günlük olmayan `forYear`. */
export function calculateNetIzin(brutIzin: number, year: number, mode: NetIzinMode = "brackets") {
  const sgk = round2(brutIzin * SGK_ORANI);
  const issizlik = round2(brutIzin * ISSIZLIK_ORANI);
  const gelirVergisiMatrahi = Math.max(0, brutIzin - sgk - issizlik);

  let gelirVergisi = 0;
  let gelirVergisiDilimleri = "";

  if (mode === "forYear") {
    gelirVergisi = round2(calculateIncomeTaxForYear(year, gelirVergisiMatrahi));
  } else {
    const gv = calculateIncomeTaxWithBrackets(year, gelirVergisiMatrahi);
    gelirVergisi = round2(gv.tax);
    gelirVergisiDilimleri = gv.summary;
  }

  const damgaVergisi = round2(brutIzin * DAMGA_ORANI);
  const netIzin = round2(Math.max(0, brutIzin - sgk - issizlik - gelirVergisi - damgaVergisi));

  return { sgk, issizlik, gelirVergisi, gelirVergisiDilimleri, damgaVergisi, netIzin };
}

/** Backend `calculateYillikIzin` — lokal, ağ yok. */
export function calculateYillikIzin(input: YillikCoreInput): YillikCoreResult {
  const {
    years,
    brutUcret,
    usedRows = [],
    exitYear,
    is18Or50 = false,
    isUnderground = false,
    isBorclarKanunu = false,
    totalEntitlement: totalEntitlementRaw,
  } = input;

  const safeYears = years !== undefined && years !== null && !Number.isNaN(years) ? Math.max(0, Number(years)) : 0;
  const totalEntitlementOverride =
    totalEntitlementRaw != null && !Number.isNaN(totalEntitlementRaw) && totalEntitlementRaw > 0
      ? Number(totalEntitlementRaw)
      : undefined;
  const hasTotalEntitlement = totalEntitlementOverride != null;

  if (!hasTotalEntitlement && (years === undefined || years === null || Number.isNaN(years))) {
    return {
      breakdown: EMPTY_BREAKDOWN,
      usedTotal: 0,
      remainingDays: 0,
      totalEntitlement: 0,
      brutIzin: 0,
      sgk: 0,
      issizlik: 0,
      gelirVergisi: 0,
      gelirVergisiDilimleri: "",
      damgaVergisi: 0,
      netIzin: 0,
      error: "Çalışma süresi veya toplam izin hakkı gereklidir.",
    };
  }

  const parsedBrut = typeof brutUcret === "number" ? brutUcret : parseNum(String(brutUcret ?? ""));
  const breakdown = calculateBreakdown(safeYears, is18Or50, isUnderground, isBorclarKanunu);
  const usedTotal = calculateUsedTotal(usedRows);
  const effectiveTotal = hasTotalEntitlement ? totalEntitlementOverride! : breakdown.total;
  const remainingDays = calculateRemainingDays(effectiveTotal, usedTotal);

  let brutIzin = 0;
  let net = {
    sgk: 0,
    issizlik: 0,
    gelirVergisi: 0,
    gelirVergisiDilimleri: "",
    damgaVergisi: 0,
    netIzin: 0,
  };

  if (parsedBrut > 0) {
    const year = exitYear || new Date().getFullYear();
    if (!year || year < 2010 || year > 2030) {
      return {
        breakdown,
        usedTotal,
        remainingDays,
        totalEntitlement: effectiveTotal,
        brutIzin: 0,
        sgk: 0,
        issizlik: 0,
        gelirVergisi: 0,
        gelirVergisiDilimleri: "",
        damgaVergisi: 0,
        netIzin: 0,
        error: `Geçersiz yıl: ${year}. Yıl 2010-2030 arasında olmalıdır.`,
      };
    }
    brutIzin = calculateBrutIzin(parsedBrut, remainingDays);
    net = calculateNetIzin(brutIzin, year, "brackets");
  }

  return {
    breakdown,
    usedTotal,
    remainingDays,
    totalEntitlement: effectiveTotal,
    brutIzin,
    ...net,
  };
}

export function resolveExitYear(exitDateISO: string): number {
  if (exitDateISO) {
    const y = new Date(exitDateISO).getFullYear();
    if (Number.isFinite(y) && y >= 2010 && y <= 2030) return y;
  }
  return new Date().getFullYear();
}

export function createEmptyUsedRow(): UsedLeaveRow {
  return { id: Math.random().toString(36).slice(2), start: "", end: "", days: "" };
}

export function createInitialUsedRows(count = 7): UsedLeaveRow[] {
  return Array.from({ length: count }, () => createEmptyUsedRow());
}

export function normalizeUsedRows(raw: unknown, count = 7): UsedLeaveRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return createInitialUsedRows(count);
  return raw.map((r) => ({
    id: String((r as UsedLeaveRow)?.id || Math.random().toString(36).slice(2)),
    start: String((r as UsedLeaveRow)?.start ?? ""),
    end: String((r as UsedLeaveRow)?.end ?? ""),
    days: String((r as UsedLeaveRow)?.days ?? ""),
  }));
}
