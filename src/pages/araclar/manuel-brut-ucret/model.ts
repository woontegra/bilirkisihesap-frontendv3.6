/** Bu sayfaya özel şablon veri modeli — başka hesaplama sayfalarına bağlı değildir. */

export type ManuelBrutPeriodsMap = Record<string, number>;

export type ManuelBrutTemplate = {
  id: string;
  name: string;
  periods: ManuelBrutPeriodsMap;
  updatedAt: string;
};

export type ManuelBrutCatalogPeriod = {
  key: string;
  year: number;
  indexInYear: number;
  start: string;
  end: string;
  floorBrut: number;
};

export type ManuelBrutYearCatalog = {
  year: number;
  periods: ManuelBrutCatalogPeriod[];
};

export type ManuelBrutFloorViolation = {
  key: string;
  amount: number;
  floorBrut: number;
};

export const MANUEL_BRUT_YEAR_MIN = 2010;
export const MANUEL_BRUT_YEAR_MAX = 2026;
