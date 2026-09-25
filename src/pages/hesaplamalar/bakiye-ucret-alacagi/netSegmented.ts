/**
 * Bakiye Ücret — segmentli brütten nete (backend `netFromGrossSegmentedUcretAlacagi`).
 * Ücret Alacağı motorunun yerel kopyası; bu klasör dışından import edilmez.
 */
import { getAsgariBrutForDate } from "./asgariUcret";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";

export const SGK_ORAN = 0.14;
export const ISSIZLIK_ORAN = 0.01;
export const DAMGA_ORAN = 0.00759;

export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export type BakiyeNetRow = {
  ucret: number;
  katsayi: number;
  gunSayisi: number;
  ayGunSayisi: number;
  startISO: string;
  odenenUcret: number;
};

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
  gelirVergisiDilimleri: string;
};

// Inline income tax brackets (same as ucret-alacagi engine subset)
type Bracket = { limit: number | null; rate: number; baseTax: number; baseLimit: number };
const incomeTaxRates: Record<number, Bracket[]> = {
  2024: [
    { limit: 110000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 230000, rate: 0.2, baseTax: 16500, baseLimit: 110000 },
    { limit: 870000, rate: 0.27, baseTax: 40500, baseLimit: 230000 },
    { limit: 3000000, rate: 0.35, baseTax: 213300, baseLimit: 870000 },
    { limit: null, rate: 0.4, baseTax: 958800, baseLimit: 3000000 },
  ],
  2025: [
    { limit: 158000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 330000, rate: 0.2, baseTax: 23700, baseLimit: 158000 },
    { limit: 1200000, rate: 0.27, baseTax: 58100, baseLimit: 330000 },
    { limit: 4300000, rate: 0.35, baseTax: 293000, baseLimit: 1200000 },
    { limit: null, rate: 0.4, baseTax: 1410000, baseLimit: 4300000 },
  ],
  2026: [
    { limit: 198274, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 414117, rate: 0.2, baseTax: 29741, baseLimit: 198274 },
    { limit: 1505880, rate: 0.27, baseTax: 71909, baseLimit: 414117 },
    { limit: 5396070, rate: 0.35, baseTax: 366685, baseLimit: 1505880 },
    { limit: null, rate: 0.4, baseTax: 1731252, baseLimit: 5396070 },
  ],
};

function getRatesForYear(year: number): Bracket[] {
  if (incomeTaxRates[year]) return incomeTaxRates[year];
  const years = Object.keys(incomeTaxRates).map(Number).sort((a, b) => b - a);
  for (const y of years) {
    if (year >= y) return incomeTaxRates[y];
  }
  return incomeTaxRates[2024];
}

function calculateIncomeTax(year: number, income: number): number {
  const brackets = getRatesForYear(year);
  for (const b of brackets) {
    if (b.limit === null || income <= b.limit) return b.baseTax + (income - b.baseLimit) * b.rate;
  }
  return 0;
}

function calcPeriodGross(row: BakiyeNetRow): number {
  const ucret = row.ucret || 0;
  const katsayi = row.katsayi ?? 1;
  const gun = row.gunSayisi || 0;
  const ayGun = row.ayGunSayisi || 30;
  const odenen = row.odenenUcret || 0;
  if (ucret <= 0 || gun <= 0) return 0;
  return round2((ucret * katsayi * gun) / ayGun - odenen);
}

function calculateNetFromGross(gross: number, year: number) {
  const sgk = round2(gross * SGK_ORAN);
  const issizlik = round2(gross * ISSIZLIK_ORAN);
  const matrah = gross - sgk - issizlik;
  const gelirVergisi = round2(calculateIncomeTax(year, matrah));
  const damgaVergisi = round2(gross * DAMGA_ORAN);
  const net = round2(gross - sgk - issizlik - gelirVergisi - damgaVergisi);
  return { gross, sgk, issizlik, gelirVergisi, damgaVergisi, net };
}

function computeAsgariIstisnalar(gelirVergisi: number, damgaVergisi: number, year: number, dateStr: string) {
  let gelirIstisna = 0;
  let damgaIstisna = 0;
  if (year >= 2022 && dateStr) {
    const asgariBrut = getAsgariBrutForDate(dateStr);
    if (asgariBrut != null && asgariBrut > 0) {
      const asgariResult = calculateNetFromGross(asgariBrut, year);
      gelirIstisna = Math.min(gelirVergisi, asgariResult.gelirVergisi);
      damgaIstisna = Math.min(damgaVergisi, asgariResult.damgaVergisi);
    }
  }
  return { gelirIstisna, damgaIstisna };
}

function incrementalIncomeTax(year: number, prevCumMatrah: number, matrahSlice: number): number {
  if (matrahSlice <= 0) return 0;
  return round2(calculateIncomeTax(year, prevCumMatrah + matrahSlice) - calculateIncomeTax(year, prevCumMatrah));
}

function mergeBracketSummaries(summaries: string[]): string {
  const rates = new Set<number>();
  for (const summary of summaries) {
    for (const match of summary.matchAll(/%(\d+)/g)) rates.add(Number(match[1]));
  }
  if (rates.size === 0) return "";
  return `(${[...rates].sort((a, b) => a - b).map((r) => `%${r}`).join(", ")})`;
}

