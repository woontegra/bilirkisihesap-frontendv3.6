/**
 * Standart Fazla Mesai — gelir vergisi (ücretliler) kademeli tarife tablosu, 2010–2030.
 * Yalnızca bu klasöre ait yerel bir kopyadır (değerler resmî GİB tebliğleriyle uyumludur);
 * başka bir modülle paylaşılmaz ve hiçbir dosyadan import edilmez.
 */

export type IncomeTaxBracket = {
  limit: number | null;
  rate: number;
  baseTax: number;
  baseLimit: number;
};

export const INCOME_TAX_BRACKETS: Record<number, IncomeTaxBracket[]> = {
  2030: [
    { limit: 198274, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 414117, rate: 0.2, baseTax: 29741, baseLimit: 198274 },
    { limit: 1505880, rate: 0.27, baseTax: 71909, baseLimit: 414117 },
    { limit: 5396070, rate: 0.35, baseTax: 366685, baseLimit: 1505880 },
    { limit: null, rate: 0.4, baseTax: 1731252, baseLimit: 5396070 },
  ],
  2029: [
    { limit: 198274, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 414117, rate: 0.2, baseTax: 29741, baseLimit: 198274 },
    { limit: 1505880, rate: 0.27, baseTax: 71909, baseLimit: 414117 },
    { limit: 5396070, rate: 0.35, baseTax: 366685, baseLimit: 1505880 },
    { limit: null, rate: 0.4, baseTax: 1731252, baseLimit: 5396070 },
  ],
  2028: [
    { limit: 198274, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 414117, rate: 0.2, baseTax: 29741, baseLimit: 198274 },
    { limit: 1505880, rate: 0.27, baseTax: 71909, baseLimit: 414117 },
    { limit: 5396070, rate: 0.35, baseTax: 366685, baseLimit: 1505880 },
    { limit: null, rate: 0.4, baseTax: 1731252, baseLimit: 5396070 },
  ],
  2027: [
    { limit: 198274, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 414117, rate: 0.2, baseTax: 29741, baseLimit: 198274 },
    { limit: 1505880, rate: 0.27, baseTax: 71909, baseLimit: 414117 },
    { limit: 5396070, rate: 0.35, baseTax: 366685, baseLimit: 1505880 },
    { limit: null, rate: 0.4, baseTax: 1731252, baseLimit: 5396070 },
  ],
  2026: [
    { limit: 198274, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 414117, rate: 0.2, baseTax: 29741, baseLimit: 198274 },
    { limit: 1505880, rate: 0.27, baseTax: 71909, baseLimit: 414117 },
    { limit: 5396070, rate: 0.35, baseTax: 366685, baseLimit: 1505880 },
    { limit: null, rate: 0.4, baseTax: 1731252, baseLimit: 5396070 },
  ],
  2025: [
    { limit: 158000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 330000, rate: 0.2, baseTax: 23700, baseLimit: 158000 },
    { limit: 1200000, rate: 0.27, baseTax: 58100, baseLimit: 330000 },
    { limit: 4300000, rate: 0.35, baseTax: 293000, baseLimit: 1200000 },
    { limit: null, rate: 0.4, baseTax: 1410000, baseLimit: 4300000 },
  ],
  2024: [
    { limit: 110000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 230000, rate: 0.2, baseTax: 16500, baseLimit: 110000 },
    { limit: 870000, rate: 0.27, baseTax: 40500, baseLimit: 230000 },
    { limit: 3000000, rate: 0.35, baseTax: 213300, baseLimit: 870000 },
    { limit: null, rate: 0.4, baseTax: 958800, baseLimit: 3000000 },
  ],
  2023: [
    { limit: 70000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 150000, rate: 0.2, baseTax: 10500, baseLimit: 70000 },
    { limit: 370000, rate: 0.27, baseTax: 26500, baseLimit: 150000 },
    { limit: 1900000, rate: 0.35, baseTax: 85900, baseLimit: 370000 },
    { limit: null, rate: 0.4, baseTax: 607000, baseLimit: 1900000 },
  ],
  2022: [
    { limit: 32000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 70000, rate: 0.2, baseTax: 4800, baseLimit: 32000 },
    { limit: 250000, rate: 0.27, baseTax: 12400, baseLimit: 70000 },
    { limit: 880000, rate: 0.35, baseTax: 61000, baseLimit: 250000 },
    { limit: null, rate: 0.4, baseTax: 281500, baseLimit: 880000 },
  ],
  2021: [
    { limit: 24000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 53000, rate: 0.2, baseTax: 3600, baseLimit: 24000 },
    { limit: 190000, rate: 0.27, baseTax: 9400, baseLimit: 53000 },
    { limit: 650000, rate: 0.35, baseTax: 46390, baseLimit: 190000 },
    { limit: null, rate: 0.4, baseTax: 207390, baseLimit: 650000 },
  ],
  2020: [
    { limit: 22000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 49000, rate: 0.2, baseTax: 3300, baseLimit: 22000 },
    { limit: 120000, rate: 0.27, baseTax: 8700, baseLimit: 49000 },
    { limit: 600000, rate: 0.35, baseTax: 27870, baseLimit: 120000 },
    { limit: null, rate: 0.4, baseTax: 191070, baseLimit: 600000 },
  ],
  2019: [
    { limit: 18000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 40000, rate: 0.2, baseTax: 2700, baseLimit: 18000 },
    { limit: 148000, rate: 0.27, baseTax: 7100, baseLimit: 40000 },
    { limit: null, rate: 0.35, baseTax: 36260, baseLimit: 148000 },
  ],
  2018: [
    { limit: 14800, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 34000, rate: 0.2, baseTax: 2220, baseLimit: 14800 },
    { limit: 120000, rate: 0.27, baseTax: 6060, baseLimit: 34000 },
    { limit: null, rate: 0.35, baseTax: 29280, baseLimit: 120000 },
  ],
  2017: [
    { limit: 13000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 30000, rate: 0.2, baseTax: 1950, baseLimit: 13000 },
    { limit: 110000, rate: 0.27, baseTax: 5350, baseLimit: 30000 },
    { limit: null, rate: 0.35, baseTax: 26950, baseLimit: 110000 },
  ],
  2016: [
    { limit: 12600, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 30000, rate: 0.2, baseTax: 1890, baseLimit: 12600 },
    { limit: 110000, rate: 0.27, baseTax: 5370, baseLimit: 30000 },
    { limit: null, rate: 0.35, baseTax: 26970, baseLimit: 110000 },
  ],
  2015: [
    { limit: 12000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 29000, rate: 0.2, baseTax: 1800, baseLimit: 12000 },
    { limit: 106000, rate: 0.27, baseTax: 5200, baseLimit: 29000 },
    { limit: null, rate: 0.35, baseTax: 25990, baseLimit: 106000 },
  ],
  2014: [
    { limit: 11000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 27000, rate: 0.2, baseTax: 1650, baseLimit: 11000 },
    { limit: 97000, rate: 0.27, baseTax: 4850, baseLimit: 27000 },
    { limit: null, rate: 0.35, baseTax: 23750, baseLimit: 97000 },
  ],
  2013: [
    { limit: 10700, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 26000, rate: 0.2, baseTax: 1605, baseLimit: 10700 },
    { limit: 94000, rate: 0.27, baseTax: 4665, baseLimit: 26000 },
    { limit: null, rate: 0.35, baseTax: 23025, baseLimit: 94000 },
  ],
  2012: [
    { limit: 10000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 25000, rate: 0.2, baseTax: 1500, baseLimit: 10000 },
    { limit: 88000, rate: 0.27, baseTax: 4500, baseLimit: 25000 },
    { limit: null, rate: 0.35, baseTax: 21510, baseLimit: 88000 },
  ],
  2011: [
    { limit: 9400, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 23000, rate: 0.2, baseTax: 1410, baseLimit: 9400 },
    { limit: 80000, rate: 0.27, baseTax: 4130, baseLimit: 23000 },
    { limit: null, rate: 0.35, baseTax: 19520, baseLimit: 80000 },
  ],
  2010: [
    { limit: 8800, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 22000, rate: 0.2, baseTax: 1320, baseLimit: 8800 },
    { limit: 50000, rate: 0.27, baseTax: 3960, baseLimit: 22000 },
    { limit: null, rate: 0.35, baseTax: 11520, baseLimit: 50000 },
  ],
};

