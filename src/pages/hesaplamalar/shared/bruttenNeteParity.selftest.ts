/**
 * Brütten nete parite testi (V3.5 referansı), 15 sayfa: 10 fazla mesai, 2 UBGT, 3 hafta tatili.
 *
 * Değişmez: hakkaniyet veya mahsuplaşma bulunması, ana Brütten Nete tablosunun SGK/vergi
 * matrahını toplam/orijinal brütten son brüte sessizce değiştiremez.
 *
 * İki hesap birlikte bulunur:
 *   A) toplam brüt → ana Brütten Nete → ana net
 *   B) toplam brüt → hakkaniyet/mahsup → son brüt → son brütten nete → son net alacak
 * Biri diğerinin yerine geçemez; biri kaybolursa test başarısız olur.
 *
 * Referans hesap V3.5 formülüdür (SGK %14, işsizlik %1, damga binde 7,59, dilimli gelir vergisi)
 * ve bu projenin kodundan bağımsız yazılmıştır. 2013 sonrası oranlar V3.5 ile aynıdır.
 *
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/shared/bruttenNeteParity.selftest.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildPreviewUdfModel, extractUdfCdata } from "@/components/calculation-preview/udf/buildPreviewUdf";
import type { PreviewSection } from "@/components/calculation-preview/types";
import { computeStandartFmResultV3, netFromGrossStandartFm } from "../fazla-mesai/standart/v3-engine/adapter";
import { createEmptyForm as standartForm } from "../fazla-mesai/standart/model";
import { computeTanikliFmResultV3, netFromGrossFm as tanikliNet } from "../fazla-mesai/tanikli-standart/v3-engine/adapter";
import { createEmptyForm as tanikliForm, createEmptyWitness as tanikliWitness } from "../fazla-mesai/tanikli-standart/model";
import { computeHaftalikKarmaResultV3, netFromGrossFm as karmaNet } from "../fazla-mesai/haftalik-karma/v3-engine/adapter";
import { createEmptyHaftalikKarmaForm, createEmptyWitness as karmaWitness } from "../fazla-mesai/haftalik-karma/model";
import { computeDonemselResultV3, netFromGrossFm as donemselNet } from "../fazla-mesai/donemsel/v3-engine/adapter";
import { createEmptyDonemselForm, createEmptyWitness as donemselWitness } from "../fazla-mesai/donemsel/model";
import {
  computeDonemselHaftalikResultV3,
  netFromGrossFm as donemselHaftalikNet,
} from "../fazla-mesai/donemsel-haftalik/v3-engine/adapter";
import {
  createEmptyDonemselHaftalikForm,
  createEmptyWitness as donemselHaftalikWitness,
} from "../fazla-mesai/donemsel-haftalik/model";
import { computeYeraltiResultV3 } from "../fazla-mesai/yeralti-isci/v3-engine/adapter";
import { netFromGrossFm as yeraltiNet } from "../fazla-mesai/yeralti-isci/engine";
import { createEmptyForm as yeraltiForm } from "../fazla-mesai/yeralti-isci/model";
import { computeVardiya24Result, netFromGrossFm as vardiya24Net } from "../fazla-mesai/vardiya-24/engine";
import { createEmptyForm as vardiya24Form } from "../fazla-mesai/vardiya-24/model";
import { computeVardiya48Result, netFromGrossFm as vardiya48Net } from "../fazla-mesai/vardiya-48/engine";
import { createEmptyForm as vardiya48Form } from "../fazla-mesai/vardiya-48/model";
import { computeGemiGunlukResult, netFromGrossFm as gemiGunlukNet } from "../fazla-mesai/gemi-adami-gunluk/engine";
import { createEmptyForm as gemiGunlukForm } from "../fazla-mesai/gemi-adami-gunluk/model";
import { computeGemi724Result, netFromGrossFm as gemi724Net } from "../fazla-mesai/gemi-adami-7-24/engine";
import { createEmptyForm as gemi724Form } from "../fazla-mesai/gemi-adami-7-24/model";
import { calcHakkaniyet as ubgtHakkaniyet, calcSonBrutAlacak, calculateNet as ubgtNet } from "../ubgt/engine";
import { createEmptyForm as ubgtForm } from "../ubgt/model";
import { buildStandartUbgtPreviewSections } from "../ubgt/standart/buildStandartUbgtPreviewSections";
import { buildBilirkisiUbgtPreviewSections } from "../ubgt/bilirkisi/buildBilirkisiUbgtPreviewSections";
import { calculateNetFromBrut } from "../hafta-tatili/lib/net";
import { computeStandardHaftaTatili } from "../hafta-tatili/standard/engine";
import { createEmptyForm as htStandardForm } from "../hafta-tatili/standard/model";
import { buildStandartHtPreviewSections } from "../hafta-tatili/standard/buildStandartHtPreviewSections";
import { computeBasinHaftaTatili } from "../hafta-tatili/basin/engine";
import { createEmptyForm as htBasinForm } from "../hafta-tatili/basin/model";
import { buildBasinHtPreviewSections } from "../hafta-tatili/basin/buildBasinHtPreviewSections";
import { computeGemiHaftaTatili } from "../hafta-tatili/gemi/engine";
import { createEmptyForm as htGemiForm } from "../hafta-tatili/gemi/model";
import { buildGemiHtPreviewSections } from "../hafta-tatili/gemi/buildGemiHtPreviewSections";
import { SON_NET_LABEL, type GrossNetBreakdown } from "./EquityNetLines";

type Kesinti = { brut: number; sgk: number; issizlik: number; gv: number; damga: number; net: number };

const failures: string[] = [];
let checks = 0;

function check(cond: unknown, message: string): void {
  checks += 1;
  if (!cond) failures.push(message);
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

function expectKesinti(name: string, actual: Kesinti, expected: Kesinti): void {
  for (const key of ["brut", "sgk", "issizlik", "gv", "damga", "net"] as const) {
    check(sameMoney(actual[key], expected[key]), `${name} ${key}: ${actual[key]} ≠ ${expected[key]}`);
  }
}

/** Ücret gelirleri gelir vergisi tarifesi (GVK 103). */
const WAGE_BRACKETS: Record<number, Array<[number, number]>> = {
  2024: [
    [110000, 0.15],
    [230000, 0.2],
    [870000, 0.27],
    [3000000, 0.35],
    [Infinity, 0.4],
  ],
  2025: [
    [158000, 0.15],
    [330000, 0.2],
    [1200000, 0.27],
    [4300000, 0.35],
    [Infinity, 0.4],
  ],
};

