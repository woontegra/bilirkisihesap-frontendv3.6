/**
 * İhbar Tazminatı — ortak formül çekirdeği (`lib/core.ts`) doğrulama testleri.
 * `aktuerya-backend/src/services/ihbar30.service.js` ile kuruş eşleşmesi hedeflenir.
 * Ağ isteği yoktur; başka hesaplama modülünden import edilmez.
 */

import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import {
  basinIhbarSuresiLabel,
  calculateIhbar,
  calculateToplamBrut,
  calculateWeeks,
  computeEklentiResult,
  DAMGA_ORAN,
  formulaTextBasin,
  formulaTextStandard,
  round2,
  weeksLabel,
} from "./core";
import { formatMoney, parseNum } from "./money";

type Failure = { label: string; actual: unknown; expected: unknown };

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  return false;
}

function runTests(): { passed: number; failures: Failure[] } {
  const failures: Failure[] = [];
  let passed = 0;
  const check = (label: string, actual: unknown, expected: unknown) => {
    if (isEqual(actual, expected)) passed += 1;
    else failures.push({ label, actual, expected });
  };

  // ── parseNum (Türkçe format) ──
  check("parse 25.000", parseNum("25.000"), 25000);
  check("parse 25.000,50", parseNum("25.000,50"), 25000.5);
  check("parse 30000,00", parseNum("30000,00"), 30000);
  check("parse boş", parseNum(""), 0);
  check("parse negatif → 0", parseNum("-500"), 0);
  check("parse NaN → 0", parseNum("abc"), 0);

  // ── round2 (backend) ──
  check("round2 half-up", round2(100.005), 100.01);
  check("round2 tam", round2(56000), 56000);

  // ── DAMGA_ORAN sabiti ──
  check("DAMGA_ORAN = 0.00759", DAMGA_ORAN, 0.00759);

  // ── calculateWeeks bucket sınırları (backend calculateWeeks) ──
  check("0 ay → 2 hafta", calculateWeeks({ yil: 0, ay: 0, gun: 0 }), 2);
  check("5 ay 29 gün → 2 hafta", calculateWeeks({ yil: 0, ay: 5, gun: 29 }), 2);
  check("6 ay → 4 hafta", calculateWeeks({ yil: 0, ay: 6, gun: 0 }), 4);
  check("18 ay → 6 hafta", calculateWeeks({ yil: 1, ay: 6, gun: 0 }), 6);
  check("17 ay 29 gün → 4 hafta", calculateWeeks({ yil: 1, ay: 5, gun: 29 }), 4);
  check("36 ay → 8 hafta", calculateWeeks({ yil: 3, ay: 0, gun: 0 }), 8);
  check("35 ay 29 gün → 6 hafta", calculateWeeks({ yil: 2, ay: 11, gun: 29 }), 6);
  check("5 yıl → 8 hafta", calculateWeeks({ yil: 5, ay: 0, gun: 0 }), 8);

  // ── weeksLabel ──
  check("weeksLabel(2)", weeksLabel(2), "2 hafta (altı aydan az)");
  check("weeksLabel(4)", weeksLabel(4), "4 hafta (altı ay - 1,5 yıl)");
  check("weeksLabel(6)", weeksLabel(6), "6 hafta (1,5 yıl - 3 yıl)");
  check("weeksLabel(8)", weeksLabel(8), "8 hafta (3 yıldan fazla)");

  // ── toplamBrut = brut+prim+ikramiye+yol+yemek+sum(extras) ──
  const toplam = calculateToplamBrut({
    brut: "25.000",
    prim: "2.000",
    ikramiye: "1.000",
    yol: "500",
    yemek: "500",
    extras: [
      { id: "e1", label: "Yakacak", value: "1.000" },
      { id: "e2", label: "", value: "0" },
    ],
  });
  check("toplamBrut toplamı", toplam, 30000);

  // ── standart yol: brüt 30.000, 8 hafta → amount = 30000/30*56 = 56000 ──
  const std8 = calculateIhbar({
    brut: "30.000",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
    totals: { yil: 3, ay: 0, gun: 0 },
    exitYear: 2024,
  });
  check("8 hafta amount = 56000", std8.brut, 56000);
  check("8 hafta weeks", std8.weeks, 8);
  check("8 hafta ihbarGun null", std8.ihbarGun, null);
  check("formulaTextStandard", formulaTextStandard(30000, 8), "(30.000,00 / 30 × 8 × 7)");

  // ── damga/gv/net — FrontendV3 calculations.ts ekran paritesi (lump-sum GV + round2 damga/net) ──
  const gv2024 = calculateIncomeTaxWithBrackets(2024, 56000);
  const expectedGv2024 = gv2024.tax; // zaten lump-sum round2
  const expectedDamga2024 = round2(56000 * DAMGA_ORAN);
  const expectedNet2024 = round2(56000 - expectedGv2024 - expectedDamga2024);
  check("2024 gelir vergisi lump-sum (V3 UI)", std8.gelirVergisi, expectedGv2024);
  check("2024 damga round2 (V3 UI)", std8.damgaVergisi, expectedDamga2024);
  check("2024 net round2 (V3 UI)", std8.net, expectedNet2024);

  // ── 2 hafta bucket doğrulama (kısa çalışma) ──
  const std2 = calculateIhbar({
    brut: "20.000",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
    totals: { yil: 0, ay: 3, gun: 0 },
    exitYear: 2024,
  });
  check("2 hafta amount", std2.brut, (20000 / 30) * 2 * 7);
  check("2 hafta weeks", std2.weeks, 2);

  // ── basın yolu: kıdem 4 yıl → 30 gün; kıdem 5 yıl → 90 gün ──
  const basin4y = calculateIhbar({
    brut: "40.000",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
    totals: { yil: 4, ay: 0, gun: 0 },
    exitYear: 2024,
    kidemTotals: { yil: 4, ay: 0, gun: 0 },
  });
  check("basın 4y → ihbarGun 30", basin4y.ihbarGun, 30);
  check("basın 4y amount", basin4y.brut, (40000 / 30) * 30);
  check("basın 4y weeks=0", basin4y.weeks, 0);
  check("basinIhbarSuresiLabel(4)", basinIhbarSuresiLabel(4), "1 ay (30 gün)");

  const basin5y = calculateIhbar({
    brut: "40.000",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
    totals: { yil: 5, ay: 0, gun: 0 },
    exitYear: 2024,
    kidemTotals: { yil: 5, ay: 0, gun: 0 },
  });
  check("basın 5y → ihbarGun 90", basin5y.ihbarGun, 90);
  check("basın 5y amount", basin5y.brut, (40000 / 30) * 90);
  check("basinIhbarSuresiLabel(5)", basinIhbarSuresiLabel(5), "3 ay (90 gün)");

  // ── basın yolu round2 UYGULANIR (backend calculateBasinAmounts) ──
  const basinAmount = (40000 / 30) * 90;
  const basinGv = calculateIncomeTaxWithBrackets(2024, basinAmount);
  const expectedBasinDamga = round2(basinAmount * DAMGA_ORAN);
  const expectedBasinNet = round2(basinAmount - basinGv.tax - expectedBasinDamga);
  check("basın damga round2", basin5y.damgaVergisi, expectedBasinDamga);
  check("basın net round2", basin5y.net, expectedBasinNet);
  check("formulaTextBasin", formulaTextBasin(40000, 90), "(40.000,00 / 30 × 90 gün)");

  // ── kidemTotals boş/sıfır ise standart yola düşülür ──
  const basinFallback = calculateIhbar({
    brut: "30.000",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
    totals: { yil: 1, ay: 0, gun: 0 },
    exitYear: 2024,
    kidemTotals: { yil: 0, ay: 0, gun: 0 },
  });
  check("boş kıdem → standart yol (ihbarGun null)", basinFallback.ihbarGun, null);
  check("boş kıdem → 4 hafta", basinFallback.weeks, 4);

  // ── boş/sıfır/negatif değerler → güvenli sıfırlar ──
  const zero = calculateIhbar({
    brut: "",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
    totals: { yil: 0, ay: 0, gun: 0 },
    exitYear: 2024,
  });
  check("boş brüt → toplamBrut 0", zero.toplamBrut, 0);
  check("boş brüt → amount 0", zero.brut, 0);
  check("boş brüt → gv 0", zero.gelirVergisi, 0);
  check("boş brüt → damga 0", zero.damgaVergisi, 0);
  check("boş brüt → net 0", zero.net, 0);

  const negative = calculateIhbar({
    brut: "-25.000",
    prim: "-500",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [{ id: "e1", label: "x", value: "-100" }],
    totals: { yil: 0, ay: 0, gun: 0 },
    exitYear: 2024,
  });
  check("negatif girişler → toplamBrut 0", negative.toplamBrut, 0);
  check("negatif girişler → amount 0", negative.brut, 0);

  // ── formatMoney ──
  check("formatMoney", formatMoney(56000), "56.000,00");

  // ── Eklenti: 12 aylık toplam / 360 × 30 ──
  const eklentiMonths = ["3600", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
  check("computeEklentiResult (sum/360)*30", round2(computeEklentiResult(eklentiMonths)), 300);

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`ihbar-tazminati lib/core.test: ${failures.length} test başarısız`, failures);
  } else {
    // eslint-disable-next-line no-console
    console.log(`ihbar-tazminati lib/core.test: ${passed} test geçti ✔`);
  }
  return { passed, failures };
}

const result = runTests();
if (result.failures.length > 0) {
  throw new Error(`ihbar-tazminati lib/core.test: ${result.failures.length} failure(s)`);
}
