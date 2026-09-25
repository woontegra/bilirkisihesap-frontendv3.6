import { useEffect, useMemo, useState } from "react";
import { countSelectedInYear, filterUbgtGroupsByCutoff } from "./exclusionDisplayFilter";

export function useUbgtYearView<T extends { date: string }>(
  groups: { year: number; entries: T[] }[],
  cutoffIso: string | null | undefined,
  open: boolean,
  selected: Iterable<string>,
) {
  const visibleGroups = useMemo(
    () => filterUbgtGroupsByCutoff(groups, cutoffIso),
    [groups, cutoffIso],
  );
  const years = useMemo(() => visibleGroups.map((group) => group.year), [visibleGroups]);
  const [activeYear, setActiveYear] = useState<number | null>(null);

  const yearsKey = years.join("|");

  useEffect(() => {
    if (!open) return;
    setActiveYear(years[0] ?? null);
  }, [open, yearsKey, years]);

  const selectedCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const year of years) {
      counts[year] = countSelectedInYear(selected, year);
    }
    return counts;
  }, [years, selected]);

  const activeGroup =
    visibleGroups.find((group) => group.year === activeYear) ?? visibleGroups[0] ?? null;

  return {
    visibleGroups,
    years,
    activeYear: activeGroup?.year ?? null,
    setActiveYear,
    activeGroup,
    selectedCounts,
    activeDates: activeGroup?.entries.map((entry) => entry.date) ?? [],
  };
}

export function addDatesToSet(current: Set<string>, dates: string[]): Set<string> {
  const next = new Set(current);
  for (const date of dates) next.add(date);
  return next;
}

export function removeDatesFromSet(current: Set<string>, dates: string[]): Set<string> {
  const next = new Set(current);
  for (const date of dates) next.delete(date);
  return next;
}
