/**
 * İhbar Tazminatı — Mevsimlik İşçi. Lokal hesap motoru.
 * `lib/core` formüllerini çağırır; ağ isteği YOKTUR. Diğer varyantların engine'ini import etmez.
 */

import { getAsgariUcretByDate } from "../lib/asgariUcret";
import {
  calcWorkPeriodBilirKisi,
  clampYear,
  formatDateTR,
  isDateOrderInvalid,
  type WorkPeriod,
} from "../lib/dates";
import { formatMoney, parseNum } from "../lib/money";
import { calculateIhbar, formulaTextStandard, resolveExitYear, weeksLabel } from "../lib/core";
import type { IhbarMevsimForm } from "./model";

export { formatMoney, parseNum, clampYear, formatDateTR, isDateOrderInvalid };

export type IhbarMevsimResult = {
  workPeriod: WorkPeriod;
  toplamBrut: number;
  weeks: number;
  brut: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  net: number;
  ihbarSuresiLabel: string;
  formulaText: string;
  asgariUcretHatasi: string | null;
};

export function computeIhbarMevsimResult(form: IhbarMevsimForm): IhbarMevsimResult {
  const workPeriod = calcWorkPeriodBilirKisi(form.startDate, form.endDate);
  const exitYear = resolveExitYear(form.endDate);

  const core = calculateIhbar({
    brut: form.brut,
    prim: form.prim,
    ikramiye: form.ikramiye,
    yol: form.yol,
    yemek: form.yemek,
    extras: form.extras,
    totals: { yil: workPeriod.years, ay: workPeriod.months, gun: workPeriod.days },
    exitYear,
  });

  const brutValue = parseNum(form.brut);
  let asgariUcretHatasi: string | null = null;
  if (brutValue > 0 && form.endDate) {
    const minUcret = getAsgariUcretByDate(form.endDate);
    if (minUcret && brutValue < minUcret) {
      const year = new Date(form.endDate).getFullYear();
      asgariUcretHatasi = `Girilen ücret, ${year} yılı asgari brüt ücretinden düşük olamaz (${formatMoney(minUcret)} ₺).`;
    }
  }

  return {
    workPeriod,
    toplamBrut: core.toplamBrut,
    weeks: core.weeks,
    brut: core.brut,
    gelirVergisi: core.gelirVergisi,
    gelirVergisiDilimleri: core.gelirVergisiDilimleri,
    damgaVergisi: core.damgaVergisi,
    net: core.net,
    ihbarSuresiLabel: weeksLabel(core.weeks),
    formulaText: formulaTextStandard(core.toplamBrut, core.weeks),
    asgariUcretHatasi,
  };
}
