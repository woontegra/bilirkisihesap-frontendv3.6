/**
 * Beş kıdem motorunda çıkış tarihine göre ortak tarihsel damga oranı.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/shared/historical/kidemDamgaHistorical.selftest.ts
 */
import assert from "node:assert/strict";
import { damgaLabelForRate, stampRateForDate } from "./laborNet";
import { computeIsKanunuResult, isKanunuDamga } from "../../kidem-tazminati/is-kanunu/engine";
import { createEmptyForm as emptyIsKanunu } from "../../kidem-tazminati/is-kanunu/model";
import { deriveBrutNet as deriveKismiBrutNet } from "../../kidem-tazminati/kismi-sureli/engine";
import { calculateDamgaVergisi as mevsimDamga, deriveMevsimlikResult } from "../../kidem-tazminati/mevsimlik-isci/engine";
import { createEmptyMevsimlikForm } from "../../kidem-tazminati/mevsimlik-isci/model";
import { calculateDamgaVergisi as gemiDamga, deriveGemiResult } from "../../kidem-tazminati/gemi-adamlari/engine";
import { createEmptyGemiForm } from "../../kidem-tazminati/gemi-adamlari/model";
import { deriveBrutNet as deriveBasinBrutNet, resolveExitYear } from "../../kidem-tazminati/basin-is/engine";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const CASES: Array<[string, number, string, number]> = [
  ["1996-06-15", 0.0048, "Damga Vergisi (Binde 4,8)", 48],
  ["1999-08-15", 0.0048, "Damga Vergisi (Binde 4,8)", 48],
  ["1999-08-16", 0.006, "Damga Vergisi (Binde 6)", 60],
  ["2004-06-20", 0.006, "Damga Vergisi (Binde 6)", 60],
  ["2009-12-31", 0.006, "Damga Vergisi (Binde 6)", 60],
  ["2010-01-01", 0.0066, "Damga Vergisi (Binde 6,6)", 66],
  ["2012-12-31", 0.0066, "Damga Vergisi (Binde 6,6)", 66],
  ["2013-01-01", 0.00759, "Damga Vergisi (Binde 7,59)", 75.9],
  ["2026-10-07", 0.00759, "Damga Vergisi (Binde 7,59)", 75.9],
];

for (const [iso, rate, label, amount] of CASES) {
  const start = `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
  assert.equal(stampRateForDate(iso), rate, `ortak tablo ${iso}`);
  assert.equal(damgaLabelForRate(rate), label, `etiket ${iso}`);

  const isStamp = isKanunuDamga(10000, iso);
  assert.equal(isStamp.damgaOran, rate, `is damga oran ${iso}`);
  assert.equal(isStamp.damgaVergisi, amount, `is 10000 damga ${iso}`);
  const isFull = computeIsKanunuResult({
    ...emptyIsKanunu(),
    iseGirisTarihi: start,
    istenCikisTarihi: iso,
    ciplakBrut: "20",
  });
  assert.equal(isFull.damgaOran, rate, `is motor oran ${iso}`);
  assert.equal(isFull.damgaVergisi, isKanunuDamga(isFull.brutKidem, iso).damgaVergisi, `is motor tutar ${iso}`);
  assert.equal(isFull.netKidem, round2(isFull.brutKidem - isFull.damgaVergisi), `is net ${iso}`);

  const kismi = deriveKismiBrutNet(10000, iso);
  assert.equal(kismi.damgaOran, rate, `kismi oran ${iso}`);
  assert.equal(kismi.damgaVergisi, amount, `kismi 10000 damga ${iso}`);
  assert.equal(kismi.net, round2(10000 * (1 - rate)), `kismi net ${iso}`);

  assert.equal(round2(mevsimDamga(10000, iso)), amount, `mevsim 10000 damga ${iso}`);
  const mevsim = deriveMevsimlikResult({
    ...createEmptyMevsimlikForm(),
    periods: [{ id: "p", start, end: iso, days: 365 }],
    ciplakBrut: "20",
  });
  assert.equal(mevsim.damgaOran, rate, `mevsim motor oran ${iso}`);
  assert.equal(mevsim.damgaVergisi, round2(mevsimDamga(mevsim.brutKidem, iso)), `mevsim motor tutar ${iso}`);
  assert.equal(mevsim.netKidem, round2(mevsim.brutKidem - mevsim.damgaVergisi), `mevsim net ${iso}`);

  assert.equal(round2(gemiDamga(10000, iso)), amount, `gemi 10000 damga ${iso}`);
  const gemi = deriveGemiResult({
    ...createEmptyGemiForm(),
    startDate: start,
    endDate: iso,
    ciplakBrut: "20",
  });
  assert.equal(gemi.damgaOran, rate, `gemi motor oran ${iso}`);
  assert.equal(gemi.damgaVergisi, round2(gemiDamga(gemi.brutKidem, iso)), `gemi motor tutar ${iso}`);
  assert.equal(gemi.gelirVergisi, 0, `gemi gelir vergisi ${iso}`);

  const basin = deriveBasinBrutNet(10000, 10000, resolveExitYear(iso), iso);
  assert.equal(basin.damgaOran, rate, `basin oran ${iso}`);
  assert.equal(basin.damgaVergisi, amount, `basin 10000 damga ${iso}`);
  assert.equal(basin.gelirVergisi, 0, `basin gelir vergisi ${iso}`);
  assert.equal(basin.net, round2(10000 - amount), `basin net ${iso}`);
  assert.equal(damgaLabelForRate(basin.damgaOran), label, `basin etiket ${iso}`);
}

console.log("kidem damga historical selftest ok");
