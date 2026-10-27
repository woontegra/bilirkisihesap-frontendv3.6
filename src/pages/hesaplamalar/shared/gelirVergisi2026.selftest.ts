/**
 * Ücret gelir vergisi tarifesi sınır testleri: 2026 (GİB 332 Seri No.lu GVK Genel Tebliği),
 * 2025/2023/2020 ücret dilimleri ve tüm yıllarda birikmiş vergi zinciri.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/shared/gelirVergisi2026.selftest.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as fmStandart from "../fazla-mesai/standart/v3-engine/lib/incomeTaxCore";
import * as fmTanikli from "../fazla-mesai/tanikli-standart/v3-engine/lib/incomeTaxCore";
import * as fmDonemsel from "../fazla-mesai/donemsel/v3-engine/lib/incomeTaxCore";
import * as fmDonemselHaftalik from "../fazla-mesai/donemsel-haftalik/v3-engine/lib/incomeTaxCore";
import * as fmHaftalikKarma from "../fazla-mesai/haftalik-karma/v3-engine/lib/incomeTaxCore";
import * as ayrimcilik from "../ayrimcilik-tazminati/incomeTax";
import * as bakiye from "../bakiye-ucret-alacagi/incomeTax";
import * as bosta from "../bosta-gecen-sure-ucreti/incomeTax";
import * as donemselHaftalik from "../fazla-mesai/donemsel-haftalik/incomeTax";
import * as donemsel from "../fazla-mesai/donemsel/incomeTax";
import * as gemi724 from "../fazla-mesai/gemi-adami-7-24/incomeTax";
import * as gemiGunluk from "../fazla-mesai/gemi-adami-gunluk/incomeTax";
import * as haftalikKarma from "../fazla-mesai/haftalik-karma/incomeTax";
import * as standart from "../fazla-mesai/standart/incomeTax";
import * as tanikli from "../fazla-mesai/tanikli-standart/incomeTax";
import * as vardiya24 from "../fazla-mesai/vardiya-24/incomeTax";
import * as vardiya48 from "../fazla-mesai/vardiya-48/incomeTax";
import * as yeralti from "../fazla-mesai/yeralti-isci/incomeTax";
import * as haftaTatili from "../hafta-tatili/lib/incomeTax";
import * as icra from "../icra-takip-brutten-nete/lib/incomeTax";
import * as ihbar from "../ihbar-tazminati/lib/incomeTax";
import * as ubgt from "../ubgt/incomeTax";
import * as yillikIzin from "../yillik-izin/lib/incomeTax";
import { INCOME_TAX_BRACKETS as DAVACI } from "../davaci-ucreti/taxData";
import { INCOME_TAX_BRACKETS as BASIN } from "../kidem-tazminati/basin-is/taxData";
import { calculateIncomeTaxForYear as basinTax } from "../kidem-tazminati/basin-is/engine";
import { GEMI_INCOME_TAX_BRACKETS as GEMI } from "../kidem-tazminati/gemi-adamlari/taxData";
import { calculateIncomeTaxWithBrackets as ucretAlacagiTax } from "../ucret-alacagi/engine";
import { calculateIncomeTaxWithBrackets as isAramaTax } from "../is-arama-izni-ucreti/engine";

type Bracket = { limit: number | null; rate: number; baseTax: number; baseLimit: number };
type Table = Record<number, Bracket[]>;

const OFFICIAL_2026: Bracket[] = [
  { limit: 190000, rate: 0.15, baseTax: 0, baseLimit: 0 },
  { limit: 400000, rate: 0.2, baseTax: 28500, baseLimit: 190000 },
  { limit: 1500000, rate: 0.27, baseTax: 70500, baseLimit: 400000 },
  { limit: 5300000, rate: 0.35, baseTax: 367500, baseLimit: 1500000 },
  { limit: null, rate: 0.4, baseTax: 1697500, baseLimit: 5300000 },
];
const TABLE_2025: Bracket[] = [
  { limit: 158000, rate: 0.15, baseTax: 0, baseLimit: 0 },
  { limit: 330000, rate: 0.2, baseTax: 23700, baseLimit: 158000 },
  { limit: 1200000, rate: 0.27, baseTax: 58100, baseLimit: 330000 },
  { limit: 4300000, rate: 0.35, baseTax: 293000, baseLimit: 1200000 },
  { limit: null, rate: 0.4, baseTax: 1378000, baseLimit: 4300000 },
];
const BOUNDS_2026: [number, number][] = [
  [100000, 15000],
  [190000, 28500],
  [190001, 28500.2],
  [400000, 70500],
  [1500000, 367500],
  [5300000, 1697500],
  [6000000, 1977500],
];
const BOUNDS_2025: [number, number][] = [
  [158000, 23700],
  [158001, 23700.2],
  [330000, 58100],
  [1200000, 293000],
  [4300000, 1378000],
  [5000000, 1658000],
];
const BOUNDS_2023: [number, number][] = [
  [400000, 94000],
  [550000, 134500],
  [1900000, 607000],
];
const BOUNDS_2020: [number, number][] = [
  [150000, 35970],
  [180000, 44070],
  [600000, 191070],
];

let checks = 0;
function assert(ok: boolean, label: string): void {
  checks++;
  if (!ok) throw new Error(label);
}
function near(actual: number, expected: number, label: string): void {
  assert(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} !== ${expected}`);
}
function sameBrackets(actual: Bracket[] | undefined, expected: Bracket[], label: string): void {
  assert(Array.isArray(actual) && actual.length === expected.length, `${label}: dilim sayısı`);
  expected.forEach((e, i) => {
    const a = actual![i];
    assert(a.limit === e.limit && a.baseLimit === e.baseLimit && a.baseTax === e.baseTax, `${label}[${i}]: sınır/baseTax`);
    near(a.rate, e.rate, `${label}[${i}].rate`);
  });
}

const tables: Record<string, Table> = {
  "FM standart v3": fmStandart.incomeTaxRates,
  "FM tanıklı v3": fmTanikli.incomeTaxRates,
  "FM dönemsel v3": fmDonemsel.incomeTaxRates,
  "FM dönemsel-haftalık v3": fmDonemselHaftalik.incomeTaxRates,
  "FM haftalık-karma v3": fmHaftalikKarma.incomeTaxRates,
  ayrimcilik: ayrimcilik.INCOME_TAX_BRACKETS,
  bakiye: bakiye.INCOME_TAX_BRACKETS,
  bosta: bosta.INCOME_TAX_BRACKETS,
  "FM dönemsel-haftalık": donemselHaftalik.INCOME_TAX_BRACKETS,
  "FM dönemsel": donemsel.INCOME_TAX_BRACKETS,
  "FM gemi 7/24": gemi724.INCOME_TAX_BRACKETS,
  "FM gemi günlük": gemiGunluk.INCOME_TAX_BRACKETS,
  "FM haftalık-karma": haftalikKarma.INCOME_TAX_BRACKETS,
  "FM standart": standart.INCOME_TAX_BRACKETS,
  "FM tanıklı": tanikli.INCOME_TAX_BRACKETS,
  "FM vardiya 24": vardiya24.INCOME_TAX_BRACKETS,
  "FM vardiya 48": vardiya48.INCOME_TAX_BRACKETS,
  "FM yeraltı": yeralti.INCOME_TAX_BRACKETS,
  "hafta tatili": haftaTatili.INCOME_TAX_BRACKETS,
  icra: icra.INCOME_TAX_BRACKETS,
  ihbar: ihbar.INCOME_TAX_BRACKETS,
  ubgt: ubgt.INCOME_TAX_BRACKETS,
  "yıllık izin": yillikIzin.INCOME_TAX_BRACKETS,
  davaci: DAVACI,
  "kıdem basın": BASIN,
  "kıdem gemi": GEMI,
};

for (const [name, t] of Object.entries(tables)) {
  sameBrackets(t[2026], OFFICIAL_2026, `${name} 2026`);
  sameBrackets(t[2025], TABLE_2025, `${name} 2025 değişmedi`);
  for (const y of [2027, 2028, 2029, 2030]) if (t[y]) sameBrackets(t[y], OFFICIAL_2026, `${name} ${y}`);
  for (const [y, list] of Object.entries(t)) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      assert(list[i].baseLimit === prev.limit, `${name} ${y} dilim ${i + 1} baseLimit`);
      near(list[i].baseTax, prev.baseTax + (prev.limit! - prev.baseLimit) * prev.rate, `${name} ${y} dilim ${i + 1} birikmiş vergi`);
    }
  }
}

for (let i = 1; i < OFFICIAL_2026.length; i++) {
  const prev = OFFICIAL_2026[i - 1];
  near(OFFICIAL_2026[i].baseTax, prev.baseTax + (prev.limit! - prev.baseLimit) * prev.rate, `2026 zincir ${i}`);
}

const taxFns: Record<string, (year: number, income: number) => number> = {
  "FM standart v3": (y, x) => fmStandart.calculateIncomeTaxWithBrackets(y, x).tax,
  "FM tanıklı v3": (y, x) => fmTanikli.calculateIncomeTaxWithBrackets(y, x).tax,
  "FM dönemsel v3": (y, x) => fmDonemsel.calculateIncomeTaxWithBrackets(y, x).tax,
  "FM dönemsel-haftalık v3": (y, x) => fmDonemselHaftalik.calculateIncomeTaxWithBrackets(y, x).tax,
  "FM haftalık-karma v3": (y, x) => fmHaftalikKarma.calculateIncomeTaxWithBrackets(y, x).tax,
  "FM standart": (y, x) => standart.calculateIncomeTaxWithBrackets(y, x).tax,
  "FM vardiya 48": (y, x) => vardiya48.calculateIncomeTaxWithBrackets(y, x).tax,
  ayrimcilik: (y, x) => ayrimcilik.calculateIncomeTaxRaw(y, x),
  bakiye: (y, x) => bakiye.calculateIncomeTaxForYear(y, x),
  ihbar: (y, x) => ihbar.calculateIncomeTaxRaw(y, x),
  "yıllık izin": (y, x) => yillikIzin.calculateIncomeTaxForYear(y, x),
  "kıdem basın": basinTax,
  "ücret alacağı": (y, x) => ucretAlacagiTax(y, x).tax,
  "iş arama izni": (y, x) => isAramaTax(y, x).tax,
};

for (const [name, fn] of Object.entries(taxFns)) {
  for (const [income, tax] of BOUNDS_2026) near(fn(2026, income), tax, `${name} 2026 ${income}`);
  for (const [income, tax] of BOUNDS_2025) near(fn(2025, income), tax, `${name} 2025 ${income}`);
  for (const [income, tax] of BOUNDS_2023) near(fn(2023, income), tax, `${name} 2023 ${income}`);
  for (const [income, tax] of BOUNDS_2020) near(fn(2020, income), tax, `${name} 2020 ${income}`);
  // İş arama izni motoru yalnızca 2010–2026 tablosu tutar ve yıl yedeklemesi yapmaz.
  if (name !== "iş arama izni") near(fn(2027, 400000), 70500, `${name} 2027 tahmin değil 2026 resmî`);
}

const ESTIMATES = /\b(198274|414117|1505880|5396070|1731252)\b/;
function scan(dir: string): string[] {
  const hits: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) hits.push(...scan(p));
    else if (/\.tsx?$/.test(entry) && !/\.(selftest|test)\.tsx?$/.test(entry) && ESTIMATES.test(readFileSync(p, "utf8"))) hits.push(p);
  }
  return hits;
}
const leftovers = scan(join(__dirname, ".."));
assert(leftovers.length === 0, `tahmini 2026 değeri kalan dosyalar: ${leftovers.join(", ")}`);

console.log(`gelirVergisi2026: ${Object.keys(tables).length} tablo, ${Object.keys(taxFns).length} fonksiyon, ${checks} kontrol geçti`);
