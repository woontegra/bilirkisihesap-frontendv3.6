/**
 * Aile motorlarını doğrudan çağırır. SHA ve tsc yerine tahakkuk, oran ve net yazar.
 * Çalıştırma: npx vite-node --config vite.config.ts src/pages/hesaplamalar/shared/historical/familyMotor.selftest.ts
 */
import { ratesForAccrual, lastClaimAccrualIso } from "./laborNet";
import { asgariUcretler, engineAsgariBrut, getAsgariUcretRowByDate } from "./asgariUcret";
import { netFromGrossStandartFm } from "../../fazla-mesai/standart/v3-engine/adapter";
import { createEmptyForm as emptyTanikli, createEmptyWitness } from "../../fazla-mesai/tanikli-standart/model";
import { computeTanikliFmResultV3, netFromGrossFm as netTanikli } from "../../fazla-mesai/tanikli-standart/v3-engine/adapter";
import { netFromGrossFm as netHaftalik } from "../../fazla-mesai/haftalik-karma/v3-engine/adapter";
import { netFromGrossFm as netDonemsel } from "../../fazla-mesai/donemsel/v3-engine/adapter";
import { netFromGrossFm as netDonemselHaftalik } from "../../fazla-mesai/donemsel-haftalik/v3-engine/adapter";
import { netFromGrossFm as netYeralti } from "../../fazla-mesai/yeralti-isci/engine";
import { netFromGrossFm as netVardiya24 } from "../../fazla-mesai/vardiya-24/engine";
import { netFromGrossFm as netVardiya48 } from "../../fazla-mesai/vardiya-48/engine";
import { netFromGrossFm as netGemiGunluk } from "../../fazla-mesai/gemi-adami-gunluk/engine";
import { netFromGrossFm as netGemi724 } from "../../fazla-mesai/gemi-adami-7-24/engine";
import { generateHaftaTatiliPeriods, MIN_WAGE_TABLE as htWages } from "../../hafta-tatili/lib/calculations";
import { calculateNetFromBrut } from "../../hafta-tatili/lib/net";
import { createEmptyForm as emptyHt } from "../../hafta-tatili/standard/model";
import { computeStandardHaftaTatili } from "../../hafta-tatili/standard/engine";
import { createEmptyForm as emptyHtBasin } from "../../hafta-tatili/basin/model";
import { computeBasinHaftaTatili } from "../../hafta-tatili/basin/engine";
import { createEmptyForm as emptyHtGemi } from "../../hafta-tatili/gemi/model";
import { computeGemiHaftaTatili } from "../../hafta-tatili/gemi/engine";
import { createInitialUsedRows } from "../../yillik-izin/lib/core";
import { computeYillikStandartResult } from "../../yillik-izin/standart/engine";
import { computeYillikBorclarResult } from "../../yillik-izin/borclar/engine";
import { computeYillikBasinResult } from "../../yillik-izin/basin/engine";
import { computeYillikKismiResult } from "../../yillik-izin/kismi/engine";
import { computeYillikBelirliResult } from "../../yillik-izin/belirli/engine";
import { computeYillikMevsimResult } from "../../yillik-izin/mevsim/engine";
import { computeYillikGemiResult } from "../../yillik-izin/gemi/engine";
import { computeYillikBasinGunlukOlmayanResult } from "../../yillik-izin/basin/gunluk-olmayan/engine";
import { computeBostaGecenSure } from "../../bosta-gecen-sure-ucreti/engine";
import { computeIsArama } from "../../is-arama-izni-ucreti/engine";
import { computeIhbar30IsciResult } from "../../ihbar-tazminati/is-kanunu/engine";
import { computeIhbarBasinResult } from "../../ihbar-tazminati/basin/engine";
import { computeIhbarBorclarResult } from "../../ihbar-tazminati/borclar/engine";
import { computeIhbarGemiResult } from "../../ihbar-tazminati/gemi/engine";
import { computeIhbarKismiResult } from "../../ihbar-tazminati/kismi/engine";
import { computeIhbarMevsimResult } from "../../ihbar-tazminati/mevsim/engine";
import { computeIhbarBelirliResult } from "../../ihbar-tazminati/belirli/engine";
import { computeAyrimcilik } from "../../ayrimcilik-tazminati/engine";
import { computeHaksizFesih } from "../../haksiz-fesih-tazminati/engine";
import { computeIseAlmama } from "../../ise-almama-tazminati/engine";
import { computeKotuNiyet } from "../../kotu-niyet-tazminati/engine";
import { computeUbgt, deriveTaxAccrualIso, calculateNet as ubgtNet } from "../../ubgt/engine";
import { MIN_WAGE_TABLE as ubgtWages } from "../../ubgt/lib/minWage";

