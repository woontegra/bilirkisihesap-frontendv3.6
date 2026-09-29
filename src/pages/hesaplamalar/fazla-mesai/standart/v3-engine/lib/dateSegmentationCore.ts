/**
 * Date segmentation core - Tarih aralıklarını asgari ücret dönemlerine göre böler
 * Tüm tarih işlemleri UTC ile yapılır (timezone kaynaklı 1 gün sapmasını önler)
 */

// Asgari ücret dönemleri
const ASGARI_UCRET_DONEMLERI: Record<number, Array<{ start: string; end: string }>> = {
  1996: [
    { start: "01.01.1996", end: "31.07.1996" },
    { start: "01.08.1996", end: "31.12.1996" }
  ],
  1997: [
    { start: "01.01.1997", end: "31.07.1997" },
    { start: "01.08.1997", end: "31.12.1997" }
  ],
  1998: [
    { start: "01.01.1998", end: "31.07.1998" },
    { start: "01.08.1998", end: "30.09.1998" },
    { start: "01.10.1998", end: "31.12.1998" }
  ],
  1999: [
    { start: "01.01.1999", end: "30.06.1999" },
    { start: "01.07.1999", end: "15.08.1999" },
    { start: "16.08.1999", end: "31.12.1999" }
  ],
  2000: [
    { start: "01.01.2000", end: "31.03.2000" },
    { start: "01.04.2000", end: "31.05.2000" },
    { start: "01.06.2000", end: "30.06.2000" },
    { start: "01.07.2000", end: "31.12.2000" }
  ],
  2001: [
    { start: "01.01.2001", end: "31.03.2001" },
    { start: "01.04.2001", end: "30.06.2001" },
    { start: "01.07.2001", end: "31.07.2001" },
    { start: "01.08.2001", end: "31.12.2001" }
  ],
  2002: [
    { start: "01.01.2002", end: "31.03.2002" },
    { start: "01.04.2002", end: "30.06.2002" },
    { start: "01.07.2002", end: "31.12.2002" }
  ],
  2003: [
    { start: "01.01.2003", end: "31.03.2003" },
    { start: "01.04.2003", end: "30.06.2003" },
    { start: "01.07.2003", end: "31.12.2003" }
  ],
  2004: [
    { start: "01.01.2004", end: "30.06.2004" },
    { start: "01.07.2004", end: "31.12.2004" }
  ],
  2005: [{ start: "01.01.2005", end: "31.12.2005" }],
  2006: [{ start: "01.01.2006", end: "31.12.2006" }],
  2007: [
    { start: "01.01.2007", end: "30.06.2007" },
    { start: "01.07.2007", end: "31.12.2007" }
  ],
  2008: [
    { start: "01.01.2008", end: "30.06.2008" },
    { start: "01.07.2008", end: "31.12.2008" }
  ],
  2009: [
    { start: "01.01.2009", end: "30.06.2009" },
    { start: "01.07.2009", end: "31.12.2009" }
  ],
  2010: [
    { start: "01.01.2010", end: "30.06.2010" },
    { start: "01.07.2010", end: "31.12.2010" }
  ],
  2011: [
    { start: "01.01.2011", end: "30.06.2011" },
    { start: "01.07.2011", end: "31.12.2011" }
  ],
  2012: [
    { start: "01.01.2012", end: "30.06.2012" },
    { start: "01.07.2012", end: "31.12.2012" }
  ],
  2013: [
    { start: "01.01.2013", end: "30.06.2013" },
    { start: "01.07.2013", end: "31.12.2013" }
  ],
  2014: [
    { start: "01.01.2014", end: "30.06.2014" },
    { start: "01.07.2014", end: "31.12.2014" }
  ],
  2015: [{ start: "01.01.2015", end: "31.12.2015" }],
  2016: [{ start: "01.01.2016", end: "31.12.2016" }],
  2017: [{ start: "01.01.2017", end: "31.12.2017" }],
  2018: [{ start: "01.01.2018", end: "31.12.2018" }],
  2019: [{ start: "01.01.2019", end: "31.12.2019" }],
  2020: [{ start: "01.01.2020", end: "31.12.2020" }],
  2021: [{ start: "01.01.2021", end: "31.12.2021" }],
  2022: [
    { start: "01.01.2022", end: "30.06.2022" },
    { start: "01.07.2022", end: "31.12.2022" }
  ],
  2023: [
    { start: "01.01.2023", end: "30.06.2023" },
    { start: "01.07.2023", end: "31.12.2023" }
  ],
  2024: [{ start: "01.01.2024", end: "31.12.2024" }],
  2025: [{ start: "01.01.2025", end: "31.12.2025" }],
  2026: [{ start: "01.01.2026", end: "31.12.2026" }]
};

