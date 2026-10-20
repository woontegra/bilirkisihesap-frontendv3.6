/**
 * Basın — günlük olmayan gazete. `yillikIzinBasinGunlukOlmayan.service.js` ile birebir.
 */

import { calculateBrutIzin, calculateNetIzin, calculateUsedTotal, resolveExitYear } from "../../lib/core";
import { calcWorkPeriodBilirKisi } from "../../lib/dates";
import { getAsgariUcretByDate } from "../../lib/asgariUcret";
import { formatMoney, parseNum, round2 } from "../../lib/money";
import type { YillikBasinGunlukOlmayanForm } from "./model";

export function calculateGunlukOlmayanIzin(meslegeBaslangic: string, istenCikis: string) {
  if (!meslegeBaslangic || !istenCikis) return { izinGun: 0, devre: 0, toplamAy: 0, hafta: 0 };
  const giris = new Date(meslegeBaslangic);
  const cikis = new Date(istenCikis);
  if (Number.isNaN(giris.getTime()) || Number.isNaN(cikis.getTime())) {
    return { izinGun: 0, devre: 0, toplamAy: 0, hafta: 0 };
  }
  const toplamAy = (cikis.getFullYear() - giris.getFullYear()) * 12 + (cikis.getMonth() - giris.getMonth());
  const devre = Math.floor(toplamAy / 6);
  const hafta = devre * 2;
  const izinGun = devre * 14;
  return { izinGun, devre, toplamAy, hafta };
}

export function computeYillikBasinGunlukOlmayanResult(form: YillikBasinGunlukOlmayanForm) {
  const effectiveBaslangic = form.meslegeBaslangic || form.startDate;
  const izinResult = calculateGunlukOlmayanIzin(effectiveBaslangic, form.endDate);
  const usedTotal = calculateUsedTotal(form.usedRows);
  const remainingDays = Math.max(0, izinResult.izinGun - usedTotal);
  const brutVal = parseNum(form.brut);
  const exitYear = resolveExitYear(form.endDate);
  const calismaSuresiLabel =
    calcWorkPeriodBilirKisi(effectiveBaslangic, form.endDate).label || "—";

  let brutIzin = 0;
  let net = {
    sgk: 0,
    issizlik: 0,
    gelirVergisi: 0,
    gelirVergisiDilimleri: "",
    damgaVergisi: 0,
    netIzin: 0,
  };

  if (brutVal > 0 && remainingDays >= 0) {
    brutIzin = round2(calculateBrutIzin(brutVal, remainingDays));
    net = calculateNetIzin(brutIzin, exitYear, "forYear");
  }

  let asgariUcretHatasi: string | null = null;
  if (brutVal > 0 && form.endDate) {
    const min = getAsgariUcretByDate(form.endDate);
    if (min && brutVal < min) {
      asgariUcretHatasi = `Girilen ücret, ${new Date(form.endDate).getFullYear()} yılı asgari brüt ücretinden düşük olamaz (${formatMoney(min)} ₺).`;
    }
  }

  const entitlementLines =
    izinResult.devre > 0
      ? [
          { label: "Toplam ay", value: `${izinResult.toplamAy} ay` },
          { label: "6 aylık devre", value: `${izinResult.devre} devre` },
          {
            label: "İzin hakkı",
            value: `${izinResult.hafta} hafta (${izinResult.izinGun} gün)`,
          },
        ]
      : [{ label: "İzin hakkı", value: "0 gün" }];

  return {
    izinResult,
    usedTotal,
    remainingDays,
    totalEntitlement: izinResult.izinGun,
    entitlementLines,
    formulaText:
      remainingDays > 0 && brutVal > 0
        ? `(${formatMoney(brutVal)} / 30 × ${remainingDays} gün)`
        : "—",
    brutIzin,
    ...net,
    asgariUcretHatasi,
    workPeriodLabel: calismaSuresiLabel,
    calismaSuresiLabel,
  };
}

export { clampYear, formatDateTR, isDateOrderInvalid } from "../../lib/dates";
