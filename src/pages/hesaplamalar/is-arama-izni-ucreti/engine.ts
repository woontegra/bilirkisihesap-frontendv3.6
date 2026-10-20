/**
 * İş Arama İzni Ücreti — lokal hesaplama motoru.
 * Başka hesaplama sayfasından import yok (İş K. m.17 hafta tablosu bilerek burada
 * yeniden tanımlanmıştır — ihbar-tazminati modülünden import edilmez). Ağ yok.
 *
 * V3/backend (`isArama.service.calculateIsArama`) ile kuruşu kuruşuna:
 *   toplamBrut = çıplak brüt (V3: prim/ikramiye/yol/yemek/extras UI'da yok, hesaba katılmaz)
 *   calculateWeeks(yil,ay,gun) — İş K. m.17: <6 ay→2, <18 ay→4, <36 ay→6, aksi 8 hafta
 *   toplamIsAramaGunu = weeks × haftalikCalismaGunu
 *   toplamIsAramaSaati = toplamIsAramaGunu × 2
 *   gunlukCalismaSaati = 7,5 (sabit)
 *   dusumSaati = kullandirilanIzinGun×7,5 + Σ(tarihAralığı işgünü × günlükSaat)
 *   netIsAramaSaati = max(0, toplamIsAramaSaati − dusumSaati)
 *   saatlikUcret = toplamBrut / 225
 *   brut(amount) = saatlikUcret × netIsAramaSaati
 *   sskPrimi = amount×0,14; issizlikPrimi = amount×0,01
 *   gelirVergisi = kademeli gelir vergisi (matrah=amount, round2 UYGULANMAZ)
 *   damgaVergisi = amount×0,00759 (round2 UYGULANMAZ)
 *   net = amount − sskPrimi − issizlikPrimi − gelirVergisi − damgaVergisi (round2 UYGULANMAZ)
 */

import type { ExtraItem, IsAramaForm, IsAramaResult, TarihAralikDusum, WorkPeriod } from "./model";

/** Backend `round2`. */
export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

/** Türkçe para: binlik noktaları sil, virgülü ondalığa çevir. Geçersiz/negatif → 0. */
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

/** V3 `calcWorkPeriodIhbar` — kapsayıcı OLMAYAN takvim farkı (etiket için). */
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

/**
 * V3 `calcWorkPeriodBilirKisi` — kapsayıcı (+1 gün) yıl/ay/gün; hafta dilimi hesabında
 * (`calculateWeeks`) kullanılır. Etiket sade (exclusive) fark biçiminde gösterilir.
 */
export function calcWorkPeriodBilirKisi(startISO: string, endISO: string): WorkPeriod {
  if (!startISO || !endISO) return EMPTY_PERIOD;
  try {
    const start = new Date(startISO);
    const end = new Date(endISO);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return EMPTY_PERIOD;
    if (end < start) return EMPTY_PERIOD;
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
    const label = calcWorkPeriodExclusive(startISO, endISO).label;
    return { years, months, days, label };
  } catch {
    return EMPTY_PERIOD;
  }
}

/** Backend `calculateWeeks` — İş K. m.17 (ihbar süreleri). Bu modül içinde YİNELENMİŞTİR. */
export function calculateWeeks(totals: { yil: number; ay: number; gun: number }): number {
  const totalMonths = (totals.yil || 0) * 12 + (totals.ay || 0) + ((totals.gun || 0) > 0 ? 0.01 : 0);
  if (totalMonths < 6) return 2;
  if (totalMonths < 18) return 4;
  if (totalMonths < 36) return 6;
  return 8;
}

/** V3 çıkış yılı çözümü: geçerli aralık (2010–2030) dışında ise mevcut yıl kullanılır. */
export function resolveExitYear(exitDateISO: string): number {
  if (exitDateISO) {
    const y = new Date(exitDateISO).getFullYear();
    if (Number.isFinite(y) && y >= 2010 && y <= 2030) return y;
  }
  return new Date().getFullYear();
}

/** V3: yalnızca çıplak brüt — prim/ikramiye/yol/yemek/extras hesaba katılmaz (alanlar kayıtlarda saklanır). */
export function calculateToplamBrut(input: {
  brut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  extras: ExtraItem[];
}): number {
  return parseNum(input.brut);
}

/** V3 sabiti: günlük çalışma saati her zaman 7,5 (haftalık gün sayısından bağımsız). */
export function getGunlukCalismaSaati(): number {
  return 7.5;
}

/** V3 `calculateWorkDays` — tarih aralığındaki geçerli iş günü sayısı. */
export function calculateWorkDays(startDate: string, endDate: string, haftalikCalismaGunu: number): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(+start) || Number.isNaN(+end) || start > end) return 0;
  let workDays = 0;
  const current = new Date(start);
  const workDayMap: Record<number, number[]> = {
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  const validWorkDays = workDayMap[haftalikCalismaGunu] || workDayMap[5];
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (validWorkDays.includes(dayOfWeek)) workDays++;
    current.setDate(current.getDate() + 1);
  }
  return workDays;
}