const fails: string[] = [];
const rows: Record<string, unknown>[] = [];

function r2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

function fail(message: string) {
  fails.push(message);
}

function near(a: number, b: number, eps = 0.02): boolean {
  return Math.abs(a - b) <= eps;
}

const SPANS = [
  { label: "1996", start: "1996-01-01", end: "1996-12-31" },
  { label: "2004-2005", start: "2004-07-01", end: "2005-06-30" },
  { label: "2010", start: "2010-01-01", end: "2010-12-31" },
  { label: "2012", start: "2012-01-01", end: "2012-12-31" },
  { label: "2013", start: "2013-01-01", end: "2013-12-31" },
  { label: "2024", start: "2024-01-01", end: "2024-12-31" },
  { label: "2026", start: "2026-01-01", end: "2026-12-31" },
] as const;

const CHECK: Record<string, { sgk: number; issizlik: number; damga: number }> = {
  "1996-12-31": { sgk: 0.14, issizlik: 0, damga: 0.0048 },
  "2005-06-30": { sgk: 0.14, issizlik: 0.01, damga: 0.006 },
  "2010-12-31": { sgk: 0.14, issizlik: 0.01, damga: 0.0066 },
  "2012-12-31": { sgk: 0.14, issizlik: 0.01, damga: 0.0066 },
  "2013-12-31": { sgk: 0.14, issizlik: 0.01, damga: 0.00759 },
  "2024-12-31": { sgk: 0.14, issizlik: 0.01, damga: 0.00759 },
  "2025-12-31": { sgk: 0.14, issizlik: 0.01, damga: 0.00759 },
  "2026-12-31": { sgk: 0.14, issizlik: 0.01, damga: 0.00759 },
};

function expectFullRates(page: string, accrual: string, sgk: number, issizlik: number, damga: number) {
  const known = CHECK[accrual];
  const shared = ratesForAccrual(accrual);
  if (!near(sgk, shared.sgkOran, 1e-9) || !near(issizlik, shared.issizlikOran, 1e-9) || !near(damga, shared.damgaOran, 1e-9)) {
    fail(`${page} ${accrual} oran motor tablosundan ayrıldı sgk=${sgk} iss=${issizlik} damga=${damga}`);
  }
  if (known && (sgk !== known.sgk || issizlik !== known.issizlik || damga !== known.damga)) {
    fail(`${page} ${accrual} beklenen oran değil sgk=${sgk} iss=${issizlik} damga=${damga}`);
  }
}

function expectStampOnly(page: string, accrual: string, damga: number) {
  const known = CHECK[accrual];
  const shared = ratesForAccrual(accrual);
  if (!near(damga, shared.damgaOran, 1e-9)) fail(`${page} ${accrual} damga ${damga} tablo ${shared.damgaOran}`);
  if (known && damga !== known.damga) fail(`${page} ${accrual} damga ${damga} beklenen ${known.damga}`);
}

function push(row: Record<string, unknown>) {
  rows.push(row);
}

