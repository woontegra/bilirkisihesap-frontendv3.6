/**
 * Ücret Alacağı — lokal asgari ücret tabloları (brüt + net).
 * Başka sayfadan import edilmez; V3 `modules/shared/constants/asgariUcretler.ts` ve
 * `ucret-alacagi/asgariNetUcretler.ts` ile birebir.
 */

export type AsgariUcret = { start: string; end: string; brut: number };

export const ASGARI_UCRETLER: AsgariUcret[] = [
  { start: "1996-08-01", end: "1997-07-31", brut: 17010000 },
  { start: "1997-08-01", end: "1998-07-31", brut: 35437500 },
  { start: "1998-08-01", end: "1998-09-30", brut: 47839500 },
  { start: "1998-10-01", end: "1998-12-31", brut: 47839500 },
  { start: "1999-01-01", end: "1999-06-30", brut: 78075000 },
  { start: "1999-07-01", end: "1999-12-31", brut: 93600000 },
  { start: "2000-01-01", end: "2000-03-31", brut: 109800000 },
  { start: "2000-04-01", end: "2000-06-30", brut: 109800000 },
  { start: "2000-07-01", end: "2000-12-31", brut: 118800000 },
  { start: "2001-01-01", end: "2001-06-30", brut: 139950000 },
  { start: "2001-07-01", end: "2001-12-31", brut: 167940000 },
  { start: "2002-01-01", end: "2002-06-30", brut: 222000750 },
  { start: "2002-07-01", end: "2002-12-31", brut: 250875000 },
  { start: "2003-01-01", end: "2003-06-30", brut: 306000000 },
  { start: "2003-07-01", end: "2003-12-31", brut: 306000000 },
  { start: "2004-01-01", end: "2004-06-30", brut: 423000000 },
  { start: "2004-07-01", end: "2004-12-31", brut: 444150000 },
  { start: "2005-01-01", end: "2005-12-31", brut: 488.7 },
  { start: "2006-01-01", end: "2006-12-31", brut: 531.0 },
  { start: "2007-01-01", end: "2007-06-30", brut: 562.5 },
  { start: "2007-07-01", end: "2007-12-31", brut: 585.0 },
  { start: "2008-01-01", end: "2008-06-30", brut: 608.4 },
  { start: "2008-07-01", end: "2008-12-31", brut: 638.7 },
  { start: "2009-01-01", end: "2009-06-30", brut: 666.0 },
  { start: "2009-07-01", end: "2009-12-31", brut: 693.0 },
  { start: "2010-01-01", end: "2010-06-30", brut: 729.0 },
  { start: "2010-07-01", end: "2010-12-31", brut: 760.5 },
  { start: "2011-01-01", end: "2011-06-30", brut: 796.5 },
  { start: "2011-07-01", end: "2011-12-31", brut: 837.0 },
  { start: "2012-01-01", end: "2012-06-30", brut: 886.5 },
  { start: "2012-07-01", end: "2012-12-31", brut: 940.5 },
  { start: "2013-01-01", end: "2013-06-30", brut: 978.6 },
  { start: "2013-07-01", end: "2013-12-31", brut: 1021.5 },
  { start: "2014-01-01", end: "2014-06-30", brut: 1071.0 },
  { start: "2014-07-01", end: "2014-12-31", brut: 1134.0 },
  { start: "2015-01-01", end: "2015-06-30", brut: 1201.5 },
  { start: "2015-07-01", end: "2015-12-31", brut: 1273.5 },
  { start: "2016-01-01", end: "2016-12-31", brut: 1647.0 },
  { start: "2017-01-01", end: "2017-12-31", brut: 1777.5 },
  { start: "2018-01-01", end: "2018-12-31", brut: 2029.5 },
  { start: "2019-01-01", end: "2019-12-31", brut: 2558.4 },
  { start: "2020-01-01", end: "2020-12-31", brut: 2943.0 },
  { start: "2021-01-01", end: "2021-12-31", brut: 3577.5 },
  { start: "2022-01-01", end: "2022-06-30", brut: 5004.0 },
  { start: "2022-07-01", end: "2022-12-31", brut: 6471.0 },
  { start: "2023-01-01", end: "2023-06-30", brut: 10008.0 },
  { start: "2023-07-01", end: "2023-12-31", brut: 13414.5 },
  { start: "2024-01-01", end: "2024-12-31", brut: 20002.5 },
  { start: "2025-01-01", end: "2025-12-31", brut: 26005.5 },
  { start: "2026-01-01", end: "2026-12-31", brut: 33030.0 },
];

