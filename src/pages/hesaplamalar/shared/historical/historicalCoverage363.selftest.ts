/**
 * 1996–2004 kıdem tavanı, asgari uyarı eşiği ve UBGT dönem ücreti.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/shared/historical/historicalCoverage363.selftest.ts
 */
import assert from "node:assert/strict";
import { KIDEM_TAVAN_PERIODS, findTavanForIsoDate } from "../../kidem-tazminati/is-kanunu/tavanData";
import { KIDEM_TAVAN_DONEMLERI, findKidemTavan } from "../../kidem-tazminati/kismi-sureli/tavanData";
import { GEMI_KIDEM_TAVAN_DONEMLERI, findGemiTavan } from "../../kidem-tazminati/gemi-adamlari/tavanData";
import { MEVSIMLIK_KIDEM_TAVAN_DONEMLERI, findMevsimlikTavan } from "../../kidem-tazminati/mevsimlik-isci/tavanData";
import { getAsgariUcretByDate as kidemIsAsgari } from "../../kidem-tazminati/is-kanunu/asgariUcret";
import { getAsgariUcretByDate as kidemKismiAsgari, deriveAsgariUcretError } from "../../kidem-tazminati/kismi-sureli/asgariUcret";
import { getAsgariUcretByDate as kidemGemiAsgari } from "../../kidem-tazminati/gemi-adamlari/asgariUcret";
import { getAsgariUcretByDate as kidemMevsimAsgari } from "../../kidem-tazminati/mevsimlik-isci/asgariUcret";
import { getAsgariUcretByDate as kidemBasinAsgari } from "../../kidem-tazminati/basin-is/asgariUcret";
import { getAsgariUcretByDate as ihbarAsgari } from "../../ihbar-tazminati/lib/asgariUcret";
import { computeIhbar30IsciResult } from "../../ihbar-tazminati/is-kanunu/engine";
import { createEmptyForm as emptyIhbar } from "../../ihbar-tazminati/is-kanunu/model";
import { getAsgariUcretByDate as yillikAsgari } from "../../yillik-izin/lib/asgariUcret";
import { computeYillikStandartResult } from "../../yillik-izin/standart/engine";
import { createEmptyForm as emptyYillik } from "../../yillik-izin/standart/model";
import { computeUbgt } from "../../ubgt/engine";

const TAVAN_EDGES: Array<[string, number]> = [
  ["1996-01-01", 35.17625],
  ["1996-06-30", 35.17625],
  ["1996-07-01", 53.3125],
  ["1998-09-30", 181.685],
  ["1998-10-01", 200.625],
  ["2000-06-14", 488.99],
  ["2000-06-15", 506.74],
  ["2000-12-14", 558.44],
  ["2000-12-15", 587.72],
  ["2001-01-01", 646.56],
  ["2001-04-14", 646.56],
  ["2001-04-15", 663],
  ["2001-05-14", 663],
  ["2001-05-15", 730.7],
  ["2001-06-14", 730.7],
  ["2001-06-15", 768.1],
  ["2001-06-30", 768.1],
  ["2001-07-01", 807.5],
  ["2001-09-14", 807.5],
  ["2001-09-15", 835.95],
  ["2001-10-14", 835.95],
  ["2001-10-15", 884.83],
  ["2001-11-14", 884.83],
  ["2001-11-15", 938.33],
  ["2001-12-14", 938.33],
  ["2001-12-15", 978.02],
  ["2001-12-31", 978.02],
  ["2002-05-14", 1076.4],
  ["2002-05-15", 1103.54],
  ["2002-09-30", 1160.15],
  ["2002-10-01", 1260.15],
  ["2003-12-31", 1389.95],
  ["2004-01-01", 1485.43],
  ["2004-06-30", 1485.43],
  ["2004-07-01", 1574.74],
  ["2011-06-30", 2623.23],
  ["2011-07-01", 2731.85],
  ["2011-12-31", 2731.85],
  ["2012-01-01", 2917.27],
];

function localDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function trToIso(value: string): string {
  const [day, month, year] = value.split(".");
  return `${year}-${month}-${day}`;
}

