/**
 * Bütün hesap ailelerinde kullanıcı tarih ara değerleri hesabı çökertmez.
 * Geçerli 1996–2005 günleri kendi oranında kalır. 1995-12-31 motor kuralı değişmez;
 * bu hata runUserCalc içinde kalır.
 *
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/shared/historical/dateInputFamilyCoverage.selftest.ts
 */
import assert from "node:assert/strict";
import { clampYear } from "../../ihbar-tazminati/lib/dates";
import { createEmptyForm as emptyIhbar30 } from "../../ihbar-tazminati/is-kanunu/model";
import { computeIhbar30IsciResult } from "../../ihbar-tazminati/is-kanunu/engine";
import { createEmptyForm as emptyIhbarMevsim } from "../../ihbar-tazminati/mevsim/model";
import { computeIhbarMevsimResult } from "../../ihbar-tazminati/mevsim/engine";
import { createEmptyForm as emptyIhbarKismi } from "../../ihbar-tazminati/kismi/model";
import { computeIhbarKismiResult } from "../../ihbar-tazminati/kismi/engine";
import { createEmptyForm as emptyIhbarGemi } from "../../ihbar-tazminati/gemi/model";
import { computeIhbarGemiResult } from "../../ihbar-tazminati/gemi/engine";
import { createEmptyForm as emptyIhbarBorclar } from "../../ihbar-tazminati/borclar/model";
import { computeIhbarBorclarResult } from "../../ihbar-tazminati/borclar/engine";
import { createEmptyForm as emptyIhbarBelirli } from "../../ihbar-tazminati/belirli/model";
import { computeIhbarBelirliResult } from "../../ihbar-tazminati/belirli/engine";
import { createEmptyForm as emptyIhbarBasin } from "../../ihbar-tazminati/basin/model";
import { computeIhbarBasinResult } from "../../ihbar-tazminati/basin/engine";
import { createEmptyForm as emptyYillik } from "../../yillik-izin/standart/model";
import { computeYillikStandartResult } from "../../yillik-izin/standart/engine";
import { createEmptyForm as emptyYillikBorclar } from "../../yillik-izin/borclar/model";
import { computeYillikBorclarResult } from "../../yillik-izin/borclar/engine";
import { createEmptyForm as emptyYillikBasin } from "../../yillik-izin/basin/model";
import { computeYillikBasinResult } from "../../yillik-izin/basin/engine";
import { createEmptyForm as emptyYillikGemi } from "../../yillik-izin/gemi/model";
import { computeYillikGemiResult } from "../../yillik-izin/gemi/engine";
import { createEmptyForm as emptyYillikGo } from "../../yillik-izin/basin/gunluk-olmayan/model";
import { computeYillikBasinGunlukOlmayanResult } from "../../yillik-izin/basin/gunluk-olmayan/engine";
import { createEmptyForm as emptyMulti, withSyncedSpan } from "../../yillik-izin/lib/multiPeriodModel";
import { computeYillikMevsimResult } from "../../yillik-izin/mevsim/engine";
import { computeYillikKismiResult } from "../../yillik-izin/kismi/engine";
import { computeYillikBelirliResult } from "../../yillik-izin/belirli/engine";
import { createEmptyForm as emptyUbgt } from "../../ubgt/model";
import { calculateNet as calculateUbgtNet, computeUbgt } from "../../ubgt/engine";
import { createEmptyForm as emptyHafta } from "../../hafta-tatili/standard/model";
import { computeStandardHaftaTatili } from "../../hafta-tatili/standard/engine";
import { buildStandartHtPreviewSections } from "../../hafta-tatili/standard/buildStandartHtPreviewSections";
import { createEmptyForm as emptyHaftaGemi } from "../../hafta-tatili/gemi/model";
import { computeGemiHaftaTatili } from "../../hafta-tatili/gemi/engine";
import { buildGemiHtPreviewSections } from "../../hafta-tatili/gemi/buildGemiHtPreviewSections";
import { createEmptyForm as emptyHaftaBasin } from "../../hafta-tatili/basin/model";
import { computeBasinHaftaTatili } from "../../hafta-tatili/basin/engine";
import { buildBasinHtPreviewSections } from "../../hafta-tatili/basin/buildBasinHtPreviewSections";
import { calculateNetFromBrut } from "../../hafta-tatili/lib/net";
import { createEmptyForm as emptyArama } from "../../is-arama-izni-ucreti/model";
import { computeIsArama } from "../../is-arama-izni-ucreti/engine";
import { createEmptyForm as emptyAyrimcilik } from "../../ayrimcilik-tazminati/model";
import { computeAyrimcilik } from "../../ayrimcilik-tazminati/engine";
import { createEmptyForm as emptyBosta } from "../../bosta-gecen-sure-ucreti/model";
import { computeBostaGecenSure } from "../../bosta-gecen-sure-ucreti/engine";
import { createEmptyForm as emptyKotu } from "../../kotu-niyet-tazminati/model";
import { computeKotuNiyet } from "../../kotu-niyet-tazminati/engine";
import { createEmptyForm as emptyHaksiz } from "../../haksiz-fesih-tazminati/model";
import { computeHaksizFesih } from "../../haksiz-fesih-tazminati/engine";
import { createEmptyForm as emptyIseAlmama } from "../../ise-almama-tazminati/model";
import { computeIseAlmama } from "../../ise-almama-tazminati/engine";
import { createEmptyForm as emptyVardiya24 } from "../../fazla-mesai/vardiya-24/model";
import { computeVardiya24Result, fmTaxYear, netFromGrossFm as netVardiya24 } from "../../fazla-mesai/vardiya-24/engine";
import { createEmptyForm as emptyVardiya48 } from "../../fazla-mesai/vardiya-48/model";
import { computeVardiya48Result, netFromGrossFm as netVardiya48, vardiya48TaxYear } from "../../fazla-mesai/vardiya-48/engine";
import { createEmptyForm as emptyGemiGunluk } from "../../fazla-mesai/gemi-adami-gunluk/model";
import { computeGemiGunlukResult, netFromGrossFm as netGemiGunluk } from "../../fazla-mesai/gemi-adami-gunluk/engine";
import { createEmptyForm as emptyGemi724 } from "../../fazla-mesai/gemi-adami-7-24/model";
import { computeGemi724Result, netFromGrossFm as netGemi724 } from "../../fazla-mesai/gemi-adami-7-24/engine";
import { createEmptyForm as emptyYeralti } from "../../fazla-mesai/yeralti-isci/model";
import { netFromGrossFm as netYeralti } from "../../fazla-mesai/yeralti-isci/engine";
import { computeYeraltiResultV3 } from "../../fazla-mesai/yeralti-isci/v3-engine/adapter";
import { createEmptyForm as emptyTanikli } from "../../fazla-mesai/tanikli-standart/model";
import { computeTanikliFmResult } from "../../fazla-mesai/tanikli-standart/engine";
import { netFromGrossFm as netTanikli } from "../../fazla-mesai/tanikli-standart/v3-engine/adapter";
import { createEmptyHaftalikKarmaForm } from "../../fazla-mesai/haftalik-karma/model";
import { computeHaftalikKarmaResult } from "../../fazla-mesai/haftalik-karma/engine";
import { netFromGrossFm as netKarma } from "../../fazla-mesai/haftalik-karma/v3-engine/adapter";
import { createEmptyDonemselForm } from "../../fazla-mesai/donemsel/model";
import { computeDonemselResult } from "../../fazla-mesai/donemsel/engine";
import { netFromGrossFm as netDonemsel } from "../../fazla-mesai/donemsel/v3-engine/adapter";
import { createEmptyDonemselHaftalikForm } from "../../fazla-mesai/donemsel-haftalik/model";
import { computeDonemselHaftalikResult } from "../../fazla-mesai/donemsel-haftalik/engine";
import { netFromGrossFm as netDonemselHaftalik } from "../../fazla-mesai/donemsel-haftalik/v3-engine/adapter";
import { createEmptyForm as emptyStandartFm } from "../../fazla-mesai/standart/model";
import { computeStandartFmResultV3, netFromGrossStandartFm } from "../../fazla-mesai/standart/v3-engine/adapter";
import { createEmptyForm as emptyKidem } from "../../kidem-tazminati/is-kanunu/model";
import { computeIsKanunuResult } from "../../kidem-tazminati/is-kanunu/engine";
import { createEmptyGemiForm } from "../../kidem-tazminati/gemi-adamlari/model";
import { deriveGemiResult } from "../../kidem-tazminati/gemi-adamlari/engine";
import { createEmptyMevsimlikForm } from "../../kidem-tazminati/mevsimlik-isci/model";
import { deriveMevsimlikResult } from "../../kidem-tazminati/mevsimlik-isci/engine";
import { computeCalismaSuresi, deriveBrutNet as deriveBasinBrutNet, resolveExitYear } from "../../kidem-tazminati/basin-is/engine";
import { calculateKismiKidem, deriveBrutNet as deriveKismiBrutNet } from "../../kidem-tazminati/kismi-sureli/engine";
import { createEmptyForm as emptyPrim } from "../../prim-alacagi/model";
import { computePrim } from "../../prim-alacagi/engine";
import { createEmptyForm as emptyBakiye } from "../../bakiye-ucret-alacagi/model";
import { computeBakiyeUcret } from "../../bakiye-ucret-alacagi/engine";
import { createEmptyForm as emptyUcret } from "../../ucret-alacagi/model";
import { computeUcretAlacagi } from "../../ucret-alacagi/engine";
import { computeNetFromGrossSingle, computeStandartBrutNetFromGross } from "../../icra-takip-brutten-nete/lib/brutNet";
import { deriveGrossFromNet, deriveNetFromGross } from "../../davaci-ucreti/engine";
import { runUserCalc } from "../../../../hooks/userCalcGuard";
import { WageIncomeTaxError, wageIncomeTaxForDate } from "./wageDeductions";
import { ratesForAccrual, stampRateForDate } from "./laborNet";

