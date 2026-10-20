/**
 * LOCAL COPY - DO NOT MODIFY
 * This file is frozen as part of StandartIndependent page isolation
 * 
 * Türkiye Asgari Ücret Tablosu (1996–2026)
 */

export interface AsgariUcret {
  start: string;
  end: string;
  brut: number;
}

export const asgariUcretler: AsgariUcret[] = [
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
  { start: "2005-01-01", end: "2005-12-31", brut: 488.70 },
  { start: "2006-01-01", end: "2006-12-31", brut: 531.00 },
  { start: "2007-01-01", end: "2007-06-30", brut: 562.50 },
  { start: "2007-07-01", end: "2007-12-31", brut: 585.00 },
  { start: "2008-01-01", end: "2008-06-30", brut: 608.40 },
  { start: "2008-07-01", end: "2008-12-31", brut: 638.70 },
  { start: "2009-01-01", end: "2009-06-30", brut: 666.00 },
  { start: "2009-07-01", end: "2009-12-31", brut: 693.00 },
  { start: "2010-01-01", end: "2010-06-30", brut: 729.00 },
  { start: "2010-07-01", end: "2010-12-31", brut: 760.50 },
  { start: "2011-01-01", end: "2011-06-30", brut: 796.50 },
  { start: "2011-07-01", end: "2011-12-31", brut: 837.00 },
  { start: "2012-01-01", end: "2012-06-30", brut: 886.50 },
  { start: "2012-07-01", end: "2012-12-31", brut: 940.50 },
  { start: "2013-01-01", end: "2013-06-30", brut: 978.60 },
  { start: "2013-07-01", end: "2013-12-31", brut: 1021.50 },
  { start: "2014-01-01", end: "2014-06-30", brut: 1071.00 },
  { start: "2014-07-01", end: "2014-12-31", brut: 1134.00 },
  { start: "2015-01-01", end: "2015-06-30", brut: 1201.50 },
  { start: "2015-07-01", end: "2015-12-31", brut: 1273.50 },
  { start: "2016-01-01", end: "2016-12-31", brut: 1647.00 },
  { start: "2017-01-01", end: "2017-12-31", brut: 1777.50 },
  { start: "2018-01-01", end: "2018-12-31", brut: 2029.50 },
  { start: "2019-01-01", end: "2019-12-31", brut: 2558.40 },
  { start: "2020-01-01", end: "2020-12-31", brut: 2943.00 },
  { start: "2021-01-01", end: "2021-12-31", brut: 3577.50 },
  { start: "2022-01-01", end: "2022-06-30", brut: 5004.00 },
  { start: "2022-07-01", end: "2022-12-31", brut: 6471.00 },
  { start: "2023-01-01", end: "2023-06-30", brut: 10008.00 },
  { start: "2023-07-01", end: "2023-12-31", brut: 13414.50 },
  { start: "2024-01-01", end: "2024-12-31", brut: 20002.50 },
  { start: "2025-01-01", end: "2025-12-31", brut: 26005.50 },
  { start: "2026-01-01", end: "2026-12-31", brut: 33030.00 }
];

export function getAsgariUcretByDate(dateString: string): number | null {
  const date = new Date(dateString);
  const found = asgariUcretler.find(
    (u) => date >= new Date(u.start) && date <= new Date(u.end)
  );
  return found ? found.brut : null;
}