function wageTax(year: number, matrah: number): number {
  let tax = 0;
  let floor = 0;
  for (const [ceiling, rate] of WAGE_BRACKETS[year]) {
    if (matrah <= floor) break;
    tax += (Math.min(matrah, ceiling) - floor) * rate;
    floor = ceiling;
  }
  return tax;
}

function v35Kesinti(brut: number, year: number): Kesinti {
  const sgk = r2(brut * 0.14);
  const issizlik = r2(brut * 0.01);
  const gv = r2(wageTax(year, brut - sgk - issizlik));
  const damga = r2(brut * 0.00759);
  return { brut, sgk, issizlik, gv, damga, net: r2(brut - sgk - issizlik - gv - damga) };
}

function fromFm(brut: number, r: { sgk: number; issizlik: number; gelirVergisi: number; damgaVergisi: number; net: number }): Kesinti {
  return { brut, sgk: r.sgk, issizlik: r.issizlik, gv: r.gelirVergisi, damga: r.damgaVergisi, net: r.net };
}

function fromNetResult(
  brut: number,
  r: { ssk: number; issizlik: number; gelirVergisi: number; damgaVergisi: number; netAmount: number },
): Kesinti {
  return { brut, sgk: r.ssk, issizlik: r.issizlik, gv: r.gelirVergisi, damga: r.damgaVergisi, net: r.netAmount };
}

function parseMoney(cell: string): number {
  const cleaned = cell.replace(/[₺\s]/g, "").replace(/^[−-]/, "").replace(/\./g, "").replace(",", ".");
  return Number(cleaned);
}

function kesintiFromSection(section: PreviewSection | undefined): Kesinti {
  const rows = section?.rows ?? [];
  const value = (match: (label: string) => boolean) => {
    const row = rows.find((r) => match(r[0] ?? ""));
    return row ? parseMoney(row[row.length - 1] ?? "") : Number.NaN;
  };
  return {
    brut: rows[0] ? parseMoney(rows[0][rows[0].length - 1] ?? "") : Number.NaN,
    sgk: value((l) => /SGK/i.test(l)),
    issizlik: value((l) => /şsizlik/i.test(l)),
    gv: value((l) => /^Gelir/i.test(l)),
    damga: value((l) => /amga/i.test(l)),
    net: rows.length ? parseMoney(rows[rows.length - 1][rows[rows.length - 1].length - 1] ?? "") : Number.NaN,
  };
}

