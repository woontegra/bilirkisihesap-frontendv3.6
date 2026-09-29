/**
 * 2005 öncesi asgari ücret dönem bölmeleri.
 * 2005 ve sonrası sayfanın kendi dönem haritasına bırakılır.
 */
import { asgariUcretler } from "./asgariUcret";

function isoToTr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Takvim yılıyla kesişen onaylı dönemler. 2005 ve sonrası için boş dizi. */
export function asgariPeriodsWithinYear(year: number): Array<{ start: string; end: string }> {
  if (!Number.isInteger(year) || year >= 2005 || year < 1996) return [];
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  return asgariUcretler
    .filter((row) => row.start <= yEnd && row.end >= yStart)
    .map((row) => ({
      start: isoToTr(row.start < yStart ? yStart : row.start),
      end: isoToTr(row.end > yEnd ? yEnd : row.end),
    }));
}
