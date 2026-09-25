/**
 * 2010–2026 asgari ücret dönem kataloğu.
 * V3 davranışına göre yeniden oluşturuldu; V3 dosyasından kopyalanmadı.
 * Bu katalog yalnızca Manuel Brüt Ücret sayfasına aittir.
 */

import {
  MANUEL_BRUT_YEAR_MAX,
  MANUEL_BRUT_YEAR_MIN,
  type ManuelBrutCatalogPeriod,
  type ManuelBrutYearCatalog,
} from "./model";

type FloorRow = { start: string; end: string; floorBrut: number };

/** Sayfa kapsamındaki dönemler (takvim yılı 2010–2026). */
const FLOOR_ROWS: FloorRow[] = [
  { start: "2010-01-01", end: "2010-06-30", floorBrut: 729 },
  { start: "2010-07-01", end: "2010-12-31", floorBrut: 760.5 },
  { start: "2011-01-01", end: "2011-06-30", floorBrut: 796.5 },
  { start: "2011-07-01", end: "2011-12-31", floorBrut: 837 },
  { start: "2012-01-01", end: "2012-06-30", floorBrut: 886.5 },
  { start: "2012-07-01", end: "2012-12-31", floorBrut: 940.5 },
  { start: "2013-01-01", end: "2013-06-30", floorBrut: 978.6 },
  { start: "2013-07-01", end: "2013-12-31", floorBrut: 1021.5 },
  { start: "2014-01-01", end: "2014-06-30", floorBrut: 1071 },
  { start: "2014-07-01", end: "2014-12-31", floorBrut: 1134 },
  { start: "2015-01-01", end: "2015-06-30", floorBrut: 1201.5 },
  { start: "2015-07-01", end: "2015-12-31", floorBrut: 1273.5 },
  { start: "2016-01-01", end: "2016-12-31", floorBrut: 1647 },
  { start: "2017-01-01", end: "2017-12-31", floorBrut: 1777.5 },
  { start: "2018-01-01", end: "2018-12-31", floorBrut: 2029.5 },
  { start: "2019-01-01", end: "2019-12-31", floorBrut: 2558.4 },
  { start: "2020-01-01", end: "2020-12-31", floorBrut: 2943 },
  { start: "2021-01-01", end: "2021-12-31", floorBrut: 3577.5 },
  { start: "2022-01-01", end: "2022-06-30", floorBrut: 5004 },
  { start: "2022-07-01", end: "2022-12-31", floorBrut: 6471 },
  { start: "2023-01-01", end: "2023-06-30", floorBrut: 10008 },
  { start: "2023-07-01", end: "2023-12-31", floorBrut: 13414.5 },
  { start: "2024-01-01", end: "2024-12-31", floorBrut: 20002.5 },
  { start: "2025-01-01", end: "2025-12-31", floorBrut: 26005.5 },
  { start: "2026-01-01", end: "2026-12-31", floorBrut: 33030 },
];

export function periodStorageKey(start: string, end: string): string {
  return `${start.slice(0, 10)}_${end.slice(0, 10)}`;
}

export function formatPeriodLabel(year: number, indexInYear: number, totalInYear: number): string {
  if (totalInYear <= 1) return String(year);
  return `${year} ${indexInYear}. dönem`;
}

export function formatTrDateFromIso(iso: string): string {
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!d || !m || !y) return s;
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`;
}

export function formatPeriodRangeLabel(periodKey: string): string {
  const idx = periodKey.indexOf("_");
  if (idx < 0) return periodKey;
  return `${formatTrDateFromIso(periodKey.slice(0, idx))} - ${formatTrDateFromIso(periodKey.slice(idx + 1))}`;
}

export function getManuelBrutPeriodCatalog(): ManuelBrutYearCatalog[] {
  const rows: ManuelBrutYearCatalog[] = [];
  for (let year = MANUEL_BRUT_YEAR_MIN; year <= MANUEL_BRUT_YEAR_MAX; year += 1) {
    const raw = FLOOR_ROWS.filter((u) => Number(u.start.slice(0, 4)) === year).sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    const periods: ManuelBrutCatalogPeriod[] = raw.map((u, i) => ({
      key: periodStorageKey(u.start, u.end),
      year,
      indexInYear: i + 1,
      start: u.start,
      end: u.end,
      floorBrut: u.floorBrut,
    }));
    rows.push({ year, periods });
  }
  return rows;
}

let floorByKeyCache: Record<string, number> | null = null;

export function getFloorByPeriodKey(): Record<string, number> {
  if (!floorByKeyCache) {
    const next: Record<string, number> = {};
    for (const { periods } of getManuelBrutPeriodCatalog()) {
      for (const p of periods) next[p.key] = p.floorBrut;
    }
    floorByKeyCache = next;
  }
  return floorByKeyCache;
}
