/**
 * Backend `dateSegmentationCore.js` — tanık + asgari ücret pivot segmentasyonu.
 */

import { normalizeDate, normalizeLocalDate, toISODateLocal } from "./dateHelpers";

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

type WitnessLike = { id: string; dateIn?: string; dateOut?: string };

export function normalizeWitnessDateRanges(
  witnesses: WitnessLike[],
  davaciStartDate: Date,
  davaciEndDate: Date,
): Array<{ startDate: string; endDate: string; witnessIds: string[] }> {
  const toDate = (s: string | undefined) => {
    if (!s) return null;
    const n = normalizeDate(s);
    return n ? normalizeLocalDate(n) : null;
  };

  const claimStart = davaciStartDate;
  const claimEnd = davaciEndDate;
  const witnessRanges: Array<{ start: Date; end: Date; id: string }> = [];
  for (const w of witnesses) {
    const s = toDate(w.dateIn);
    const e = toDate(w.dateOut);
    if (s && e) witnessRanges.push({ start: s, end: e, id: w.id });
  }
  if (witnessRanges.length === 0) return [];

  const effective: Array<{ start: Date; end: Date; id: string }> = [];
  for (const r of witnessRanges) {
    if (r.start <= claimEnd && r.end >= claimStart) {
      const st = r.start < claimStart ? claimStart : r.start;
      const en = r.end > claimEnd ? claimEnd : r.end;
      if (st <= en) effective.push({ start: st, end: en, id: r.id });
    }
  }
  if (effective.length === 0) return [];

  const pivots = new Set<number>();
  pivots.add(claimStart.getTime());
  const claimEndPlus = new Date(claimEnd);
  claimEndPlus.setDate(claimEndPlus.getDate() + 1);
  pivots.add(claimEndPlus.getTime());

  for (const r of effective) {
    pivots.add(r.start.getTime());
    const ep = new Date(r.end);
    ep.setDate(ep.getDate() + 1);
    pivots.add(ep.getTime());
  }

  const minYear = claimStart.getFullYear();
  const maxYear = claimEnd.getFullYear();
  for (let y = minYear; y <= maxYear; y++) {
    const p = ASGARI_UCRET_DONEMLERI[y];
    if (p && p.length > 0) {
      const p1 = new Date(y, 0, 1);
      if (p1 >= claimStart && p1 <= claimEnd) pivots.add(p1.getTime());
      if (p.length === 2 || y === 2015) {
        const p2 = new Date(y, 6, 1);
        if (p2 >= claimStart && p2 <= claimEnd) pivots.add(p2.getTime());
      }
    }
  }

  const sorted = [...pivots].map((t) => new Date(t)).sort((a, b) => a.getTime() - b.getTime());
  const segments: Array<{ startDate: string; endDate: string; witnessIds: string[] }> = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const next = sorted[i + 1];
    const segEnd = new Date(next);
    segEnd.setDate(segEnd.getDate() - 1);
    if (segStart > segEnd) continue;
    if (segStart < claimStart || segEnd > claimEnd) continue;
    const active: string[] = [];
    for (const r of effective) {
      if (!(segEnd < r.start || segStart > r.end)) active.push(r.id);
    }
    if (active.length === 0) continue;
    segments.push({
      startDate: toISODateLocal(segStart),
      endDate: toISODateLocal(segEnd),
      witnessIds: active,
    });
  }
  return segments;
}