/** Hakkaniyet/mahsup bölümündeki "Son Brüt Alacak" satırı ve ardından gelen son brütten nete satırları. */
function sonKesintiFromSection(section: PreviewSection | undefined): Kesinti {
  const rows = section?.rows ?? [];
  const start = rows.findIndex((r) => /^Son br[üu]t/i.test(r[0] ?? ""));
  const after = start >= 0 ? rows.slice(start + 1) : [];
  const value = (match: (label: string) => boolean) => {
    const row = after.find((r) => match(r[0] ?? ""));
    return row ? parseMoney(row[row.length - 1] ?? "") : Number.NaN;
  };
  return {
    brut: start >= 0 ? parseMoney(rows[start][rows[start].length - 1] ?? "") : Number.NaN,
    sgk: value((l) => /SGK/i.test(l)),
    issizlik: value((l) => /şsizlik/i.test(l)),
    gv: value((l) => /^Gelir/i.test(l)),
    damga: value((l) => /amga/i.test(l)),
    net: value((l) => l === SON_NET_LABEL),
  };
}

// 1) Doğrulanmış iki örnek (V3.5 ekran değerleri), kuruşu kuruşuna.
const ACCRUAL_2025 = "2025-12-31";
const UBGT_ORNEK: Kesinti = { brut: 13089.99, sgk: 1832.6, issizlik: 130.9, gv: 1668.97, damga: 99.35, net: 9358.17 };
const FM_ORNEK: Kesinti = { brut: 34540.29, sgk: 4835.64, issizlik: 345.4, gv: 4403.89, damga: 262.16, net: 24693.2 };
// İkinci hesap: toplam brüt − 1/3 hakkaniyet − mahsup (0) = son brüt → son net.
const FM_HAKKANIYET = 11513.43;
const FM_SON: Kesinti = { brut: 23026.86, sgk: 3223.76, issizlik: 230.27, gv: 2935.92, damga: 174.77, net: 16462.14 };
const UBGT_HAKKANIYET = 4363.33;
const UBGT_SON_BRUT = 8726.66;
const UBGT_SON_SGK = 1221.73;
const UBGT_SON_NET = 6238.77;

expectKesinti("referans formül UBGT örneği", v35Kesinti(UBGT_ORNEK.brut, 2025), UBGT_ORNEK);
expectKesinti("referans formül FM örneği", v35Kesinti(FM_ORNEK.brut, 2025), FM_ORNEK);
check(sameMoney(r2(FM_ORNEK.brut / 3), FM_HAKKANIYET), "FM örneği 1/3 hakkaniyet 11.513,43 olmalı");
check(sameMoney(r2(FM_ORNEK.brut - FM_HAKKANIYET - 0), FM_SON.brut), "FM örneği son brüt 23.026,86 olmalı");
expectKesinti("referans formül FM son brüt örneği", v35Kesinti(FM_SON.brut, 2025), FM_SON);
expectKesinti("UBGT calculateNet örnek 1", fromNetResult(UBGT_ORNEK.brut, ubgtNet(UBGT_ORNEK.brut, ACCRUAL_2025)), UBGT_ORNEK);
check(sameMoney(ubgtHakkaniyet(UBGT_ORNEK.brut), UBGT_HAKKANIYET), "UBGT örneği 1/3 hakkaniyet 4.363,33 olmalı");
check(sameMoney(calcSonBrutAlacak(UBGT_ORNEK.brut, UBGT_HAKKANIYET, 0), UBGT_SON_BRUT), "UBGT örneği son brüt 8.726,66 olmalı");
{
  const son = fromNetResult(UBGT_SON_BRUT, ubgtNet(UBGT_SON_BRUT, ACCRUAL_2025));
  expectKesinti("UBGT calculateNet son brüt örneği", son, v35Kesinti(UBGT_SON_BRUT, 2025));
  check(sameMoney(son.sgk, UBGT_SON_SGK) && sameMoney(son.net, UBGT_SON_NET), "UBGT son brüt örneği SGK 1.221,73 / net 6.238,77 olmalı");
}

const fmNetFns: Array<[string, (b: number, a: string) => { sgk: number; issizlik: number; gelirVergisi: number; damgaVergisi: number; net: number }]> = [
  ["standart", netFromGrossStandartFm],
  ["tanikli-standart", tanikliNet],
  ["haftalik-karma", karmaNet],
  ["donemsel", donemselNet],
  ["donemsel-haftalik", donemselHaftalikNet],
  ["yeralti-isci", yeraltiNet],
  ["vardiya-24", vardiya24Net],
  ["vardiya-48", vardiya48Net],
  ["gemi-adami-gunluk", gemiGunlukNet],
  ["gemi-adami-7-24", gemi724Net],
];
const fmNetByName = new Map(fmNetFns);
for (const [name, fn] of fmNetFns) {
  const ana = fromFm(FM_ORNEK.brut, fn(FM_ORNEK.brut, ACCRUAL_2025));
  const son = fromFm(FM_SON.brut, fn(FM_SON.brut, ACCRUAL_2025));
  expectKesinti(`${name} örnek 2 ana tablo`, ana, FM_ORNEK);
  expectKesinti(`${name} örnek 2 son brütten nete`, son, FM_SON);
  check(sameMoney(ana.net, 24693.2) && sameMoney(son.net, 16462.14), `${name} örnek 2: ana net 24.693,20 ve son net 16.462,14 birlikte olmalı`);
}
expectKesinti("hafta tatili calculateNetFromBrut örnek 2", fromNetResult(FM_ORNEK.brut, calculateNetFromBrut(FM_ORNEK.brut, ACCRUAL_2025)), FM_ORNEK);
expectKesinti("hafta tatili calculateNetFromBrut son brüt örneği", fromNetResult(FM_SON.brut, calculateNetFromBrut(FM_SON.brut, ACCRUAL_2025)), FM_SON);