const HISTORICAL = ["1996-06-15", "1999-06-15", "2004-06-15", "2005-06-15", "2026-10-07"] as const;

function yearKeystrokes(yearDigits: string, monthDay: string): string[] {
  const frames = [""];
  let typed = "";
  for (const ch of yearDigits) {
    typed += ch;
    frames.push(typed);
    frames.push(`${typed.padStart(4, "0")}-${monthDay}`);
  }
  let partial = `${yearDigits}-`;
  frames.push(partial);
  for (const ch of monthDay) {
    partial += ch;
    frames.push(partial);
  }
  return frames;
}

const frames = [
  ...yearKeystrokes("2026", "10-07"),
  ...yearKeystrokes("1996", "06-15"),
  "",
  "   ",
  "2026",
  "2026-02",
  "2026-02-",
  "2026-00-15",
  "2026-10-00",
  "0202-05-20",
  "0020-05-20",
  "0002-05-20",
  "2026-02-29",
  clampYear("202604-02-29"),
  "1996-06-15",
  "1999-06-15",
  "2004-06-15",
  "2005-06-15",
  "2026-10-07",
];

function mustNotThrow(label: string, run: () => void) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.fail(`${label} fırlattı: ${message}`);
  }
}

function contained(label: string, run: () => void) {
  let escaped: unknown = null;
  try {
    const settled = runUserCalc(run);
    if (settled.error) {
      assert.match(settled.error, /kesinti oranı tanımlı değil|Son tahakkuk tarihi geçersiz|tarifesi tanımlı değil/);
    }
  } catch (error) {
    escaped = error;
  }
  assert.equal(escaped, null, `${label} ortak korumanın dışında: ${escaped instanceof Error ? escaped.message : String(escaped)}`);
}