const fmMotors = [
  ["standart", netFromGrossStandartFm],
  ["tanikli", netTanikli],
  ["haftalik-karma", netHaftalik],
  ["donemsel", netDonemsel],
  ["donemsel-haftalik", netDonemselHaftalik],
  ["yeralti", netYeralti],
  ["vardiya-24", netVardiya24],
  ["vardiya-48", netVardiya48],
  ["gemi-gunluk", netGemiGunluk],
  ["gemi-7-24", netGemi724],
] as const;

for (const span of SPANS) {
  for (const [name, fn] of fmMotors) {
    const full = fn(90000, span.end);
    const son = fn(50000, span.end);
    const rates = ratesForAccrual(span.end);
    if (!near(son.sgk, r2(50000 * rates.sgkOran))) {
      fail(`fm:${name} ${span.end} son brüt SGK ${son.sgk} tam brüt kesintisi gibi duruyor`);
    }
    if (!near(son.issizlik, r2(50000 * rates.issizlikOran))) {
      fail(`fm:${name} ${span.end} son brüt işsizlik ${son.issizlik}`);
    }
    if (!near(son.damgaVergisi, r2(50000 * rates.damgaOran))) {
      fail(`fm:${name} ${span.end} son brüt damga ${son.damgaVergisi}`);
    }
    if (near(son.sgk, full.sgk)) fail(`fm:${name} ${span.end} 50.000 ve 90.000 aynı SGK`);
    push({
      page: `fazla-mesai/${name}`,
      span: span.label,
      accrual: span.end,
      sgkOran: rates.sgkOran,
      issizlikOran: rates.issizlikOran,
      gv: son.gelirVergisiDilimleri,
      damgaOran: rates.damgaOran,
      brut: 90000,
      hakkaniyet: 30000,
      mahsup: 10000,
      sonBrut: 50000,
      sonNet: son.net,
      tamBrutNet: full.net,
    });
  }
}

const later = lastClaimAccrualIso([
  { endISO: "2024-06-01", isDeductionRow: false },
  { endISO: "2026-03-15", isDeductionRow: false },
  { endISO: "2027-01-01", isDeductionRow: true },
]);
if (later !== "2026-03-15") fail(`son tahakkuk satırı ${later}, çıkıştan sonraki 2026-03-15 olmalı`);

{
  const form = emptyTanikli();
  form.iseGiris = "1996-01-01";
  form.istenCikis = "1996-12-31";
  form.davaciIn = "08:00";
  form.davaciOut = "20:00";
  form.taniklar = [{ ...createEmptyWitness(), dateIn: "1996-01-01", dateOut: "1996-12-31", in: "08:00", out: "20:00" }];
  const result = computeTanikliFmResultV3(form);
  const accrual = lastClaimAccrualIso(result.rows) || "";
  push({
    page: "fazla-mesai/tanikli-cetvel",
    span: "1996",
    accrual,
    brut: result.toplamFm,
    hakkaniyet: result.hakkaniyetOneri,
    mahsup: result.mahsupTutari,
    sonBrut: result.mahsupSonrasiNet,
    engineNet: result.netYillik,
    warnings: result.warnings,
  });
  if (!(result.toplamFm > 0) || !accrual.startsWith("1996")) {
    fail(`tanikli 1996 cetveli oluşmadı brut=${result.toplamFm} accrual=${accrual} ${result.warnings.join(" | ")}`);
  }
}

function htForm(empty: () => { dateRanges: { start: string; end: string }[]; settleAmount: string }, start: string, end: string, settle = "") {
  const form = empty();
  form.dateRanges = [{ ...form.dateRanges[0], start, end }];
  form.settleAmount = settle;
  return form;
}

