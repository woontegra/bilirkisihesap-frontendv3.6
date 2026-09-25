import type { ColumnClassification, ConfidenceTier, SmartFieldRole } from "./types";

export type ConfidenceInput = {
  headerScore: number;
  contentScore: number;
  neighborScore: number;
  continuityScore: number;
};

/**
 * 0–100 güven puanı: %35 başlık, %40 içerik, %15 komşu, %10 süreklilik.
 */
export function computeConfidenceScore(input: ConfidenceInput): number {
  const raw =
    input.headerScore * 35 +
    input.contentScore * 40 +
    input.neighborScore * 15 +
    input.continuityScore * 10;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function tierFromConfidence(confidence: number, forceManual = false): ConfidenceTier {
  if (forceManual) return "manual";
  if (confidence >= 85) return "auto";
  if (confidence >= 60) return "review";
  return "manual";
}

export function applyContinuityBonus(
  classifications: ColumnClassification[],
  priorRoles: Set<SmartFieldRole>,
): ColumnClassification[] {
  return classifications.map((c) => {
    let continuity = c.continuityScore;
    if (c.role !== "unknown" && priorRoles.has(c.role)) continuity = 1;
    const confidence = computeConfidenceScore({
      headerScore: c.headerScore,
      contentScore: c.contentScore,
      neighborScore: c.neighborScore,
      continuityScore: continuity,
    });
    return {
      ...c,
      continuityScore: continuity,
      confidence,
      tier: tierFromConfidence(confidence),
    };
  });
}

export function areCandidatesTooClose(a: number, b: number, threshold = 8): boolean {
  return Math.abs(a - b) < threshold;
}
