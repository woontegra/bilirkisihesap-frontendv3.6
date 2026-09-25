import {
  calculateYillikIzinGemi,
  formatTotalWorkDays,
  type GemiCoreResult,
} from "../lib/gemiCore";
import { calculateUsedTotal, resolveExitYear } from "../lib/core";
import { getAsgariUcretByDate } from "../lib/asgariUcret";
import { formatMoney, parseNum } from "../lib/money";
import type { YillikGemiForm } from "./model";

export type GemiComputeResult = GemiCoreResult & {
  usedTotal: number;
  workDaysLabel: string;
  entitlementLines: { label: string; value: string }[];
  formulaText: string;
  asgariUcretHatasi: string | null;
  totalEntitlement: number;
};

export function computeYillikGemiResult(form: YillikGemiForm): GemiComputeResult {
  const usedTotal = calculateUsedTotal(form.usedRows);
  const exitDate =
    form.endDate ||
    [...form.workPeriods].reverse().find((p) => p.istenCikis)?.istenCikis ||
    "";
  const core = calculateYillikIzinGemi({
    workPeriods: form.workPeriods,
    brutUcret: form.brut,
    usedDays: usedTotal,
    year: resolveExitYear(exitDate),
  });

  const brutVal = parseNum(form.brut);
  let asgariUcretHatasi: string | null = null;
  const refDate = exitDate;
  if (brutVal > 0 && refDate) {
    const min = getAsgariUcretByDate(refDate);
    if (min && brutVal < min) {
      asgariUcretHatasi = `Girilen ücret, ${new Date(refDate).getFullYear()} yılı asgari brüt ücretinden düşük olamaz (${formatMoney(min)} ₺).`;
    }
  }

  const bd = core.breakdown;
  const entitlementLines: { label: string; value: string }[] = [];
  if (bd.y1 > 0 && bd.d1 > 0) {
    entitlementLines.push({
      label: `${bd.y1} yıl (İlk dönem - 15 gün/yıl)`,
      value: `${bd.y1} × 15 = ${bd.d1} gün`,
    });
  }
  if (bd.y2 > 0 && bd.d2 > 0) {
    entitlementLines.push({
      label: `${bd.y2} yıl (Sonraki dönem - 30 gün/yıl)`,
      value: `${bd.y2} × 30 = ${bd.d2} gün`,
    });
  }

  return {
    ...core,
    usedTotal,
    workDaysLabel: formatTotalWorkDays(core.totalWorkDays),
    entitlementLines,
    formulaText:
      core.remainingDays > 0 && brutVal > 0
        ? `(${formatMoney(brutVal)} / 30 × ${core.remainingDays} gün)`
        : "—",
    asgariUcretHatasi,
    totalEntitlement: core.totalVacationDays,
  };
}

export { clampYear, formatDateTR, isDateOrderInvalid } from "../lib/dates";