for (const span of SPANS) {
  const standard = computeStandardHaftaTatili(htForm(emptyHt, span.start, span.end) as never);
  const basin = computeBasinHaftaTatili(htForm(emptyHtBasin, span.start, span.end) as never);
  const gemi = computeGemiHaftaTatili(htForm(emptyHtGemi, span.start, span.end) as never);
  for (const [name, result] of [["standart", standard], ["basin", basin], ["gemi", gemi]] as const) {
    const sonNet = calculateNetFromBrut(result.mahsupSonuc, result.accrualIso || result.year);
    const rates = ratesForAccrual(span.end);
    if (!(result.totalBrut > 0)) fail(`ht:${name} ${span.label} brüt 0`);
    if (result.accrualIso !== span.end) fail(`ht:${name} tahakkuk ${result.accrualIso} beklenen ${span.end}`);
    if (!near(sonNet.ssk, r2(result.mahsupSonuc * rates.sgkOran))) fail(`ht:${name} ${span.end} SGK son brütten değil ${sonNet.ssk}`);
    if (!near(sonNet.issizlik, r2(result.mahsupSonuc * rates.issizlikOran))) fail(`ht:${name} ${span.end} işsizlik son brütten değil`);
    if (!near(sonNet.damgaVergisi, r2(result.mahsupSonuc * rates.damgaOran))) fail(`ht:${name} ${span.end} damga son brütten değil`);
    push({
      page: `hafta-tatili/${name}`,
      span: span.label,
      accrual: result.accrualIso,
      sgkOran: rates.sgkOran,
      issizlikOran: rates.issizlikOran,
      gv: sonNet.gelirVergisiDilimleri,
      damgaOran: sonNet.damgaOran,
      brut: result.totalBrut,
      hakkaniyet: result.hakkaniyet,
      mahsup: 0,
      sonBrut: result.mahsupSonuc,
      sonNet: sonNet.netAmount,
      cetvelNet: result.net.netAmount,
    });
  }
}

{
  const h1 = generateHaftaTatiliPeriods("2009-01-01", "2009-06-30");
  const h2 = generateHaftaTatiliPeriods("2009-07-01", "2009-12-31");
  const dayBefore = generateHaftaTatiliPeriods("2009-06-30", "2009-06-30");
  const dayAfter = generateHaftaTatiliPeriods("2009-07-01", "2009-07-01");
  if (h1[0]?.wage !== 666 || dayBefore[0]?.wage !== 666) fail(`30.06.2009 hafta tatili ücreti ${dayBefore[0]?.wage}`);
  if (h2[0]?.wage !== 693 || dayAfter[0]?.wage !== 693) fail(`01.07.2009 hafta tatili ücreti ${dayAfter[0]?.wage}`);
  if (getAsgariUcretRowByDate("2009-06-30")?.brut !== 666) fail("ortak tablo 30.06.2009 666 değil");
  if (getAsgariUcretRowByDate("2009-07-01")?.brut !== 693) fail("ortak tablo 01.07.2009 693 değil");
  if (engineAsgariBrut("2009-06-30") !== 666 || engineAsgariBrut("2009-07-01") !== 693) {
    fail("fazla mesai asgari ölçeği 2009 yarım dönemlerini yanlış okuyor");
  }
  const y1996 = generateHaftaTatiliPeriods("1996-01-01", "1996-06-30");
  if (!y1996.length || y1996[0].start !== "1996-01-01") fail("1996 hafta tatili dönemi üretilmedi");
  const y2013 = generateHaftaTatiliPeriods("2013-01-01", "2013-12-31");
  if (y2013.some((p) => p.start < "2005-01-01")) fail("2013 hafta tatili 2005 öncesi satır aldı");
}

function nextIso(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

function assertContiguous(name: string, periods: Array<{ start: string; end: string }>) {
  const sorted = [...periods].sort((a, b) => (a.start < b.start ? -1 : 1));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (!prev || !cur) continue;
    if (cur.start <= prev.end) fail(`${name} çakışma ${prev.end} / ${cur.start}`);
    const expected = nextIso(prev.end);
    if (cur.start !== expected) fail(`${name} boşluk ${prev.end} sonrası ${cur.start}, beklenen ${expected}`);
  }
}

assertContiguous("ortak asgari", asgariUcretler);
assertContiguous("hafta tatili", htWages);
assertContiguous("ubgt asgari", ubgtWages);

