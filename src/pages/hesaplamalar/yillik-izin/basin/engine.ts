import { calculateGunlukGazeteIzin } from "../lib/basinGunlukGazete";
import { calculateYillikIzin, resolveExitYear } from "../lib/core";
import { calcWorkPeriodBilirKisi } from "../lib/dates";
import { getAsgariUcretByDate } from "../lib/asgariUcret";
import { formatMoney, parseNum } from "../lib/money";
import type { StandardComputeResult } from "../lib/types";
import type { YillikBasinForm } from "./model";

export function computeYillikBasinResult(form: YillikBasinForm): StandardComputeResult & {
  basinDetail: ReturnType<typeof calculateGunlukGazeteIzin>;
  meslekKidemiLabel: string;
  isyeriCalismaLabel: string;
} {
  const izin = calculateGunlukGazeteIzin(form.meslegeBaslangic, form.startDate, form.endDate);
  const core = calculateYillikIzin({
    years: 0,
    totalEntitlement: izin.izinGun,
    brutUcret: form.brut,
    usedRows: form.usedRows,
    exitYear: resolveExitYear(form.endDate),
  });

  const brutVal = parseNum(form.brut);
  let asgariUcretHatasi: string | null = null;
  if (brutVal > 0 && form.endDate) {
    const min = getAsgariUcretByDate(form.endDate);
    if (min && brutVal < min) {
      asgariUcretHatasi = `Girilen ücret, ${new Date(form.endDate).getFullYear()} yılı asgari brüt ücretinden düşük olamaz (${formatMoney(min)} ₺).`;
    }
  }

  const meslekKidemiLabel = calcWorkPeriodBilirKisi(form.meslegeBaslangic, form.endDate).label || "—";
  const isyeriCalismaLabel = calcWorkPeriodBilirKisi(form.startDate, form.endDate).label || "—";

  const entitlementLines: { label: string; value: string }[] = [];
  if (izin.y1 > 0 && izin.h1 > 0) {
    entitlementLines.push({
      label: `${izin.y1} yıl (İlk 5 yıl)`,
      value: `${izin.h1} hafta`,
    });
  }
  if (izin.y2 > 0 && izin.h2 > 0) {
    entitlementLines.push({
      label: `${izin.y2} yıl (5 yıl sonrası)`,
      value: `${izin.h2} hafta`,
    });
  }
  if (izin.toplamHafta > 0) {
    entitlementLines.push({
      label: "Toplam hafta",
      value: `${izin.toplamHafta} hafta (${izin.izinGun} gün)`,
    });
  }
  if (!entitlementLines.length) {
    entitlementLines.push({ label: "İzin hakkı", value: izin.aciklama || "0 gün" });
  }

  return {
    workPeriodLabel: izin.aciklama || `${izin.izinGun} gün`,
    entitlementLines,
    totalEntitlement: core.totalEntitlement,
    usedTotal: core.usedTotal,
    remainingDays: core.remainingDays,
    formulaText:
      core.remainingDays > 0 && brutVal > 0
        ? `(${formatMoney(brutVal)} / 30 × ${core.remainingDays} gün)`
        : "—",
    brutIzin: core.brutIzin,
    sgk: core.sgk,
    issizlik: core.issizlik,
    gelirVergisi: core.gelirVergisi,
    gelirVergisiDilimleri: core.gelirVergisiDilimleri,
    damgaVergisi: core.damgaVergisi,
    netIzin: core.netIzin,
    asgariUcretHatasi,
    basinDetail: izin,
    meslekKidemiLabel,
    isyeriCalismaLabel,
  };
}

export { clampYear, formatDateTR, isDateOrderInvalid } from "../lib/dates";
