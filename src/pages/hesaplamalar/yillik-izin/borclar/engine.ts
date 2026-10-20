import { calculateYillikIzin, resolveExitYear } from "../lib/core";
import { calcWorkPeriodBilirKisi } from "../lib/dates";
import { formatMoney, parseNum } from "../lib/money";
import type { StandardComputeResult } from "../lib/types";
import type { YillikBorclarForm } from "./model";
import { getAsgariUcretByDate } from "../lib/asgariUcret";

export function computeYillikBorclarResult(form: YillikBorclarForm): StandardComputeResult {
  const wp = calcWorkPeriodBilirKisi(form.startDate, form.endDate);
  const core = calculateYillikIzin({
    years: wp.years,
    brutUcret: form.brut,
    usedRows: form.usedRows,
    exitYear: resolveExitYear(form.endDate),
    is18Or50: form.is18Or50,
    isUnderground: false,
    isBorclarKanunu: true,
  });

  const brutVal = parseNum(form.brut);
  let asgariUcretHatasi: string | null = null;
  if (brutVal > 0 && form.endDate) {
    const min = getAsgariUcretByDate(form.endDate);
    if (min && brutVal < min) {
      asgariUcretHatasi = `Girilen ücret, ${new Date(form.endDate).getFullYear()} yılı asgari brüt ücretinden düşük olamaz (${formatMoney(min)} ₺).`;
    }
  }

  const weeklyDays = form.is18Or50 ? 21 : 14;
  const entitlementLines = wp.years > 0
    ? [{ label: form.is18Or50 ? "3 hafta × yıl" : "2 hafta × yıl", value: `${weeklyDays} × ${wp.years} = ${core.totalEntitlement} gün` }]
    : [];

  return {
    workPeriodLabel: wp.label,
    entitlementLines,
    breakdown: core.breakdown,
    totalEntitlement: core.totalEntitlement,
    usedTotal: core.usedTotal,
    remainingDays: core.remainingDays,
    formulaText: core.remainingDays > 0 && brutVal > 0 ? `(${formatMoney(brutVal)} / 30 × ${core.remainingDays} gün)` : "—",
    brutIzin: core.brutIzin,
    sgk: core.sgk,
    issizlik: core.issizlik,
    gelirVergisi: core.gelirVergisi,
    gelirVergisiDilimleri: core.gelirVergisiDilimleri,
    damgaVergisi: core.damgaVergisi,
    netIzin: core.netIzin,
    asgariUcretHatasi,
  };
}
