/**
 * Standart Fazla Mesai — 1996–2004 Eski TL pilot koruması.
 * 2005 sonrası ücret ve toplamlar değişmemeli.
 */
import { asgariUcretler } from "./v3-engine/lib/asgariUcretler";
import { segmentOvertimeResult } from "./v3-engine/lib/dateSegmentationCore";
import { computeStandartFmResultV3 } from "./v3-engine/adapter";
import { createEmptyForm } from "./model";
import { validateDateRange } from "./engine";
import { buildStandartSaveData, mapStandartFormFromBackend, runBackendCaseSelfTests } from "./backendCase";
import {
  formatHistoricalTrl,
  formatTrlWageLines,
  formatTryEquivalent,
  parseTurkishAmount,
  scaleTableBrut,
  trlHistoricalToTry,
} from "./trlScale";

const EXPECTED_PRE_2005: { start: string; end: string; brut: number; normalized: string }[] = [
  { start: "1996-01-01", end: "1996-07-31", brut: 8460000, normalized: "8,46" },
  { start: "1996-08-01", end: "1997-07-31", brut: 17010000, normalized: "17,01" },
  { start: "1997-08-01", end: "1998-07-31", brut: 35437500, normalized: "35,4375" },
  { start: "1998-08-01", end: "1998-09-30", brut: 47839500, normalized: "47,8395" },
  { start: "1998-10-01", end: "1998-12-31", brut: 47839500, normalized: "47,8395" },
  { start: "1999-01-01", end: "1999-06-30", brut: 78075000, normalized: "78,075" },
  { start: "1999-07-01", end: "1999-08-15", brut: 93600000, normalized: "93,60" },
  { start: "1999-08-16", end: "1999-12-31", brut: 93600000, normalized: "93,60" },
  { start: "2000-01-01", end: "2000-03-31", brut: 109800000, normalized: "109,80" },
  { start: "2000-04-01", end: "2000-05-31", brut: 109800000, normalized: "109,80" },
  { start: "2000-06-01", end: "2000-06-30", brut: 109800000, normalized: "109,80" },
  { start: "2000-07-01", end: "2000-12-31", brut: 118800000, normalized: "118,80" },
  { start: "2001-01-01", end: "2001-03-31", brut: 139950000, normalized: "139,95" },
  { start: "2001-04-01", end: "2001-06-30", brut: 139950000, normalized: "139,95" },
  { start: "2001-07-01", end: "2001-07-31", brut: 146947500, normalized: "146,9475" },
  { start: "2001-08-01", end: "2001-12-31", brut: 167940000, normalized: "167,94" },
  { start: "2002-01-01", end: "2002-03-31", brut: 222000750, normalized: "222,00075" },
  { start: "2002-04-01", end: "2002-06-30", brut: 222000750, normalized: "222,00075" },
  { start: "2002-07-01", end: "2002-12-31", brut: 250875000, normalized: "250,875" },
  { start: "2003-01-01", end: "2003-03-31", brut: 306000000, normalized: "306,00" },
  { start: "2003-04-01", end: "2003-06-30", brut: 306000000, normalized: "306,00" },
  { start: "2003-07-01", end: "2003-12-31", brut: 306000000, normalized: "306,00" },
  { start: "2004-01-01", end: "2004-06-30", brut: 423000000, normalized: "423,00" },
  { start: "2004-07-01", end: "2004-12-31", brut: 444150000, normalized: "444,15" },
];