function calculateDusumSaati(
  kullandirilanIzinGun: string,
  tarihAralikDusumler: TarihAralikDusum[],
  haftalikCalismaGunu: number,
): number {
  const gunlukCalismaSaati = getGunlukCalismaSaati();
  let toplamDusum = 0;
  const gunBazli = parseNum(kullandirilanIzinGun);
  if (gunBazli > 0) toplamDusum += gunBazli * gunlukCalismaSaati;
  tarihAralikDusumler.forEach((dusum) => {
    if (dusum.baslangic && dusum.bitis && dusum.gunlukSaat) {
      const gunler = calculateWorkDays(dusum.baslangic, dusum.bitis, haftalikCalismaGunu);
      toplamDusum += gunler * parseNum(dusum.gunlukSaat);
    }
  });
  return toplamDusum;
}

/* ────────────────────────────────────────────────────────────────────────
 * Gelir vergisi tarifesi (ücretliler), 2010–2030.
 * `ihbar-tazminati/lib/incomeTax.ts` dosyasının yerel bir kopyasıdır (GİB
 * tebliğleriyle uyumlu); yalnızca bu modül içinde kullanılır, başka bir
 * hesaplama modülünden import edilmez.
 * ──────────────────────────────────────────────────────────────────────── */

type IncomeTaxBracket = { limit: number | null; rate: number; baseTax: number; baseLimit: number };

const INCOME_TAX_BRACKETS: Record<number, IncomeTaxBracket[]> = {
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

type IncomeTaxResult = { tax: number; summary: string };

/** Belirli bir yıl/matrah için kademeli gelir vergisi ve dilim özeti (round2 UYGULANMAZ). */
export function calculateIncomeTaxWithBrackets(year: number, income: number): IncomeTaxResult {
  const brackets = INCOME_TAX_BRACKETS[year];
  if (!brackets || !Number.isFinite(income) || income <= 0) {
    return { tax: 0, summary: "" };
  }

  const appliedRates: number[] = [];
  let totalTax = 0;

  for (const bracket of brackets) {
    if (income <= bracket.baseLimit) break;
    const taxableInThisBracket =
      bracket.limit === null ? income - bracket.baseLimit : Math.min(income, bracket.limit) - bracket.baseLimit;
    if (taxableInThisBracket > 0) {
      totalTax += taxableInThisBracket * bracket.rate;
      const ratePct = Math.round(bracket.rate * 100);
      if (!appliedRates.includes(ratePct)) appliedRates.push(ratePct);
    }
    if (bracket.limit === null || income <= bracket.limit) break;
  }

  const summary = appliedRates.length > 0 ? `(${appliedRates.map((r) => `%${r}`).join(", ")})` : "";
  return { tax: totalTax, summary };
}

/** Backend sabiti — binde 7,59. */
export const DAMGA_ORAN = 0.00759;
const SGK_ORAN = 0.14;
const ISSIZLIK_ORAN = 0.01;

export function computeIsArama(form: IsAramaForm): IsAramaResult {
  const workPeriod = calcWorkPeriodBilirKisi(form.startDate, form.endDate);
  const exitYear = resolveExitYear(form.endDate);
  const haftalikGunNum = Number(form.haftalikCalismaGunu) || 5;

  const toplamBrut = calculateToplamBrut(form);
  const weeks = calculateWeeks({ yil: workPeriod.years, ay: workPeriod.months, gun: workPeriod.days });
  const toplamIsAramaGunu = weeks * haftalikGunNum;
  const toplamIsAramaSaati = toplamIsAramaGunu * 2;

  const dusumSaati = calculateDusumSaati(form.kullandirilanIzinGun, form.tarihAralikDusumler, haftalikGunNum);
  const netIsAramaSaati = Math.max(0, toplamIsAramaSaati - dusumSaati);

  const saatlikUcret = toplamBrut > 0 ? toplamBrut / 225 : 0;
  const amount = saatlikUcret * netIsAramaSaati;

  const sskPrimi = amount * SGK_ORAN;
  const issizlikPrimi = amount * ISSIZLIK_ORAN;
  const gv = calculateIncomeTaxWithBrackets(exitYear, amount);
  const damgaVergisi = amount * DAMGA_ORAN;
  const net = amount - sskPrimi - issizlikPrimi - gv.tax - damgaVergisi;

  return {
    workPeriod,
    toplamBrut,
    weeks,
    toplamIsAramaGunu,
    toplamIsAramaSaati,
    dusumSaati,
    netIsAramaSaati,
    saatlikUcret,
    brut: amount,
    sskPrimi,
    issizlikPrimi,
    gelirVergisi: gv.tax,
    gelirVergisiDilimleri: gv.summary,
    damgaVergisi,
    net,
  };
}
