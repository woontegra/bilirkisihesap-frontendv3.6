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
  2010: [
    { limit: 8800, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 22000, rate: 0.2, baseTax: 1320, baseLimit: 8800 },
    { limit: 50000, rate: 0.27, baseTax: 3960, baseLimit: 22000 },
    { limit: null, rate: 0.35, baseTax: 11520, baseLimit: 50000 },
  ],
  2011: [
    { limit: 9400, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 23000, rate: 0.2, baseTax: 1410, baseLimit: 9400 },
    { limit: 80000, rate: 0.27, baseTax: 4130, baseLimit: 23000 },
    { limit: null, rate: 0.35, baseTax: 19520, baseLimit: 80000 },
  ],
  2012: [
    { limit: 10000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 25000, rate: 0.2, baseTax: 1500, baseLimit: 10000 },
    { limit: 88000, rate: 0.27, baseTax: 4500, baseLimit: 25000 },
    { limit: null, rate: 0.35, baseTax: 21510, baseLimit: 88000 },
  ],
  2013: [
    { limit: 10700, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 26000, rate: 0.2, baseTax: 1605, baseLimit: 10700 },
    { limit: 94000, rate: 0.27, baseTax: 4665, baseLimit: 26000 },
    { limit: null, rate: 0.35, baseTax: 23025, baseLimit: 94000 },
  ],
  2014: [
    { limit: 11000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 27000, rate: 0.2, baseTax: 1650, baseLimit: 11000 },
    { limit: 97000, rate: 0.27, baseTax: 4850, baseLimit: 27000 },
    { limit: null, rate: 0.35, baseTax: 23750, baseLimit: 97000 },
  ],
  2015: [
    { limit: 12000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 29000, rate: 0.2, baseTax: 1800, baseLimit: 12000 },
    { limit: 106000, rate: 0.27, baseTax: 5200, baseLimit: 29000 },
    { limit: null, rate: 0.35, baseTax: 25990, baseLimit: 106000 },
  ],
  2016: [
    { limit: 12600, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 30000, rate: 0.2, baseTax: 1890, baseLimit: 12600 },
    { limit: 110000, rate: 0.27, baseTax: 5370, baseLimit: 30000 },
    { limit: null, rate: 0.35, baseTax: 26970, baseLimit: 110000 },
  ],
  2017: [
    { limit: 13000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 30000, rate: 0.2, baseTax: 1950, baseLimit: 13000 },
    { limit: 110000, rate: 0.27, baseTax: 5350, baseLimit: 30000 },
    { limit: null, rate: 0.35, baseTax: 26950, baseLimit: 110000 },
  ],
  2018: [
    { limit: 14800, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 34000, rate: 0.2, baseTax: 2220, baseLimit: 14800 },
    { limit: 120000, rate: 0.27, baseTax: 6060, baseLimit: 34000 },
    { limit: null, rate: 0.35, baseTax: 29280, baseLimit: 120000 },
  ],
  2019: [
    { limit: 18000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 40000, rate: 0.2, baseTax: 2700, baseLimit: 18000 },
    { limit: 148000, rate: 0.27, baseTax: 7100, baseLimit: 40000 },
    { limit: null, rate: 0.35, baseTax: 36260, baseLimit: 148000 },
  ],
  2020: [
    { limit: 22000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 49000, rate: 0.2, baseTax: 3300, baseLimit: 22000 },
    { limit: 180000, rate: 0.27, baseTax: 8700, baseLimit: 49000 },
    { limit: 600000, rate: 0.35, baseTax: 44070, baseLimit: 180000 },
    { limit: null, rate: 0.4, baseTax: 191070, baseLimit: 600000 },
  ],
  2021: [
    { limit: 24000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 53000, rate: 0.2, baseTax: 3600, baseLimit: 24000 },
    { limit: 190000, rate: 0.27, baseTax: 9400, baseLimit: 53000 },
    { limit: 650000, rate: 0.35, baseTax: 46390, baseLimit: 190000 },
    { limit: null, rate: 0.4, baseTax: 207390, baseLimit: 650000 },
  ],
  2022: [
    { limit: 32000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 70000, rate: 0.2, baseTax: 4800, baseLimit: 32000 },
    { limit: 250000, rate: 0.27, baseTax: 12400, baseLimit: 70000 },
    { limit: 880000, rate: 0.35, baseTax: 61000, baseLimit: 250000 },
    { limit: null, rate: 0.4, baseTax: 281500, baseLimit: 880000 },
  ],
  2023: [
    { limit: 70000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 150000, rate: 0.2, baseTax: 10500, baseLimit: 70000 },
    { limit: 550000, rate: 0.27, baseTax: 26500, baseLimit: 150000 },
    { limit: 1900000, rate: 0.35, baseTax: 134500, baseLimit: 550000 },
    { limit: null, rate: 0.4, baseTax: 607000, baseLimit: 1900000 },
  ],
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
    { limit: null, rate: 0.4, baseTax: 1378000, baseLimit: 4300000 },
  ],
  // 2026: GİB 332 Seri No.lu GVK Genel Tebliği ücret tarifesi.
  2026: [
    { limit: 190000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 400000, rate: 0.2, baseTax: 28500, baseLimit: 190000 },
    { limit: 1500000, rate: 0.27, baseTax: 70500, baseLimit: 400000 },
    { limit: 5300000, rate: 0.35, baseTax: 367500, baseLimit: 1500000 },
    { limit: null, rate: 0.4, baseTax: 1697500, baseLimit: 5300000 },
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
