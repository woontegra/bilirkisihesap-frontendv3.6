const GRID_EPS = 1e-7;

/**
 * Haftalık fiili çalışma süresi (45 saat öncesi toplam) için FM yuvarlaması:
 * - Değer zaten tam saat veya buçuklu (…,0 / …,5) ise aynen kalır — `Math.round(76,5) === 77` hatası oluşmaz.
 * - Aksi halde bir üst buçuğa çıkarılır: 76,10 → 76,5; 76,60 → 77.
 *
 * Yeraltı işçileri fazla mesai sayfasında tamsayı `Math.round` kullanılmaya devam eder.
 */
export function ceilWeeklyWorkHoursToHalfHour(weeklyTotal: number): number {
  if (!Number.isFinite(weeklyTotal)) return 0;
  const doubled = weeklyTotal * 2;
  const nearestHalf = Math.round(doubled);
  if (Math.abs(doubled - nearestHalf) < GRID_EPS) {
    return nearestHalf / 2;
  }
  return Math.ceil(doubled - GRID_EPS) / 2;
}
