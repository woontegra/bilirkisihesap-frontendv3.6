/**
 * İhbar Tazminatı — TÜM varyantların ortak formül çekirdeği.
 * `aktuerya-backend/src/services/ihbar30.service.js` ile kuruşu kuruşuna:
 *
 *   DAMGA_ORAN = 0.00759
 *   round2(n) = Math.round(n*100)/100
 *   calculateWeeks(yil,ay,gun): totalMonths = yil*12+ay+(gun>0?0.01:0)
 *     <6 → 2 hafta; <18 → 4 hafta; <36 → 6 hafta; aksi halde 8 hafta
 *
 *   standart yol (FrontendV3 `ihbar-tazminati/calculations.ts` ekran paritesi):
 *     amount = (toplamBrut/30) * hafta * 7
 *     gelirVergisi = round2(calculateIncomeTaxWithBrackets(year, amount).tax)
 *     damgaVergisi = round2(amount * DAMGA_ORAN)
 *     net = round2(amount - gelirVergisi - damgaVergisi)
 *
 *   basın yolu (kidemTotals yil/ay/gün'den en az biri > 0 ise):
 *     ihbarGun = kidemYil >= 5 ? 90 : 30
 *     amount = (toplamBrut/30) * ihbarGun
 *     damgaVergisi = round2(amount * DAMGA_ORAN)
 *     net = round2(amount - gelirVergisi - damgaVergisi)
 *
 * Bu dosya yalnızca ihbar-tazminati/lib içinde paylaşılır. Ağ isteği yoktur.
 */

import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import { formatMoney, parseNum } from "./money";

/** Backend sabiti — binde 7,59. */
export const DAMGA_ORAN = 0.00759;

/** Backend `round2`. */
export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export type ExtraItem = { id: string; label: string; value: string };

export type WorkTotals = { yil: number; ay: number; gun: number };

/** Backend `calculateWeeks`. */
export function calculateWeeks(totals: WorkTotals): number {
  const totalMonths = (totals.yil || 0) * 12 + (totals.ay || 0) + ((totals.gun || 0) > 0 ? 0.01 : 0);
  if (totalMonths < 6) return 2;
  if (totalMonths < 18) return 4;
  if (totalMonths < 36) return 6;
  return 8;
}

export type IhbarCoreInput = {
  brut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  extras: ExtraItem[];
  totals: WorkTotals;
  exitYear: number;
  /** Yalnızca Basın varyantı: mesleğe başlangıç → işten çıkış kıdem süresi (yıl/ay/gün). */
  kidemTotals?: WorkTotals | null;
};

export type IhbarCoreResult = {
  weeks: number;
  ihbarGun: number | null;
  toplamBrut: number;
  /** Brüt ihbar tazminatı tutarı (backend `data.brut`). */
  brut: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  net: number;
};

/** Backend `toplamBrut = brut+prim+ikramiye+yol+yemek+diger+sum(extras)`; bu modülde `diger` alanı yok (=0). */
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

function calculateStandardAmounts(toplamBrut: number, totals: WorkTotals, year: number) {
  const selectedYear = year || new Date().getFullYear();
  const weeks = calculateWeeks(totals);
  const amount = toplamBrut ? (toplamBrut / 30) * weeks * 7 : 0;
  const gv = calculateIncomeTaxWithBrackets(selectedYear, amount);
  // FrontendV3 calculations.ts: calculateDamgaVergisi + calculateGelirVergisi (lump-sum) + calculateNetDisplay
  // calculateIncomeTaxWithBrackets.tax artık V3 lump-sum (baseTax) — ek round2 gerekmez (zaten lump-sum içinde).
  const gelirVergisi = gv.tax;
  const damgaVergisi = round2(amount * DAMGA_ORAN);
  const net = round2(amount - gelirVergisi - damgaVergisi);
  return {
    weeks,
    ihbarGun: null as number | null,
    amount,
    gelirVergisi,
    gelirVergisiDilimleri: gv.summary,
    damgaVergisi,
    net,
  };
}

