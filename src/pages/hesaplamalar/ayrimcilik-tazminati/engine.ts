/**
 * Ayrımcılık Tazminatı — lokal hesaplama motoru.
 * Başka sayfadan hesap motoru import edilmez. Ağ yok.
 * V3 ile kuruşu kuruşuna eşleşecek şekilde:
 *   katsayı 1–4 × çıplak brüt; katsayı satırlarında 2 ondalık yuvarlama.
 *   opsiyonel brüt girilirse brutForNetConversion = opsiyonel; değilse 4 aylık tutar.
 *   DAMGA_ORAN = 0.00759
 *   Gelir+damga: İhbar Tazminatı ile aynı pipeline
 *     gelirVergisi = calculateIncomeTaxWithBrackets(exitYear, amount).tax
 *     damgaVergisi = round2(amount * DAMGA_ORAN)
 *     net = round2(amount - gelirVergisi - damgaVergisi)
 */

import { getAsgariUcretByDate } from "./asgariUcret";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import type { AyrimcilikForm, AyrimcilikResult, CoefRow, WorkPeriod } from "./model";
import { normalizeNetAyKatsayi } from "./model";

export const DAMGA_ORAN = 0.00759; // V3 / İhbar sabiti

export const KATSAYILAR = [1, 2, 3, 4] as const;

/** İhbar `round2` ile aynı. */
export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

/** İhbar `resolveExitYear` ile aynı. */
export function resolveExitYear(exitDateISO: string): number {
  if (exitDateISO) {
    const y = new Date(exitDateISO).getFullYear();
    if (Number.isFinite(y) && y >= 2010 && y <= 2030) return y;
  }
  return new Date().getFullYear();
}

/** Türkçe para: binlik noktaları sil, virgülü ondalığa çevir. Geçersiz → 0 */
export function parseNum(v: string): number {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function formatMoney(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
}

export function formatDateTR(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Yıl alanını en fazla 4 haneye kısıtla (V3 clampYearInDateInput). */
export function clampYearInDateInput(value: string): string {
  if (!value || !value.includes("-")) return value;
  const parts = value.split("-");
  if (parts[0] && parts[0].length > 4) parts[0] = parts[0].substring(0, 4);
  return parts.join("-");
}

export function calcWorkPeriodDisplay(startISO: string, endISO: string): WorkPeriod {
  const empty: WorkPeriod = { years: 0, months: 0, days: 0, label: "0 Yıl 0 Ay 0 Gün" };
  if (!startISO || !endISO) return empty;
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(+start) || Number.isNaN(+end) || end < start) return empty;

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months--;
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days, label: `${years} Yıl ${months} Ay ${days} Gün` };
}

/**
 * V3 calcWorkPeriodBilirKisi: kapsayıcı Y/M/D (endDate dahil) + display etiketi.
 */
export function calcWorkPeriodBilirKisi(startISO: string, endISO: string): WorkPeriod {
  const empty: WorkPeriod = { years: 0, months: 0, days: 0, label: "0 Yıl 0 Ay 0 Gün" };
  if (!startISO || !endISO) return empty;
  try {
    const start = new Date(startISO);
    const end = new Date(endISO);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return empty;
    if (end < start) return empty;

    // V3'in "kapsayıcı" yaklaşımı: bitiş tarihini +1 gün yap
    end.setDate(end.getDate() + 1);

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months--;
      const lastDayOfPrevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
      days += lastDayOfPrevMonth.getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    const label = calcWorkPeriodDisplay(startISO, endISO).label;
    return { years, months, days, label };
  } catch {
    return empty;
  }
}

function buildCoefRows(brutVal: number, brutRaw: string): CoefRow[] {
  if (!(brutVal > 0) || !Number.isFinite(brutVal)) return [];
  return KATSAYILAR.map((k) => ({
    k,
    label: `${k} aylık${brutRaw ? ` × ${brutRaw}` : ""}`,
    // V3: Math.round(brutVal * k * 100) / 100
    value: Math.round(brutVal * k * 100) / 100,
  }));
}

export function computeAyrimcilik(form: AyrimcilikForm): AyrimcilikResult {
  const brutVal = parseNum(form.brut);
  const coefRows = buildCoefRows(brutVal, form.brut.trim());

  const inputVal = parseNum(form.brutInputForNet);
  const netAy = normalizeNetAyKatsayi(form.netAyKatsayi);
  const selectedCoef = coefRows.find((row) => row.k === netAy)?.value || 0;
  // Opsiyonel brüt girilirse onu; değilse seçilen ay katsayısı satırı; tablo yoksa çıplak × ay.
  const fromSelection =
    selectedCoef > 0 ? selectedCoef : brutVal > 0 ? Math.round(brutVal * netAy * 100) / 100 : 0;
  const brutForNetConversion = inputVal > 0 ? inputVal : fromSelection;
  const amount = Number.isFinite(brutForNetConversion) ? brutForNetConversion : 0;

  const selectedYear = resolveExitYear(form.endDate);
  const gv = calculateIncomeTaxWithBrackets(selectedYear, amount);
  const gelirVergisi = amount > 0 ? gv.tax : 0;
  const damgaVergisi = amount > 0 ? round2(amount * DAMGA_ORAN) : 0;
  const netTazminat = amount > 0 ? round2(amount - gelirVergisi - damgaVergisi) : 0;

  let workPeriod: WorkPeriod | null = null;
  if (form.startDate && form.endDate) {
    const r = calcWorkPeriodBilirKisi(form.startDate, form.endDate);
    if (r.label && r.label !== "0 Yıl 0 Ay 0 Gün") workPeriod = r;
  }

  let asgariUcretHatasi: string | null = null;
  if (form.endDate && form.brut) {
    const minUcret = getAsgariUcretByDate(form.endDate);
    if (minUcret != null && brutVal > 0 && brutVal < minUcret) {
      const year = new Date(form.endDate).getFullYear();
      asgariUcretHatasi = `Girilen ücret, ${year} yılı asgari brüt ücretinden düşük olamaz (${formatMoney(minUcret)} ₺).`;
    }
  }

  return {
    coefRows,
    brutVal,
    brutForNetConversion: amount,
    gelirVergisi: Number.isFinite(gelirVergisi) ? gelirVergisi : 0,
    gelirVergisiDilimleri: gv.summary || "",
    damgaVergisi: Number.isFinite(damgaVergisi) ? damgaVergisi : 0,
    netTazminat: Number.isFinite(netTazminat) ? netTazminat : 0,
    workPeriod,
    asgariUcretHatasi,
  };
}

export function isDateOrderInvalid(startDate: string, endDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false;
  return new Date(endDate) < new Date(startDate);
}
