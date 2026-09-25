/**
 * Davacı Ücreti hesaplama motoru — %100 lokal, network isteği yok.
 * V3 sonuçlarıyla birebir aynı çıktıyı üretecek şekilde doğrulanmıştır.
 */

import type { ExtraItem, NetFromGrossData, Period } from "./model";
import {
  ASGARI_UCRETLER,
  DAMGA_ORAN,
  INCOME_TAX_BRACKETS,
  ISSIZLIK_ORAN,
  SGK_ORAN,
  type TaxBracket,
} from "./taxData";

/* ── Para yardımcıları ── */

export function parseNum(value: string): number {
  const n = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n || 0 : 0;
}

export function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value || 0 : 0);
}

/** Yazım sırasında yalnızca rakam, nokta ve virgül bırakır. */
export { sanitizeMoneyTyping } from "@/utils/moneyInput";

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ── Gelir vergisi ── */

function getRatesForYear(year: number): TaxBracket[] {
  if (INCOME_TAX_BRACKETS[year]) return INCOME_TAX_BRACKETS[year];
  const years = Object.keys(INCOME_TAX_BRACKETS)
    .map(Number)
    .sort((a, b) => b - a);
  for (const y of years) {
    if (year >= y) return INCOME_TAX_BRACKETS[y];
  }
  return INCOME_TAX_BRACKETS[2010];
}

function calculateIncomeTax(year: number, matrah: number): number {
  const brackets = getRatesForYear(year);
  for (const b of brackets) {
    if (b.limit === null || matrah <= b.limit) {
      return b.baseTax + (matrah - b.baseLimit) * b.rate;
    }
  }
  return 0;
}

/** Matrahın düştüğü dilime kadar uygulanan oranların özeti: "(%15, %20)" */
export function incomeTaxBracketSummary(year: number, matrah: number): string {
  const brackets = getRatesForYear(year);
  const applied: number[] = [];
  for (const b of brackets) {
    const pct = Math.round(b.rate * 100);
    if (!applied.includes(pct)) applied.push(pct);
    if (b.limit === null || matrah <= b.limit) break;
  }
  return applied.length > 0 ? `(${applied.map((r) => `%${r}`).join(", ")})` : "";
}

/* ── Asgari ücret dönemleri ── */

function getAsgariBrutForDateISO(iso: string): number | null {
  const d = iso.slice(0, 10);
  const found = ASGARI_UCRETLER.find((x) => d >= x.start && d <= x.end);
  return found ? found.brut : null;
}

export function hasTwoPeriods(year: number): boolean {
  const first = ASGARI_UCRETLER.some((u) => u.start === `${year}-01-01` && u.end.startsWith(`${year}-06`));
  const second = ASGARI_UCRETLER.some((u) => u.start === `${year}-07-01`);
  return first && second;
}

export function getAsgariUcretByYearAndPeriod(year: number, period: Period): number | null {
  const checkDate = period === 1 ? `${year}-03-01` : `${year}-09-01`;
  return getAsgariBrutForDateISO(checkDate);
}

/* ── Brütten nete ── */

type BaseNetResult = {
  gross: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  damgaVergisi: number;
  net: number;
};

function calculateNetFromGrossBase(gross: number, year: number): BaseNetResult {
  const sgk = round2(gross * SGK_ORAN);
  const issizlik = round2(gross * ISSIZLIK_ORAN);
  const matrah = gross - sgk - issizlik;
  const gelirVergisi = round2(calculateIncomeTax(year, matrah));
  const damgaVergisi = round2(gross * DAMGA_ORAN);
  const net = round2(gross - sgk - issizlik - gelirVergisi - damgaVergisi);
  return { gross, sgk, issizlik, gelirVergisi, damgaVergisi, net };
}

function startISOForPeriod(year: number, period: Period): string {
  return period === 2 ? `${year}-07-15` : `${year}-06-15`;
}

export type SegmentedNetResult = {
  totalGross: number;
  totalSgk: number;
  totalIssizlik: number;
  totalGelirVergisiBrut: number;
  totalGelirVergisiIstisna: number;
  totalGelirVergisi: number;
  totalDamgaVergisiBrut: number;
  totalDamgaVergisiIstisna: number;
  totalDamgaVergisi: number;
  totalNet: number;
};

function emptySegmented(): SegmentedNetResult {
  return {
    totalGross: 0,
    totalSgk: 0,
    totalIssizlik: 0,
    totalGelirVergisiBrut: 0,
    totalGelirVergisiIstisna: 0,
    totalGelirVergisi: 0,
    totalDamgaVergisiBrut: 0,
    totalDamgaVergisiIstisna: 0,
    totalDamgaVergisi: 0,
    totalNet: 0,
  };
}

/** Tek aylık brüt için brütten nete; 2022+ asgari ücret gelir/damga vergisi istisnası uygulanır. */
export function computeNetFromGrossSingle(gross: number, year: number, period: Period): SegmentedNetResult {
  if (!gross || gross <= 0 || !Number.isFinite(gross)) {
    return emptySegmented();
  }
  const base = calculateNetFromGrossBase(gross, year);

  let gelirIstisna = 0;
  let damgaIstisna = 0;
  if (year >= 2022) {
    const asgariBrut = getAsgariBrutForDateISO(startISOForPeriod(year, period));
    if (asgariBrut != null && asgariBrut > 0) {
      const asgariResult = calculateNetFromGrossBase(asgariBrut, year);
      gelirIstisna = Math.min(base.gelirVergisi, asgariResult.gelirVergisi);
      damgaIstisna = Math.min(base.damgaVergisi, asgariResult.damgaVergisi);
    }
  }

  const net =
    gross - base.sgk - base.issizlik - (base.gelirVergisi - gelirIstisna) - (base.damgaVergisi - damgaIstisna);

  return {
    totalGross: round2(gross),
    totalSgk: round2(base.sgk),
    totalIssizlik: round2(base.issizlik),
    totalGelirVergisiBrut: round2(base.gelirVergisi),
    totalGelirVergisiIstisna: round2(gelirIstisna),
    totalGelirVergisi: round2(base.gelirVergisi - gelirIstisna),
    totalDamgaVergisiBrut: round2(base.damgaVergisi),
    totalDamgaVergisiIstisna: round2(damgaIstisna),
    totalDamgaVergisi: round2(base.damgaVergisi - damgaIstisna),
    totalNet: round2(net),
  };
}

