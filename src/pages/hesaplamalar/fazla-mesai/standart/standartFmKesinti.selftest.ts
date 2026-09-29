/**
 * Standart Fazla Mesai tarihsel kesinti testleri.
 * Toplam brüt, son tahakkuk tarihinde bir kez netleştirilir.
 */
import { calculateIncomeTaxWithBrackets, incomeTaxRates } from "./v3-engine/lib/incomeTaxCore";
import { DAMGA_VERGISI_ORANI } from "./v3-engine/lib/fazlaMesai/tableDisplayPipeline";
import {
  computeStandartFmResultV3,
  lastStandartFmAccrualIso,
  netFromGrossStandartFm,
} from "./v3-engine/adapter";
import { runStandartFmV3Pipeline } from "./v3-engine/pipeline";
import { standartPreviewCetvelCells } from "./previewPeriodLabel";
import { buildStandartSaveData, mapStandartFormFromBackend } from "./backendCase";
import { formatMoney } from "./engine";
import { createEmptyForm } from "./model";
import {
  WageIncomeTaxError,
  standartFmDamgaLabel,
  standartFmDamgaOrani,
  standartFmIssizlikLabel,
  standartFmIssizlikOrani,
  standartFmSgkOrani,
  wageIncomeTaxBracketsForDate,
  standartFmWagePeriods,
} from "./v3-engine/lib/standartFmKesinti";

function assert(ok: boolean, label: string): void {
  if (!ok) throw new Error(label);
}