function nextIso(iso: string): string {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  const date = new Date(year, month - 1, day + 1);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

for (const [iso, tavan] of TAVAN_EDGES) {
  assert.equal(findTavanForIsoDate(iso), tavan, `is-kanunu ${iso}`);
  assert.equal(findKidemTavan(localDate(iso)), tavan, `kismi ${iso}`);
  assert.equal(findGemiTavan(localDate(iso)), tavan, `gemi ${iso}`);
  assert.equal(findMevsimlikTavan(localDate(iso)), tavan, `mevsim ${iso}`);
}

assert.equal(findTavanForIsoDate("1995-12-31"), null);
assert.equal(findKidemTavan(localDate("1995-12-31")), null);
assert.equal(findTavanForIsoDate("2026-12-31"), 73729.87);

function assertContiguous(label: string, rows: Array<{ start: string; end: string }>, toIso: (value: string) => string) {
  for (let i = 1; i < rows.length; i += 1) {
    assert.equal(toIso(rows[i].start), nextIso(toIso(rows[i - 1].end)), `${label} ${rows[i - 1].end}`);
  }
}

assertContiguous("is-kanunu", [...KIDEM_TAVAN_PERIODS], (value) => value);
assertContiguous("kismi", KIDEM_TAVAN_DONEMLERI, trToIso);
assertContiguous("gemi", GEMI_KIDEM_TAVAN_DONEMLERI, trToIso);
assertContiguous("mevsim", MEVSIMLIK_KIDEM_TAVAN_DONEMLERI, trToIso);

const ASGARI: Array<[string, number]> = [
  ["1996-01-01", 8.46],
  ["1996-06-30", 8.46],
  ["1996-08-01", 17.01],
  ["1999-01-15", 78.075],
  ["2004-06-15", 423],
  ["2004-07-01", 444.15],
  ["2005-01-01", 488.7],
  ["2005-12-31", 488.7],
];

const asgariReaders = [
  kidemIsAsgari,
  kidemKismiAsgari,
  kidemGemiAsgari,
  kidemMevsimAsgari,
  kidemBasinAsgari,
  ihbarAsgari,
  yillikAsgari,
];

for (const read of asgariReaders) {
  for (const [iso, expected] of ASGARI) {
    assert.equal(read(iso), expected, iso);
    assert.ok((read(iso) ?? 0) < 10000, `ölçek ${iso}`);
  }
  assert.equal(read("2004-06-15"), 423);
  assert.notEqual(read("2004-06-15"), 33030);
  assert.notEqual(read("1996-01-01"), 33030);
}

function warns(message: string | null): boolean {
  return Boolean(message) && !/000\.000|33\.030|33030/.test(message ?? "");
}

assert.equal(warns(deriveAsgariUcretError("8,45", "1996-01-01")), true);
assert.equal(deriveAsgariUcretError("8,46", "1996-01-01"), null);
assert.equal(warns(deriveAsgariUcretError("422,99", "2004-06-15")), true);
assert.equal(deriveAsgariUcretError("423", "2004-06-15"), null);
assert.equal(warns(deriveAsgariUcretError("488,69", "2005-06-15")), true);
assert.equal(deriveAsgariUcretError("488,70", "2005-06-15"), null);
assert.equal(warns(deriveAsgariUcretError("78,07", "1999-03-01")), true);
assert.equal(deriveAsgariUcretError("78,075", "1999-03-01"), null);

function ihbarWarn(endDate: string, brut: string): string | null {
  return computeIhbar30IsciResult({
    ...emptyIhbar(),
    startDate: "1996-01-01",
    endDate,
    brut,
  }).asgariUcretHatasi;
}

assert.equal(warns(ihbarWarn("1996-06-30", "8,45")), true);
assert.equal(ihbarWarn("1996-06-30", "8,46"), null);
assert.equal(warns(ihbarWarn("1996-08-01", "17,00")), true);
assert.equal(ihbarWarn("1996-08-01", "17,01"), null);
assert.equal(warns(ihbarWarn("2004-06-30", "422,99")), true);
assert.equal(ihbarWarn("2004-06-30", "423"), null);
assert.equal(warns(ihbarWarn("2005-01-15", "488,69")), true);
assert.equal(ihbarWarn("2005-01-15", "488,70"), null);

function yillikWarn(endDate: string, brut: string): string | null {
  return computeYillikStandartResult({
    ...emptyYillik(),
    startDate: "1996-01-01",
    endDate,
    brut,
  }).asgariUcretHatasi;
}

assert.equal(warns(yillikWarn("1996-06-30", "8,45")), true);
assert.equal(yillikWarn("1996-06-30", "8,46"), null);
assert.equal(warns(yillikWarn("1996-08-01", "17,00")), true);
assert.equal(yillikWarn("1996-08-01", "17,01"), null);
assert.equal(warns(yillikWarn("2004-06-30", "422,99")), true);
assert.equal(yillikWarn("2004-06-30", "423"), null);
assert.equal(warns(yillikWarn("2005-01-15", "488,69")), true);
assert.equal(yillikWarn("2005-01-15", "488,70"), null);

function ubgtWages(start: string, end: string): number[] {
  const result = computeUbgt({ dateRanges: [{ start, end }], selectedHolidayIds: [] });
  assert.equal(result.error, undefined, `${start} ${result.error ?? ""}`);
  return result.periods.map((period) => period.wage);
}

assert.deepEqual(ubgtWages("1996-01-01", "1996-01-31"), [8.46]);
assert.deepEqual(ubgtWages("1999-07-01", "1999-07-31"), [93.6]);
assert.deepEqual(ubgtWages("2004-06-01", "2004-06-30"), [423]);
assert.deepEqual(ubgtWages("2005-01-01", "2005-01-31"), [488.7]);
assert.ok(ubgtWages("1996-08-01", "1996-08-31")[0] < 10000);
assert.ok(ubgtWages("2004-12-01", "2004-12-31")[0] === 444.15);

console.log("historicalCoverage363.selftest: geçti");
