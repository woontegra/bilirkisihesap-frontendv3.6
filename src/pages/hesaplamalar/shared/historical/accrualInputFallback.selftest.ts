/**
 * Geçersiz tahakkuk girdisi hesabı çökertmez.
 * Geçerli 1996 ve sonrası gün kendi tarihsel oranında kalır; 1995 gerçek günü bilinçli olarak reddedilir.
 *
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/shared/historical/accrualInputFallback.selftest.ts
 */
import assert from "node:assert/strict";
import { clampYear } from "../../ihbar-tazminati/lib/dates";
import { calculateIhbar } from "../../ihbar-tazminati/lib/core";
import { createEmptyForm as emptyIhbar, type Ihbar30IsciForm } from "../../ihbar-tazminati/is-kanunu/model";
import { computeIhbar30IsciResult } from "../../ihbar-tazminati/is-kanunu/engine";
import { createEmptyForm as emptyArama } from "../../is-arama-izni-ucreti/model";
import { computeIsArama } from "../../is-arama-izni-ucreti/engine";
import { createEmptyForm as emptyAyrimcilik } from "../../ayrimcilik-tazminati/model";
import { computeAyrimcilik } from "../../ayrimcilik-tazminati/engine";
import { calculateNetIzin, calculateYillikIzin } from "../../yillik-izin/lib/core";
import { createEmptyForm as emptyBosta } from "../../bosta-gecen-sure-ucreti/model";
import { computeBostaGecenSure } from "../../bosta-gecen-sure-ucreti/engine";
import { calculateNetFromBrut } from "../../hafta-tatili/lib/net";
import { calculateNet as calculateUbgtNet } from "../../ubgt/engine";
import { netFromGrossFm } from "../../fazla-mesai/vardiya-24/engine";
import { netFromGrossFm as netFromGrossTanikli } from "../../fazla-mesai/tanikli-standart/v3-engine/adapter";
import { netFromGrossStandartFm } from "../../fazla-mesai/standart/v3-engine/adapter";
import { calculateIncomeTaxWithBrackets } from "../../fazla-mesai/standart/v3-engine/lib/incomeTaxCore";
import {
  deductionLabels,
  lastClaimAccrualIso,
  ratesForAccrual,
  stampRateForDate,
  wageTaxKeepingModernTable,
} from "./laborNet";
import { runUserCalc } from "../../../../hooks/userCalcGuard";
import { WageIncomeTaxError, isUsableAccrualIso, resolveStandartFmAccrualIso, wageIncomeTaxForDate } from "./wageDeductions";

const CURRENT_YEAR = new Date().getFullYear();
const MATRAH = 7000;

function taxAt(iso: string): number {
  return wageIncomeTaxForDate(iso, MATRAH).tax;
}

function mustNotThrow(label: string, run: () => void) {
  assert.doesNotThrow(run, `${label} fırlattı`);
}

const emptyInputs = ["", "   ", "2026", "2026-02", "2026-02-", "2026-1-1", "2026-00-15", "2026-10-00"];
for (const input of emptyInputs) {
  mustNotThrow(`girdi ${JSON.stringify(input)}`, () => {
    const rates = ratesForAccrual(input);
    assert.match(rates.tahakkukTarihi, /^\d{4}-12-31$/);
  });
}

mustNotThrow("null tahakkuk", () => {
  assert.equal(resolveStandartFmAccrualIso(CURRENT_YEAR).endsWith("-12-31"), true);
});

for (const padded of ["0202-05-20", "0020-05-20", "0002-05-20"]) {
  assert.equal(isUsableAccrualIso(padded), false, `${padded} tamamlanmış tahakkuk değil`);
  mustNotThrow(padded, () => {
    const rates = ratesForAccrual(padded);
    assert.equal(rates.tahakkukTarihi, `${CURRENT_YEAR}-12-31`);
    assert.notEqual(rates.tahakkukTarihi.slice(0, 4), padded.slice(0, 4));
  });
}

const invalidDay = ratesForAccrual("2026-02-29");
assert.equal(invalidDay.tahakkukTarihi, "2026-12-31", "2026-02-29 yıl sonuna düşer");
assert.equal(invalidDay.damgaOran, 0.00759);
assert.equal(invalidDay.issizlikOran, 0.01);
assert.equal(invalidDay.sgkOran, 0.14);