export type IncomeTaxResult = {
  tax: number;
  brackets: { rate: number; ratePercent: string; taxableAmount: number; taxAmount: number }[];
  /** Örn. "(%15, %20, %27)" */
  summary: string;
};

/** Belirli bir yıl ve matrah için kademeli gelir vergisini, uygulanan dilimlerin dökümüyle döner.
 * Yıl tabloda yoksa (2010 öncesi/2030 sonrası kapsanmayan) vergi 0 döner. */
export function calculateIncomeTaxWithBrackets(year: number, income: number): IncomeTaxResult {
  const brackets = INCOME_TAX_BRACKETS[year];
  if (!brackets || !Number.isFinite(income) || income <= 0) {
    return { tax: 0, brackets: [], summary: "" };
  }

  const applied: IncomeTaxResult["brackets"] = [];
  let totalTax = 0;

  for (const bracket of brackets) {
    if (income <= bracket.baseLimit) break;
    const taxableInThisBracket =
      bracket.limit === null ? income - bracket.baseLimit : Math.min(income, bracket.limit) - bracket.baseLimit;
    if (taxableInThisBracket > 0) {
      const taxForThisBracket = taxableInThisBracket * bracket.rate;
      totalTax += taxForThisBracket;
      applied.push({
        rate: bracket.rate,
        ratePercent: `%${(bracket.rate * 100).toFixed(0)}`,
        taxableAmount: taxableInThisBracket,
        taxAmount: taxForThisBracket,
      });
    }
    if (bracket.limit === null || income <= bracket.limit) break;
  }

  const summary = applied.length > 0 ? `(${applied.map((b) => b.ratePercent).join(", ")})` : "";
  return { tax: totalTax, brackets: applied, summary };
}