const EXPECTED_FROM_2005: { start: string; end: string; brut: number }[] = [
  { start: "2005-01-01", end: "2005-12-31", brut: 488.7 },
  { start: "2006-01-01", end: "2006-12-31", brut: 531 },
  { start: "2007-01-01", end: "2007-06-30", brut: 562.5 },
  { start: "2007-07-01", end: "2007-12-31", brut: 585 },
  { start: "2008-01-01", end: "2008-06-30", brut: 608.4 },
  { start: "2008-07-01", end: "2008-12-31", brut: 638.7 },
  { start: "2009-01-01", end: "2009-06-30", brut: 666 },
  { start: "2009-07-01", end: "2009-12-31", brut: 693 },
  { start: "2010-01-01", end: "2010-06-30", brut: 729 },
  { start: "2010-07-01", end: "2010-12-31", brut: 760.5 },
  { start: "2011-01-01", end: "2011-06-30", brut: 796.5 },
  { start: "2011-07-01", end: "2011-12-31", brut: 837 },
  { start: "2012-01-01", end: "2012-06-30", brut: 886.5 },
  { start: "2012-07-01", end: "2012-12-31", brut: 940.5 },
  { start: "2013-01-01", end: "2013-06-30", brut: 978.6 },
  { start: "2013-07-01", end: "2013-12-31", brut: 1021.5 },
  { start: "2014-01-01", end: "2014-06-30", brut: 1071 },
  { start: "2014-07-01", end: "2014-12-31", brut: 1134 },
  { start: "2015-01-01", end: "2015-06-30", brut: 1201.5 },
  { start: "2015-07-01", end: "2015-12-31", brut: 1273.5 },
  { start: "2016-01-01", end: "2016-12-31", brut: 1647 },
  { start: "2017-01-01", end: "2017-12-31", brut: 1777.5 },
  { start: "2018-01-01", end: "2018-12-31", brut: 2029.5 },
  { start: "2019-01-01", end: "2019-12-31", brut: 2558.4 },
  { start: "2020-01-01", end: "2020-12-31", brut: 2943 },
  { start: "2021-01-01", end: "2021-12-31", brut: 3577.5 },
  { start: "2022-01-01", end: "2022-06-30", brut: 5004 },
  { start: "2022-07-01", end: "2022-12-31", brut: 6471 },
  { start: "2023-01-01", end: "2023-06-30", brut: 10008 },
  { start: "2023-07-01", end: "2023-12-31", brut: 13414.5 },
  { start: "2024-01-01", end: "2024-12-31", brut: 20002.5 },
  { start: "2025-01-01", end: "2025-12-31", brut: 26005.5 },
  { start: "2026-01-01", end: "2026-12-31", brut: 33030 },
];

const GOLDEN = {
  "2024": { brut: 20002.5, fm: 62407.8, sonNet: 41605.2, netYillik: 44615.96 },
  "2025": { brut: 26005.5, fm: 81137.16, sonNet: 54091.44, netYillik: 58005.77 },
  "2026": { brut: 33030, fm: 103053.6, sonNet: 68702.4, netYillik: 73674.05 },
  "2005": { brut: 488.7, fm: 1524.74, sonNet: 1016.4933333333333, netYillik: 1092.48 },
} as const;

function assert(ok: boolean, label: string): void {
  if (!ok) throw new Error(label);
}

function addIsoDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function calc(start: string, end: string) {
  const form = createEmptyForm();
  form.iseGiris = start;
  form.istenCikis = end;
  form.davaciIn = "08:00";
  form.davaciOut = "18:00";
  form.weeklyDays = 6;
  form.katSayi = "1";
  return { form, result: computeStandartFmResultV3(form) };
}

const snapshotBefore = JSON.stringify(asgariUcretler);

const pre = asgariUcretler.filter((row) => row.start < "2005-01-01");
assert(pre.length === EXPECTED_PRE_2005.length, "1996-2004 dönem sayısı");
for (let i = 0; i < pre.length; i += 1) {
  const row = pre[i];
  const expected = EXPECTED_PRE_2005[i];
  assert(row.start === expected.start && row.end === expected.end && row.brut === expected.brut, `dönem ${expected.start}`);
  if (i > 0) {
    assert(row.start === addIsoDay(pre[i - 1].end), `boşluk/çakışma ${row.start}`);
    assert(row.start > pre[i - 1].end, `çakışma ${row.start}`);
  }
  const scaled = scaleTableBrut(row.start, row.brut);
  assert(scaled.currencyEra === "TRL" && scaled.conversionDivisor === 1_000_000, `dönem TRL ${row.start}`);
  assert(formatTryEquivalent(scaled.normalizedGross) === expected.normalized, `normalize ${expected.normalized}`);
  assert(scaled.historicalGross === row.brut, `kaynak korunur ${row.start}`);
  assert(trlHistoricalToTry(scaled.normalizedGross) !== scaled.normalizedGross || expected.brut < 1_000_000, "ikinci bölme ayrı alan");
}
assert(pre[0].start === "1996-01-01", "alt sınır");
assert(pre[pre.length - 1].end === "2004-12-31", "2004 bitiş");
assert(addIsoDay("2004-12-31") === "2005-01-01", "sınır günü");

