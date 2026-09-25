/**
 * Dönemsel Haftalık — UBGT / yıllık izin düşümünde gün başına düşülecek net saat stratejisi.
 * Sadece bu sayfa kullanır; değiştirmek için yalnızca `deductionDailyHourStrategy` sabitini güncelleyin.
 */

export type DeductionDailyHourStrategy = "MIN" | "MAX" | "GROUP_1" | "GROUP_2";

/** Aktif strateji (şimdilik MIN). */
export const deductionDailyHourStrategy: DeductionDailyHourStrategy = "MIN";

/**
 * @param groupNetDailiesInOrder Grup sırasıyla net günlük süreler (geçersiz grup → 0).
 */
export function resolveDeductionMarginalNetHours(
  groupNetDailiesInOrder: number[],
  strategy: DeductionDailyHourStrategy = deductionDailyHourStrategy,
): number {
  const positive = groupNetDailiesInOrder.filter((n) => Number.isFinite(n) && n > 0);

  switch (strategy) {
    case "MIN":
      return positive.length ? Math.min(...positive) : 0;
    case "MAX":
      return positive.length ? Math.max(...positive) : 0;
    case "GROUP_1":
      return groupNetDailiesInOrder[0] ?? 0;
    case "GROUP_2":
      return groupNetDailiesInOrder[1] ?? 0;
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}
