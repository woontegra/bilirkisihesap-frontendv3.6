import type { ManuelBrutFloorViolation, ManuelBrutPeriodsMap, ManuelBrutYearCatalog } from "./model";
import { formatPeriodLabel, formatPeriodRangeLabel, getFloorByPeriodKey } from "./periodCatalog";
import { formatFloorDisplay, parseMoneyInput } from "./money";

export function findFloorViolations(periods: ManuelBrutPeriodsMap): ManuelBrutFloorViolation[] {
  const floors = getFloorByPeriodKey();
  const violations: ManuelBrutFloorViolation[] = [];
  for (const [key, amount] of Object.entries(periods)) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) continue;
    const floorBrut = floors[key];
    if (floorBrut == null || amount >= floorBrut) continue;
    violations.push({ key, amount, floorBrut });
  }
  return violations;
}

export function formatFloorViolationMessage(violation: ManuelBrutFloorViolation): string {
  const label = formatPeriodRangeLabel(violation.key);
  return `${label} için brüt ücret ${formatFloorDisplay(violation.floorBrut)} TL'den az olamaz.`;
}

export function formatPeriodFloorError(
  year: number,
  indexInYear: number,
  totalInYear: number,
  floorBrut: number,
): string {
  const label = formatPeriodLabel(year, indexInYear, totalInYear);
  return `${label} için brüt ücret ${formatFloorDisplay(floorBrut)} TL'den az olamaz.`;
}

export function collectPeriodFloorErrors(
  catalog: ManuelBrutYearCatalog[],
  periodInputs: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const { year, periods } of catalog) {
    for (const period of periods) {
      const raw = periodInputs[period.key];
      if (!raw?.trim()) continue;
      const amount = parseMoneyInput(raw);
      if (amount > 0 && amount < period.floorBrut) {
        next[period.key] = formatPeriodFloorError(
          year,
          period.indexInYear,
          periods.length,
          period.floorBrut,
        );
      }
    }
  }
  return next;
}

export function buildPeriodsMap(periodInputs: Record<string, string>): ManuelBrutPeriodsMap {
  const out: ManuelBrutPeriodsMap = {};
  for (const [key, raw] of Object.entries(periodInputs)) {
    const amount = parseMoneyInput(raw);
    if (amount > 0) out[key] = amount;
  }
  return out;
}

export function periodsEqual(a: ManuelBrutPeriodsMap, b: ManuelBrutPeriodsMap): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  }
  return true;
}
