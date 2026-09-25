/**
 * Mevsimlik İşçi — kıdem tazminatı tavan tablosu (v1).
 * Veri kaynağı: frontendV3/src/calculations/kidem-tazminati/utils.ts (KIDEM_TAVAN_DONEMLERI).
 * Bu dosya sadece veriyi kendi yapısına göre yeniden yazar; koddan içe aktarma yoktur,
 * yalnızca bu modül tarafından kullanılır (Gemi Adamları modülündeki kopyadan bağımsızdır).
 */

export const TAVAN_DATA_VERSION = 1 as const;

export type TavanDonemi = {
  start: string;
  end: string;
  tavan: number;
};

export const MEVSIMLIK_KIDEM_TAVAN_DONEMLERI: TavanDonemi[] = [
  { start: "01.01.2004", end: "30.06.2004", tavan: 1485430000 / 1000000 },
  { start: "01.07.2004", end: "31.12.2004", tavan: 1574740000 / 1000000 },
  { start: "01.01.2005", end: "30.06.2005", tavan: 1648.9 },
  { start: "01.07.2005", end: "31.12.2005", tavan: 1727.15 },
  { start: "01.01.2006", end: "30.06.2006", tavan: 1770.63 },
  { start: "01.07.2006", end: "31.12.2006", tavan: 1857.44 },
  { start: "01.01.2007", end: "30.06.2007", tavan: 1960.69 },
  { start: "01.07.2007", end: "31.12.2007", tavan: 2030.19 },
  { start: "01.01.2008", end: "30.06.2008", tavan: 2087.92 },
  { start: "01.07.2008", end: "31.12.2008", tavan: 2173.18 },
  { start: "01.01.2009", end: "30.06.2009", tavan: 2260.05 },
  { start: "01.07.2009", end: "31.12.2009", tavan: 2365.16 },
  { start: "01.01.2010", end: "30.06.2010", tavan: 2427.04 },
  { start: "01.07.2010", end: "31.12.2010", tavan: 2517.01 },
  { start: "01.01.2011", end: "30.06.2011", tavan: 2623.23 },
  { start: "01.01.2012", end: "30.06.2012", tavan: 2917.27 },
  { start: "01.07.2012", end: "31.12.2012", tavan: 3033.98 },
  { start: "01.01.2013", end: "30.06.2013", tavan: 3129.25 },
  { start: "01.07.2013", end: "31.12.2013", tavan: 3254.44 },
  { start: "01.01.2014", end: "31.12.2014", tavan: 3438.22 },
  { start: "01.01.2015", end: "30.06.2015", tavan: 3541.37 },
  { start: "01.07.2015", end: "31.08.2015", tavan: 3709.98 },
  { start: "01.09.2015", end: "31.12.2015", tavan: 3828.37 },
  { start: "01.01.2016", end: "30.06.2016", tavan: 4092.53 },
  { start: "01.07.2016", end: "31.12.2016", tavan: 4297.21 },
  { start: "01.01.2017", end: "30.06.2017", tavan: 4426.16 },
  { start: "01.07.2017", end: "31.12.2017", tavan: 4732.48 },
  { start: "01.01.2018", end: "30.06.2018", tavan: 5001.76 },
  { start: "01.07.2018", end: "31.12.2018", tavan: 5434.42 },
  { start: "01.01.2019", end: "30.06.2019", tavan: 6017.6 },
  { start: "01.07.2019", end: "31.12.2019", tavan: 6379.86 },
  { start: "01.01.2020", end: "30.06.2020", tavan: 6730.15 },
  { start: "01.07.2020", end: "31.12.2020", tavan: 7117.17 },
  { start: "01.01.2021", end: "30.06.2021", tavan: 7638.96 },
  { start: "01.07.2021", end: "31.12.2021", tavan: 8284.51 },
  { start: "01.01.2022", end: "30.06.2022", tavan: 10848.59 },
  { start: "01.07.2022", end: "31.12.2022", tavan: 15371.4 },
  { start: "01.01.2023", end: "30.06.2023", tavan: 19982.83 },
  { start: "01.07.2023", end: "31.12.2023", tavan: 23489.83 },
  { start: "01.01.2024", end: "30.06.2024", tavan: 35058.58 },
  { start: "01.07.2024", end: "31.12.2024", tavan: 41828.42 },
  { start: "01.01.2025", end: "30.06.2025", tavan: 46655.43 },
  { start: "01.07.2025", end: "31.12.2025", tavan: 53919.68 },
  { start: "01.01.2026", end: "30.06.2026", tavan: 64948.77 },
  { start: "01.07.2026", end: "31.12.2026", tavan: 73729.87 },
];

function parseTrDate(value: string): Date {
  const [day, month, year] = value.split(".").map((p) => parseInt(p, 10));
  return new Date(year, month - 1, day);
}

/** Çıkış tarihine göre uygulanan aylık kıdem tazminatı tavanını bulur (yoksa null). */
export function findMevsimlikTavan(exitDate: Date): number | null {
  const normalized = new Date(exitDate.getFullYear(), exitDate.getMonth(), exitDate.getDate());
  for (const donem of MEVSIMLIK_KIDEM_TAVAN_DONEMLERI) {
    const start = parseTrDate(donem.start);
    const end = parseTrDate(donem.end);
    if (normalized >= start && normalized <= end) return donem.tavan;
  }
  return null;
}
