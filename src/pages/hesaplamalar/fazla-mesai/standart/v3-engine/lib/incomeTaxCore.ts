// src/utils/incomeTaxCore.ts
//------------------------------------------------------------
// GELİR VERGİSİ TARİFESİ (ÜCRETLİLER) — 2010–2030
// GİB RESMİ TEBLİĞLERİNE %100 UYUMLU
//------------------------------------------------------------

export interface TaxBracket {
  limit: number | null;   // üst sınır (null = sonsuz)
  rate: number;           // vergi oranı
  baseTax: number;        // önceki dilimlerin toplam vergisi
  baseLimit: number;      // önceki dilimlerin toplam limiti
}

const BRACKETS_2026_2030: TaxBracket[] = [
  { limit: 198274, rate: 0.15, baseTax: 0, baseLimit: 0 },
  { limit: 414117, rate: 0.20, baseTax: 29741, baseLimit: 198274 },
  { limit: 1505880, rate: 0.27, baseTax: 71909, baseLimit: 414117 },
  { limit: 5396070, rate: 0.35, baseTax: 366685, baseLimit: 1505880 },
  { limit: null, rate: 0.40, baseTax: 1731252, baseLimit: 5396070 },
];

export const incomeTaxRates: Record<number, TaxBracket[]> = {
  2030: BRACKETS_2026_2030,
  2029: BRACKETS_2026_2030,
  2028: BRACKETS_2026_2030,
  2027: BRACKETS_2026_2030,
  2026: BRACKETS_2026_2030,

  // ----------------------------
  // 2025
  // ----------------------------
  2025: [
    { limit: 158000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 330000, rate: 0.20, baseTax: 23700, baseLimit: 158000 },
    { limit: 1200000, rate: 0.27, baseTax: 58100, baseLimit: 330000 },
    { limit: 4300000, rate: 0.35, baseTax: 293000, baseLimit: 1200000 },
    { limit: null, rate: 0.40, baseTax: 1410000, baseLimit: 4300000 }
  ],

  // ----------------------------
  // 2024
  // ----------------------------
  2024: [
    { limit: 110000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 230000, rate: 0.20, baseTax: 16500, baseLimit: 110000 },
    { limit: 870000, rate: 0.27, baseTax: 40500, baseLimit: 230000 },
    { limit: 3000000, rate: 0.35, baseTax: 213300, baseLimit: 870000 },
    { limit: null, rate: 0.40, baseTax: 958800, baseLimit: 3000000 }
  ],

  // ----------------------------
  // 2023
  // ----------------------------
  2023: [
    { limit: 70000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 150000, rate: 0.20, baseTax: 10500, baseLimit: 70000 },
    { limit: 370000, rate: 0.27, baseTax: 26500, baseLimit: 150000 },
    { limit: 1900000, rate: 0.35, baseTax: 85900, baseLimit: 370000 },
    { limit: null, rate: 0.40, baseTax: 607000, baseLimit: 1900000 }
  ],

  // ----------------------------
  // 2022
  // ----------------------------
  2022: [
    { limit: 32000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 70000, rate: 0.20, baseTax: 4800, baseLimit: 32000 },
    { limit: 250000, rate: 0.27, baseTax: 12400, baseLimit: 70000 },
    { limit: 880000, rate: 0.35, baseTax: 61000, baseLimit: 250000 },
    { limit: null, rate: 0.40, baseTax: 281500, baseLimit: 880000 }
  ],

  // ----------------------------
  // 2021
  // ----------------------------
  2021: [
    { limit: 24000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 53000, rate: 0.20, baseTax: 3600, baseLimit: 24000 },
    { limit: 130000, rate: 0.27, baseTax: 9400, baseLimit: 53000 },
    { limit: 650000, rate: 0.35, baseTax: 30190, baseLimit: 130000 },
    { limit: null, rate: 0.40, baseTax: 212190, baseLimit: 650000 }
  ],

  // ----------------------------
  // 2020
  // ----------------------------
  2020: [
    { limit: 22000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 49000, rate: 0.20, baseTax: 3300, baseLimit: 22000 },
    { limit: 120000, rate: 0.27, baseTax: 8700, baseLimit: 49000 },
    { limit: 600000, rate: 0.35, baseTax: 27870, baseLimit: 120000 },
    { limit: null, rate: 0.40, baseTax: 191070, baseLimit: 600000 }
  ],

  // ----------------------------
  // 2019
  // ----------------------------
  2019: [
    { limit: 18000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 40000, rate: 0.20, baseTax: 2700, baseLimit: 18000 },
    { limit: 148000, rate: 0.27, baseTax: 7100, baseLimit: 40000 },
    { limit: null, rate: 0.35, baseTax: 36260, baseLimit: 148000 }
  ],

  // ----------------------------
  // 2018
  // ----------------------------
  2018: [
    { limit: 14800, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 34000, rate: 0.20, baseTax: 2220, baseLimit: 14800 },
    { limit: 120000, rate: 0.27, baseTax: 6060, baseLimit: 34000 },
    { limit: null, rate: 0.35, baseTax: 29280, baseLimit: 120000 }
  ],

  // ----------------------------
  // 2017
  // ----------------------------
  2017: [
    { limit: 13000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 30000, rate: 0.20, baseTax: 1950, baseLimit: 13000 },
    { limit: 110000, rate: 0.27, baseTax: 5350, baseLimit: 30000 },
    { limit: null, rate: 0.35, baseTax: 26950, baseLimit: 110000 }
  ],

  // ----------------------------
  // 2016
  // ----------------------------
  2016: [
    { limit: 12600, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 30000, rate: 0.20, baseTax: 1890, baseLimit: 12600 },
    { limit: 110000, rate: 0.27, baseTax: 5370, baseLimit: 30000 },
    { limit: null, rate: 0.35, baseTax: 26970, baseLimit: 110000 }
  ],

  // ----------------------------
  // 2015
  // ----------------------------
  2015: [
    { limit: 12000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 29000, rate: 0.20, baseTax: 1800, baseLimit: 12000 },
    { limit: 106000, rate: 0.27, baseTax: 5200, baseLimit: 29000 },
    { limit: null, rate: 0.35, baseTax: 25990, baseLimit: 106000 }
  ],

  // ----------------------------
  // 2014
  // ----------------------------
  2014: [
    { limit: 11000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 27000, rate: 0.20, baseTax: 1650, baseLimit: 11000 },
    { limit: 97000, rate: 0.27, baseTax: 4850, baseLimit: 27000 },
    { limit: null, rate: 0.35, baseTax: 23750, baseLimit: 97000 }
  ],

  // ----------------------------
  // 2013
  // ----------------------------
  2013: [
    { limit: 10700, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 26000, rate: 0.20, baseTax: 1605, baseLimit: 10700 },
    { limit: 94000, rate: 0.27, baseTax: 4665, baseLimit: 26000 },
    { limit: null, rate: 0.35, baseTax: 23025, baseLimit: 94000 }
  ],

  // ----------------------------
  // 2012
  // ----------------------------
  2012: [
    { limit: 10000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 25000, rate: 0.20, baseTax: 1500, baseLimit: 10000 },
    { limit: 88000, rate: 0.27, baseTax: 4500, baseLimit: 25000 },
    { limit: null, rate: 0.35, baseTax: 21510, baseLimit: 88000 }
  ],

  // ----------------------------
  // 2011
  // ----------------------------
  2011: [
    { limit: 9400, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 23000, rate: 0.20, baseTax: 1410, baseLimit: 9400 },
    { limit: 80000, rate: 0.27, baseTax: 4130, baseLimit: 23000 },
    { limit: null, rate: 0.35, baseTax: 19520, baseLimit: 80000 }
  ],

  // ----------------------------
  // 2010
  // ----------------------------
  2010: [
    { limit: 8800, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 22000, rate: 0.20, baseTax: 1320, baseLimit: 8800 },
    { limit: 50000, rate: 0.27, baseTax: 3960, baseLimit: 22000 },
    { limit: null, rate: 0.35, baseTax: 11520, baseLimit: 50000 }
  ]
};