// 2) Fazla mesai: sayfanın kullandığı hesap fonksiyonu, mahsupsuz ve mahsuplu.
const IN = "2023-01-01";
const OUT = "2024-12-31";
const TAX_YEAR = 2024;
const MAHSUP = "5000";

type FmPageResult = {
  toplamFm?: number;
  totalFm?: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  damgaVergisi: number;
  netYillik: number;
  sonNet?: number;
  mahsupSonrasiNet?: number;
};

const fmPages: Array<[string, (mahsup: string) => FmPageResult]> = [
  [
    "standart",
    (m) => computeStandartFmResultV3({ ...standartForm(), iseGiris: IN, istenCikis: OUT, davaciIn: "08:00", davaciOut: "20:00", mahsup: m }),
  ],
  [
    "tanikli-standart",
    (m) =>
      computeTanikliFmResultV3({
        ...tanikliForm(),
        iseGiris: IN,
        istenCikis: OUT,
        davaciIn: "08:00",
        davaciOut: "20:00",
        taniklar: [{ ...tanikliWitness(), name: "T", dateIn: IN, dateOut: OUT, in: "08:00", out: "20:00", weeklyDays: 6 }],
        mahsup: m,
      }),
  ],
  [
    "haftalik-karma",
    (m) =>
      computeHaftalikKarmaResultV3({
        ...createEmptyHaftalikKarmaForm(),
        iseGiris: IN,
        istenCikis: OUT,
        dayGroups: [
          { id: "g1", dayCount: "6", startTime: "08:00", endTime: "20:00" },
          { id: "g2", dayCount: "", startTime: "", endTime: "" },
        ],
        witnesses: [
          {
            ...karmaWitness(),
            name: "T",
            startISO: IN,
            endISO: OUT,
            dayGroups: [{ id: "w1", dayCount: "6", startTime: "08:00", endTime: "20:00" }],
          },
        ],
        mahsup: m,
      }),
  ],
  [
    "donemsel",
    (m) => {
      const f = createEmptyDonemselForm();
      const w = donemselWitness();
      const saat = { startTime: "08:00", endTime: "20:00" };
      return computeDonemselResultV3({
        ...f,
        dateIn: IN,
        dateOut: OUT,
        summerPattern: { ...f.summerPattern, ...saat },
        winterPattern: { ...f.winterPattern, ...saat },
        witnessesSeasons: [
          { ...w, name: "T", dateIn: IN, dateOut: OUT, summerPattern: { ...w.summerPattern, ...saat }, winterPattern: { ...w.winterPattern, ...saat } },
        ],
        mahsup: m,
      });
    },
  ],
  [
    "donemsel-haftalik",
    (m) => {
      const f = createEmptyDonemselHaftalikForm();
      const w = donemselHaftalikWitness();
      const p = { days1: "6", startTime: "08:00", endTime: "20:00" };
      return computeDonemselHaftalikResultV3({
        ...f,
        dateIn: IN,
        dateOut: OUT,
        summerPattern: { ...f.summerPattern, ...p },
        winterPattern: { ...f.winterPattern, ...p },
        witnessesSeasons: [
          { ...w, name: "T", dateIn: IN, dateOut: OUT, summerPattern: { ...w.summerPattern, ...p }, winterPattern: { ...w.winterPattern, ...p } },
        ],
        mahsup: m,
      });
    },
  ],
  [
    "yeralti-isci",
    (m) => computeYeraltiResultV3({ ...yeraltiForm(), davaciDateIn: IN, davaciDateOut: OUT, davaciIn: "08:00", davaciOut: "20:00", mahsup: m }),
  ],
  [
    "vardiya-24",
    (m) => {
      const f = vardiya24Form();
      return computeVardiya24Result({ ...f, iseGiris: IN, istenCikis: OUT, taniklar: [{ ...f.taniklar[0], name: "T", dateIn: IN, dateOut: OUT }], mahsup: m });
    },
  ],
  [
    "vardiya-48",
    (m) => {
      const f = vardiya48Form();
      return computeVardiya48Result({
        ...f,
        iseGiris: IN,
        istenCikis: OUT,
        taniklar: [{ ...f.taniklar[0], name: "T", dateIn: IN, dateOut: OUT }],
        mahsuplasmaMiktari: m,
      });
    },
  ],
  [
    "gemi-adami-gunluk",
    (m) => {
      const f = gemiGunlukForm();
      return computeGemiGunlukResult({
        ...f,
        iseGiris: IN,
        istenCikis: OUT,
        davaciIn: "08:00",
        davaciOut: "20:00",
        witnesses: [{ ...f.witnesses[0], name: "T", dateIn: IN, dateOut: OUT, in: "08:00", out: "20:00" }],
        mahsup: m,
      });
    },
  ],
  [
    "gemi-adami-7-24",
    (m) =>
      computeGemi724Result({ ...gemi724Form(), iseGiris: IN, istenCikis: OUT, witnesses: [{ id: "w1", name: "T", dateIn: IN, dateOut: OUT }], mahsup: m }),
  ],
];