/** Netten brüte — brütten nete kurallarıyla kontrollü binary search (maks. 100 adım, 0,005 tolerans). */
export function computeGrossFromNetSingle(netInput: number, year: number, period: Period): SegmentedNetResult {
  if (!netInput || netInput <= 0 || !Number.isFinite(netInput)) {
    return emptySegmented();
  }
  let low = netInput;
  let high = netInput * 2;
  let gross = netInput / 0.7;
  for (let i = 0; i < 100; i++) {
    gross = (low + high) / 2;
    const res = computeNetFromGrossSingle(gross, year, period);
    const calculatedNet = round2(res.totalNet);
    if (Math.abs(calculatedNet - netInput) < 0.005) break;
    if (calculatedNet < netInput) low = gross;
    else high = gross;
  }
  gross = round2(gross);
  const grossPlus1 = round2(gross + 0.01);
  const resPlus = computeNetFromGrossSingle(grossPlus1, year, period);
  if (round2(resPlus.totalNet) === round2(netInput)) {
    return { ...resPlus, totalGross: grossPlus1 };
  }
  return { ...computeNetFromGrossSingle(gross, year, period), totalGross: gross };
}

/* ── Türetilmiş sonuçlar ── */

export function calculateTotalBrut(ciplakBrut: string, extraItems: ExtraItem[]): number {
  const base = parseNum(ciplakBrut);
  const extras = extraItems.reduce((sum, item) => sum + parseNum(item.value), 0);
  return base + extras;
}

const emptyNetFromGross = (): NetFromGrossData => ({
  gross: 0,
  sgk: 0,
  issizlik: 0,
  gelirVergisi: 0,
  gelirVergisiDilimleri: "",
  damgaVergisi: 0,
  net: 0,
  gelirVergisiBrut: 0,
  gelirVergisiIstisna: 0,
  damgaVergisiBrut: 0,
  damgaVergisiIstisna: 0,
});

export function deriveNetFromGross(totalBrut: number, year: number, period: Period): NetFromGrossData {
  if (totalBrut <= 0) return emptyNetFromGross();
  const result = computeNetFromGrossSingle(totalBrut, year, period);
  const matrah = totalBrut - result.totalSgk - result.totalIssizlik;
  return {
    gross: result.totalGross,
    sgk: result.totalSgk,
    issizlik: result.totalIssizlik,
    gelirVergisi: result.totalGelirVergisi,
    gelirVergisiDilimleri: incomeTaxBracketSummary(year, matrah),
    damgaVergisi: result.totalDamgaVergisi,
    net: result.totalNet,
    gelirVergisiBrut: result.totalGelirVergisiBrut,
    gelirVergisiIstisna: result.totalGelirVergisiIstisna,
    damgaVergisiBrut: result.totalDamgaVergisiBrut,
    damgaVergisiIstisna: result.totalDamgaVergisiIstisna,
  };
}

export function deriveGrossFromNet(netForGross: string, year: number, period: Period): NetFromGrossData {
  const netValue = parseNum(netForGross);
  if (netValue <= 0) return emptyNetFromGross();
  const result = computeGrossFromNetSingle(netValue, year, period);
  const matrah = result.totalGross - result.totalSgk - result.totalIssizlik;
  return {
    gross: result.totalGross,
    sgk: result.totalSgk,
    issizlik: result.totalIssizlik,
    gelirVergisi: result.totalGelirVergisi,
    gelirVergisiDilimleri: incomeTaxBracketSummary(year, matrah),
    damgaVergisi: result.totalDamgaVergisi,
    net: result.totalNet,
    gelirVergisiBrut: result.totalGelirVergisiBrut,
    gelirVergisiIstisna: result.totalGelirVergisiIstisna,
    damgaVergisiBrut: result.totalDamgaVergisiBrut,
    damgaVergisiIstisna: result.totalDamgaVergisiIstisna,
  };
}

export function deriveAsgariUcretError(
  ciplakBrut: string,
  year: number,
  period: Period,
): string | null {
  if (!ciplakBrut || !year) return null;
  const brutValue = parseNum(ciplakBrut);
  if (!brutValue) return null;
  const minUcret = getAsgariUcretByYearAndPeriod(year, period);
  if (!minUcret) return null;

  const twoPeriods = hasTwoPeriods(year);
  const periodText = twoPeriods
    ? period === 1
      ? "1. dönem (Ocak-Haziran)"
      : "2. dönem (Temmuz-Aralık)"
    : "";

  if (brutValue < minUcret) {
    return `Girilen ücret, ${year} yılı${twoPeriods ? ` ${periodText}` : ""} asgari brüt ücretinden düşük olamaz (${fmtCurrency(minUcret)} ₺).`;
  }
  return null;
}

/** Eklenti hesaplama: 12 aylık toplam / 360 × 30 */
export function computeEklentiResult(months: string[]): number {
  const sum = months.reduce((acc, v) => acc + parseNum(v), 0);
  return (sum / 360) * 30;
}