/** Backend calculateSegmentedNetFromRows — bakiye satır formatı. */
export function calculateSegmentedNetFromRows(rows: BakiyeNetRow[]): SegmentedNetResult {
  const empty: SegmentedNetResult = {
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
    gelirVergisiDilimleri: "",
  };
  if (!rows.length) return empty;

  const sorted = rows
    .map((row, i) => ({ row, i, start: String(row.startISO || "") }))
    .sort((a, b) => a.start.localeCompare(b.start));

  const cumMatrahByYear = new Map<number, number>();
  let totalGross = 0;
  let totalSgk = 0;
  let totalIssizlik = 0;
  let totalGelirBrut = 0;
  let totalGelirIstisna = 0;
  let totalDamgaBrut = 0;
  let totalDamgaIstisna = 0;

  for (const { row } of sorted) {
    const netBrut = calcPeriodGross(row);
    if (netBrut <= 0) continue;
    const year = row.startISO ? new Date(row.startISO).getFullYear() : new Date().getFullYear();
    const sgk = round2(netBrut * SGK_ORAN);
    const issizlik = round2(netBrut * ISSIZLIK_ORAN);
    const matrah = netBrut - sgk - issizlik;
    const prevCum = cumMatrahByYear.get(year) || 0;
    const gelirVergisi = incrementalIncomeTax(year, prevCum, matrah);
    cumMatrahByYear.set(year, prevCum + matrah);
    const damgaVergisi = round2(netBrut * DAMGA_ORAN);
    const { gelirIstisna, damgaIstisna } = computeAsgariIstisnalar(gelirVergisi, damgaVergisi, year, row.startISO);

    totalGross += netBrut;
    totalSgk += sgk;
    totalIssizlik += issizlik;
    totalGelirBrut += gelirVergisi;
    totalGelirIstisna += gelirIstisna;
    totalDamgaBrut += damgaVergisi;
    totalDamgaIstisna += damgaIstisna;
  }

  const summaries: string[] = [];
  for (const [year, matrah] of cumMatrahByYear) {
    if (matrah > 0) summaries.push(calculateIncomeTaxWithBrackets(year, matrah).summary);
  }

  const totalGelirVergisi = round2(totalGelirBrut - totalGelirIstisna);
  const totalDamgaVergisi = round2(totalDamgaBrut - totalDamgaIstisna);

  return {
    totalGross: round2(totalGross),
    totalSgk: round2(totalSgk),
    totalIssizlik: round2(totalIssizlik),
    totalGelirVergisiBrut: round2(totalGelirBrut),
    totalGelirVergisiIstisna: round2(totalGelirIstisna),
    totalGelirVergisi,
    totalDamgaVergisiBrut: round2(totalDamgaBrut),
    totalDamgaVergisiIstisna: round2(totalDamgaIstisna),
    totalDamgaVergisi,
    totalNet: round2(totalGross - totalSgk - totalIssizlik - totalGelirVergisi - totalDamgaVergisi),
    gelirVergisiDilimleri: mergeBracketSummaries(summaries),
  };
}

export function computeNetFromPeriodBrut(monthlyBrut: number, billableDays: number, periodStartISO: string): number {
  if (!monthlyBrut || monthlyBrut <= 0 || !billableDays || billableDays <= 0) return 0;
  const rows: BakiyeNetRow[] = [
    { ucret: monthlyBrut, katsayi: 1, gunSayisi: billableDays, ayGunSayisi: 30, startISO: periodStartISO, odenenUcret: 0 },
  ];
  return round2(calculateSegmentedNetFromRows(rows).totalNet);
}

export function computeNetFromGrossSingle(monthlyBrut: number, year: number): SegmentedNetResult {
  const rows: BakiyeNetRow[] = [
    { ucret: monthlyBrut, katsayi: 1, gunSayisi: 30, ayGunSayisi: 30, startISO: `${year}-06-15`, odenenUcret: 0 },
  ];
  return calculateSegmentedNetFromRows(rows);
}

export function computeGrossFromNetSingle(netInput: number, year: number): SegmentedNetResult & { gross: number } {
  if (!netInput || netInput <= 0) {
    return { ...computeNetFromGrossSingle(0, year), gross: 0 };
  }
  let low = netInput;
  let high = netInput * 2;
  let gross = netInput / 0.7;
  for (let i = 0; i < 100; i++) {
    gross = (low + high) / 2;
    const res = computeNetFromGrossSingle(gross, year);
    const calculatedNet = round2(res.totalNet);
    if (Math.abs(calculatedNet - netInput) < 0.005) break;
    if (calculatedNet < netInput) low = gross;
    else high = gross;
  }
  gross = round2(gross);
  const grossPlus1 = round2(gross + 0.01);
  const resPlus = computeNetFromGrossSingle(grossPlus1, year);
  if (round2(resPlus.totalNet) === round2(netInput)) gross = grossPlus1;
  const res = computeNetFromGrossSingle(gross, year);
  return { ...res, gross };
}
