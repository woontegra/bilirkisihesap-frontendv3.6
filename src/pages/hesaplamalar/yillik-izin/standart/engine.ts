/**
 * Yıllık Ücretli İzin — Standart (İş Kanunu). Lokal motor.
 * `lib/core` + `yillikIzin.service.js` formülleri. Ağ yok.
 */

import { getAsgariUcretByDate } from "../lib/asgariUcret";
import {
  calculateYillikIzin,
  resolveExitYear,
  type Breakdown,
} from "../lib/core";
import { calcWorkPeriodBilirKisi, clampYear, formatDateTR, isDateOrderInvalid } from "../lib/dates";
import { formatMoney, parseNum } from "../lib/money";
import type { EntitlementLine, StandardComputeResult } from "../lib/types";
import type { YillikStandartForm } from "./model";

export { formatMoney, parseNum, clampYear, formatDateTR, isDateOrderInvalid };

export function buildEntitlementLines(breakdown: Breakdown): EntitlementLine[] {
  const lines: EntitlementLine[] = [];
  if (breakdown.y1 > 0) {
    lines.push({
      label: `1–5 yıl (${breakdown.daysPerYear1} gün/yıl)`,
      value: `${breakdown.y1} × ${breakdown.daysPerYear1} = ${breakdown.d1} gün`,
    });
  }
  if (breakdown.y2 > 0) {
    lines.push({
      label: `5–15 yıl (${breakdown.daysPerYear2} gün/yıl)`,
      value: `${breakdown.y2} × ${breakdown.daysPerYear2} = ${breakdown.d2} gün`,
    });
  }
  if (breakdown.y3 > 0) {
    lines.push({
      label: `15+ yıl (${breakdown.daysPerYear3} gün/yıl)`,
      value: `${breakdown.y3} × ${breakdown.daysPerYear3} = ${breakdown.d3} gün`,
    });
  }
  return lines;
}

export function computeYillikStandartResult(form: YillikStandartForm): StandardComputeResult {
  const wp = calcWorkPeriodBilirKisi(form.startDate, form.endDate);
  const core = calculateYillikIzin({
    years: wp.years,
    brutUcret: form.brut,
    usedRows: form.usedRows,
    exitYear: resolveExitYear(form.endDate),
    is18Or50: form.is18Or50,
    isUnderground: form.isUnderground,
    isBorclarKanunu: false,
  });

  const brutVal = parseNum(form.brut);
  let asgariUcretHatasi: string | null = null;
  if (brutVal > 0 && form.endDate) {
    const min = getAsgariUcretByDate(form.endDate);
    if (min && brutVal < min) {
      asgariUcretHatasi = `Girilen ücret, ${new Date(form.endDate).getFullYear()} yılı asgari brüt ücretinden düşük olamaz (${formatMoney(min)} ₺).`;
    }
  }

  const formulaText =
    core.remainingDays > 0 && brutVal > 0
      ? `(${formatMoney(brutVal)} / 30 × ${core.remainingDays} gün)`
      : "—";

  return {
    workPeriodLabel: wp.label,
    entitlementLines: buildEntitlementLines(core.breakdown),
    breakdown: core.breakdown,
    totalEntitlement: core.totalEntitlement,
    usedTotal: core.usedTotal,
    remainingDays: core.remainingDays,
    formulaText,
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
