/**
 * İhbar Tazminatı — Basın İş Kanunu (5953). Lokal hesap motoru.
 * `lib/core` formüllerini çağırır; ağ isteği YOKTUR. Diğer varyantların engine'ini import etmez.
 *
 * Basın İş Kanununda ihbar tazminatı düzenlemesi yoktur; mesleğe başlangıç tarihi girildiğinde
 * kıdem süresine göre (5+ yıl → 90 gün, aksi halde 30 gün) örnek hesap yapılır. Mesleğe başlangıç
 * boşsa İş Kanunu'ndaki standart haftalık ihbar süresi (2/4/6/8 hafta) örnek amaçlı kullanılır.
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
import { basinIhbarSuresiLabel, calculateIhbar, formulaTextBasin, formulaTextStandard, resolveExitYear, weeksLabel } from "../lib/core";
import type { IhbarBasinForm } from "./model";

export { formatMoney, parseNum, clampYear, formatDateTR, isDateOrderInvalid };

export type IhbarBasinResult = {
  workPeriod: WorkPeriod;
  kidemDiff: WorkPeriod;
  hasBasinKidem: boolean;
  toplamBrut: number;
  weeks: number;
  ihbarGun: number | null;
  brut: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  net: number;
  ihbarSuresiLabel: string;
  kidemSuresiLabel: string;
  formulaText: string;
  asgariUcretHatasi: string | null;
};

export function computeIhbarBasinResult(form: IhbarBasinForm): IhbarBasinResult {
  const workPeriod = calcWorkPeriodBilirKisi(form.startDate, form.endDate);
  const kidemDiff = calcWorkPeriodBilirKisi(form.meslegeBaslangic, form.endDate);
  const hasBasinKidem = kidemDiff.years > 0 || kidemDiff.months > 0 || kidemDiff.days > 0;
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
    kidemTotals: hasBasinKidem ? { yil: kidemDiff.years, ay: kidemDiff.months, gun: kidemDiff.days } : null,
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

  const isBasinPath = core.ihbarGun !== null;
  const ihbarSuresiLabel = isBasinPath ? basinIhbarSuresiLabel(kidemDiff.years) : weeksLabel(core.weeks);
  const formulaText = isBasinPath
    ? formulaTextBasin(core.toplamBrut, core.ihbarGun as number)
    : formulaTextStandard(core.toplamBrut, core.weeks);

  return {
    workPeriod,
    kidemDiff,
    hasBasinKidem,
    toplamBrut: core.toplamBrut,
    weeks: core.weeks,
    ihbarGun: core.ihbarGun,
    brut: core.brut,
    gelirVergisi: core.gelirVergisi,
    gelirVergisiDilimleri: core.gelirVergisiDilimleri,
    damgaVergisi: core.damgaVergisi,
    net: core.net,
    ihbarSuresiLabel,
    kidemSuresiLabel: hasBasinKidem ? kidemDiff.label : "—",
    formulaText,
    asgariUcretHatasi,
  };
}