const report: Array<Record<string, unknown>> = [];

function fmKesinti(r: FmPageResult): Kesinti {
  return { brut: r.toplamFm ?? r.totalFm ?? 0, sgk: r.sgk, issizlik: r.issizlik, gv: r.gelirVergisi, damga: r.damgaVergisi, net: r.netYillik };
}

for (const [name, run] of fmPages) {
  const plain = run("");
  const settled = run(MAHSUP);
  const full = fmKesinti(plain);
  const withMahsup = fmKesinti(settled);
  const sonBrut = settled.sonNet ?? settled.mahsupSonrasiNet ?? 0;
  check(full.brut > 0, `${name} toplam brüt sıfır`);
  expectKesinti(`${name} tam brüt (V3.5)`, full, v35Kesinti(full.brut, TAX_YEAR));
  expectKesinti(`${name} mahsuplu`, withMahsup, full);
  check(sonBrut < full.brut, `${name} son brüt tam brütten küçük olmalı`);
  check(!sameMoney(withMahsup.net, v35Kesinti(sonBrut, TAX_YEAR).net), `${name} net son brütten hesaplanmış`);
  const netFn = fmNetByName.get(name);
  const son = netFn ? fromFm(sonBrut, netFn(Math.max(0, sonBrut), OUT)) : fmKesinti(settled);
  expectKesinti(`${name} son brütten nete`, son, v35Kesinti(sonBrut, TAX_YEAR));
  check(son.net < withMahsup.net, `${name} son net ana netten küçük olmalı`);
  report.push({
    sayfa: `fazla-mesai/${name}`,
    anaTablo: withMahsup,
    sonBruttenNete: { ...son, brut: r2(sonBrut) },
  });
}

// 3) UBGT: önizleme oluşturucuları (Önizleme, PDF, Word ve UDF aynı bölümleri kullanır).
const ubgtBrut = UBGT_ORNEK.brut;
const ubgtEffective = ubgtNet(ubgtBrut, ACCRUAL_2025);
const ubgtHak = ubgtHakkaniyet(ubgtBrut);

/** UbgtCalcPage ile aynı: son brüt = brüt − hakkaniyet − mahsup; son brüt sayfanın calculateNet'i ile netleşir. */
function ubgtEquity(settle: number): { sonBrut: number; equityNet: GrossNetBreakdown } {
  const sonBrut = calcSonBrutAlacak(ubgtBrut, ubgtHak, settle);
  const raw = ubgtNet(sonBrut, ACCRUAL_2025);
  return {
    sonBrut,
    equityNet: {
      sgk: raw.ssk,
      issizlik: raw.issizlik,
      gelirVergisi: raw.gelirVergisi,
      gelirVergisiDilimleri: raw.gelirVergisiDilimleri,
      damgaVergisi: raw.damgaVergisi,
      net: raw.netAmount,
    },
  };
}

