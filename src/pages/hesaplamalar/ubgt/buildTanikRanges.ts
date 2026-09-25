/**
 * V3 `UbgtBilirkisiPage.buildTanikRanges` — tanık tarihlerini davacı penceresine kırp,
 * tatil id'lerini davacı seçiminin alt kümesine filtrele.
 */

export type DavaciRangeForClip = {
  start: string;
  end: string;
  selectedHolidayIds?: string[];
};

export type WitnessForClip = {
  id: string;
  name: string;
  start: string;
  end: string;
  selectedHolidayIds: string[];
};

export type TanikRangeClipped = {
  id: string;
  start: string;
  end: string;
  person: string;
  selectedHolidayIds: string[];
};

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function buildTanikRanges(
  davaciDateRanges: DavaciRangeForClip[],
  witnesses: WitnessForClip[],
  davaciSelectedHolidayIds: string[],
): TanikRangeClipped[] {
  const davaciRanges = davaciDateRanges.filter((r) => r.start && r.end);
  if (davaciRanges.length === 0) return [];
  const allDavaciDates = davaciRanges.flatMap((r) => [new Date(r.start), new Date(r.end)]);
  const davaciMinDate = new Date(Math.min(...allDavaciDates.map((d) => d.getTime())));
  const davaciMaxDate = new Date(Math.max(...allDavaciDates.map((d) => d.getTime())));

  return witnesses
    .filter((w) => w.start && w.end)
    .map((w) => {
      let start = w.start;
      let end = w.end;
      const tanikStart = new Date(w.start);
      const tanikEnd = new Date(w.end);
      if (tanikStart < davaciMinDate) start = toIsoDate(davaciMinDate);
      if (tanikEnd > davaciMaxDate) end = toIsoDate(davaciMaxDate);
      if (new Date(start) > new Date(end)) return null;
      const filteredHolidayIds = (w.selectedHolidayIds || []).filter((id) =>
        davaciSelectedHolidayIds.includes(id),
      );
      return {
        id: w.id,
        start,
        end,
        person: w.name,
        selectedHolidayIds: filteredHolidayIds,
      };
    })
    .filter((r): r is TanikRangeClipped => r !== null);
}

/** Davacı dönemlerindeki seçili tatil id birleşimi (V3 davaciSelectedHolidayIds). */
export function collectDavaciHolidayIds(davaciDateRanges: DavaciRangeForClip[]): string[] {
  const allIds = new Set<string>();
  davaciDateRanges.forEach((range) => {
    range.selectedHolidayIds?.forEach((hid) => allIds.add(hid));
  });
  return Array.from(allIds);
}
