/**
 * Çoklu çalışma dönemi — belirli / kısmi / mevsim / gemi paylaşılan yardımcılar.
 * Hesap: ilk giriş — son çıkış span (V3 parity); dönemler kayıt / UI için.
 */

import { newLocalId } from "./caseStorage";
import type { GemiWorkPeriod } from "./types";

export type SimpleWorkPeriod = {
  id: string;
  iseGiris: string;
  istenCikis: string;
};

export function createEmptySimplePeriod(): SimpleWorkPeriod {
  return { id: newLocalId("period"), iseGiris: "", istenCikis: "" };
}

export function deriveSpanDates(periods: Array<{ iseGiris?: string; istenCikis?: string }>): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: periods[0]?.iseGiris || "",
    endDate: periods[periods.length - 1]?.istenCikis || "",
  };
}

export function normalizeSimplePeriods(
  raw: unknown,
  fallbackStart = "",
  fallbackEnd = "",
): SimpleWorkPeriod[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((p) => {
      const row = (p ?? {}) as Partial<SimpleWorkPeriod>;
      return {
        id: String(row.id || newLocalId("period")),
        iseGiris: String(row.iseGiris ?? ""),
        istenCikis: String(row.istenCikis ?? ""),
      };
    });
  }
  if (fallbackStart || fallbackEnd) {
    return [{ id: newLocalId("period"), iseGiris: fallbackStart, istenCikis: fallbackEnd }];
  }
  return [createEmptySimplePeriod()];
}

export function periodDaysDisplay(period: GemiWorkPeriod, calculated: number): number {
  if (period.gunSayisi !== undefined) return period.gunSayisi;
  return calculated;
}