function yillikBase(start: string, end: string) {
  return {
    startDate: start,
    endDate: end,
    brut: "50000",
    usedRows: createInitialUsedRows(7),
    is18Or50: false,
    isUnderground: false,
    employerPayment: "",
  };
}

for (const span of SPANS) {
  const base = yillikBase(span.start, span.end);
  const variants = [
    ["standart", computeYillikStandartResult(base)],
    ["borclar", computeYillikBorclarResult(base)],
    ["basin", computeYillikBasinResult({
      startDate: span.label === "2004-2005" ? "2004-06-30" : `${Number(span.end.slice(0, 4)) - 1}-12-31`,
      endDate: span.end,
      brut: "50000",
      usedRows: createInitialUsedRows(7),
      employerPayment: "",
      meslegeBaslangic: span.label === "2004-2005" ? "2004-06-30" : `${Number(span.end.slice(0, 4)) - 1}-12-31`,
    })],
    ["kismi", computeYillikKismiResult({ ...base, workPeriods: [{ id: "p", iseGiris: span.start, istenCikis: span.end }] })],
    ["belirli", computeYillikBelirliResult({ ...base, workPeriods: [{ id: "p", iseGiris: span.start, istenCikis: span.end }] })],
    ["mevsim", computeYillikMevsimResult({ ...base, workPeriods: [{ id: "p", iseGiris: span.start, istenCikis: span.end }] })],
    ["gemi", computeYillikGemiResult({
      workPeriods: [{ id: "p", iseGiris: span.start, istenCikis: span.end }],
      brut: "50000",
      usedRows: createInitialUsedRows(7),
      usedDays: 0,
      endDate: span.end,
      employerPayment: "",
    })],
    ["basin-gunluk-olmayan", computeYillikBasinGunlukOlmayanResult({
      meslegeBaslangic: span.start,
      startDate: span.start,
      endDate: span.end,
      brut: "50000",
      usedRows: createInitialUsedRows(7),
      employerPayment: "",
    })],
  ] as const;
  for (const [name, result] of variants) {
    const damga = result.damgaOran ?? 0;
    const issizlik = result.issizlikOran ?? 0;
    expectFullRates(`yillik:${name}`, span.end, 0.14, issizlik, damga);
    if (!(result.brutIzin > 0) || !(result.netIzin > 0)) fail(`yillik:${name} ${span.label} net oluşmadı`);
    push({
      page: `yillik-izin/${name}`,
      span: span.label,
      accrual: span.end,
      sgkOran: 0.14,
      issizlikOran: issizlik,
      gv: result.gelirVergisiDilimleri,
      damgaOran: damga,
      brut: result.brutIzin,
      hakkaniyet: 0,
      mahsup: 0,
      sonBrut: result.brutIzin,
      sonNet: result.netIzin,
    });
  }
}