export function getAsgariUcretByDate(dateString: string): number | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  const found = ASGARI_UCRETLER.find((u) => date >= new Date(u.start) && date <= new Date(u.end));
  return found ? found.brut : null;
}

export function getAsgariUcretForPeriod(startISO: string): number {
  const v = getAsgariUcretByDate(startISO);
  return v ?? ASGARI_UCRETLER[ASGARI_UCRETLER.length - 1].brut;
}

/** V3 `asgariNetUcretler` (ucretAlacagi.service ASGARI_UCRET_DONEMLERI ile aynı). */
export type AsgariNetUcretDonem = { start: string; end: string; net: number };

export const ASGARI_NET_UCRETLER: AsgariNetUcretDonem[] = [
  { start: "2015-01-01", end: "2015-06-30", net: 949.07 },
  { start: "2015-07-01", end: "2015-12-31", net: 1000.54 },
  { start: "2016-01-01", end: "2016-12-31", net: 1300.99 },
  { start: "2017-01-01", end: "2017-12-31", net: 1404.06 },
  { start: "2018-01-01", end: "2018-12-31", net: 1603.12 },
  { start: "2019-01-01", end: "2019-12-31", net: 2020.9 },
  { start: "2020-01-01", end: "2020-12-31", net: 2324.71 },
  { start: "2021-01-01", end: "2021-12-31", net: 2825.9 },
  { start: "2022-01-01", end: "2022-06-30", net: 4253.4 },
  { start: "2022-07-01", end: "2022-12-31", net: 5500.35 },
  { start: "2023-01-01", end: "2023-06-30", net: 8506.8 },
  { start: "2023-07-01", end: "2023-12-31", net: 11402.32 },
  { start: "2024-01-01", end: "2024-12-31", net: 17002.12 },
  { start: "2025-01-01", end: "2025-12-31", net: 22104.67 },
  { start: "2026-01-01", end: "2026-12-31", net: 28075.0 },
];

export function getAsgariNetUcretByDate(dateString: string): number | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  const found = ASGARI_NET_UCRETLER.find((u) => date >= new Date(u.start) && date <= new Date(u.end));
  return found ? found.net : null;
}

export function getAsgariNetUcretForPeriod(startISO: string): number | null {
  return getAsgariNetUcretByDate(startISO);
}

/** V3 `incomeTaxCore.ts` içindeki ASGARI_BRUT (2022+ asgari ücret gelir/damga vergisi istisnası). */
export type AsgariBrutDonem = { start: string; end: string; brut: number };

export const ASGARI_BRUT: AsgariBrutDonem[] = [
  { start: "2022-01-01", end: "2022-06-30", brut: 5004 },
  { start: "2022-07-01", end: "2022-12-31", brut: 6471 },
  { start: "2023-01-01", end: "2023-06-30", brut: 10008 },
  { start: "2023-07-01", end: "2023-12-31", brut: 13414.5 },
  { start: "2024-01-01", end: "2024-12-31", brut: 20002.5 },
  { start: "2025-01-01", end: "2025-12-31", brut: 26005.5 },
  { start: "2026-01-01", end: "2026-12-31", brut: 33030 },
];

export function getAsgariBrutForDate(dateStr: string): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  const found = ASGARI_BRUT.find((x) => t >= new Date(x.start).getTime() && t <= new Date(x.end).getTime());
  return found ? found.brut : null;
}
