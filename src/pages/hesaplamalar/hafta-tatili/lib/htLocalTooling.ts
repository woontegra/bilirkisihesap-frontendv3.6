/**
 * Hafta Tatili — lokal tooling (manuel brüt feature'ına bağımlı olmayan).
 */

import { MIN_WAGE_TABLE } from "./calculations";

/** Asgari ücrete dönüş (HT MIN_WAGE_TABLE). */
export function getMinWageForStartISO(isoDate: string): number {
  const d = String(isoDate).trim().slice(0, 10);
  if (d.length < 10) return 0;
  const entry = MIN_WAGE_TABLE.find((u) => d >= u.start && d <= u.end);
  return entry?.wage ?? 0;
}

/** Cetvel dönemlerinden mahsup matris yılları. */
export function yearsFromTableRows(rows: { startISO?: string; endISO?: string; period?: string }[]): number[] {
  const yearSet = new Set<number>();
  for (const row of rows) {
    if (row.startISO && row.startISO.length >= 4) {
      const y = Number(row.startISO.slice(0, 4));
      if (Number.isFinite(y)) yearSet.add(y);
    }
    if (row.endISO && row.endISO.length >= 4) {
      const y = Number(row.endISO.slice(0, 4));
      if (Number.isFinite(y)) yearSet.add(y);
    }
  }
  return [...yearSet].sort((a, b) => a - b);
}