for (const span of SPANS) {
  const bosta = computeBostaGecenSure({
    endDate: span.end,
    brut: "10000",
    prim: "",
    ikramiye: "",
    yol: "1000",
    yemek: "",
    extras: [],
  });
  expectFullRates("bosta", span.end, ratesForAccrual(span.end).sgkOran, bosta.issizlikOran || 0, bosta.damgaOran || 0);
  if (!near(bosta.sgk, r2(bosta.brutAmount * ratesForAccrual(span.end).sgkOran))) fail(`boşta SGK ${bosta.sgk}`);
  push({
    page: "bosta-gecen-sure",
    span: span.label,
    accrual: span.end,
    model: "cetvel satırı yok; tek tarih opsiyonel endDate; yol brüte girmez; brüt x4",
    sgkOran: ratesForAccrual(span.end).sgkOran,
    issizlikOran: bosta.issizlikOran,
    gv: bosta.gelirVergisiDilimleri,
    damgaOran: bosta.damgaOran,
    brut: bosta.brutAmount,
    hakkaniyet: 0,
    mahsup: 0,
    sonBrut: bosta.brutAmount,
    sonNet: bosta.netAmount,
  });

  const arama = computeIsArama({
    startDate: span.start,
    endDate: span.end,
    brut: "50000",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
    haftalikCalismaGunu: "6",
    kullandirilanIzinGun: "",
    tarihAralikDusumler: [],
  });
  const aramaRates = ratesForAccrual(span.end);
  if (!near(arama.sskPrimi, arama.brut * aramaRates.sgkOran, 0.02)) fail(`iş arama SGK ${arama.sskPrimi}`);
  if (!near(arama.issizlikPrimi, arama.brut * aramaRates.issizlikOran, 0.02)) fail(`iş arama işsizlik ${arama.issizlikPrimi}`);
  if (!near(arama.damgaVergisi, arama.brut * aramaRates.damgaOran, 0.02)) fail(`iş arama damga ${arama.damgaVergisi}`);
  expectFullRates("is-arama", span.end, aramaRates.sgkOran, arama.issizlikOran || 0, arama.damgaOran || 0);
  push({
    page: "is-arama-izni",
    span: span.label,
    accrual: span.end,
    sgkOran: ratesForAccrual(span.end).sgkOran,
    issizlikOran: arama.issizlikOran,
    gv: arama.gelirVergisiDilimleri,
    damgaOran: arama.damgaOran,
    brut: arama.brut,
    hakkaniyet: 0,
    mahsup: 0,
    sonBrut: arama.brut,
    sonNet: arama.net,
  });

  const ihbarForm = {
    startDate: span.start,
    endDate: span.end,
    brut: "50000",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
    meslegeBaslangic: "",
  };
  const ihbars = [
    ["is-kanunu", computeIhbar30IsciResult(ihbarForm)],
    ["basin", computeIhbarBasinResult(ihbarForm)],
    ["borclar", computeIhbarBorclarResult(ihbarForm)],
    ["gemi", computeIhbarGemiResult(ihbarForm)],
    ["kismi", computeIhbarKismiResult(ihbarForm)],
    ["mevsim", computeIhbarMevsimResult(ihbarForm)],
    ["belirli", computeIhbarBelirliResult(ihbarForm)],
  ] as const;
  for (const [name, result] of ihbars) {
    expectStampOnly(`ihbar:${name}`, span.end, result.damgaOran || 0);
    if (!(result.net > 0)) fail(`ihbar:${name} ${span.label} net 0`);
    push({
      page: `ihbar/${name}`,
      span: span.label,
      accrual: span.end,
      sgkOran: 0,
      issizlikOran: 0,
      gv: result.gelirVergisiDilimleri,
      damgaOran: result.damgaOran,
      brut: result.brut,
      hakkaniyet: 0,
      mahsup: 0,
      sonBrut: result.brut,
      sonNet: result.net,
    });
  }

  const ayr = computeAyrimcilik({
    startDate: span.start,
    endDate: span.end,
    brut: "50000",
    brutInputForNet: "",
    netAyKatsayi: 4,
  });
  expectStampOnly("ayrimcilik", span.end, ayr.damgaOran || 0);
  push({
    page: "ayrimcilik",
    span: span.label,
    accrual: span.end,
    sgkOran: 0,
    issizlikOran: 0,
    gv: ayr.gelirVergisiDilimleri,
    damgaOran: ayr.damgaOran,
    brut: ayr.brutForNetConversion,
    hakkaniyet: 0,
    mahsup: 0,
    sonBrut: ayr.brutForNetConversion,
    sonNet: ayr.netTazminat,
  });

  const haksiz = computeHaksizFesih({
    startDate: span.start,
    endDate: span.end,
    brut: "50000",
    odenenTutar: "1000",
    brutInputForNet: "",
    netAyKatsayi: 1,
  });
  expectStampOnly("haksiz", span.end, haksiz.damgaOran ?? 0);
  const damgaOnBrut = 50000 * (haksiz.damgaOran ?? 0);
  if (!near(haksiz.damgaVergisi, damgaOnBrut)) fail(`haksiz damga brütten değil ${haksiz.damgaVergisi}`);
  if (!near(haksiz.mahsupSonrasiNet, haksiz.netTazminat - 1000)) fail("haksiz mahsup netten düşülmeli");
  push({
    page: "haksiz-fesih",
    span: span.label,
    accrual: span.end,
    sgkOran: 0,
    issizlikOran: 0,
    gv: "",
    damgaOran: haksiz.damgaOran,
    brut: haksiz.brutForNet,
    hakkaniyet: 0,
    mahsup: 1000,
    mahsupYeri: "net",
    sonBrut: haksiz.brutForNet,
    sonNet: haksiz.mahsupSonrasiNet,
  });

  const ise = computeIseAlmama({
    startDate: span.start,
    endDate: span.end,
    brut: "20000",
    brutInputForNet: "50000",
    selectedKatsayi: 4,
  });
  expectStampOnly("ise-baslatmama", span.end, ise.damgaOran ?? 0);
  if (!near(ise.damgaVergisi, 50000 * (ise.damgaOran ?? 0))) fail("işe başlatmama damga 50.000 üzerinden değil");
  push({
    page: "ise-baslatmama",
    span: span.label,
    accrual: span.end,
    sgkOran: 0,
    issizlikOran: 0,
    gv: "",
    damgaOran: ise.damgaOran,
    brut: ise.brutForNet,
    hakkaniyet: 0,
    mahsup: 0,
    sonBrut: ise.brutForNet,
    sonNet: ise.netTazminat,
  });

  const kotu = computeKotuNiyet({
    startDate: span.start,
    endDate: span.end,
    brut: "50000",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
  });
  expectStampOnly("kotu-niyet", span.end, kotu.damgaOran || 0);
  push({
    page: "kotu-niyet",
    span: span.label,
    accrual: span.end,
    sgkOran: 0,
    issizlikOran: 0,
    gv: "",
    damgaOran: kotu.damgaOran,
    brut: kotu.brutAmount,
    hakkaniyet: 0,
    mahsup: 0,
    sonBrut: kotu.brutAmount,
    sonNet: kotu.netAmount,
  });
}

