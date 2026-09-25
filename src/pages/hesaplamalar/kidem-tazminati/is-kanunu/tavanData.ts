/**
 * Kıdem tazminatı tavan tutarları (aylık brüt, ₺) — resmi dönem duyurularına
 * dayanan sabit tablo. Dönemler ISO (YYYY-MM-DD) tarih aralıklarıyla
 * tanımlanır; bu biçimde string karşılaştırması doğrudan kronolojik sırayla
 * çalışır, ekstra tarih ayrıştırmasına gerek kalmaz.
 *
 * Not: 2011-07-01 → 2011-12-31 aralığı için ayrı bir dönem kaydı yoktur
 * (referans tabloda bilinçli olarak boş bırakılmıştır); bu aralığa denk gelen
 * çıkış tarihleri için tavan tutarı null döner.
 */

export type KidemTavanPeriod = {
  start: string;
  end: string;
  tavan: number;
};

export const KIDEM_TAVAN_PERIODS: readonly KidemTavanPeriod[] = [
  { start: "2004-01-01", end: "2004-06-30", tavan: 1485.43 },
  { start: "2004-07-01", end: "2004-12-31", tavan: 1574.74 },
  { start: "2005-01-01", end: "2005-06-30", tavan: 1648.9 },
  { start: "2005-07-01", end: "2005-12-31", tavan: 1727.15 },
  { start: "2006-01-01", end: "2006-06-30", tavan: 1770.63 },
  { start: "2006-07-01", end: "2006-12-31", tavan: 1857.44 },
  { start: "2007-01-01", end: "2007-06-30", tavan: 1960.69 },
  { start: "2007-07-01", end: "2007-12-31", tavan: 2030.19 },
  { start: "2008-01-01", end: "2008-06-30", tavan: 2087.92 },
  { start: "2008-07-01", end: "2008-12-31", tavan: 2173.18 },
  { start: "2009-01-01", end: "2009-06-30", tavan: 2260.05 },
  { start: "2009-07-01", end: "2009-12-31", tavan: 2365.16 },
  { start: "2010-01-01", end: "2010-06-30", tavan: 2427.04 },
  { start: "2010-07-01", end: "2010-12-31", tavan: 2517.01 },
  { start: "2011-01-01", end: "2011-06-30", tavan: 2623.23 },
  { start: "2012-01-01", end: "2012-06-30", tavan: 2917.27 },
  { start: "2012-07-01", end: "2012-12-31", tavan: 3033.98 },
  { start: "2013-01-01", end: "2013-06-30", tavan: 3129.25 },
  { start: "2013-07-01", end: "2013-12-31", tavan: 3254.44 },
  { start: "2014-01-01", end: "2014-12-31", tavan: 3438.22 },
  { start: "2015-01-01", end: "2015-06-30", tavan: 3541.37 },
  { start: "2015-07-01", end: "2015-08-31", tavan: 3709.98 },
  { start: "2015-09-01", end: "2015-12-31", tavan: 3828.37 },
  { start: "2016-01-01", end: "2016-06-30", tavan: 4092.53 },
  { start: "2016-07-01", end: "2016-12-31", tavan: 4297.21 },
  { start: "2017-01-01", end: "2017-06-30", tavan: 4426.16 },
  { start: "2017-07-01", end: "2017-12-31", tavan: 4732.48 },
  { start: "2018-01-01", end: "2018-06-30", tavan: 5001.76 },
  { start: "2018-07-01", end: "2018-12-31", tavan: 5434.42 },
  { start: "2019-01-01", end: "2019-06-30", tavan: 6017.6 },
  { start: "2019-07-01", end: "2019-12-31", tavan: 6379.86 },
  { start: "2020-01-01", end: "2020-06-30", tavan: 6730.15 },
  { start: "2020-07-01", end: "2020-12-31", tavan: 7117.17 },
  { start: "2021-01-01", end: "2021-06-30", tavan: 7638.96 },
  { start: "2021-07-01", end: "2021-12-31", tavan: 8284.51 },
  { start: "2022-01-01", end: "2022-06-30", tavan: 10848.59 },
  { start: "2022-07-01", end: "2022-12-31", tavan: 15371.4 },
  { start: "2023-01-01", end: "2023-06-30", tavan: 19982.83 },
  { start: "2023-07-01", end: "2023-12-31", tavan: 23489.83 },
  { start: "2024-01-01", end: "2024-06-30", tavan: 35058.58 },
  { start: "2024-07-01", end: "2024-12-31", tavan: 41828.42 },
  { start: "2025-01-01", end: "2025-06-30", tavan: 46655.43 },
  { start: "2025-07-01", end: "2025-12-31", tavan: 53919.68 },
  { start: "2026-01-01", end: "2026-06-30", tavan: 64948.77 },
  { start: "2026-07-01", end: "2026-12-31", tavan: 73729.87 },
];

/**
 * Verilen ISO (YYYY-MM-DD) tarihin düştüğü dönemin tavan tutarını döner.
 * Tarih tablonun kapsadığı aralığın dışındaysa null döner (tavan uygulanmaz).
 */
export function findTavanForIsoDate(iso: string): number | null {
  const normalized = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const period = KIDEM_TAVAN_PERIODS.find((p) => normalized >= p.start && normalized <= p.end);
  return period ? period.tavan : null;
}
