/**
 * Kötü Niyet Tazminatı — lokal hesaplama motoru.
 * Başka hesaplama sayfasından import yok. Ağ yok.
 *
 * V3/backend (`kotuNiyetTazminati.service`) ile kuruşu kuruşuna:
 *   totalMonths = yil*12+ay+(gun>0?0.01:0)
 *   weeks: <6→2, <18→4, <36→6, else 8
 *   brutAmount = round2((base/30)*weeks*7*3)
 *   damga = round2(brutAmount*0.00759)
 *   net = round2(brutAmount-damga)
 *   base = brut+prim+ikramiye+yol+yemek+extras
 */

import type { ExtraItem, KotuNiyetForm, KotuNiyetResult, WorkPeriod } from "./model";

export const DAMGA_ORAN = 0.00759;
export const KOTU_NIYET_CARPAN = 3;

export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

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

export function clampYear(value: string): string {
  if (!value || !value.includes("-")) return value;
  const parts = value.split("-");
  if (parts[0] && parts[0].length > 4) parts[0] = parts[0].substring(0, 4);
  return parts.join("-");
}

export function isDateOrderInvalid(startDate: string, endDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false;
  return new Date(endDate) < new Date(startDate);
}

const EMPTY_PERIOD: WorkPeriod = { years: 0, months: 0, days: 0, label: "0 Yıl 0 Ay 0 Gün" };

function calcWorkPeriodExclusive(startISO: string, endISO: string): WorkPeriod {
  if (!startISO || !endISO) return EMPTY_PERIOD;
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return EMPTY_PERIOD;
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

/** V3 `calcWorkPeriodBilirKisi` — kapsayıcı (+1 gün) süre; hafta dilimi hesabında kullanılır. */
export function calcWorkPeriodBilirKisi(startISO: string, endISO: string): WorkPeriod {
  if (!startISO || !endISO) return EMPTY_PERIOD;
  try {
    const start = new Date(startISO);
    const end = new Date(endISO);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return EMPTY_PERIOD;
    end.setDate(end.getDate() + 1);
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
    return { years, months, days, label: calcWorkPeriodExclusive(startISO, endISO).label };
  } catch {
    return EMPTY_PERIOD;
  }
}

export function calculateTotalMonths(totals: { yil: number; ay: number; gun: number }): number {
  const { yil = 0, ay = 0, gun = 0 } = totals;
  return yil * 12 + ay + (gun > 0 ? 0.01 : 0);
}

export function calculateIhbarWeeks(totalMonths: number): number {
  if (totalMonths < 6) return 2;
  if (totalMonths < 18) return 4;
  if (totalMonths < 36) return 6;
  return 8;
}

export function calculateWeeksFromPeriod(period: WorkPeriod): number {
  return calculateIhbarWeeks(
    calculateTotalMonths({ yil: period.years, ay: period.months, gun: period.days }),
  );
}

export function calculateToplamBrut(input: {
  brut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  extras: ExtraItem[];
}): number {
  const brutValue = parseNum(input.brut);
  const primValue = parseNum(input.prim);
  const ikramiyeValue = parseNum(input.ikramiye);
  const yolValue = parseNum(input.yol);
  const yemekValue = parseNum(input.yemek);
  const extrasSum = (input.extras || []).reduce((acc, it) => acc + parseNum(it.value), 0);
  return brutValue + primValue + ikramiyeValue + yolValue + yemekValue + extrasSum;
}

/** Eklenti: 12 aylık toplam / 360 × 30 (inline — başka modülden import yok). */
export function computeEklentiResult(months: string[]): number {
  const sum = months.reduce((acc, v) => acc + parseNum(v), 0);
  return (sum / 360) * 30;
}

const EMPTY_RESULT: KotuNiyetResult = {
  workPeriod: EMPTY_PERIOD,
  toplamBrut: 0,
  weeks: 0,
  gunlukUcret: 0,
  ihbarTutari: 0,
  brutAmount: 0,
  damgaVergisi: 0,
  netAmount: 0,
};

export function computeKotuNiyet(form: KotuNiyetForm): KotuNiyetResult {
  const workPeriod = calcWorkPeriodBilirKisi(form.startDate, form.endDate);
  const toplamBrut = calculateToplamBrut(form);

  if (!(toplamBrut > 0)) return { ...EMPTY_RESULT, workPeriod };

  const weeks = calculateWeeksFromPeriod(workPeriod);
  const gunlukUcret = toplamBrut / 30;
  const ihbarTutari = gunlukUcret * weeks * 7;
  const brutAmount = round2((toplamBrut / 30) * weeks * 7 * KOTU_NIYET_CARPAN);
  const damgaVergisi = round2(brutAmount * DAMGA_ORAN);
  const netAmount = round2(brutAmount - damgaVergisi);

  return {
    workPeriod,
    toplamBrut,
    weeks,
    gunlukUcret,
    ihbarTutari,
    brutAmount,
    damgaVergisi,
    netAmount,
  };
}