const ubgtHolidays = ["1-ocak", "23-nisan", "19-mayis", "30-agustos", "29-ekim"];
const ubgt1996 = computeUbgt({
  dateRanges: [{ start: "1996-01-01", end: "1996-12-31" }],
  selectedHolidayIds: [],
});
if (ubgt1996.error) fail(`UBGT 1996 reddedildi: ${ubgt1996.error}`);
if (ubgt1996.periods[0]?.wage !== 8.46 || ubgt1996.periods.some((period) => period.wage >= 10000)) {
  fail(`UBGT 1996 dönem ücreti ölçekli değil: ${ubgt1996.periods.map((period) => period.wage).join(",")}`);
}
push({ page: "ubgt", span: "1996", accrual: "", sonNet: null, note: `dönem ücretleri ${ubgt1996.periods.map((period) => period.wage).join(",")}` });

const ubgt2004 = computeUbgt({
  dateRanges: [{ start: "2004-12-31", end: "2004-12-31" }],
  selectedHolidayIds: ubgtHolidays,
});
if (ubgt2004.error || ubgt2004.periods[0]?.wage !== 444.15) {
  fail(`UBGT 31.12.2004 ücret ${ubgt2004.periods[0]?.wage ?? "yok"}: ${ubgt2004.error || "hata yok"}`);
}

const ubgt2005 = computeUbgt({
  dateRanges: [{ start: "2005-01-01", end: "2005-12-31" }],
  selectedHolidayIds: ubgtHolidays,
});
if (ubgt2005.error || !(ubgt2005.toplamBrut > 0)) fail(`UBGT 01.01.2005 kabul edilmedi: ${ubgt2005.error || "brüt 0"}`);