const from2005 = asgariUcretler.filter((row) => row.start >= "2005-01-01");
assert(from2005.length === EXPECTED_FROM_2005.length, "2005+ satır sayısı");
for (let i = 0; i < from2005.length; i += 1) {
  const row = from2005[i];
  const expected = EXPECTED_FROM_2005[i];
  assert(row.start === expected.start && row.end === expected.end && row.brut === expected.brut, `2005+ ${expected.start}`);
  const scaled = scaleTableBrut(row.start, row.brut);
  assert(scaled.currencyEra === "TRY" && scaled.conversionDivisor === 1, `TRY ${row.start}`);
  assert(scaled.normalizedGross === row.brut, `TRY bölünmez ${row.start}`);
}

assert(parseTurkishAmount("444.150.000") === 444150000, "gruplu giriş");
assert(parseTurkishAmount("444150000") === 444150000, "düz giriş");
assert(parseTurkishAmount("1e6") === null, "bilimsel gösterim yok");
assert(formatHistoricalTrl(444150000) === "444.150.000", "tarihsel biçim");
assert(!formatHistoricalTrl(8460000).includes("e"), "bilimsel gösterim yok");

assert(validateDateRange("1995-12-31", "1996-07-31") !== null, "1995 reddedilir");
assert(validateDateRange("1996-01-01", "1996-07-31") === null, "1996 kabul");

for (const year of ["2024", "2025", "2026", "2005"] as const) {
  const { result } = calc(`${year}-01-01`, `${year}-12-31`);
  const golden = GOLDEN[year];
  assert(result.rows.length === 1, `${year} tek satır`);
  assert(result.rows[0].brut === golden.brut, `${year} brüt`);
  assert(result.rows[0].currencyEra === "TRY", `${year} TRY`);
  assert(result.toplamFm === golden.fm, `${year} toplam`);
  assert(result.sonNet === golden.sonNet, `${year} son net`);
  assert(result.netYillik === golden.netYillik, `${year} net`);
  assert(result.warnings.length === 0, `${year} uyarı yok`);
}

assert(segmentOvertimeResult({ start: "2022-01-01", end: "2022-12-31" }).length === 2, "2022 iki yarı");
assert(segmentOvertimeResult({ start: "2015-01-01", end: "2015-12-31" }).length === 1, "2015 tek yıl");
assert(segmentOvertimeResult({ start: "2005-01-01", end: "2005-12-31" }).length === 1, "2005 tek yıl");

const y1996 = calc("1996-01-01", "1996-07-31");
assert(y1996.result.rows.length === 1, "1996 tek satır");
assert(y1996.result.rows[0].historicalBrut === 8460000, "1996 tarihsel");
assert(formatTryEquivalent(y1996.result.rows[0].brut) === "8,46", "1996 normalize");
assert(y1996.result.rows[0].fm < 10000, "1996 sonuç Eski TL ile şişmez");
assert(y1996.result.toplamFm === y1996.result.rows[0].fm, "1996 toplam güncel ölçek");

const y2004 = calc("2004-07-01", "2004-12-31");
assert(y2004.result.rows.length === 1, "2004 tek satır");
assert(y2004.result.rows[0].startISO === "2004-07-01" && y2004.result.rows[0].endISO === "2004-12-31", "2004 sınır");
assert(y2004.result.rows[0].historicalBrut === 444150000, "2004 tarihsel");
assert(formatTryEquivalent(y2004.result.rows[0].brut) === "444,15", "2004 normalize");
const wageCell = formatTrlWageLines(444150000, y2004.result.rows[0].brut);
assert(wageCell.includes("444.150.000 Eski TL"), "önizleme tarihsel");
assert(wageCell.includes("(444,15 TL karşılığı)"), "önizleme karşılık");

const cross = calc("2004-07-01", "2005-06-30");
assert(cross.result.rows.length === 2, "geçiş iki satır");
const oldRow = cross.result.rows[0];
const newRow = cross.result.rows[1];
assert(oldRow.endISO === "2004-12-31" && oldRow.currencyEra === "TRL", "31.12.2004 Eski TL");
assert(oldRow.historicalBrut === 444150000, "geçiş tarihsel");
assert(formatTryEquivalent(oldRow.brut) === "444,15", "geçiş normalize");
assert(newRow.startISO === "2005-01-01" && newRow.brut === 488.7 && newRow.currencyEra === "TRY", "01.01.2005 güncel");
const crossSum = Math.round((oldRow.fm + newRow.fm) * 100) / 100;
assert(cross.result.toplamFm === crossSum, "geçiş toplamı aynı ölçek");

