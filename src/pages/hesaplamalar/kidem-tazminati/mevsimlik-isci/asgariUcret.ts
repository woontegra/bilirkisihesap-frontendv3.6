/**
 * Dönemsel asgari brüt ücret tablosu (V3 KidemTazminatiForm ile aynı değerler).
 * Çıplak brüt kontrolü için kullanılır; hesabı engellemez.
 */

const ASGARI_UCRET_BRUT: Readonly<Record<string, number>> = {
  "2005-1": 488.7,
  "2005-2": 488.7,
  "2006-1": 531,
  "2006-2": 531,
  "2007-1": 562.5,
  "2007-2": 585,
  "2008-1": 608.4,
  "2008-2": 638.7,
  "2009-1": 666,
  "2009-2": 693,
  "2010-1": 729,
  "2010-2": 760.5,
  "2011-1": 796.5,
  "2011-2": 837,
  "2012-1": 886.5,
  "2012-2": 940.5,
  "2013-1": 978.6,
  "2013-2": 1021.5,
  "2014-1": 1071,
  "2014-2": 1134,
  "2015-1": 1201.5,
  "2015-2": 1273.5,
  "2016-1": 1647,
  "2016-2": 1647,
  "2017-1": 1777.5,
  "2017-2": 1777.5,
  "2018-1": 2029.5,
  "2018-2": 2029.5,
  "2019-1": 2558.4,
  "2019-2": 2558.4,
  "2020-1": 2943,
  "2020-2": 2943,
  "2021-1": 3577.5,
  "2021-2": 3577.5,
  "2022-1": 5004,
  "2022-2": 6471,
  "2023-1": 10008,
  "2023-2": 13414.5,
  "2024-1": 20002.5,
  "2024-2": 20002.5,
  "2025-1": 26005.5,
  "2025-2": 26005.5,
  "2026-1": 33030,
  "2026-2": 33030,
};

/** ISO tarih (YYYY-MM-DD) için dönem asgari brütünü döner. */
export function getAsgariUcretByDate(isoDate: string): number | null {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;

  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const period = month <= 6 ? "1" : "2";
  const key = `${year}-${period}`;

  if (ASGARI_UCRET_BRUT[key]) return ASGARI_UCRET_BRUT[key];

  const maxYear = Math.max(...Object.keys(ASGARI_UCRET_BRUT).map((k) => Number(k.slice(0, 4))));
  const maxPeriod = year > maxYear ? "2" : period;
  return ASGARI_UCRET_BRUT[`${maxYear}-${maxPeriod}`] ?? null;
}