for (const settle of [0, 1000]) {
  const { sonBrut, equityNet } = ubgtEquity(settle);
  const ubgtBuilds: Array<[string, PreviewSection[]]> = [
    [
      "ubgt/alacagi",
      buildStandartUbgtPreviewSections({
        form: { ...ubgtForm("standart"), settleAmount: String(settle) },
        displayPeriods: [],
        displayTotalDays: 0,
        displayBrutForNet: ubgtBrut,
        effectiveNet: ubgtEffective,
        hakkaniyet: ubgtHak,
        settleNum: settle,
        sonBrutAlacak: sonBrut,
        equityNet,
      }),
    ],
    [
      "ubgt/bilirkisi",
      buildBilirkisiUbgtPreviewSections({
        form: { ...ubgtForm("bilirkisi"), settleAmount: String(settle) },
        displayPeriods: [],
        displayTotalDays: 0,
        displayBrutForNet: ubgtBrut,
        effectiveNet: ubgtEffective,
        hakkaniyet: ubgtHak,
        settleNum: settle,
        sonBrutAlacak: sonBrut,
        equityNet,
      }),
    ],
  ];
  for (const [name, sections] of ubgtBuilds) {
    const shown = kesintiFromSection(sections.find((s) => s.id === "brutten-nete"));
    expectKesinti(`${name} ana tablo (mahsup ${settle})`, shown, UBGT_ORNEK);
    const son = sonKesintiFromSection(sections.find((s) => s.id === "mahsuplasma"));
    expectKesinti(`${name} son brütten nete (mahsup ${settle})`, son, v35Kesinti(sonBrut, 2025));
    check(!sameMoney(shown.net, son.net), `${name} ana net ile son net ayrı olmalı (mahsup ${settle})`);
    const udfText = extractUdfCdata(buildPreviewUdfModel(sections).xml);
    check(udfText.includes("13.089,99") && udfText.includes("9.358,17"), `${name} UDF ana tablo neti eksik (mahsup ${settle})`);
    if (settle === 0) {
      check(sameMoney(son.brut, UBGT_SON_BRUT) && sameMoney(son.sgk, UBGT_SON_SGK) && sameMoney(son.net, UBGT_SON_NET), `${name} son net örneği 6.238,77 değil`);
      check(udfText.includes("8.726,66") && udfText.includes("6.238,77"), `${name} UDF son brüt/son net eksik`);
      report.push({ sayfa: name, anaTablo: shown, sonBruttenNete: son });
    }
  }
}

// 4) Hafta tatili: sayfanın hesap fonksiyonu + önizleme oluşturucusu, mahsupsuz ve mahsuplu.
function htRange() {
  return [{ id: "dr1", start: IN, end: OUT }];
}
const htPages: Array<[string, (settle: string) => { sections: PreviewSection[]; totalBrut: number; mahsupSonuc: number; net: Kesinti }]> = [
  [
    "hafta-tatili/standard",
    (s) => {
      const form = { ...htStandardForm(), dateRanges: htRange(), settleAmount: s };
      const result = computeStandardHaftaTatili(form);
      return { sections: buildStandartHtPreviewSections({ form, result }), totalBrut: result.totalBrut, mahsupSonuc: result.mahsupSonuc, net: fromNetResult(result.totalBrut, result.net) };
    },
  ],
  [
    "hafta-tatili/basin-is",
    (s) => {
      const form = { ...htBasinForm(), dateRanges: htRange(), settleAmount: s };
      const result = computeBasinHaftaTatili(form);
      return { sections: buildBasinHtPreviewSections({ form, result }), totalBrut: result.totalBrut, mahsupSonuc: result.mahsupSonuc, net: fromNetResult(result.totalBrut, result.net) };
    },
  ],
  [
    "hafta-tatili/gemi-adami",
    (s) => {
      const form = { ...htGemiForm(), dateRanges: htRange(), settleAmount: s };
      const result = computeGemiHaftaTatili(form);
      return { sections: buildGemiHtPreviewSections({ form, result }), totalBrut: result.totalBrut, mahsupSonuc: result.mahsupSonuc, net: fromNetResult(result.totalBrut, result.net) };
    },
  ],
];
for (const [name, run] of htPages) {
  const plain = run("");
  const settled = run(MAHSUP);
  check(plain.totalBrut > 0, `${name} toplam brüt sıfır`);
  const expected = v35Kesinti(plain.totalBrut, TAX_YEAR);
  expectKesinti(`${name} motor (V3.5)`, settled.net, expected);
  const shown = kesintiFromSection(settled.sections.find((s) => s.id === "brutten-nete"));
  expectKesinti(`${name} önizleme mahsuplu`, shown, expected);
  expectKesinti(`${name} önizleme mahsupsuz`, kesintiFromSection(plain.sections.find((s) => s.id === "brutten-nete")), expected);
  check(settled.mahsupSonuc < settled.totalBrut, `${name} son brüt tam brütten küçük olmalı`);
  check(!sameMoney(shown.net, v35Kesinti(settled.mahsupSonuc, TAX_YEAR).net), `${name} önizleme neti son brütten hesaplanmış`);
  for (const [label, run] of [["mahsuplu", settled], ["mahsupsuz", plain]] as const) {
    const son = sonKesintiFromSection(run.sections.find((s) => s.id === "mahsuplasma"));
    expectKesinti(`${name} son brütten nete ${label}`, son, v35Kesinti(run.mahsupSonuc, TAX_YEAR));
    check(son.net < expected.net, `${name} son net ana netten küçük olmalı (${label})`);
  }
  const sonMahsuplu = sonKesintiFromSection(settled.sections.find((s) => s.id === "mahsuplasma"));
  report.push({ sayfa: name, anaTablo: shown, sonBruttenNete: sonMahsuplu });
}