assert.equal(clampYear("202604-02-29"), "2026-02-29");
const clamped = ratesForAccrual(clampYear("202604-02-29"));
assert.equal(clamped.tahakkukTarihi, "2026-12-31", "clamp sonrası imkânsız gün çökmez");
assert.equal(clamped.damgaOran, ratesForAccrual("2026-12-31").damgaOran);

const today = ratesForAccrual("2026-10-07");
assert.equal(today.tahakkukTarihi, "2026-10-07", "geçerli gün aynen kalır");
assert.equal(today.damgaOran, 0.00759);
assert.equal(today.issizlikOran, 0.01);
const modern = wageTaxKeepingModernTable("2026-10-07", MATRAH, (year, income) => {
  const tax = calculateIncomeTaxWithBrackets(year, income);
  return { tax: tax.tax, summary: tax.brackets };
});
assert.equal(modern.tax, calculateIncomeTaxWithBrackets(2026, MATRAH).tax);

function expectHistorical(iso: string, damga: number, issizlik: number) {
  const rates = ratesForAccrual(iso);
  assert.equal(rates.tahakkukTarihi, iso, `${iso} güne düşürülmedi`);
  assert.equal(rates.damgaOran, damga, `${iso} damga`);
  assert.equal(rates.issizlikOran, issizlik, `${iso} işsizlik`);
  assert.equal(rates.sgkOran, 0.14);
  assert.equal(wageTaxKeepingModernTable(iso, MATRAH, () => {
    throw new Error("1996–2009 modern tabloya düşmemeli");
  }).tax, taxAt(iso));
}

expectHistorical("1996-06-15", 0.0048, 0);
expectHistorical("1999-06-15", 0.0048, 0);
expectHistorical("2004-06-15", 0.006, 0.01);
expectHistorical("2005-06-15", 0.006, 0.01);

assert.notEqual(taxAt("1996-06-15"), taxAt("1999-06-15"), "1996 ve 1999 tarifesi ayrı");
assert.notEqual(taxAt("1999-06-15"), taxAt("2004-06-15"), "1999 ve 2004 tarifesi ayrı");
assert.notEqual(taxAt("2004-06-15"), taxAt("2005-06-15"), "2004 ve 2005 tarifesi ayrı");
assert.notEqual(taxAt("1996-06-15"), taxAt("2026-10-07"), "1996 güncel yıla düşmez");
assert.notEqual(ratesForAccrual("1996-06-15").damgaOran, today.damgaOran);
assert.equal(ratesForAccrual(1996).tahakkukTarihi, "1996-12-31");
assert.equal(ratesForAccrual(1996).damgaOran, 0.0048);
assert.equal(ratesForAccrual(1996).issizlikOran, 0);

assert.throws(() => wageIncomeTaxForDate("1995-12-31", 100), WageIncomeTaxError);
assert.throws(() => ratesForAccrual("1995-12-31"), (error: unknown) => {
  return error instanceof WageIncomeTaxError && error.message.includes("kesinti oranı tanımlı değil");
});
mustNotThrow("1995-02-31 imkânsız gün", () => {
  const rates = ratesForAccrual("1995-02-31");
  assert.equal(rates.tahakkukTarihi, `${CURRENT_YEAR}-12-31`);
});
assert.equal(stampRateForDate("2026-02-29"), 0.00759);
assert.equal(stampRateForDate("1996-06-15"), 0.0048);
assert.equal(stampRateForDate("1995-12-31"), 0.00759);
assert.equal(stampRateForDate(""), 0.00759);

const ihbarBase = {
  brut: "30000",
  prim: "",
  ikramiye: "",
  yol: "",
  yemek: "",
  extras: [],
  totals: { yil: 3, ay: 0, gun: 0 },
};
for (const iso of ["1996-06-15", "1999-06-15", "2004-06-15", "2005-06-15"] as const) {
  const result = calculateIhbar({ ...ihbarBase, exitYear: Number(iso.slice(0, 4)), accrualIso: iso });
  assert.equal(result.damgaOran, ratesForAccrual(iso).damgaOran, `ihbar damga ${iso}`);
  assert.equal(result.gelirVergisi, wageIncomeTaxForDate(iso, result.brut).tax, `ihbar GV ${iso}`);
  assert.notEqual(result.gelirVergisi, calculateIncomeTaxWithBrackets(CURRENT_YEAR, result.brut).tax);
}
mustNotThrow("ihbar imkânsız gün", () => {
  calculateIhbar({ ...ihbarBase, exitYear: 2026, accrualIso: "2026-02-29" });
});
mustNotThrow("ihbar boş gün", () => {
  calculateIhbar({ ...ihbarBase, exitYear: 2026, accrualIso: "" });
});