function ihbarForm<T extends { startDate: string; endDate: string; brut: string }>(empty: () => T, endDate: string): T {
  return { ...empty(), startDate: "1990-01-01", endDate, brut: "30000" };
}

function yillikSpan(endDate: string) {
  return { startDate: "1990-01-01", endDate, brut: "30000" };
}

function multi(endDate: string) {
  return withSyncedSpan({
    ...emptyMulti(),
    brut: "30000",
    workPeriods: [{ id: "p", iseGiris: "1990-01-01", istenCikis: endDate }],
  });
}

function haftaForm<T extends { dateRanges: { id: string; start: string; end: string }[] }>(empty: () => T, endDate: string): T {
  const form = empty();
  form.dateRanges = [{ id: "dr", start: endDate ? "1990-01-01" : "", end: endDate }];
  return form;
}

const families: { name: string; run: (iso: string) => void; historical?: (iso: string) => void; throwsBefore1996: boolean }[] = [
  {
    name: "ihbar-30",
    throwsBefore1996: true,
    run: (iso) => computeIhbar30IsciResult(ihbarForm(emptyIhbar30, iso)),
    historical: (iso) => {
      const result = computeIhbar30IsciResult(ihbarForm(emptyIhbar30, iso));
      assert.equal(result.damgaOran, ratesForAccrual(iso).damgaOran, `ihbar-30 damga ${iso}`);
      assert.equal(result.gelirVergisi, wageIncomeTaxForDate(iso, result.brut).tax);
    },
  },
  { name: "ihbar-mevsim", throwsBefore1996: true, run: (iso) => computeIhbarMevsimResult(ihbarForm(emptyIhbarMevsim, iso)) },
  { name: "ihbar-kismi", throwsBefore1996: true, run: (iso) => computeIhbarKismiResult(ihbarForm(emptyIhbarKismi, iso)) },
  { name: "ihbar-gemi", throwsBefore1996: true, run: (iso) => computeIhbarGemiResult(ihbarForm(emptyIhbarGemi, iso)) },
  { name: "ihbar-borclar", throwsBefore1996: true, run: (iso) => computeIhbarBorclarResult(ihbarForm(emptyIhbarBorclar, iso)) },
  { name: "ihbar-belirli", throwsBefore1996: true, run: (iso) => computeIhbarBelirliResult(ihbarForm(emptyIhbarBelirli, iso)) },
  { name: "ihbar-basin", throwsBefore1996: true, run: (iso) => computeIhbarBasinResult(ihbarForm(emptyIhbarBasin, iso)) },
  {
    name: "yillik-standart",
    throwsBefore1996: true,
    run: (iso) => computeYillikStandartResult({ ...emptyYillik(), ...yillikSpan(iso) }),
    historical: (iso) => {
      const result = computeYillikStandartResult({ ...emptyYillik(), ...yillikSpan(iso) });
      assert.ok(result.brutIzin > 0, `yillik-standart brüt ${iso}`);
      assert.equal(result.damgaOran, ratesForAccrual(iso).damgaOran);
      assert.equal(result.issizlikOran, ratesForAccrual(iso).issizlikOran);
    },
  },
  { name: "yillik-borclar", throwsBefore1996: true, run: (iso) => computeYillikBorclarResult({ ...emptyYillikBorclar(), ...yillikSpan(iso) }) },
  { name: "yillik-basin", throwsBefore1996: true, run: (iso) => computeYillikBasinResult({ ...emptyYillikBasin(), ...yillikSpan(iso) }) },
  { name: "yillik-gemi", throwsBefore1996: true, run: (iso) => computeYillikGemiResult({ ...emptyYillikGemi(), endDate: iso, brut: "30000", workPeriods: [{ id: "p", iseGiris: "1990-01-01", istenCikis: iso }] }) },
  { name: "yillik-gunluk-olmayan", throwsBefore1996: true, run: (iso) => computeYillikBasinGunlukOlmayanResult({ ...emptyYillikGo(), meslegeBaslangic: "1990-01-01", startDate: "1990-01-01", endDate: iso, brut: "30000" }) },
  { name: "yillik-mevsim", throwsBefore1996: true, run: (iso) => computeYillikMevsimResult(multi(iso)) },
  { name: "yillik-kismi", throwsBefore1996: true, run: (iso) => computeYillikKismiResult(multi(iso)) },
  { name: "yillik-belirli", throwsBefore1996: true, run: (iso) => computeYillikBelirliResult(multi(iso)) },
  {
    name: "ubgt-net",
    throwsBefore1996: true,
    run: (iso) => calculateUbgtNet(1000, iso),
    historical: (iso) => {
      const net = calculateUbgtNet(1000, iso);
      assert.equal(net.damgaVergisi, Math.round(1000 * ratesForAccrual(iso).damgaOran * 100) / 100);
      assert.equal(net.issizlik, Math.round(1000 * ratesForAccrual(iso).issizlikOran * 100) / 100);
    },
  },
  {
    name: "ubgt-compute",
    throwsBefore1996: false,
    run: (iso) => {
      computeUbgt({ ...emptyUbgt(), dateRanges: [{ start: iso ? "2006-01-01" : "", end: iso }], year: 2026 });
    },
  },
  {
    name: "hafta-standart",
    throwsBefore1996: false,
    run: (iso) => {
      const form = haftaForm(emptyHafta, iso);
      const result = computeStandardHaftaTatili(form);
      buildStandartHtPreviewSections({ form, result, daily50Header: "Günlük" });
    },
    historical: (iso) => {
      const result = computeStandardHaftaTatili(haftaForm(emptyHafta, iso));
      if (result.totalBrut > 0) {
        assert.equal(result.net.damgaOran, ratesForAccrual(iso).damgaOran, `hafta damga ${iso}`);
        assert.equal(result.net.issizlikOran, ratesForAccrual(iso).issizlikOran);
      }
    },
  },
  {
    name: "hafta-gemi",
    throwsBefore1996: false,
    run: (iso) => {
      const form = haftaForm(emptyHaftaGemi, iso);
      const result = computeGemiHaftaTatili(form);
      buildGemiHtPreviewSections({ form, result, daily50Header: "Günlük" });
    },
  },
  {
    name: "hafta-basin",
    throwsBefore1996: false,
    run: (iso) => {
      const form = haftaForm(emptyHaftaBasin, iso);
      const result = computeBasinHaftaTatili(form);
      buildBasinHtPreviewSections({ form, result, daily50Header: "Günlük" });
    },
  },
  {
    name: "hafta-net",
    throwsBefore1996: true,
    run: (iso) => calculateNetFromBrut(1000, iso),
    historical: (iso) => {
      const net = calculateNetFromBrut(1000, iso);
      assert.equal(net.damgaOran, ratesForAccrual(iso).damgaOran);
      assert.equal(net.issizlikOran, ratesForAccrual(iso).issizlikOran);
    },
  },
  {
    name: "is-arama",
    throwsBefore1996: true,
    run: (iso) => computeIsArama({ ...emptyArama(), startDate: "1990-01-01", endDate: iso, brut: "30000" }),
    historical: (iso) => {
      const result = computeIsArama({ ...emptyArama(), startDate: "1990-01-01", endDate: iso, brut: "30000" });
      if (result.brut > 0) {
        assert.equal(result.damgaOran, ratesForAccrual(iso).damgaOran, `iş arama damga ${iso}`);
        assert.equal(result.issizlikOran, ratesForAccrual(iso).issizlikOran);
      }
    },
  },
  {
    name: "ayrimcilik",
    throwsBefore1996: true,
    run: (iso) => computeAyrimcilik({ ...emptyAyrimcilik(), endDate: iso, brut: "10000", brutInputForNet: "7000" }),
    historical: (iso) => {
      const result = computeAyrimcilik({ ...emptyAyrimcilik(), endDate: iso, brutInputForNet: "7000" });
      assert.equal(result.damgaOran, ratesForAccrual(iso).damgaOran);
      assert.equal(result.gelirVergisi, wageIncomeTaxForDate(iso, 7000).tax);
    },
  },
  {
    name: "bosta",
    throwsBefore1996: true,
    run: (iso) => computeBostaGecenSure({ ...emptyBosta(), endDate: iso, brut: "10000" }),
    historical: (iso) => {
      const result = computeBostaGecenSure({ ...emptyBosta(), endDate: iso, brut: "10000" });
      assert.equal(result.damgaOran, ratesForAccrual(iso).damgaOran);
      assert.equal(result.issizlikOran, ratesForAccrual(iso).issizlikOran);
    },
  },
  {
    name: "kotu-niyet",
    throwsBefore1996: false,
    run: (iso) => computeKotuNiyet({ ...emptyKotu(), startDate: "1990-01-01", endDate: iso, brut: "30000" }),
    historical: (iso) => {
      const result = computeKotuNiyet({ ...emptyKotu(), startDate: "1990-01-01", endDate: iso, brut: "30000" });
      assert.equal(result.damgaOran, stampRateForDate(iso));
      assert.equal(stampRateForDate(iso), ratesForAccrual(iso).damgaOran);
    },
  },
  {
    name: "haksiz-fesih",
    throwsBefore1996: false,
    run: (iso) => computeHaksizFesih({ ...emptyHaksiz(), startDate: "1990-01-01", endDate: iso, brut: "30000" }),
    historical: (iso) => assert.equal(computeHaksizFesih({ ...emptyHaksiz(), endDate: iso, brut: "30000" }).damgaOran, stampRateForDate(iso)),
  },
  {
    name: "ise-almama",
    throwsBefore1996: false,
    run: (iso) => computeIseAlmama({ ...emptyIseAlmama(), startDate: "1990-01-01", endDate: iso, brut: "30000" }),
    historical: (iso) => assert.equal(computeIseAlmama({ ...emptyIseAlmama(), endDate: iso, brut: "30000" }).damgaOran, stampRateForDate(iso)),
  },
  { name: "fm-vardiya-24", throwsBefore1996: true, run: (iso) => { netVardiya24(1000, iso); netVardiya24(1000, fmTaxYear(iso)); computeVardiya24Result({ ...emptyVardiya24(), iseGiris: "2020-01-01", istenCikis: iso }); } },
  { name: "fm-vardiya-48", throwsBefore1996: true, run: (iso) => { netVardiya48(1000, iso); netVardiya48(1000, vardiya48TaxYear(iso)); computeVardiya48Result({ ...emptyVardiya48(), iseGiris: "2020-01-01", istenCikis: iso }); } },
  { name: "fm-gemi-gunluk", throwsBefore1996: true, run: (iso) => { netGemiGunluk(1000, iso); computeGemiGunlukResult({ ...emptyGemiGunluk(), iseGiris: "2020-01-01", istenCikis: iso }); } },
  { name: "fm-gemi-724", throwsBefore1996: true, run: (iso) => { netGemi724(1000, iso); computeGemi724Result({ ...emptyGemi724(), iseGiris: "2020-01-01", istenCikis: iso }); } },
  { name: "fm-yeralti", throwsBefore1996: true, run: (iso) => { netYeralti(1000, iso); computeYeraltiResultV3({ ...emptyYeralti(), davaciDateOut: iso }); } },
  { name: "fm-tanikli", throwsBefore1996: true, run: (iso) => { netTanikli(1000, iso); computeTanikliFmResult({ ...emptyTanikli(), iseGiris: "2020-01-01", istenCikis: iso }); } },
  { name: "fm-haftalik-karma", throwsBefore1996: true, run: (iso) => { netKarma(1000, iso); computeHaftalikKarmaResult({ ...createEmptyHaftalikKarmaForm(), istenCikis: iso }); } },
  { name: "fm-donemsel", throwsBefore1996: true, run: (iso) => { netDonemsel(1000, iso); computeDonemselResult({ ...createEmptyDonemselForm(), dateOut: iso }); } },
  { name: "fm-donemsel-haftalik", throwsBefore1996: true, run: (iso) => { netDonemselHaftalik(1000, iso); computeDonemselHaftalikResult({ ...createEmptyDonemselHaftalikForm(), dateOut: iso }); } },
  {
    name: "fm-standart",
    throwsBefore1996: true,
    run: (iso) => {
      netFromGrossStandartFm(1000, iso);
      computeStandartFmResultV3({ ...emptyStandartFm(), iseGiris: "2020-01-01", istenCikis: iso });
    },
    historical: (iso) => {
      const net = netFromGrossStandartFm(1000, iso);
      assert.equal(net.tahakkukTarihi, iso);
      assert.equal(net.damgaOran, ratesForAccrual(iso).damgaOran);
      assert.equal(net.issizlikOran, ratesForAccrual(iso).issizlikOran);
      assert.equal(
        net.gelirVergisi,
        Math.round(wageIncomeTaxForDate(iso, 1000 - net.sgk - net.issizlik).tax * 100) / 100,
      );
    },
  },
  { name: "kidem-30", throwsBefore1996: false, run: (iso) => computeIsKanunuResult({ ...emptyKidem(), iseGirisTarihi: "1990-01-01", istenCikisTarihi: iso, ciplakBrut: "30000" }) },
  { name: "kidem-gemi", throwsBefore1996: false, run: (iso) => deriveGemiResult({ ...createEmptyGemiForm(), startDate: "1990-01-01", endDate: iso }) },
  { name: "kidem-mevsim", throwsBefore1996: false, run: (iso) => deriveMevsimlikResult({ ...createEmptyMevsimlikForm(), periods: [{ id: "p", start: "1990-01-01", end: iso, days: 90 }] }) },
  { name: "kidem-basin", throwsBefore1996: false, run: (iso) => { computeCalismaSuresi("1990-01-01", iso); deriveBasinBrutNet(1000, 30000, resolveExitYear(iso), iso); } },
  { name: "kidem-kismi", throwsBefore1996: false, run: (iso) => { calculateKismiKidem(30000, 2, 0, 0, iso); deriveKismiBrutNet(1000, iso); } },
  { name: "prim", throwsBefore1996: false, run: () => computePrim({ ...emptyPrim(), brutInputForNet: "10000" }) },
  {
    name: "bakiye",
    throwsBefore1996: false,
    run: (iso) => computeBakiyeUcret({ ...emptyBakiye(), startDate: iso, endDate: iso, resignDate: "", monthly: 30000 } as never),
  },
  { name: "ucret", throwsBefore1996: false, run: (iso) => computeUcretAlacagi({ ...emptyUcret(), startDate: "1990-01-01", endDate: iso }) },
  { name: "icra", throwsBefore1996: false, run: (iso) => { const year = Number(String(iso).slice(0, 4)); computeNetFromGrossSingle(10000, Number.isFinite(year) ? year : 2026, 1, iso); computeStandartBrutNetFromGross(10000, Number.isFinite(year) ? year : 2026); } },
  { name: "davaci", throwsBefore1996: false, run: (iso) => { const year = Number(String(iso).slice(0, 4)) || 2026; deriveNetFromGross(10000, year, 1); deriveGrossFromNet("8000", year, 1); } },
];