// ------------------------------------------------------------
// SGK ve İşsizlik Oranları
//------------------------------------------------------------
export const SGK_ISCIPAY_ORANI = 0.14;      // %14 SGK işçi payı
export const ISSIZLIK_ISCIPAY_ORANI = 0.01; // %1 işsizlik işçi payı
export const DAMGA_VERGISI_ORANI = 0.00759; // %0.759 damga vergisi

// ------------------------------------------------------------
// BRÜT → GELİR VERGİSİ → NET
//------------------------------------------------------------

function getRatesForYear(year: number): TaxBracket[] | undefined {
  if (incomeTaxRates[year]) return incomeTaxRates[year];
  const years = Object.keys(incomeTaxRates).map(Number).sort((a, b) => b - a);
  for (const y of years) {
    if (year >= y) return incomeTaxRates[y];
  }
  return incomeTaxRates[2010];
}

export function calculateIncomeTaxForYear(year: number, income: number) {
  const brackets = getRatesForYear(year);
  if (!brackets) return 0;

  for (const b of brackets) {
    if (b.limit === null || income <= b.limit) {
      return b.baseTax + (income - b.baseLimit) * b.rate;
    }
  }

  return 0;
}

// Bracket bilgileri ile birlikte gelir vergisi hesaplama
export function calculateIncomeTaxWithBrackets(year: number, income: number): { tax: number; brackets: string } {
  const brackets = getRatesForYear(year);
  if (!brackets || income <= 0) return { tax: 0, brackets: "" };

  const appliedBrackets: number[] = [];
  let tax = 0;

  for (const b of brackets) {
    if (!appliedBrackets.includes(b.rate * 100)) {
      appliedBrackets.push(b.rate * 100);
    }

    if (b.limit === null || income <= b.limit) {
      tax = b.baseTax + (income - b.baseLimit) * b.rate;
      break;
    }
  }

  const bracketString = appliedBrackets.length > 0 
    ? `(${appliedBrackets.map(rate => `%${rate}`).join(', ')})` 
    : '';

  return { tax, brackets: bracketString };
}

