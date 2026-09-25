/**
 * Bilirkişi UBGT segmentasyonu — backend `dateSegmentationCore.calculateUbgtSegments`.
 */
export type UbgtDateRangeInput = {
  start: string;
  end: string;
  id?: string;
  person?: string;
  selectedHolidayIds?: string[];
};

export type UbgtSegment = { start: string; end: string; persons: string[] };

const ASGARI_UCRET_DONEMLERI: Record<number, Array<{ start: string; end: string }>> = {
  2005: [{ start: "01.01.2005", end: "31.12.2005" }],
  2006: [{ start: "01.01.2006", end: "31.12.2006" }],
  2007: [
    { start: "01.01.2007", end: "30.06.2007" },
    { start: "01.07.2007", end: "31.12.2007" },
  ],
  2008: [
    { start: "01.01.2008", end: "30.06.2008" },
    { start: "01.07.2008", end: "31.12.2008" },
  ],
  2009: [
    { start: "01.01.2009", end: "30.06.2009" },
    { start: "01.07.2009", end: "31.12.2009" },
  ],
  2010: [
    { start: "01.01.2010", end: "30.06.2010" },
    { start: "01.07.2010", end: "31.12.2010" },
  ],
  2011: [
    { start: "01.01.2011", end: "30.06.2011" },
    { start: "01.07.2011", end: "31.12.2011" },
  ],
  2012: [
    { start: "01.01.2012", end: "30.06.2012" },
    { start: "01.07.2012", end: "31.12.2012" },
  ],
  2013: [
    { start: "01.01.2013", end: "30.06.2013" },
    { start: "01.07.2013", end: "31.12.2013" },
  ],
  2014: [
    { start: "01.01.2014", end: "30.06.2014" },
    { start: "01.07.2014", end: "31.12.2014" },
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
    { start: "01.07.2022", end: "31.12.2022" },
  ],
  2023: [
    { start: "01.01.2023", end: "30.06.2023" },
    { start: "01.07.2023", end: "31.12.2023" },
  ],
  2024: [{ start: "01.01.2024", end: "31.12.2024" }],
  2025: [{ start: "01.01.2025", end: "31.12.2025" }],
  2026: [{ start: "01.01.2026", end: "31.12.2026" }],
};

export function normalizeLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  try {
    const trimmed = dateStr.trim();
    if (!trimmed || trimmed.length < 10) return null;
    if (trimmed.includes(".")) {
      const parts = trimmed.split(".");
      if (parts.length !== 3) return null;
      const [d, m, y] = parts;
      if (!d || !m || !y) return null;
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dt = new Date(iso);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(trimmed);
    return Number.isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function calculateUbgtSegments(allDateRanges: UbgtDateRangeInput[]): UbgtSegment[] {
  if (!allDateRanges || allDateRanges.length === 0) return [];

  const ranges: Array<{ start: Date; end: Date; id?: string; person?: string }> = [];
  for (const r of allDateRanges) {
    const start = normalizeLocalDate(r.start);
    const end = normalizeLocalDate(r.end);
    if (start && end && start <= end) {
      ranges.push({ start, end, id: r.id, person: r.person });
    }
  }

  if (ranges.length === 0) return [];

  const minDate = ranges.reduce((min, r) => (r.start < min ? r.start : min), ranges[0].start);
  const maxDate = ranges.reduce((max, r) => (r.end > max ? r.end : max), ranges[0].end);

  const pivots = new Set<number>();
  pivots.add(minDate.getTime());

  const maxDatePlus = new Date(maxDate);
  maxDatePlus.setDate(maxDatePlus.getDate() + 1);
  pivots.add(maxDatePlus.getTime());

  for (const r of ranges) {
    pivots.add(r.start.getTime());
    const endPlus = new Date(r.end);
    endPlus.setDate(endPlus.getDate() + 1);
    pivots.add(endPlus.getTime());
  }

  const minYear = minDate.getFullYear();
  const maxYear = maxDate.getFullYear();

  for (let y = minYear; y <= maxYear; y++) {
    const yearPeriods = ASGARI_UCRET_DONEMLERI[y];
    if (yearPeriods && yearPeriods.length > 0) {
      const yearStart = new Date(y, 0, 1);
      if (yearStart >= minDate && yearStart <= maxDate) pivots.add(yearStart.getTime());
      if (yearPeriods.length > 1) {
        const midYear = new Date(y, 6, 1);
        if (midYear >= minDate && midYear <= maxDate) pivots.add(midYear.getTime());
      }
    }
  }

  const sorted = [...pivots].map((t) => new Date(t)).sort((a, b) => a.getTime() - b.getTime());
  const segments: UbgtSegment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const next = sorted[i + 1];
    const segEnd = new Date(next);
    segEnd.setDate(segEnd.getDate() - 1);
    if (segStart > segEnd) continue;

    const activePersons: string[] = [];
    for (const r of ranges) {
      if (!(segEnd < r.start || segStart > r.end)) {
        if (r.person) activePersons.push(r.person);
      }
    }
    if (activePersons.length === 0) continue;

    segments.push({
      start: toISODateLocal(segStart),
      end: toISODateLocal(segEnd),
      persons: [...new Set(activePersons)],
    });
  }

  return segments;
}