for (const family of families) {
  for (const iso of frames) {
    mustNotThrow(`${family.name} ${JSON.stringify(iso)}`, () => family.run(iso));
  }
  if (family.historical) {
    for (const iso of HISTORICAL) family.historical(iso);
  }
  if (family.throwsBefore1996) {
    assert.throws(() => family.run("1995-12-31"), WageIncomeTaxError, `${family.name} 1995 motor kuralı`);
    contained(`${family.name} 1995`, () => family.run("1995-12-31"));
  } else {
    mustNotThrow(`${family.name} 1995`, () => family.run("1995-12-31"));
  }
}

assert.notEqual(ratesForAccrual("1996-06-15").damgaOran, ratesForAccrual("2026-10-07").damgaOran);
assert.notEqual(wageIncomeTaxForDate("1996-06-15", 7000).tax, wageIncomeTaxForDate("1999-06-15", 7000).tax);
assert.notEqual(wageIncomeTaxForDate("2004-06-15", 7000).tax, wageIncomeTaxForDate("2005-06-15", 7000).tax);
assert.equal(ratesForAccrual("0202-05-20").tahakkukTarihi.startsWith("199"), false);

console.log(`dateInputFamilyCoverage.selftest: geçti (${families.length} aile, ${frames.length} ara değer)`);
