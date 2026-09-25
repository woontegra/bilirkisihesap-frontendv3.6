/** İcra — istisnalı full kesinti (backend/ucret-alacagi brütten nete). Yerel kopya. */
import { getAsgariBrutForDate } from "./asgariUcret";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";

export const SGK_ORAN = 0.14;
export const ISSIZLIK_ORAN = 0.01;
export const DAMGA_ORAN = 0.00759;

export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export type SegmentedNetPanel = {
  gross: number;
  sgk: number;
  issizlik: number;
  gelirVergisiBrut: number;
  gelirVergisiIstisna: number;
  gelirVergisi: number;
  damgaVergisiBrut: number;
  damgaVergisiIstisna: number;
  damgaVergisi: number;
  net: number;
  gelirVergisiDilimleri: string;
};

const EMPTY: SegmentedNetPanel = {
  gross: 0,
  sgk: 0,
  issizlik: 0,
  gelirVergisiBrut: 0,
  gelirVergisiIstisna: 0,
  gelirVergisi: 0,
  damgaVergisiBrut: 0,
  damgaVergisiIstisna: 0,
  damgaVergisi: 0,
  net: 0,
  gelirVergisiDilimleri: "",
};

type Bracket = { limit: number | null; rate: number; baseTax: number; baseLimit: number };
const incomeTaxRates: Record<number, Bracket[]> = {
  2020: [
    { limit: 22000, rate: 0.15, baseTax: 0, baseLimit: 0 },
    { limit: 49000, rate: 0.2, baseTax: 3300, baseLimit: 22000 },
    { limit: 120000, rate: 0.27, baseTax: 8700, baseLimit: 49000 },
    { limit: 600000, rate: 0.35, baseTax: 27870, baseLimit: 120000 },
    { limit: null, rate: 0.4, baseTax: 191070, baseLimit: 600000 },
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
  for (const y of years) if (year >= y) return incomeTaxRates[y];
  return incomeTaxRates[2020];
}

function calculateIncomeTax(year: number, income: number): number {
  const brackets = getRatesForYear(year);
  for (const b of brackets) {
    if (b.limit === null || income <= b.limit) return b.baseTax + (income - b.baseLimit) * b.rate;
  }
  return 0;
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

function getStartISOForYearPeriod(year: number, period?: 1 | 2): string {
  return period === 2 ? `${year}-07-15` : `${year}-06-15`;
}

/** V3 `computeNetFromGrossSingle` — istisnalı full. */
export function computeNetFromGrossSingle(gross: number, year: number, period?: 1 | 2, startISO?: string): SegmentedNetPanel {
  if (!gross || gross <= 0) return { ...EMPTY };
  const dateStr = startISO || getStartISOForYearPeriod(year, period);
  const sgk = round2(gross * SGK_ORAN);
  const issizlik = round2(gross * ISSIZLIK_ORAN);
  const matrah = gross - sgk - issizlik;
  const gelirVergisiBrut = round2(calculateIncomeTax(year, matrah));
  const damgaVergisiBrut = round2(gross * DAMGA_ORAN);
  const { gelirIstisna, damgaIstisna } = computeAsgariIstisnalar(gelirVergisiBrut, damgaVergisiBrut, year, dateStr);
  const gelirVergisi = round2(gelirVergisiBrut - gelirIstisna);
  const damgaVergisi = round2(damgaVergisiBrut - damgaIstisna);
  const net = round2(gross - sgk - issizlik - gelirVergisi - damgaVergisi);
  const gelirVergisiDilimleri = calculateIncomeTaxWithBrackets(year, matrah).summary;
  return {
    gross,
    sgk,
    issizlik,
    gelirVergisiBrut,
    gelirVergisiIstisna: gelirIstisna,
    gelirVergisi,
    damgaVergisiBrut,
    damgaVergisiIstisna: damgaIstisna,
    damgaVergisi,
    net,
    gelirVergisiDilimleri,
  };
}

/** V3 istisnasiz — asgari ücret istisnası yok. */
export function computeStandartBrutNetFromGross(totalBrut: number, year: number): SegmentedNetPanel {
  if (totalBrut <= 0) return { ...EMPTY };
  const sgk = round2(totalBrut * SGK_ORAN);
  const issizlik = round2(totalBrut * ISSIZLIK_ORAN);
  const matrah = Math.max(0, totalBrut - sgk - issizlik);
  const gvResult = calculateIncomeTaxWithBrackets(year, matrah);
  const gelirVergisi = round2(gvResult.tax);
  const damgaVergisi = round2(totalBrut * DAMGA_ORAN);
  const net = round2(totalBrut - sgk - issizlik - gelirVergisi - damgaVergisi);
  return {
    gross: totalBrut,
    sgk,
    issizlik,
    gelirVergisiBrut: gelirVergisi,
    gelirVergisiIstisna: 0,
    gelirVergisi,
    damgaVergisiBrut: damgaVergisi,
    damgaVergisiIstisna: 0,
    damgaVergisi,
    net,
    gelirVergisiDilimleri: gvResult.summary,
  };
}

export function hasTwoPeriods(year: number): boolean {
  return year === 2022 || year === 2023;
}

export function computeDamgaOnly(gross: number): { gross: number; damgaVergisi: number; net: number } {
  const damgaVergisi = round2(gross * DAMGA_ORAN);
  return { gross, damgaVergisi, net: round2(gross - damgaVergisi) };
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

export function parseNum(v: string): number {
  return Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;
}

export type BreakdownRow = {
  label: string;
  amount: number;
  display: "deduction" | "positive" | "net" | "default";
  emphasize?: boolean;
};

function formatGelirVergisiBrutLabel(dilimleri: string): string {
  return dilimleri ? `Gelir vergisi ${dilimleri}` : "Gelir vergisi";
}

const DAMGA_VERGISI_LABEL = "Damga vergisi (binde 7,59)";

/** V3 `buildGelirDamgaBrutNetRows` / istisnalı full satır yapısı. */
export function buildSegmentedBreakdownRows(
  panel: SegmentedNetPanel,
  options?: { grossLabel?: string; netLabel?: string },
): BreakdownRow[] {
  const grossLabel = options?.grossLabel ?? "Brüt alacak";
  const netLabel = options?.netLabel ?? "Ödenecek net tutar";
  const rows: BreakdownRow[] = [
    { label: grossLabel, amount: panel.gross, display: "default" },
    { label: "SGK primi (%14)", amount: panel.sgk, display: "deduction" },
    { label: "İşsizlik primi (%1)", amount: panel.issizlik, display: "deduction" },
  ];

  if ((panel.gelirVergisiIstisna ?? 0) > 0) {
    rows.push(
      { label: formatGelirVergisiBrutLabel(panel.gelirVergisiDilimleri), amount: panel.gelirVergisiBrut, display: "deduction" },
      { label: "Asg. üc. gel. vergi ist.", amount: panel.gelirVergisiIstisna, display: "positive" },
      { label: "Net gelir vergisi", amount: panel.gelirVergisi, display: "deduction" },
    );
  } else {
    rows.push({
      label: formatGelirVergisiBrutLabel(panel.gelirVergisiDilimleri),
      amount: panel.gelirVergisi,
      display: "deduction",
    });
  }

  if ((panel.damgaVergisiIstisna ?? 0) > 0) {
    rows.push(
      { label: DAMGA_VERGISI_LABEL, amount: panel.damgaVergisiBrut, display: "deduction" },
      { label: "Asg. üc. damga vergi ist.", amount: panel.damgaVergisiIstisna, display: "positive" },
      { label: "Net damga vergisi", amount: panel.damgaVergisi, display: "deduction" },
    );
  } else {
    rows.push({ label: DAMGA_VERGISI_LABEL, amount: panel.damgaVergisi, display: "deduction" });
  }

  rows.push({ label: netLabel, amount: panel.net, display: "net", emphasize: true });
  return rows;
}

export function breakdownRowToPreview(row: BreakdownRow): [string, string] {
  const prefix =
    row.display === "positive" ? "+" : row.display === "deduction" ? "−" : "";
  return [`${row.label}`, `${prefix}${formatMoney(row.amount)} ₺`];
}