// 2 ondalık basamağa yuvarla (brütten nete için)
const round2Gross = (n: number) => Math.round(n * 100) / 100;

export function calculateNetFromGross(gross: number, year: number) {
  // SGK ve işsizlik kesintileri (yuvarlanmış)
  const sgk = round2Gross(gross * SGK_ISCIPAY_ORANI);
  const issizlik = round2Gross(gross * ISSIZLIK_ISCIPAY_ORANI);
  
  // Gelir vergisi matrahı (SGK kesintileri düşüldükten sonra)
  const gelirVergisiMatrahi = gross - sgk - issizlik;
  
  // Gelir vergisi hesapla (yuvarlanmış)
  const gelirVergisi = round2Gross(calculateIncomeTaxForYear(year, gelirVergisiMatrahi));
  
  // Damga vergisi (brüt üzerinden, yuvarlanmış)
  const damgaVergisi = round2Gross(gross * DAMGA_VERGISI_ORANI);
  
  // Net ücret (yuvarlanmış)
  const net = round2Gross(gross - sgk - issizlik - gelirVergisi - damgaVergisi);
  
  return { 
    gross,
    sgk, 
    issizlik, 
    gelirVergisi, 
    damgaVergisi, 
    net 
  };
}

// ------------------------------------------------------------
// NET → BRÜT (Iteratif hesaplama)
//------------------------------------------------------------

// 2 ondalık basamağa yuvarla
const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateGrossFromNet(netInput: number, year: number) {
  // Binary search ile brüt hesapla
  let low = netInput;
  let high = netInput * 2;
  let gross = netInput / 0.70;
  
  for (let i = 0; i < 100; i++) {
    gross = (low + high) / 2;
    const result = calculateNetFromGross(gross, year);
    const calculatedNet = round2(result.net);
    
    if (Math.abs(calculatedNet - netInput) < 0.005) break;
    
    if (calculatedNet < netInput) {
      low = gross;
    } else {
      high = gross;
    }
  }
  
  // Brütü yuvarla
  gross = round2(gross);
  
  // Eğer brüt tam sayıya çok yakınsa, tam sayıyı da kontrol et
  const nearestInteger = Math.round(gross);
  if (Math.abs(gross - nearestInteger) < 0.05) {
    const intResult = calculateNetFromGross(nearestInteger, year);
    if (Math.abs(round2(intResult.net) - netInput) < 0.01) {
      return {
        net: round2(intResult.net),
        gross: nearestInteger,
        sgk: round2(intResult.sgk),
        issizlik: round2(intResult.issizlik),
        gelirVergisi: round2(intResult.gelirVergisi),
        damgaVergisi: round2(intResult.damgaVergisi)
      };
    }
  }
  
  // Normal hesaplama
  const sgk = round2(gross * SGK_ISCIPAY_ORANI);
  const issizlik = round2(gross * ISSIZLIK_ISCIPAY_ORANI);
  const gelirVergisiMatrahi = gross - sgk - issizlik;
  const gelirVergisi = round2(calculateIncomeTaxForYear(year, gelirVergisiMatrahi));
  const damgaVergisi = round2(gross * DAMGA_VERGISI_ORANI);
  const net = round2(gross - sgk - issizlik - gelirVergisi - damgaVergisi);
  
  return {
    net,
    gross,
    sgk,
    issizlik,
    gelirVergisi,
    damgaVergisi
  };
}
