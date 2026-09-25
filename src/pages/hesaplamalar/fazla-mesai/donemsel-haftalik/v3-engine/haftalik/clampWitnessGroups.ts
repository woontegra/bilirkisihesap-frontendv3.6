import type { PatternDay } from "./types";

/**
 * Tanık gün gruplarını davacı gruplarıyla grup indeksine göre saati kısıtlar.
 * V3 HaftalikKarmaPage clampWitnessGroupsByIndex ile birebir.
 */
export function clampWitnessGroupsByIndex(
  witnessGroups: Array<{ days?: number; dayCount?: number; startTime: string; endTime: string }>,
  davaciGroups: PatternDay[],
): PatternDay[] {
  const toMins = (t: string) => {
    const [h, m] = (t || "0:0").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const toTime = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

  return witnessGroups.map((group, groupIdx) => {
    const dayCount = (group as { days?: number; dayCount?: number }).days ?? group.dayCount ?? 0;
    const davaciGroup = davaciGroups[groupIdx];
    if (!davaciGroup?.startTime || !davaciGroup?.endTime) {
      return { dayCount, startTime: group.startTime, endTime: group.endTime };
    }
    const kesikGir = Math.max(toMins(group.startTime), toMins(davaciGroup.startTime));
    const kesikCik = Math.min(toMins(group.endTime), toMins(davaciGroup.endTime));
    return { dayCount, startTime: toTime(kesikGir), endTime: toTime(kesikCik) };
  });
}