function ihbarForm(endDate: string): Ihbar30IsciForm {
  return { ...emptyIhbar(), endDate, brut: "30000" };
}
function yearKeystrokes(yearDigits: string, monthDay: string): string[] {
  const frames = [""];
  let typed = "";
  for (const ch of yearDigits) {
    typed += ch;
    frames.push(`${typed.padStart(4, "0")}-${monthDay}`);
  }
  return frames;
}

const typing = [
  ...yearKeystrokes("2024", "05-20"),
  "0202-05-20",
  "0020-05-20",
  "0002-05-20",
  "",
  "2026-02",
  "2026-02-29",
  clampYear("202604-02-29"),
  "2024-05-20",
  "1996-06-15",
];
for (const endDate of typing) {
  const form = { ...emptyIhbar(), startDate: "2020-01-01", endDate, brut: "30000" };
  const settled = runUserCalc(() => computeIhbar30IsciResult(form));
  assert.equal(settled.error, null, `Ihbar30 ara değer ${JSON.stringify(endDate)}: ${settled.error}`);
  assert.ok(settled.result, `Ihbar30 ara değer ${JSON.stringify(endDate)} sonuçsuz`);
}
const pre1996 = runUserCalc(() => computeIhbar30IsciResult({ ...emptyIhbar(), endDate: "1995-12-31", brut: "30000" }));
assert.equal(pre1996.result, null);
assert.match(pre1996.error ?? "", /kesinti oranı tanımlı değil/);
assert.throws(() => ratesForAccrual("1995-12-31"), WageIncomeTaxError);

mustNotThrow("ihbar 30+ imkânsız gün", () => computeIhbar30IsciResult(ihbarForm("2026-02-29")));
mustNotThrow("ihbar 30+ clamp", () => computeIhbar30IsciResult(ihbarForm(clampYear("202604-02-29"))));
mustNotThrow("ihbar 30+ yarım", () => computeIhbar30IsciResult(ihbarForm("2026-02")));
const ihbar1996 = computeIhbar30IsciResult({ ...ihbarForm("1996-06-15"), startDate: "1993-01-01" });
assert.equal(ihbar1996.damgaOran, 0.0048);

mustNotThrow("iş arama imkânsız gün", () => computeIsArama({ ...emptyArama(), endDate: "2026-02-29" }));
const arama1996 = computeIsArama({
  ...emptyArama(),
  startDate: "1994-01-01",
  endDate: "1996-06-15",
  brut: "30000",
});
assert.ok(arama1996.brut > 0, "iş arama 1996 brüt");
assert.equal(arama1996.issizlikPrimi, 0, "1996 işsizlik sıfır");
assert.ok(arama1996.sskPrimi > 0);

mustNotThrow("ayrımcılık imkânsız gün", () => computeAyrimcilik({ ...emptyAyrimcilik(), endDate: "2026-02-29", brut: "10000" }));
const ayrim1999 = computeAyrimcilik({ ...emptyAyrimcilik(), endDate: "1999-06-15", brutInputForNet: "7000" });
assert.equal(ayrim1999.damgaOran, 0.0048);
assert.equal(ayrim1999.gelirVergisi, taxAt("1999-06-15"));

const yillik1996 = calculateYillikIzin({ years: 6, brutUcret: "30000", exitYear: 1996, accrualIso: "1996-06-15" });
assert.equal(yillik1996.damgaOran, 0.0048);
assert.equal(yillik1996.issizlikOran, 0);
assert.ok(yillik1996.brutIzin > 0);
mustNotThrow("yıllık izin imkânsız gün", () => {
  calculateNetIzin(1000, "2026-02-29");
  calculateYillikIzin({ years: 6, brutUcret: "30000", exitYear: 2026, accrualIso: "2026-02-29" });
});
const yillik2004 = calculateNetIzin(1000, "2004-06-15");
assert.equal(yillik2004.damgaOran, 0.006);
assert.equal(yillik2004.issizlikOran, 0.01);
assert.equal(yillik2004.gelirVergisi, wageIncomeTaxForDate("2004-06-15", 1000 - yillik2004.sgk - yillik2004.issizlik).tax);

