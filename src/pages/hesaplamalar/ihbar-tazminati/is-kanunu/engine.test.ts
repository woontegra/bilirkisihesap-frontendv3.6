/**
 * İhbar Tazminatı — İş Kanununa Göre (30+ işçi). Lokal motor + depo doğrulaması.
 * V3/backend formülü ile kuruş eşleşmesi. Başka sayfa motoru import edilmez. Ağ yoktur.
 */

import { clampYear, computeIhbar30IsciResult, formatDateTR, isDateOrderInvalid, parseNum } from "./engine";
import { createEmptyForm, snapshotKey } from "./model";
import { clearCorruptCases, deleteCase, loadCasesSafe, saveCase } from "./storage";

type Failure = { label: string; actual: unknown; expected: unknown };

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  if (a && b && typeof a === "object" && typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function runEngineSelfTests(): { passed: number; failures: Failure[] } {
  const failures: Failure[] = [];
  let passed = 0;
  const check = (label: string, actual: unknown, expected: unknown) => {
    if (isEqual(actual, expected)) passed += 1;
    else failures.push({ label, actual, expected });
  };

  // ── Türkçe sayı ayrıştırma ──
  check("parse 25.000", parseNum("25.000"), 25000);
  check("parse 25.000,50", parseNum("25.000,50"), 25000.5);
  check("parse boş", parseNum(""), 0);
  check("parse negatif → 0", parseNum("-1"), 0);

  // ── Tarih yardımcıları ──
  check("tarih sırası geçersiz", isDateOrderInvalid("2024-06-01", "2024-01-01"), true);
  check("tarih sırası geçerli", isDateOrderInvalid("2024-01-01", "2024-06-01"), false);
  check("formatDateTR", formatDateTR("2024-03-15"), "15.03.2024");
  check("clampYear kısaltır", clampYear("202412-03-15"), "2024-03-15");

  // ── Boş form → güvenli sıfırlar ──
  const empty = computeIhbar30IsciResult(createEmptyForm());
  check("boş form toplamBrut 0", empty.toplamBrut, 0);
  check("boş form brut 0", empty.brut, 0);
  check("boş form net 0", empty.net, 0);
  check("boş form asgari uyarı yok", empty.asgariUcretHatasi, null);

  // ── Kapsayıcı (+1 gün) çalışma süresi ile tam hesap — 3 yıl (36 ay) → 8 hafta ──
  const result36 = computeIhbar30IsciResult({
    ...createEmptyForm(),
    startDate: "2021-01-01",
    endDate: "2024-01-01",
    brut: "30.000",
  });
  check("3 yıl çalışma → 8 hafta", result36.weeks, 8);
  check("3 yıl çalışma → amount 56000", result36.brut, 56000);
  check("3 yıl çalışma → ihbarSuresiLabel", result36.ihbarSuresiLabel, "8 hafta (3 yıldan fazla)");
  check("formulaText doğru", result36.formulaText, "(30.000,00 / 30 × 8 × 7)");
  check("net = brut - gv - damga", result36.net, result36.brut - result36.gelirVergisi - result36.damgaVergisi);

  // ── Ekstra kalemler toplama dahil ──
  const withExtras = computeIhbar30IsciResult({
    ...createEmptyForm(),
    startDate: "2023-01-01",
    endDate: "2024-01-01",
    brut: "20.000",
    prim: "1.000",
    ikramiye: "500",
    yol: "250",
    yemek: "250",
    extras: [{ id: "e1", label: "Yakacak", value: "1.000" }],
  });
  check("toplamBrut ekstra dahil", withExtras.toplamBrut, 23000);

  // ── Asgari ücret uyarısı (2025 yılı) ──
  const lowWage = computeIhbar30IsciResult({
    ...createEmptyForm(),
    startDate: "2024-01-01",
    endDate: "2025-06-15",
    brut: "10.000",
  });
  check("asgari ücret uyarısı var", !!lowWage.asgariUcretHatasi, true);

  // ── Lokal depo round-trip (yalnızca localStorage mevcutsa) ──
  if (typeof localStorage !== "undefined") {
    clearCorruptCases();
    const form = { ...createEmptyForm(), startDate: "2022-01-01", endDate: "2024-01-01", brut: "25.000" };
    const computed = computeIhbar30IsciResult(form);
    const saved = saveCase("Test 30 İşçi", form, {
      toplamBrut: computed.toplamBrut,
      brut: computed.brut,
      gelirVergisi: computed.gelirVergisi,
      damgaVergisi: computed.damgaVergisi,
      net: computed.net,
    });
    check("kayıt oluştu", !!saved?.id, true);

    const loaded = loadCasesSafe();
    check("kayıt yüklendi", loaded.ok && loaded.items.some((c) => c.id === saved!.id), true);

    const reopened = loaded.items.find((c) => c.id === saved!.id)!;
    check("snapshot key eşleşti", snapshotKey(reopened.form), snapshotKey(form));
    const recomputed = computeIhbar30IsciResult(reopened.form);
    check("açınca aynı net", recomputed.net, computed.net);

    deleteCase(saved!.id);
    check("silindi", loadCasesSafe().items.every((c) => c.id !== saved!.id), true);

    localStorage.setItem("bilirkisi-hesap-v35:ihbar-30isci:cases:v1", "{not-json");
    const corrupt = loadCasesSafe();
    check("bozuk kayıt çökmez", corrupt.ok, false);
    clearCorruptCases();
    check("temiz sonrası ok", loadCasesSafe().ok, true);
  }

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`ihbar-30isci engine.test: ${failures.length} test başarısız`, failures);
  } else {
    // eslint-disable-next-line no-console
    console.log(`ihbar-30isci engine.test: ${passed} test geçti ✔`);
  }
  return { passed, failures };
}

const result = runEngineSelfTests();
if (result.failures.length > 0) {
  throw new Error(`ihbar-30isci engine.test: ${result.failures.length} failure(s)`);
}