/** DD.MM.YYYY veya YYYY-MM-DD stringini UTC gece yarısı olarak Date'e çevirir */
function parseDateAsUTC(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  const parts = dateStr.split(/[.\-\/]/).map(Number);
  let day: number, month: number, year: number;
  if (parts[0] > 1900) {
    [year, month, day] = parts as [number, number, number];
  } else {
    [day, month, year] = parts as [number, number, number];
  }
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

/** Tarihi YYYY-MM-DD olarak döndürür (UTC ile timezone kayması önlenir) */
const toISODateUTC = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

/**
 * Tarih aralığını asgari ücret dönemlerine göre böler
 */
export function splitByAsgariUcretPeriods(startDate: Date, endDate: Date): Array<{ start: Date; end: Date }> {
  const result: Array<{ start: Date; end: Date }> = [];
  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();

  for (let year = startYear; year <= endYear; year++) {
    const yearPeriods = ASGARI_UCRET_DONEMLERI[year];

    if (!yearPeriods || yearPeriods.length === 0) {
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year, 11, 31));
      const segStart = year === startYear ? startDate : yearStart;
      const segEnd = year === endYear ? endDate : yearEnd;
      if (segStart <= segEnd) {
        result.push({ start: new Date(segStart), end: new Date(segEnd) });
      }
      continue;
    }

    for (const period of yearPeriods) {
      const pStart = parseDateAsUTC(period.start);
      const pEnd = parseDateAsUTC(period.end);

      if (isNaN(pStart.getTime()) || isNaN(pEnd.getTime())) continue;

      const segStart = pStart > startDate ? pStart : startDate;
      const segEnd = pEnd < endDate ? pEnd : endDate;

      if (segStart <= segEnd) {
        result.push({ start: new Date(segStart), end: new Date(segEnd) });
      }
    }
  }

  result.sort((a, b) => a.start.getTime() - b.start.getTime());
  // Asgari ücret dönemlerine göre bölündüyse, her segment ayrı kalmalı
  return result;
}

/** Geçerli yyyy-mm-dd formatı ve mantıklı yıl aralığı kontrolü (donma/yanlış tarih önleme) */
const REASONABLE_YEAR_MIN = 1990;
const REASONABLE_YEAR_MAX = 2035;

function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

/** DD.MM.YYYY veya YYYY-MM-DD → YYYY-MM-DD */
function toYYYYMMDD(s: string): string | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  if (isValidISODate(trimmed)) return trimmed;
  const ddmmyy = trimmed.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
  if (ddmmyy) {
    const [, d, m, y] = ddmmyy;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return null;
}

/** YYYY-MM-DD stringini UTC gece yarısı olarak Date'e çevirir (timezone kaymasını önler) */
function parseISODateUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/**
 * overtimeResults'tan segmentleri oluşturur (yıl ve asgari ücret dönemlerine göre böler)
 */
export function segmentOvertimeResult(result: any): Array<{ start: string; end: string }> {
  const startRaw = result.start || result.startDate || '';
  const endRaw = result.end || result.endDate || '';
  const startISO = toYYYYMMDD(startRaw) || (isValidISODate(startRaw) ? startRaw : null);
  const endISO = toYYYYMMDD(endRaw) || (isValidISODate(endRaw) ? endRaw : null);

  if (!startISO || !endISO) {
    return [];
  }

  const startDate = parseISODateUTC(startISO);
  const endDate = parseISODateUTC(endISO);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return [];
  }
  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();
  if (startYear < REASONABLE_YEAR_MIN || endYear > REASONABLE_YEAR_MAX || startYear > endYear) {
    return [];
  }
  if (startDate > endDate) {
    return [];
  }
  
  const segments = splitByAsgariUcretPeriods(startDate, endDate);

  return segments.map(seg => ({
    start: toISODateUTC(seg.start),
    end: toISODateUTC(seg.end)
  }));
}