const bosta2004 = computeBostaGecenSure({ ...emptyBosta(), endDate: "2004-06-15", brut: "10000" });
assert.equal(bosta2004.damgaOran, 0.006);
assert.equal(bosta2004.issizlikOran, 0.01);
assert.equal(bosta2004.gelirVergisi, wageIncomeTaxForDate("2004-06-15", bosta2004.brutAmount - bosta2004.sgk - bosta2004.issizlik).tax);
mustNotThrow("boşta imkânsız gün", () => computeBostaGecenSure({ ...emptyBosta(), endDate: "2026-02-29", brut: "10000" }));
mustNotThrow("boşta boş tarih", () => computeBostaGecenSure({ ...emptyBosta(), brut: "10000" }));

const hafta2005 = calculateNetFromBrut(1000, "2005-06-15");
assert.equal(hafta2005.damgaVergisi, 6);
assert.equal(hafta2005.issizlik, 10);
mustNotThrow("hafta tatili imkânsız gün", () => calculateNetFromBrut(1000, "2026-02-29"));

const ubgt1996 = calculateUbgtNet(1000, "1996-06-15");
assert.equal(ubgt1996.damgaVergisi, 4.8);
assert.equal(ubgt1996.issizlik, 0);
mustNotThrow("ubgt imkânsız gün", () => calculateUbgtNet(1000, clampYear("202604-02-29")));

const fm1996 = netFromGrossFm(1000, "1996-06-15");
assert.equal(fm1996.issizlik, 0);
assert.equal(fm1996.damgaVergisi, 4.8);
mustNotThrow("vardiya imkânsız gün", () => netFromGrossFm(1000, "2026-02-29"));
const tanikli2004 = netFromGrossTanikli(1000, "2004-06-15");
assert.equal(tanikli2004.issizlik, 10);
assert.equal(tanikli2004.damgaVergisi, 6);
mustNotThrow("tanıklı imkânsız gün", () => netFromGrossTanikli(1000, "2026-02-29"));

const standart1999 = netFromGrossStandartFm(1000, "1999-06-15");
assert.equal(standart1999.tahakkukTarihi, "1999-06-15");
assert.equal(standart1999.damgaOran, 0.0048);
assert.equal(standart1999.issizlikOran, 0);
assert.equal(
  standart1999.gelirVergisi,
  Math.round(wageIncomeTaxForDate("1999-06-15", 1000 - standart1999.sgk - standart1999.issizlik).tax * 100) / 100,
);
mustNotThrow("standart FM imkânsız gün", () => {
  const net = netFromGrossStandartFm(1000, "2026-02-29");
  assert.equal(net.tahakkukTarihi, "2026-12-31");
});
assert.throws(() => netFromGrossStandartFm(1000, "1995-12-31"), WageIncomeTaxError);

const labels1996 = deductionLabels("1996-06-15");
assert.match(labels1996.issizlik, /%0/);
assert.match(labels1996.damga, /4,8/);
mustNotThrow("etiket imkânsız gün", () => deductionLabels("2026-02-29"));
assert.equal(lastClaimAccrualIso([{ endISO: "2026-02-29" }, { endISO: "2004-06-15" }]), "2026-02-29");
mustNotThrow("son satır imkânsız gün", () => deductionLabels(lastClaimAccrualIso([{ endISO: "2026-02-29" }]) || CURRENT_YEAR));

for (const padded of ["0202-05-20", "0020-05-20", "0002-05-20"]) {
  mustNotThrow(`iş arama ${padded}`, () => computeIsArama({ ...emptyArama(), endDate: padded }));
  mustNotThrow(`ayrımcılık ${padded}`, () => computeAyrimcilik({ ...emptyAyrimcilik(), endDate: padded, brut: "10000" }));
  mustNotThrow(`yıllık ${padded}`, () => calculateNetIzin(1000, padded));
  mustNotThrow(`boşta ${padded}`, () => computeBostaGecenSure({ ...emptyBosta(), endDate: padded, brut: "10000" }));
  mustNotThrow(`hafta ${padded}`, () => calculateNetFromBrut(1000, padded));
  mustNotThrow(`ubgt ${padded}`, () => calculateUbgtNet(1000, padded));
  mustNotThrow(`vardiya ${padded}`, () => netFromGrossFm(1000, padded));
  mustNotThrow(`tanıklı ${padded}`, () => netFromGrossTanikli(1000, padded));
  mustNotThrow(`standart FM ${padded}`, () => netFromGrossStandartFm(1000, padded));
  mustNotThrow(`etiket ${padded}`, () => deductionLabels(padded));
}

console.log("accrualInputFallback.selftest: geçti");