function near(actual: number, expected: number, label: string): void {
  assert(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} !== ${expected}`);
}

function calc(start: string, end: string) {
  const form = createEmptyForm();
  form.iseGiris = start;
  form.istenCikis = end;
  form.davaciIn = "08:00";
  form.davaciOut = "18:00";
  form.weeklyDays = 6;
  form.katSayi = "1";
  return computeStandartFmResultV3(form);
}

function cumulativeHolds(iso: string): boolean {
  const brackets = wageIncomeTaxBracketsForDate(iso);
  let expectedTax = 0;
  let prevLimit = 0;
  for (const bracket of brackets) {
    if (Math.abs(bracket.baseLimit - prevLimit) > 1e-9) return false;
    if (Math.abs(bracket.baseTax - expectedTax) > 1e-6) return false;
    if (bracket.limit === null) return true;
    expectedTax = bracket.baseTax + (bracket.limit - bracket.baseLimit) * bracket.rate;
    prevLimit = bracket.limit;
  }
  return false;
}

assert(standartFmSgkOrani("1996-01-01") === 0.14, "SGK 1996");
assert(standartFmSgkOrani("2026-09-26") === 0.14, "SGK 2026");
assert(standartFmIssizlikOrani("2000-05-31") === 0, "işsizlik 31.05.2000");
assert(standartFmIssizlikOrani("2000-06-01") === 0.02, "işsizlik 01.06.2000");
assert(standartFmIssizlikOrani("2001-12-31") === 0.02, "işsizlik 31.12.2001");
assert(standartFmIssizlikOrani("2002-01-01") === 0.01, "işsizlik 01.01.2002");
assert(standartFmDamgaOrani("1999-08-15") === 0.0048, "damga 15.08.1999");
assert(standartFmDamgaOrani("1999-08-16") === 0.006, "damga 16.08.1999");
assert(standartFmDamgaOrani("2004-12-31") === 0.006, "2004 damga binde 6");
assert(standartFmDamgaOrani("2009-12-31") === 0.006, "damga 2009");
assert(standartFmDamgaOrani("2010-01-01") === 0.0066, "damga 2010");
assert(standartFmDamgaOrani("2012-12-31") === 0.0066, "damga 2012");
assert(standartFmDamgaOrani("2013-01-01") === 0.00759, "damga 2013");
assert(DAMGA_VERGISI_ORANI === 0.00759, "satır yaklaşımı sabiti durur");
assert(standartFmDamgaLabel(0.00759) === "Damga Vergisi (Binde 7,59)", "2013+ damga etiketi");
assert(standartFmIssizlikLabel(0.01) === "İşsizlik (%1)", "2013+ işsizlik etiketi");

const y1996 = wageIncomeTaxBracketsForDate("1996-07-31");
assert(y1996[0].limit === 300 && y1996[0].rate === 0.25 && y1996[0].baseTax === 0, "1996 ilk dilim");
assert(y1996[y1996.length - 1].rate === 0.55 && y1996[y1996.length - 1].baseTax === 4335, "1996 son dilim");
assert(y1996[0].limit !== 300 / 1_000_000, "1996 eşik bir kez bölünür");
const y1997 = wageIncomeTaxBracketsForDate("1997-12-31");
assert(y1997[0].limit === 500 && y1997[0].rate === 0.25, "1997 ilk dilim");
assert(wageIncomeTaxBracketsForDate("1998-06-30")[0].rate === 0.25, "30.06.1998 tarife");
assert(wageIncomeTaxBracketsForDate("1998-07-01")[0].rate === 0.2, "01.07.1998 tarife");
assert(wageIncomeTaxBracketsForDate("1998-07-01")[0].limit === 1000, "1998 ikinci dönem eşiği");

const y2000 = wageIncomeTaxBracketsForDate("2000-12-31");
assert(y2000[y2000.length - 1].baseTax === 19250, "2000 son baseTax 19.250");
assert(y2000[y2000.length - 1].baseTax !== 22375, "2000 yanlış taban yok");

const y2003 = wageIncomeTaxBracketsForDate("2003-06-01");
assert(
  y2003.map((b) => b.limit).join(",") === "5000,12000,24000,60000,120000,",
  "2003 ücret eşikleri",
);
assert(y2003.map((b) => b.rate).join(",") === "0.15,0.2,0.25,0.3,0.35,0.4", "2003 ücret oranları");
assert(y2003.length === 6 && y2003[5].rate === 0.4, "2003 ücret tarifesi altı dilim");

const y2004 = wageIncomeTaxBracketsForDate("2004-12-31");
assert(y2004[0].limit === 6000 && y2004[y2004.length - 1].rate === 0.4, "2004 ücret ve %40");
const y2005 = wageIncomeTaxBracketsForDate("2005-01-01");
assert(y2005[0].limit === 6600 && y2005[y2005.length - 1].rate === 0.35, "2005 ücret tarifesi");
assert(y2005[0].limit !== 6600 / 1_000_000, "2005 bölünmez");
assert(incomeTaxRates[2010][0].limit === 8800 && incomeTaxRates[2010][2].rate === 0.27, "2010 tablo durur");
assert(incomeTaxRates[2013][0].limit === 10700, "2013 tablo durur");
assert(wageIncomeTaxBracketsForDate("2009-12-31")[0].limit === 8700, "2009 eşiği");
assert(wageIncomeTaxBracketsForDate("2010-01-01")[0].limit === 8800, "2010 eşiği");

for (const period of standartFmWagePeriods()) {
  assert(cumulativeHolds(period.start), `kümülatif ${period.start}`);
}

const sameBrut = 1000;
const june1998 = netFromGrossStandartFm(sameBrut, "1998-06-30");
const july1998 = netFromGrossStandartFm(sameBrut, "1998-07-01");
near(june1998.gelirVergisi, 220.5, "30.06.1998 GV");
near(july1998.gelirVergisi, 172, "01.07.1998 GV");
near(june1998.damgaVergisi, 4.8, "30.06.1998 damga");
near(july1998.damgaVergisi, 4.8, "01.07.1998 damga");
near(june1998.issizlik, 0, "1998 işsizlik");

const aug15 = netFromGrossStandartFm(sameBrut, "1999-08-15");
const aug16 = netFromGrossStandartFm(sameBrut, "1999-08-16");
near(aug15.damgaVergisi, 4.8, "15.08.1999 damga tutarı");
near(aug16.damgaVergisi, 6, "16.08.1999 damga tutarı");
near(aug15.gelirVergisi, aug16.gelirVergisi, "1999 damga sınırında GV aynı");
near(aug15.issizlik, 0, "15.08.1999 işsizlik");

const may2000 = netFromGrossStandartFm(sameBrut, "2000-05-31");
const jun2000 = netFromGrossStandartFm(sameBrut, "2000-06-01");
near(may2000.issizlik, 0, "31.05.2000 işsizlik tutarı");
near(jun2000.issizlik, 20, "01.06.2000 işsizlik tutarı");
near(may2000.damgaVergisi, 6, "31.05.2000 damga");
near(jun2000.damgaVergisi, 6, "01.06.2000 damga");

const end2001 = netFromGrossStandartFm(sameBrut, "2001-12-31");
const start2002 = netFromGrossStandartFm(sameBrut, "2002-01-01");
near(end2001.issizlik, 20, "31.12.2001 işsizlik");
near(start2002.issizlik, 10, "01.01.2002 işsizlik");

const end2004 = netFromGrossStandartFm(20000, "2004-12-31");
const start2005 = netFromGrossStandartFm(20000, "2005-01-01");
near(end2004.gelirVergisi, 3250, "31.12.2004 GV");
near(start2005.gelirVergisi, 3170, "01.01.2005 GV");
near(end2004.damgaVergisi, 120, "31.12.2004 damga");
near(start2005.damgaVergisi, 120, "01.01.2005 damga");
assert(start2005.gelirVergisi !== 2960, "2005, 2010 tarifesi değil");

const end2009 = netFromGrossStandartFm(11000, "2009-12-31");
const start2010 = netFromGrossStandartFm(11000, "2010-01-01");
near(end2009.gelirVergisi, 1435, "2009 GV");
near(start2010.gelirVergisi, 1430, "2010 GV");
near(end2009.damgaVergisi, 66, "2009 damga");
near(start2010.damgaVergisi, 72.6, "2010 damga");

const end2012 = netFromGrossStandartFm(sameBrut, "2012-12-31");
const start2013 = netFromGrossStandartFm(sameBrut, "2013-01-01");
near(end2012.damgaVergisi, 6.6, "2012 damga");
near(start2013.damgaVergisi, 7.59, "2013 damga");
near(end2012.gelirVergisi, 127.5, "2012 GV");
near(start2013.gelirVergisi, 127.5, "2013 GV");
near(start2013.net, 714.91, "2013 örnek net");

let unknownThrew = false;
try {
  calculateIncomeTaxWithBrackets(1996, 1000);
} catch (error) {
  unknownThrew = error instanceof WageIncomeTaxError && error.message.includes("2010 tarifesine geçilmedi");
}
assert(unknownThrew, "bilinmeyen yıl 2010'a düşmez");
let dateThrew = false;
try {
  netFromGrossStandartFm(1000, "1995-12-31");
} catch (error) {
  dateThrew = error instanceof WageIncomeTaxError && !error.message.includes("2010 tarifesi uygulandı");
}
assert(dateThrew, "1995 kontrollü hata");

assert(
  lastStandartFmAccrualIso([
    { endISO: "1999-12-31", isDeductionRow: false },
    { endISO: "2000-06-01", isDeductionRow: true },
  ]) === "1999-12-31",
  "düşüm satırı tahakkuk tarihi olmaz",
);
assert(
  lastStandartFmAccrualIso([
    { endISO: "1999-12-31", isDeductionRow: false },
    { endISO: "2000-01-01", isDeductionRow: false },
  ]) === "2000-01-01",
  "en son tahakkuk günü",
);

const early1996 = calc("1996-01-01", "1996-07-31");
assert(early1996.tahakkukTarihi === "1996-07-31", "1996 tahakkuk");
assert(early1996.issizlik === 0 && early1996.damgaOran === 0.0048 && early1996.sgkOran === 0.14, "1996 oranlar");
assert(early1996.gelirVergisiDilimleri === "(%25)", "1996 dilim");
near(early1996.toplamFm, 15.23, "1996 brüt");
near(early1996.sgk, 2.13, "1996 SGK");
near(early1996.damgaVergisi, 0.07, "1996 damga");
near(early1996.gelirVergisi, 3.28, "1996 GV");
near(early1996.netYillik, 9.75, "1996 net");

const early1997 = calc("1997-01-01", "1997-07-31");
assert(early1997.tahakkukTarihi === "1997-07-31", "1997 tahakkuk");
assert(early1997.issizlikOran === 0 && early1997.damgaOran === 0.0048, "1997 oranlar");
assert(early1997.gelirVergisiDilimleri === "(%25)", "1997 dilim");

const span = calc("1999-01-01", "2000-12-31");
const weekSum = span.rows.reduce((sum, row) => sum + (row.isDeductionRow ? 0 : row.weeks), 0);
const hourSet = new Set(span.rows.map((row) => row.fmHours));
assert(span.rows.length === 7 && weekSum === 105 && hourSet.size === 1 && hourSet.has(9), "çok yıl hafta ve saat");
near(span.toplamFm, 630.04, "çok yıl brüt");
assert(span.tahakkukTarihi === "2000-12-31", "çok yıl son tahakkuk");
const once = netFromGrossStandartFm(span.toplamFm, span.tahakkukTarihi);
near(span.netYillik, once.net, "tek netleştirme");
near(span.sgk, once.sgk, "tek SGK");
near(span.issizlik, once.issizlik, "tek işsizlik");
near(span.gelirVergisi, once.gelirVergisi, "tek GV");
near(span.damgaVergisi, once.damgaVergisi, "tek damga");
near(span.netYillik, 446.07, "2000 tarifesiyle tek net");
const splitNet = Math.round(
  span.rows.reduce((sum, row) => sum + netFromGrossStandartFm(row.fm, row.endISO).net, 0) * 100,
) / 100;
assert(splitNet !== span.netYillik, "yıllar ayrı netleştirilmez");

const GROSS_LOCK = {
  "2005": { fm: 1524.74, weeks: 52, hours: 9, rows: 1, oldNet: 1090.06, net: 1092.48 },
  "2010": { fm: 2323.62, weeks: 52, hours: 9, rows: 2, oldNet: 1661.17, net: 1663.47 },
  "2012": { fm: 2850.12, weeks: 52, hours: 9, rows: 2, oldNet: 2037.58, net: 2040.4 },
  "2013": { fm: 3120.16, weeks: 52, hours: 9, rows: 2, oldNet: 2230.64, net: 2230.64 },
  "2024": { fm: 62407.8, weeks: 52, hours: 9, rows: 1, oldNet: 44615.96, net: 44615.96 },
  "2025": { fm: 81137.16, weeks: 52, hours: 9, rows: 1, oldNet: 58005.77, net: 58005.77 },
  "2026": { fm: 103053.6, weeks: 52, hours: 9, rows: 1, oldNet: 73674.05, net: 73674.05 },
} as const;

const report: Record<string, { fm: number; net: number; oldNet: number; damga: number; gv: number }> = {};
for (const year of Object.keys(GROSS_LOCK) as Array<keyof typeof GROSS_LOCK>) {
  const result = calc(`${year}-01-01`, `${year}-12-31`);
  const lock = GROSS_LOCK[year];
  const weeks = result.rows.reduce((sum, row) => sum + row.weeks, 0);
  assert(result.rows.length === lock.rows, `${year} satır`);
  assert(weeks === lock.weeks, `${year} hafta`);
  assert(result.rows.every((row) => row.fmHours === lock.hours), `${year} saat`);
  near(result.toplamFm, lock.fm, `${year} brüt`);
  near(result.sonNet, lock.fm / 3 * 2, `${year} son brüt`);
  near(result.netYillik, lock.net, `${year} net`);
  assert(result.warnings.length === 0, `${year} uyarı yok`);
  report[year] = {
    fm: result.toplamFm,
    net: result.netYillik,
    oldNet: lock.oldNet,
    damga: result.damgaVergisi,
    gv: result.gelirVergisi,
  };
}
assert(report["2005"].net !== report["2005"].oldNet, "2005 net tarihsel düzeltme");
assert(report["2010"].net !== report["2010"].oldNet, "2010 net damga düzeltmesi");
assert(report["2012"].net !== report["2012"].oldNet, "2012 net damga düzeltmesi");
assert(report["2013"].net === report["2013"].oldNet, "2013 net aynı");
assert(report["2026"].net === report["2026"].oldNet, "2026 net aynı");

const equity2024 = netFromGrossStandartFm(50000, 2024);
near(equity2024.sgk, 7000, "2024 son brüt SGK");
near(equity2024.issizlik, 500, "2024 son brüt işsizlik");
near(equity2024.gelirVergisi, 6375, "2024 son brüt GV");
near(equity2024.damgaVergisi, 379.5, "2024 son brüt damga");
near(equity2024.net, 35745.5, "2024 son brüt net");

function visibleCase(start: string, end: string) {
  const form = createEmptyForm();
  form.iseGiris = start;
  form.istenCikis = end;
  form.davaciIn = "08:00";
  form.davaciOut = "18:00";
  form.weeklyDays = 6;
  form.katSayi = "1";
  const result = computeStandartFmResultV3(form);
  const pipeline = runStandartFmV3Pipeline({
    iseGiris: form.iseGiris,
    istenCikis: form.istenCikis,
    davaciIn: form.davaciIn,
    davaciOut: form.davaciOut,
    weeklyDays: form.weeklyDays,
    sevenDayMode: form.sevenDayMode,
    haftaTatiliGunu: form.haftaTatiliGunu,
    katSayi: 1,
    mode270: form.mode270,
    exclusions: [],
    zamanasimiBaslangic: null,
    rowOverrides: {},
    manualRows: [],
  });
  return { form, result, pipeline };
}

function shown(value: number): string {
  return formatMoney(value);
}

const visible1996 = visibleCase("1996-01-01", "1996-07-31");
assert(shown(visible1996.result.toplamFm) === "15,23", "görünen 1996 brüt");
assert(shown(visible1996.result.sgk) === "2,13", "görünen 1996 SGK");
assert(shown(visible1996.result.issizlik) === "0,00", "görünen 1996 işsizlik");
assert(shown(visible1996.result.gelirVergisi) === "3,28", "görünen 1996 GV");
assert(shown(visible1996.result.damgaVergisi) === "0,07", "görünen 1996 damga");
assert(shown(visible1996.result.netYillik) === "9,75", "görünen 1996 net");

const visibleChecks: Array<[string, string, string, string]> = [
  ["2005-01-01", "2005-12-31", "1.524,74", "1.092,48"],
  ["2010-01-01", "2010-12-31", "2.323,62", "1.663,47"],
  ["2012-01-01", "2012-12-31", "2.850,12", "2.040,40"],
  ["2024-01-01", "2024-12-31", "62.407,80", "44.615,96"],
];
const visibleReport: Record<string, { brut: string; net: string }> = {
  "1996": { brut: shown(visible1996.result.toplamFm), net: shown(visible1996.result.netYillik) },
};
for (const [start, end, brutText, netText] of visibleChecks) {
  const sample = visibleCase(start, end);
  assert(shown(sample.result.toplamFm) === brutText, `görünen brüt ${start}`);
  assert(shown(sample.result.netYillik) === netText, `görünen net ${start}`);
  visibleReport[start.slice(0, 4)] = { brut: shown(sample.result.toplamFm), net: shown(sample.result.netYillik) };
}

const approx1996 = Number((15.23 * (1 - 0.00759 - 0.15)).toFixed(2));
near(approx1996, 12.83, "1996 satır yaklaşık net");
assert(visible1996.pipeline.totalNet !== visible1996.result.netYillik, "yaklaşık toplam resmi net değil");
near(visible1996.pipeline.tableDisplayRows[0].net ?? 0, approx1996, "pipeline satır net yaklaşık");
assert(!("net" in visible1996.result.rows[0]), "cetvel satırında net alanı yok");
const cetvelCell = standartPreviewCetvelCells({
  dateRange: "01.01.1996 – 31.07.1996",
  weeks: String(visible1996.result.rows[0].weeks),
  wage: shown(visible1996.result.rows[0].brut),
  katsayi: "1",
  fmHours: visible1996.result.rows[0].fmHours.toFixed(2).replace(".", ","),
  fm: shown(visible1996.result.rows[0].fm),
});
assert(cetvelCell[cetvelCell.length - 1] === "15,23", "önizleme cetveli brüt FM");
assert(!cetvelCell.includes("12,83"), "önizleme cetvelinde yaklaşık net yok");
assert(visible1996.result.hakkaniyetIndirimi === visible1996.result.toplamFm / 3, "hakkaniyet brütten");
assert(
  visible1996.result.sonNet === visible1996.result.toplamFm - visible1996.result.hakkaniyetIndirimi,
  "son brüt yaklaşık netten gelmez",
);

const payload = buildStandartSaveData(visible1996.form, visible1996.result);
const payloadText = JSON.stringify(payload);
assert(payload.net_total === 9.75, "kayıt resmi net");
assert(!payloadText.includes("12.83") && !payloadText.includes("12,83"), "kayıtta yaklaşık net yok");
const reopened = mapStandartFormFromBackend(payload);
assert(reopened != null, "kayıt formu açılır");
if (reopened) {
  const again = computeStandartFmResultV3(reopened);
  near(again.netYillik, 9.75, "yeniden açılan resmi net");
  near(again.toplamFm, 15.23, "yeniden açılan brüt");
  assert(!("net" in again.rows[0]), "yeniden açılan satırda yaklaşık net yok");
}

console.log(JSON.stringify({
  y1996: { fm: early1996.toplamFm, net: early1996.netYillik, sgk: early1996.sgk, gv: early1996.gelirVergisi, damga: early1996.damgaVergisi },
  span: { fm: span.toplamFm, weeks: weekSum, net: span.netYillik, splitNet, tahakkuk: span.tahakkukTarihi },
  report,
  visibleReport,
  approx1996,
  pipelineTotalNet1996: visible1996.pipeline.totalNet,
}));
console.log("standart fm kesinti selftest ok");
