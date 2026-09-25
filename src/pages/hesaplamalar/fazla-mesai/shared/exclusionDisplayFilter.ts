/** UI-only visibility helpers. Do not feed these results into calculation engines. */

export function filterUbgtGroupsByCutoff<T extends { date: string }>(
  groups: { year: number; entries: T[] }[],
  cutoffIso: string | null | undefined,
): { year: number; entries: T[] }[] {
  if (!cutoffIso) return groups;
  return groups
    .map((group) => ({
      year: group.year,
      entries: group.entries.filter((entry) => entry.date >= cutoffIso),
    }))
    .filter((group) => group.entries.length > 0);
}

export function countSelectedInYear(selected: Iterable<string>, year: number): number {
  const prefix = `${year}-`;
  let count = 0;
  for (const iso of selected) {
    if (iso.startsWith(prefix)) count += 1;
  }
  return count;
}

/** Hide only ranges that end entirely before the effective cutoff. Overlapping ranges stay visible. */
export function exclusionRangeVisible(
  start: string,
  end: string,
  cutoffIso: string | null | undefined,
): boolean {
  if (!cutoffIso) return true;
  if (!start && !end) return true;
  const last = end && end >= start ? end : start;
  if (!last) return true;
  return last >= cutoffIso;
}