// 5) Kaynak koruması: ana Brütten Nete paneli/önizlemesi toplam brüte bağlı kalır;
//    hakkaniyet/mahsup bölümü son brütü ayrıca netleştirir (ekran, önizleme, kayıt).
const ROOT = path.resolve(process.cwd(), "src/pages/hesaplamalar");
function source(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}
function blockAfter(text: string, start: RegExp, ends: string[]): string {
  const m = start.exec(text);
  if (!m) return "";
  const from = m.index;
  const cut = ends.map((e) => text.indexOf(e, from + m[0].length)).filter((i) => i > 0);
  return text.slice(from, cut.length ? Math.min(...cut) : undefined);
}
/** Ana Brütten Nete bloğunda bulunamayacak son brüt / son net kaynakları. */
const SON_BRUT = /sonNet|mahsupSonrasiNet|sonBrutAlacak|mahsupSonuc|sonBrut\b|equityNet|equityRaw/;
/** İkinci hesap: son brüt sayfanın kendi brütten-nete fonksiyonuyla netleşir. */
const FM_SON_NET = /netFromGross\w*\(\s*(Math\.max\(\s*0\s*,\s*)?result\.(sonNet|mahsupSonrasiNet)/;
function expectSecondCalc(rel: string, text: string, patterns: Array<[RegExp | string, string]>): void {
  for (const [p, what] of patterns) {
    const ok = typeof p === "string" ? text.includes(p) : p.test(text);
    check(ok, `${rel}: ikinci hesap (son brüt → son net) eksik: ${what}`);
  }
}

const fmSources: Array<[string, string]> = [
  ["fazla-mesai/standart/StandartFmPage.tsx", "toplamFm"],
  ["fazla-mesai/tanikli-standart/TanikliStandartFmPage.tsx", "toplamFm"],
  ["fazla-mesai/haftalik-karma/HaftalikKarmaFmPage.tsx", "toplamFm"],
  ["fazla-mesai/donemsel/DonemselFmPage.tsx", "toplamFm"],
  ["fazla-mesai/donemsel-haftalik/DonemselHaftalikFmPage.tsx", "toplamFm"],
  ["fazla-mesai/yeralti-isci/YeraltiFmPage.tsx", "totalFm"],
  ["fazla-mesai/vardiya-24/Vardiya24FmPage.tsx", "toplamFm"],
  ["fazla-mesai/vardiya-48/Vardiya48FmPage.tsx", "toplamFm"],
  ["fazla-mesai/gemi-adami-gunluk/GemiGunlukFmPage.tsx", "toplamFm"],
  ["fazla-mesai/gemi-adami-7-24/Gemi724FmPage.tsx", "totalFm"],
];
for (const [rel, gross] of fmSources) {
  const text = source(rel);
  const preview = blockAfter(text, /id: "(brutnet|brutten-nete)"/, ["lastRowTone", "id: "]);
  check(preview.includes(`result.${gross})`), `${rel}: önizleme Brütten Nete toplam brüte bağlı değil`);
  check(!SON_BRUT.test(preview), `${rel}: önizleme Brütten Nete son brüt kullanıyor`);
  const panel = blockAfter(text, />Brütten [nN]ete[^<]*</, ["</article>", "</section>"]);
  check(panel.includes(`result.${gross})`), `${rel}: ekran Brütten Nete toplam brüte bağlı değil`);
  check(!SON_BRUT.test(panel), `${rel}: ekran Brütten Nete son brüt kullanıyor`);
  const mahsupPreview = blockAfter(text, /id: "(mahsup|hakkaniyet)"/, ["lastRowTone"]);
  expectSecondCalc(rel, text, [
    [FM_SON_NET, "son brüt sayfanın net fonksiyonuna verilmiyor"],
    ["<EquityNetLines", "hakkaniyet panelinde son brütten nete satırları"],
    ["kesinti={equityNet}", "hakkaniyet paneli son net dökümüne bağlı değil"],
  ]);
  expectSecondCalc(rel, mahsupPreview, [
    ["equityNetPreviewRows(", "önizleme hakkaniyet bölümünde son brütten nete satırları"],
    ["kesinti: equityNet", "önizleme hakkaniyet bölümü son net dökümüne bağlı değil"],
  ]);
  if (!rel.startsWith("fazla-mesai/standart/")) {
    expectSecondCalc(rel, text, [["sonNetAlacak: equityNet.net", "kayıtta sonNetAlacak"]]);
  }
}
expectSecondCalc("fazla-mesai/standart/backendCase.ts", source("fazla-mesai/standart/backendCase.ts"), [
  [/sonNetAlacak:\s*result\.tahakkukTarihi\s*\?\s*netFromGrossStandartFm\(\s*Math\.max\(\s*0\s*,\s*result\.sonNet\)/, "kayıtta sonNetAlacak"],
]);

const ubgtPage = source("ubgt/UbgtCalcPage.tsx");
const ubgtPanel = blockAfter(ubgtPage, />Brütten [nN]ete[^<]*</, ["</article>"]);
check(ubgtPanel.includes("formatMoney(displayBrutForNet)") && ubgtPanel.includes("effectiveNet.netAmount"), "UbgtCalcPage: ekran Brütten Nete toplam brüte bağlı değil");
check(!SON_BRUT.test(ubgtPanel), "UbgtCalcPage: ekran Brütten Nete son brüt kullanıyor");
expectSecondCalc("ubgt/UbgtCalcPage.tsx", ubgtPage, [
  [/calculateNet\(\s*sonBrutAlacak/, "son brüt calculateNet'e verilmiyor"],
  ["<EquityNetLines", "hakkaniyet panelinde son brütten nete satırları"],
  ["kesinti={equityNet}", "hakkaniyet paneli son net dökümüne bağlı değil"],
  ["formatMoney(equityNet.net)", "son net alacak kartı"],
  ["sonNetAlacak: equityNet.net", "kayıtta sonNetAlacak"],
]);

const htPage = source("hafta-tatili/lib/HaftaTatiliCalcPage.tsx");
const htPanel = blockAfter(htPage, />Brütten [nN]ete[^<]*</, ["</section>"]);
check(htPanel.includes("result.totalBrut") && htPanel.includes("result.net.netAmount"), "HaftaTatiliCalcPage: ekran Brütten Nete toplam brüte bağlı değil");
check(!SON_BRUT.test(htPanel), "HaftaTatiliCalcPage: ekran Brütten Nete son brüt kullanıyor");
const htPreview = blockAfter(htPage, /title: "Brüt'ten Net'e"/, ["lastRowTone", "id: "]);
check(htPreview.includes("result.totalBrut") && !SON_BRUT.test(htPreview), "HaftaTatiliCalcPage: önizleme Brütten Nete son brüt kullanıyor");
expectSecondCalc("hafta-tatili/lib/HaftaTatiliCalcPage.tsx", htPage, [
  [/calculateNetFromBrut\(\s*Math\.max\(\s*0\s*,\s*result\.mahsupSonuc\)/, "son brüt calculateNetFromBrut'a verilmiyor"],
  ["<EquityNetLines", "hakkaniyet panelinde son brütten nete satırları"],
  ["kesinti={equityNet}", "hakkaniyet paneli son net dökümüne bağlı değil"],
  ["sonNetAlacak: equityNet.net", "kayıtta sonNetAlacak"],
]);
expectSecondCalc("hafta-tatili/lib/HaftaTatiliCalcPage.tsx", blockAfter(htPage, /id: "hakkaniyet"/, ["lastRowTone"]), [
  ["equityNetPreviewRows(", "yedek önizleme hakkaniyet bölümünde son brütten nete satırları"],
]);

for (const rel of [
  "ubgt/standart/buildStandartUbgtPreviewSections.ts",
  "ubgt/bilirkisi/buildBilirkisiUbgtPreviewSections.ts",
  "hafta-tatili/standard/buildStandartHtPreviewSections.ts",
  "hafta-tatili/basin/buildBasinHtPreviewSections.ts",
  "hafta-tatili/gemi/buildGemiHtPreviewSections.ts",
]) {
  const text = source(rel);
  const block = blockAfter(text, /id: "brutten-nete"/, ["lastRowTone", "id: "]);
  check(block.length > 0 && !SON_BRUT.test(block), `${rel}: önizleme Brütten Nete son brüt kullanıyor`);
  check(!/calculateNet(FromBrut)?\(/.test(block), `${rel}: önizleme ana tabloyu kendisi netleştiriyor`);
  expectSecondCalc(rel, blockAfter(text, /id: "mahsuplasma"/, ["lastRowTone"]), [
    ["equityNetPreviewRows(", "önizleme hakkaniyet bölümünde son brütten nete satırları"],
  ]);
}

check(!sameMoney(FM_ORNEK.net, FM_SON.net) && !sameMoney(UBGT_ORNEK.net, UBGT_SON_NET), "ana net ile son net ayrı değerler olmalı");

console.log(JSON.stringify({ proje: path.basename(process.cwd()), kontrol: checks, sayfalar: report }, null, 1));
if (failures.length > 0) {
  console.error(`brütten nete parite testi BAŞARISIZ (${failures.length}/${checks}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`brütten nete parite testi ok (${checks} kontrol, ${report.length} sayfa)`);