const manualOld = calc("2004-07-01", "2004-12-31");
manualOld.form.rowOverrides = {
  [manualOld.result.rows[0].id]: {
    brut: 900,
    historicalBrut: 900000000,
    currencyEra: "TRL",
    conversionDivisor: 1000000,
    brutManual: true,
  },
};
const manualOldResult = computeStandartFmResultV3(manualOld.form);
assert(manualOldResult.rows[0].brut === 900, "manuel 2004 bir kez 900 TL");
assert(manualOldResult.rows[0].historicalBrut === 900000000, "manuel 2004 tarihsel");
assert(manualOldResult.rows[0].fm !== manualOld.result.rows[0].fm, "manuel 2004 hesabı değişir");

const manualNew = calc("2005-01-01", "2005-12-31");
manualNew.form.rowOverrides = {
  [manualNew.result.rows[0].id]: {
    brut: 900,
    historicalBrut: 900,
    currencyEra: "TRY",
    conversionDivisor: 1,
    brutManual: true,
  },
};
const manualNewResult = computeStandartFmResultV3(manualNew.form);
assert(manualNewResult.rows[0].brut === 900, "manuel 2005 900 TL kalır");
assert(manualNewResult.rows[0].currencyEra === "TRY", "manuel 2005 TRY");

const ambiguous = calc("2004-07-01", "2004-12-31");
ambiguous.form.rowOverrides = {
  [ambiguous.result.rows[0].id]: { brut: 900000000, brutManual: true },
};
const ambiguousResult = computeStandartFmResultV3(ambiguous.form);
assert(formatTryEquivalent(ambiguousResult.rows[0].brut) === "444,15", "belirsiz tutar dönüştürülmez");
assert(ambiguousResult.rows[0].scaleMismatch === true, "belirsiz uyarı bayrağı");
assert(ambiguousResult.warnings.some((w) => w.includes("otomatik dönüştürülmedi")), "belirsiz uyarı");

const legacy = createEmptyForm();
legacy.iseGiris = "2024-01-01";
legacy.istenCikis = "2024-12-31";
legacy.davaciIn = "08:00";
legacy.davaciOut = "18:00";
legacy.weeklyDays = 6;
legacy.katSayi = "1";
const legacyBase = computeStandartFmResultV3(legacy);
legacy.rowOverrides = { [legacyBase.rows[0].id]: { brut: 25000, brutManual: true } };
const legacyResult = computeStandartFmResultV3(legacy);
assert(legacyResult.rows[0].brut === 25000, "eski manuel kayıt TRY");
assert(legacyBase.toplamFm === GOLDEN["2024"].fm, "eski otomatik kayıt");

const saved = buildStandartSaveData(manualOld.form, manualOldResult);
const restored = mapStandartFormFromBackend(saved);
assert(restored != null, "kayıt açılır");
const restoredOv = restored?.rowOverrides[manualOld.result.rows[0].id];
assert(restoredOv?.currencyEra === "TRL", "currencyEra kaybolmaz");
assert(restoredOv?.historicalBrut === 900000000, "tarihsel kayıt");
assert(restoredOv?.brut === 900, "normalize kayıt");
const oldSaved = buildStandartSaveData(legacy, legacyResult);
const oldRestored = mapStandartFormFromBackend(oldSaved);
assert(oldRestored?.rowOverrides[legacyBase.rows[0].id]?.brut === 25000, "eski kayıt brut");
assert(oldRestored?.rowOverrides[legacyBase.rows[0].id]?.currencyEra === undefined, "eski kayıt era eklemez");

const caseTests = runBackendCaseSelfTests();
assert(caseTests.failures.length === 0, `eski kayıt testi ${caseTests.failures.join(",")}`);

assert(JSON.stringify(asgariUcretler) === snapshotBefore, "kaynak tablo mutasyon yok");

console.log(JSON.stringify({
  y1996: {
    historical: y1996.result.rows[0].historicalBrut,
    normalized: y1996.result.rows[0].brut,
    fm: y1996.result.rows[0].fm,
    toplam: y1996.result.toplamFm,
  },
  y2004: {
    historical: y2004.result.rows[0].historicalBrut,
    normalized: y2004.result.rows[0].brut,
    weeks: y2004.result.rows[0].weeks,
    fm: y2004.result.rows[0].fm,
    toplam: y2004.result.toplamFm,
  },
  cross: cross.result.rows.map((row) => ({
    start: row.startISO,
    end: row.endISO,
    era: row.currencyEra,
    historical: row.historicalBrut,
    brut: row.brut,
    weeks: row.weeks,
    fm: row.fm,
  })),
  crossToplam: cross.result.toplamFm,
  golden: GOLDEN,
}));
console.log("trl scale selftest ok");
