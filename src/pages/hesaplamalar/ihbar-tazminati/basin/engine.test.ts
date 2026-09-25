/**
 * İhbar Tazminatı — Basın İş Kanunu (5953). Lokal motor doğrulaması.
 * Mesleğe başlangıç → işten çıkış kıdem süresine göre 30/90 gün örnek hesabı. Ağ yoktur.
 */

import { computeIhbarBasinResult } from "./engine";
import { createEmptyForm } from "./model";

type Failure = { label: string; actual: unknown; expected: unknown };

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  return false;
}

function runEngineSelfTests(): { passed: number; failures: Failure[] } {
  const failures: Failure[] = [];
  let passed = 0;
  const check = (label: string, actual: unknown, expected: unknown) => {
    if (isEqual(actual, expected)) passed += 1;
    else failures.push({ label, actual, expected });
  };

  // ── Mesleğe başlangıç boş → standart İş Kanunu haftalık ihbarına (örnek) düşer ──
  const noMeslek = computeIhbarBasinResult({
    ...createEmptyForm(),
    startDate: "2022-01-01",
    endDate: "2024-01-01",
    brut: "30.000",
  });
  check("mesleğe başlangıç yok → hasBasinKidem false", noMeslek.hasBasinKidem, false);
  check("mesleğe başlangıç yok → ihbarGun null", noMeslek.ihbarGun, null);
  check("mesleğe başlangıç yok → hafta esaslı", noMeslek.weeks > 0, true);

  // ── Kıdem 4 yıl (mesleğe başlangıç → işten çıkış) → 30 gün ──
  const kidem4y = computeIhbarBasinResult({
    ...createEmptyForm(),
    startDate: "2023-01-01",
    endDate: "2024-01-01",
    meslegeBaslangic: "2020-01-01",
    brut: "40.000",
  });
  check("kıdem 4 yıl → hasBasinKidem true", kidem4y.hasBasinKidem, true);
  check("kıdem 4 yıl → ihbarGun 30", kidem4y.ihbarGun, 30);
  check("kıdem 4 yıl → amount = 40000/30*30", kidem4y.brut, (40000 / 30) * 30);
  check("kıdem 4 yıl → ihbarSuresiLabel", kidem4y.ihbarSuresiLabel, "1 ay (30 gün)");

  // ── Kıdem 5 yıl → 90 gün ──
  const kidem5y = computeIhbarBasinResult({
    ...createEmptyForm(),
    startDate: "2023-01-01",
    endDate: "2024-01-01",
    meslegeBaslangic: "2019-01-01",
    brut: "40.000",
  });
  check("kıdem 5 yıl → ihbarGun 90", kidem5y.ihbarGun, 90);
  check("kıdem 5 yıl → amount = 40000/30*90", kidem5y.brut, (40000 / 30) * 90);
  check("kıdem 5 yıl → ihbarSuresiLabel", kidem5y.ihbarSuresiLabel, "3 ay (90 gün)");
  check("kıdem 5 yıl → net damga round2'li", kidem5y.net, Math.round(kidem5y.net * 100) / 100);

  // ── Boş form güvenli sıfırlar ──
  const empty = computeIhbarBasinResult(createEmptyForm());
  check("boş form net 0", empty.net, 0);

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`ihbar-basin engine.test: ${failures.length} test başarısız`, failures);
  } else {
    // eslint-disable-next-line no-console
    console.log(`ihbar-basin engine.test: ${passed} test geçti ✔`);
  }
  return { passed, failures };
}

const result = runEngineSelfTests();
if (result.failures.length > 0) {
  throw new Error(`ihbar-basin engine.test: ${result.failures.length} failure(s)`);
}
