/**
 * Tanıklı Standart Fazla Mesai — asgari ücret tablosu (1996–2026), yalnızca
 * bu klasöre ait yerel kopya. `fazla-mesai/standart` dahil başka bir alt
 * türle paylaşılmaz; her modül kendi tablosunu taşır.
 *
 * Dönemler doğrudan resmî duyurulara dayanır: 2007–2014 ve 2022–2023
 * aralıklarında yıl ortasında değişim (Ocak–Haziran / Temmuz–Aralık) vardır;
 * diğer yıllarda tek bir tam yıl dönemi uygulanır. 1996–2004 arası tutarlar
 * redenominasyon öncesi (eski) Türk Lirası cinsindendir.
 */

export type AsgariUcretDonemi = {
  start: string;
  end: string;
  brut: number;
};

export const ASGARI_UCRET_TABLOSU: readonly AsgariUcretDonemi[] = [
  { start: "1996-08-01", end: "1997-07-31", brut: 17010000 },
  { start: "1997-08-01", end: "1998-07-31", brut: 35437500 },
  { start: "1998-08-01", end: "1998-12-31", brut: 47839500 },
  { start: "1999-01-01", end: "1999-06-30", brut: 78075000 },
  { start: "1999-07-01", end: "1999-12-31", brut: 93600000 },
  { start: "2000-01-01", end: "2000-06-30", brut: 109800000 },
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

/** İki dönemin (ISO tarih aralığı) kesişimini döner; kesişim yoksa null. */
export function intersectIsoRanges(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): { start: string; end: string } | null {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (start > end) return null;
  return { start, end };
}

/** Verilen tarihin düştüğü asgari ücret dönemi tutarını döner. */
export function getAsgariUcretByDate(isoDate: string): number | null {
  const normalized = String(isoDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const found = ASGARI_UCRET_TABLOSU.find((p) => normalized >= p.start && normalized <= p.end);
  if (found) return found.brut;
  const first = ASGARI_UCRET_TABLOSU[0];
  const last = ASGARI_UCRET_TABLOSU[ASGARI_UCRET_TABLOSU.length - 1];
  if (normalized < first.start) return null;
  if (normalized > last.end) return last.brut;
  return null;
}

export type AsgariDonemSegment = {
  start: string;
  end: string;
  brut: number;
  /** Bu dönem tablo satırının tam yıl mı yoksa yarı yıl (H1/H2) mı olduğu. */
  fullYear: boolean;
};

/**
 * [startISO, endISO] aralığını tablo dönemleriyle kesiştirip alt segmentlere
 * böler. Her segment, kesiştiği orijinal tablo satırının tam-yıl/yarı-yıl
 * bilgisini taşır (hafta üst sınırı bu bilgiye göre uygulanır: tam yıl 52,
 * yarı yıl 26).
 */
export function splitRangeByAsgariUcretPeriods(startISO: string, endISO: string): AsgariDonemSegment[] {
  const s = String(startISO ?? "").slice(0, 10);
  const e = String(endISO ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || s > e) return [];

  const segments: AsgariDonemSegment[] = [];
  for (const row of ASGARI_UCRET_TABLOSU) {
    const inter = intersectIsoRanges(s, e, row.start, row.end);
    if (!inter) continue;
    const rowSpanDays = daysBetweenIsoInclusive(row.start, row.end);
    segments.push({ start: inter.start, end: inter.end, brut: row.brut, fullYear: rowSpanDays >= 300 });
  }

  const last = ASGARI_UCRET_TABLOSU[ASGARI_UCRET_TABLOSU.length - 1];
  if (e > last.end) {
    const clipStart = s > last.end ? s : addIsoDays(last.end, 1);
    if (clipStart <= e) {
      segments.push({ start: clipStart, end: e, brut: last.brut, fullYear: true });
    }
  }

  return segments;
}

/**
 * Dönem SINIRLARI (bölme) — V3 `dateSegmentationCore` ile birebir.
 * Ücret tablosundan kasıtlı olarak ayrıdır: 2015 tek tam yıl segmenttir.
 */
const HALF_YEAR_SPLIT_YEARS: ReadonlySet<number> = new Set([
  2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2022, 2023,
]);

export type AsgariSplitSegment = {
  start: string;
  end: string;
  brut: number;
  fullYear: boolean;
};

/** V3 segmentOvertimeResult / splitByAsgariUcretPeriods ile aynı bölme sınırları. */
export function splitRangeByAsgariPeriodBounds(startISO: string, endISO: string): AsgariSplitSegment[] {
  const s = String(startISO ?? "").slice(0, 10);
  const e = String(endISO ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || s > e) return [];

  const startYear = Number(s.slice(0, 4));
  const endYear = Number(e.slice(0, 4));
  const segments: AsgariSplitSegment[] = [];

  for (let year = startYear; year <= endYear; year++) {
    const periods: { start: string; end: string; fullYear: boolean }[] = HALF_YEAR_SPLIT_YEARS.has(year)
      ? [
          { start: `${year}-01-01`, end: `${year}-06-30`, fullYear: false },
          { start: `${year}-07-01`, end: `${year}-12-31`, fullYear: false },
        ]
      : [{ start: `${year}-01-01`, end: `${year}-12-31`, fullYear: true }];

    for (const period of periods) {
      const inter = intersectIsoRanges(s, e, period.start, period.end);
      if (!inter) continue;
      const brut = getAsgariUcretByDate(inter.start) ?? 0;
      segments.push({ start: inter.start, end: inter.end, brut, fullYear: period.fullYear });
    }
  }

  segments.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return segments;
}

function isoToUtcDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function daysBetweenIsoInclusive(startISO: string, endISO: string): number {
  return isoToUtcDays(endISO) - isoToUtcDays(startISO) + 1;
}

function addIsoDays(iso: string, amount: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + amount);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
