/**
 * Hakkaniyet / mahsuplaşma sonrası brütten nete koruma testi.
 * Tam brütün neti, sayfanın mevcut fonksiyonundan gelir.
 * Son net, aynı fonksiyonun Son Brüt için ürettiği sonuçtur.
 */
import { calculateIncomeTaxWithBrackets as standartTax } from "../fazla-mesai/standart/v3-engine/lib/incomeTaxCore";
import { DAMGA_VERGISI_ORANI } from "../fazla-mesai/standart/v3-engine/lib/fazlaMesaiShared";
import { netFromGrossStandartFm } from "../fazla-mesai/standart/v3-engine/adapter";
import { netFromGrossFm as tanikliNet } from "../fazla-mesai/tanikli-standart/v3-engine/adapter";
import { netFromGrossFm as karmaNet } from "../fazla-mesai/haftalik-karma/v3-engine/adapter";
import { netFromGrossFm as donemselNet } from "../fazla-mesai/donemsel/v3-engine/adapter";
import { netFromGrossFm as donemselHaftalikNet } from "../fazla-mesai/donemsel-haftalik/v3-engine/adapter";
import {
  computeTotalsFromRows as yeraltiTotals,
  netFromGrossFm as yeraltiNet,
} from "../fazla-mesai/yeralti-isci/engine";
import {
  computeTotalsFromRows as vardiya24Totals,
  netFromGrossFm as vardiya24Net,
} from "../fazla-mesai/vardiya-24/engine";
import {
  computeTotalsFromRows as vardiya48Totals,
  netFromGrossFm as vardiya48Net,
} from "../fazla-mesai/vardiya-48/engine";
import {
  computeTotalsFromRows as gemiGunlukTotals,
  netFromGrossFm as gemiGunlukNet,
} from "../fazla-mesai/gemi-adami-gunluk/engine";
import {
  computeTotalsFromRows as gemi724Totals,
  netFromGrossFm as gemi724Net,
} from "../fazla-mesai/gemi-adami-7-24/engine";
import {
  calcHakkaniyet as ubgtHak,
  calcMahsupSonucuStandart,
  calcSonBrutAlacak,
  calculateNet as ubgtNet,
} from "../ubgt/engine";
import {
  calcHakkaniyet as htHak,
  calcMahsupSonuc,
  calculateNetFromBrut,
} from "../hafta-tatili/lib/net";
import { buildOffCetvelSummary } from "../../puantaj-fazla-mesai/reportCetvel";
import type { PuantajFmResult } from "../../puantaj-fazla-mesai/model";
import { PRODUCT_VERSION, PRODUCT_VERSION_NOTE } from "@/appVersion";

const YEAR = 2024;
const BRUT = 90000;
const MAHSUP = 10000;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function near(a: number, b: number, label: string): void {
  assert(Math.abs(a - b) < 0.001, `${label}: ${a} !== ${b}`);
}

function oracleMathRound(brut: number) {
  if (!(brut > 0)) {
    return { sgk: 0, issizlik: 0, gelirVergisi: 0, damgaVergisi: 0, net: 0 };
  }
  const sgk = roundMoney(brut * 0.14);
  const issizlik = roundMoney(brut * 0.01);
  const matrah = Math.max(0, brut - sgk - issizlik);
  const gelirVergisi = roundMoney(standartTax(YEAR, matrah).tax);
  const damgaVergisi = roundMoney(brut * DAMGA_VERGISI_ORANI);
  const net = roundMoney(brut - sgk - issizlik - gelirVergisi - damgaVergisi);
  return { sgk, issizlik, gelirVergisi, damgaVergisi, net };
}

type GrossNet = { sgk: number; issizlik: number; gelirVergisi: number; damgaVergisi: number; net: number };

function expectMatch(name: string, actual: GrossNet, expected: GrossNet): void {
  near(actual.sgk, expected.sgk, `${name} sgk`);
  near(actual.issizlik, expected.issizlik, `${name} issizlik`);
  near(actual.gelirVergisi, expected.gelirVergisi, `${name} gv`);
  near(actual.damgaVergisi, expected.damgaVergisi, `${name} damga`);
  near(actual.net, expected.net, `${name} net`);
}