for (const span of SPANS.filter((s) => s.label !== "1996")) {
  const result = computeUbgt({
    dateRanges: [{ start: span.start, end: span.end }],
    selectedHolidayIds: ubgtHolidays,
  });
  if (result.error || !(result.toplamBrut > 0)) fail(`UBGT ${span.label} ${result.error || "brüt 0"}`);
  if (span.start < "2005-01-01" && result.periods.some((period) => (period.startISO ?? "") < "2005-01-01" && period.wage >= 10000)) {
    fail(`UBGT ${span.label} 2005 öncesi ücret ham eski TL`);
  }
  const accrual = deriveTaxAccrualIso([{ end: span.end }]);
  const rates = ratesForAccrual(span.end);
  if (result.toplamBrut > 0) {
    if (!near(result.toplamNet.ssk, r2(result.toplamBrut * rates.sgkOran))) fail(`UBGT ${span.end} SGK cetvel brütünden ayrıldı`);
    expectFullRates("ubgt", span.end, rates.sgkOran, result.toplamNet.issizlikOran || 0, result.toplamNet.damgaOran || 0);
  }
  const sonBrut = r2(result.toplamBrut * (2 / 3));
  const sonNet = result.toplamBrut > 0 ? ubgtNet(sonBrut, accrual || span.end) : null;
  if (sonNet && !near(sonNet.ssk, r2(sonBrut * rates.sgkOran))) fail(`UBGT sonuç tablosu SGK son brütten değil ${sonNet.ssk}`);
  push({
    page: "ubgt",
    span: span.label,
    accrual,
    sgkOran: ratesForAccrual(span.end).sgkOran,
    issizlikOran: result.toplamNet.issizlikOran,
    gv: result.toplamNet.gelirVergisiDilimleri,
    damgaOran: result.toplamNet.damgaOran,
    brut: result.toplamBrut,
    hakkaniyet: r2(result.toplamBrut / 3),
    mahsup: 0,
    sonBrut,
    sonNet: sonNet?.netAmount ?? null,
    cetvelNet: result.toplamNet.netAmount,
    note: "sonuç tablosu son brütü equityRaw ile keser; motor toplamNet cetvel brütünün netidir",
  });
}

console.log(JSON.stringify({ fails, rows }));
if (fails.length) {
  console.error(fails.join("\n"));
  process.exit(1);
}

const ht2009 = computeStandardHaftaTatili(htForm(emptyHt, "2009-01-01", "2009-06-30") as never);
const htWeeks = ht2009.rows.reduce((sum, row) => sum + (row.weekCount ?? 0), 0);
const htMoney = (wage: number) => {
  const daily50 = Number(((wage / 30) * 1.5).toFixed(2));
  return r2(daily50 * htWeeks);
};
const ubgt2009 = computeUbgt({
  dateRanges: [{ start: "2009-01-01", end: "2009-06-30" }],
  selectedHolidayIds: ubgtHolidays,
});
const ubgtMoney = (wage: number) => {
  const daily = Number((wage / 30).toFixed(6));
  return r2(Number((daily * ubgt2009.totalDays).toFixed(6)));
};
if (!near(ht2009.totalBrut, htMoney(666))) fail(`hafta tatili 2009 ilk yarı yeni brüt formülü ${ht2009.totalBrut}`);
if (!near(ubgt2009.toplamBrut, ubgtMoney(666))) fail(`UBGT 2009 ilk yarı yeni brüt formülü ${ubgt2009.toplamBrut}`);
console.log("familyMotor.selftest: geçti");
console.log(JSON.stringify({
  ht2009h1: { weeks: htWeeks, oncekiBrut: htMoney(693), yeniBrut: ht2009.totalBrut },
  ubgt2009h1: { days: ubgt2009.totalDays, oncekiBrut: ubgtMoney(693), yeniBrut: ubgt2009.toplamBrut },
  fm2009h1: engineAsgariBrut("2009-06-30"),
}));
