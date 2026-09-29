/**
 * Tarihsel kesinti yayılımı. Standart Fazla Mesai kilitleri ayrıca
 * standartFmKesinti.selftest.ts içindedir.
 */
import assert from "node:assert/strict";
import { engineAsgariBrut, getAsgariUcretRowByDate } from "./asgariUcret";
import { eraForIso, manualWageClashes, scaleTableBrut, parseTurkishAmount, formatHistoricalTrl } from "./currencyEra";
import { stampRateForDate, wageTaxKeepingModernTable } from "./laborNet";
import {
  WageIncomeTaxError,
  standartFmDamgaOrani,
  standartFmIssizlikOrani,
  standartFmSgkOrani,
  wageIncomeTaxForDate,
} from "./wageDeductions";
import { calculateIncomeTaxWithBrackets } from "../../fazla-mesai/standart/v3-engine/lib/incomeTaxCore";

function near(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 0.001, `${label}: ${actual} !== ${expected}`);
}

assert.equal(standartFmSgkOrani("1996-01-01"), 0.14);
assert.equal(standartFmIssizlikOrani("1996-06-01"), 0);
assert.equal(standartFmIssizlikOrani("2000-06-01"), 0.02);
assert.equal(standartFmIssizlikOrani("2002-01-01"), 0.01);
assert.equal(standartFmDamgaOrani("1996-01-01"), 0.0048);
assert.equal(standartFmDamgaOrani("1999-08-15"), 0.0048);
assert.equal(standartFmDamgaOrani("1999-08-16"), 0.006);
assert.equal(standartFmDamgaOrani("2005-06-01"), 0.006);
assert.equal(standartFmDamgaOrani("2010-01-01"), 0.0066);
assert.equal(standartFmDamgaOrani("2012-12-31"), 0.0066);
assert.equal(standartFmDamgaOrani("2013-01-01"), 0.00759);
assert.equal(standartFmDamgaOrani("2024-06-01"), 0.00759);
assert.equal(standartFmDamgaOrani("2026-01-01"), 0.00759);
assert.throws(() => wageIncomeTaxForDate("1995-12-31", 100), WageIncomeTaxError);

const row2004 = getAsgariUcretRowByDate("2004-12-31");
assert.equal(row2004?.brut, 444150000);
const scaled2004 = scaleTableBrut("2004-12-31", row2004!.brut);
assert.equal(scaled2004.currencyEra, "TRL");
assert.equal(scaled2004.normalizedGross, 444.15);
assert.equal(engineAsgariBrut("2005-01-01"), 488.7);
assert.equal(eraForIso("2005-01-01"), "TRY");
assert.equal(engineAsgariBrut("2010-01-01"), 729);
assert.equal(engineAsgariBrut("2012-07-01"), 940.5);
assert.equal(engineAsgariBrut("2013-01-01"), 978.6);
assert.equal(engineAsgariBrut("2024-01-01"), 20002.5);
assert.equal(engineAsgariBrut("2026-01-01"), 33030);

assert.equal(parseTurkishAmount("444.150.000"), 444150000);
assert.equal(formatHistoricalTrl(444150000), "444.150.000");
assert.equal(parseTurkishAmount("33.030,00"), 33030);
assert.equal(
  manualWageClashes({ brutManual: true }, "2004-07-01"),
  true,
);
assert.equal(stampRateForDate(""), 0.00759);
assert.equal(stampRateForDate("2010-06-01"), 0.0066);

const modern = wageTaxKeepingModernTable("2024-12-31", 10000, (year, income) => {
  const tax = calculateIncomeTaxWithBrackets(year, income);
  return { tax: tax.tax, summary: tax.brackets };
});
const direct = calculateIncomeTaxWithBrackets(2024, 10000);
near(modern.tax, direct.tax, "2024 vergi aynı tablo");

const early = wageIncomeTaxForDate("1996-07-31", 10);
assert.ok(early.tax > 0, "1996 vergi");

const sgk = Math.round(1000 * 0.14 * 100) / 100;
const issizlik = Math.round(1000 * 0.01 * 100) / 100;
const matrah = 1000 - sgk - issizlik;
const gv = wageIncomeTaxForDate("2024-12-31", matrah);
near(gv.tax, calculateIncomeTaxWithBrackets(2024, matrah).tax, "2024 gv");
near(standartFmDamgaOrani("2024-12-31") * 1000, 7.59, "2024 damga tutarı");

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const samples = ["1996-07-01", "2004-12-31", "2005-01-01", "2010-06-01", "2012-12-31", "2013-01-01", "2024-12-31", "2026-01-01"];
for (const iso of samples) {
  const brut = 1000;
  const sgk = round2(brut * standartFmSgkOrani(iso));
  const issizlik = round2(brut * standartFmIssizlikOrani(iso));
  const damga = round2(brut * standartFmDamgaOrani(iso));
  const matrah = brut - sgk - issizlik;
  const gv = wageTaxKeepingModernTable(iso, matrah, (year, income) => {
    const tax = calculateIncomeTaxWithBrackets(year, income);
    return { tax: tax.tax, summary: tax.brackets };
  });
  const gvFull = wageTaxKeepingModernTable(iso, brut, (year, income) => {
    const tax = calculateIncomeTaxWithBrackets(year, income);
    return { tax: tax.tax, summary: tax.brackets };
  });
  assert.equal(sgk, 140, `${iso} sgk`);
  assert.equal(damga, round2(brut * standartFmDamgaOrani(iso)), `${iso} damga`);
  assert.ok(gv.tax >= 0, `${iso} gv`);
  assert.ok(gvFull.tax >= 0, `${iso} gv tam`);
  if (iso >= "2013-01-01") assert.equal(damga, 7.59, `${iso} damga 7,59`);
  if (iso >= "2010-01-01" && iso <= "2012-12-31") assert.equal(damga, 6.6, `${iso} damga 6,6`);
  if (iso < "2005-01-01") assert.equal(eraForIso(iso), "TRL");
  if (iso >= "2005-01-01") assert.equal(eraForIso(iso), "TRY");
}

assert.equal(standartFmIssizlikOrani("2000-05-31"), 0);
assert.equal(standartFmIssizlikOrani("2000-06-01"), 0.02);
assert.equal(standartFmIssizlikOrani("2001-12-31"), 0.02);
assert.equal(standartFmIssizlikOrani("2002-01-01"), 0.01);

console.log("historicalRollout.selftest: geçti");