const full = oracleMathRound(BRUT);
const adapters: Array<[string, (b: number, y: number) => GrossNet]> = [
  ["standart", netFromGrossStandartFm],
  ["tanikli", tanikliNet],
  ["haftalik-karma", karmaNet],
  ["donemsel", donemselNet],
  ["donemsel-haftalik", donemselHaftalikNet],
  ["yeralti", yeraltiNet],
  ["vardiya-24", vardiya24Net],
  ["vardiya-48", vardiya48Net],
  ["gemi-gunluk", gemiGunlukNet],
];

for (const [name, fn] of adapters) {
  expectMatch(name, fn(BRUT, YEAR), full);
  expectMatch(`${name} sifir`, fn(0, YEAR), oracleMathRound(0));
}

const sonBrutUnrounded = Math.max(0, BRUT - BRUT / 3 - MAHSUP);
const sonFromAdapters = netFromGrossStandartFm(sonBrutUnrounded, YEAR);
expectMatch("standart son net", sonFromAdapters, oracleMathRound(sonBrutUnrounded));
near(netFromGrossStandartFm(0, YEAR).net, 0, "standart clamp net");

function checkEngine(
  name: string,
  totals: (rows: { fm: number }[], year: number, mahsup: string) => {
    totalFm?: number;
    toplamFm?: number;
    sgk: number;
    issizlik: number;
    gelirVergisi: number;
    damgaVergisi: number;
    netYillik: number;
    hakkaniyetIndirimi: number;
    sonNet: number;
  },
  netFn: (b: number, y: number) => GrossNet,
  hakOf: (brut: number) => number,
  sonOf: (brut: number, hak: number, mahsup: number) => number,
) {
  const zero = totals([{ fm: BRUT }], YEAR, "");
  const gross = zero.totalFm ?? zero.toplamFm ?? 0;
  near(gross, BRUT, `${name} brut`);
  expectMatch(`${name} tam brut`, { ...zero, net: zero.netYillik }, netFn(gross, YEAR));
  near(zero.hakkaniyetIndirimi, hakOf(gross), `${name} hakkaniyet`);
  near(zero.sonNet, sonOf(gross, zero.hakkaniyetIndirimi, 0), `${name} son brut mahsup 0`);
  const withMahsup = totals([{ fm: BRUT }], YEAR, String(MAHSUP));
  near(withMahsup.sonNet, sonOf(gross, withMahsup.hakkaniyetIndirimi, MAHSUP), `${name} son brut mahsup`);
  expectMatch(`${name} son net`, netFn(withMahsup.sonNet, YEAR), netFn(withMahsup.sonNet, YEAR));
  near(withMahsup.sgk, netFn(gross, YEAR).sgk, `${name} tam sgk mahsuptan etkilenmez`);
  const clamped = totals([{ fm: BRUT }], YEAR, "999999999");
  assert(clamped.sonNet >= 0, `${name} son brut eksi`);
  near(clamped.sonNet, 0, `${name} son brut taban`);
  near(netFn(clamped.sonNet, YEAR).net, netFn(0, YEAR).net, `${name} sifir son net`);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
checkEngine(
  "yeralti",
  yeraltiTotals,
  yeraltiNet,
  (b) => round2(b / 3),
  (b, h, m) => Math.max(0, round2(b - h - m)),
);
checkEngine(
  "vardiya-24",
  vardiya24Totals,
  vardiya24Net,
  (b) => b / 3,
  (b, h, m) => Math.max(0, b - h - m),
);
checkEngine(
  "vardiya-48",
  vardiya48Totals,
  vardiya48Net,
  (b) => b / 3,
  (b, h, m) => Math.max(0, b - h - m),
);
checkEngine(
  "gemi-gunluk",
  gemiGunlukTotals,
  gemiGunlukNet,
  (b) => b / 3,
  (b, h, m) => Math.max(0, b - h - m),
);
checkEngine(
  "gemi-724",
  gemi724Totals,
  gemi724Net,
  (b) => round2(b / 3),
  (b, h, m) => Math.max(0, round2(b - h - m)),
);

const gemi724Full = gemi724Net(BRUT, YEAR);
near(gemi724Full.sgk, round2(BRUT * 0.14), "gemi724 sgk");
near(gemi724Full.issizlik, round2(BRUT * 0.01), "gemi724 issizlik");
near(gemi724Full.damgaVergisi, round2(BRUT * 0.00759), "gemi724 damga");

const ubgtHakkaniyet = ubgtHak(BRUT);
near(ubgtHakkaniyet, BRUT / 3, "ubgt hakkaniyet");
near(calcSonBrutAlacak(BRUT, ubgtHakkaniyet, 0), BRUT - ubgtHakkaniyet, "ubgt son brut 0");
near(calcSonBrutAlacak(BRUT, ubgtHakkaniyet, MAHSUP), BRUT - ubgtHakkaniyet - MAHSUP, "ubgt son brut mahsup");
near(calcSonBrutAlacak(BRUT, ubgtHakkaniyet, 999999999), 0, "ubgt clamp");
const ubgtFull = ubgtNet(BRUT, YEAR);
const ubgtSon = ubgtNet(calcSonBrutAlacak(BRUT, ubgtHakkaniyet, MAHSUP), YEAR);
near(ubgtSon.ssk, ubgtNet(calcSonBrutAlacak(BRUT, ubgtHakkaniyet, MAHSUP), YEAR).ssk, "ubgt son sgk");
near(ubgtFull.netAmount, ubgtNet(BRUT, YEAR).netAmount, "ubgt tam net sabit");
assert(ubgtFull.netAmount !== ubgtSon.netAmount, "ubgt son net tam netten ayrisir");
const oldStandartSonuc = calcMahsupSonucuStandart(ubgtFull.netAmount, ubgtHakkaniyet);
near(oldStandartSonuc, Math.max(0, ubgtFull.netAmount - ubgtHakkaniyet), "ubgt eski kayit sonucu");

const htHakkaniyet = htHak(BRUT);
near(htHakkaniyet, round2(BRUT / 3), "ht hakkaniyet");
near(calcMahsupSonuc(BRUT, ""), Math.max(0, round2(BRUT - htHakkaniyet)), "ht son brut 0");
near(calcMahsupSonuc(BRUT, String(MAHSUP)), Math.max(0, round2(BRUT - htHakkaniyet - MAHSUP)), "ht son brut mahsup");
near(calcMahsupSonuc(BRUT, "999999999"), 0, "ht clamp");
const htSonBrut = calcMahsupSonuc(BRUT, String(MAHSUP));
const htSon = calculateNetFromBrut(htSonBrut, YEAR);
const htFull = calculateNetFromBrut(BRUT, YEAR);
near(htSon.netAmount, calculateNetFromBrut(htSonBrut, YEAR).netAmount, "ht son net");
near(htFull.ssk, round2(BRUT * 0.14), "ht sgk");
assert(htFull.netAmount !== htSon.netAmount, "ht son net tam netten ayrisir");

const puantaj = buildOffCetvelSummary({
  offValidatedDays: [],
  hesaplananToplamFmSaat: 10,
  offGunSayisi: 0,
  offSaatKarsiligi: 7.5,
  offMahsupSaati: 0,
  toplamFmSaat: 10,
  toplamFmTutari: BRUT,
  hakkaniyetIndirimi: round2(BRUT / 3),
  mahsup: MAHSUP,
  sonTutar: Math.max(0, round2(BRUT - round2(BRUT / 3) - MAHSUP)),
} as unknown as PuantajFmResult);
assert(puantaj.sonBrut === puantaj.sonNet, "puantaj son net = son brut");
assert(puantaj.toplamBrut.includes("90"), "puantaj toplam brut");
near(puantaj.raw.sonTutar, Math.max(0, round2(BRUT - round2(BRUT / 3) - MAHSUP)), "puantaj raw");

assert(PRODUCT_VERSION === "3.6.0", "surum");
assert(PRODUCT_VERSION_NOTE.includes("brütten nete"), "surum notu");

const report = {
  version: PRODUCT_VERSION,
  brut: BRUT,
  year: YEAR,
  mahsup: MAHSUP,
  standart: {
    tamNet: full.net,
    sonBrut: sonBrutUnrounded,
    sonNet: sonFromAdapters.net,
    sgk: sonFromAdapters.sgk,
    issizlik: sonFromAdapters.issizlik,
    gv: sonFromAdapters.gelirVergisi,
    damga: sonFromAdapters.damgaVergisi,
  },
  ubgt: { tamNet: ubgtFull.netAmount, sonBrut: calcSonBrutAlacak(BRUT, ubgtHakkaniyet, MAHSUP), sonNet: ubgtSon.netAmount },
  ht: { tamNet: htFull.netAmount, sonBrut: htSonBrut, sonNet: htSon.netAmount },
  puantajSon: puantaj.raw.sonTutar,
};
console.log(JSON.stringify(report));
console.log("equity-net selftest ok");