/**
 * Basın İş Kanunu: kıdem süresi (mesleğe başlangıç → işten çıkış) esas alınır.
 * 5 yıl ve üzeri kıdem → 90 gün; aksi halde 30 gün. Brüt ihbar = (toplam brüt / 30) × gün.
 * kidemTotals boş/sıfır ise `null` döner (standart yola düşülür).
 */
function calculateBasinAmounts(toplamBrut: number, kidemTotals: WorkTotals | null | undefined, year: number) {
  const ky = kidemTotals?.yil || 0;
  const ka = kidemTotals?.ay || 0;
  const kg = kidemTotals?.gun || 0;
  const hasKidem = ky > 0 || ka > 0 || kg > 0;
  if (!hasKidem || !toplamBrut || toplamBrut <= 0) return null;

  const selectedYear = year || new Date().getFullYear();
  const ihbarGun = ky >= 5 ? 90 : 30;
  const amount = (toplamBrut / 30) * ihbarGun;
  const gv = calculateIncomeTaxWithBrackets(selectedYear, amount);
  const damgaVergisi = round2(amount * DAMGA_ORAN);
  const net = round2(amount - gv.tax - damgaVergisi);

  return {
    weeks: 0,
    ihbarGun,
    amount,
    gelirVergisi: gv.tax,
    gelirVergisiDilimleri: gv.summary || "",
    damgaVergisi,
    net,
  };
}

/** Tüm ihbar varyantlarının ortak giriş noktası — backend `calculateIhbar30` ile birebir. */
export function calculateIhbar(input: IhbarCoreInput): IhbarCoreResult {
  const toplamBrut = calculateToplamBrut(input);

  const basin = calculateBasinAmounts(toplamBrut, input.kidemTotals, input.exitYear);
  if (basin) {
    return {
      weeks: basin.weeks,
      ihbarGun: basin.ihbarGun,
      toplamBrut,
      brut: basin.amount,
      gelirVergisi: basin.gelirVergisi,
      gelirVergisiDilimleri: basin.gelirVergisiDilimleri,
      damgaVergisi: basin.damgaVergisi,
      net: basin.net,
    };
  }

  const std = calculateStandardAmounts(toplamBrut, input.totals, input.exitYear);
  return {
    weeks: std.weeks,
    ihbarGun: std.ihbarGun,
    toplamBrut,
    brut: std.amount,
    gelirVergisi: std.gelirVergisi,
    gelirVergisiDilimleri: std.gelirVergisiDilimleri,
    damgaVergisi: std.damgaVergisi,
    net: std.net,
  };
}

/** V3 çıkış yılı çözümü: geçerli aralık (2010–2030) dışında ise mevcut yıl kullanılır. */
export function resolveExitYear(exitDateISO: string): number {
  if (exitDateISO) {
    const y = new Date(exitDateISO).getFullYear();
    if (Number.isFinite(y) && y >= 2010 && y <= 2030) return y;
  }
  return new Date().getFullYear();
}

/** V3 `haftaSayisiLabel` — hafta değerine göre açıklama metni. */
export function weeksLabel(weeks: number): string {
  if (weeks === 2) return "2 hafta (altı aydan az)";
  if (weeks === 4) return "4 hafta (altı ay - 1,5 yıl)";
  if (weeks === 6) return "6 hafta (1,5 yıl - 3 yıl)";
  if (weeks === 8) return "8 hafta (3 yıldan fazla)";
  return `${weeks} hafta`;
}

/** Basın varyantı: kıdem yılına göre ihbar süresi açıklaması ("3 ay (90 gün)" / "1 ay (30 gün)"). */
export function basinIhbarSuresiLabel(kidemYil: number): string {
  return kidemYil >= 5 ? "3 ay (90 gün)" : "1 ay (30 gün)";
}

/** Standart yol hesap gösterimi: "(30.000,00 / 30 × 8 × 7)". */
export function formulaTextStandard(toplamBrut: number, weeks: number): string {
  return `(${formatMoney(toplamBrut)} / 30 × ${weeks} × 7)`;
}

/** Basın yolu hesap gösterimi: "(30.000,00 / 30 × 90 gün)". */
export function formulaTextBasin(toplamBrut: number, ihbarGun: number): string {
  return `(${formatMoney(toplamBrut)} / 30 × ${ihbarGun} gün)`;
}
