/**
 * Mevsimlik İşçi kıdem tazminatı — toplam gün / 365 esası ve Yıl/Ay/Gün sınır değerleri.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/kidem-tazminati/mevsimlik-isci/kidem365.test.ts
 * Ağ isteği yoktur; yalnızca motor doğrulanır.
 */

import {
  calculateBrutKidem,
  calculateKidemPaylari,
  convertDaysToYilAyGun,
  deriveMevsimlikResult,
  formatYilAyGun,
  isKalanGunSinirDurumu,
} from "./engine";
import { createEmptyMevsimlikForm } from "./model";

type Failure = { label: string; actual: unknown; expected: unknown };

const failures: Failure[] = [];
let passed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok =
    typeof actual === "number" && typeof expected === "number"
      ? Math.abs(actual - expected) < 1e-6
      : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failures.push({ label, actual, expected });
}

const BRUT = 36500;

const ornekler: Array<[number, { yil: number; ay: number; gun: number }]> = [
  [0, { yil: 0, ay: 0, gun: 0 }],
  [1, { yil: 0, ay: 0, gun: 1 }],
  [29, { yil: 0, ay: 0, gun: 29 }],
  [30, { yil: 0, ay: 1, gun: 0 }],
  [329, { yil: 0, ay: 10, gun: 29 }],
  [330, { yil: 0, ay: 11, gun: 0 }],
  [359, { yil: 0, ay: 11, gun: 29 }],
  [360, { yil: 0, ay: 0, gun: 360 }],
  [364, { yil: 0, ay: 0, gun: 364 }],
  [365, { yil: 1, ay: 0, gun: 0 }],
  [366, { yil: 1, ay: 0, gun: 1 }],
  [395, { yil: 1, ay: 1, gun: 0 }],
  [724, { yil: 1, ay: 11, gun: 29 }],
  [725, { yil: 1, ay: 0, gun: 360 }],
  [729, { yil: 1, ay: 0, gun: 364 }],
  [730, { yil: 2, ay: 0, gun: 0 }],
  [2207, { yil: 6, ay: 0, gun: 17 }],
];

for (const [gun, beklenen] of ornekler) {
  check(`${gun} gün → yıl/ay/gün`, convertDaysToYilAyGun(gun), beklenen);
  check(`${gun} gün → brüt × gün / 365`, calculateBrutKidem(BRUT, beklenen), (BRUT * gun) / 365);
}

const gosterim: Array<[number, string, boolean]> = [
  [0, "0 Yıl 0 Ay 0 Gün", false],
  [29, "0 Yıl 0 Ay 29 Gün", false],
  [359, "0 Yıl 11 Ay 29 Gün", false],
  [360, "360 Gün", true],
  [364, "364 Gün", true],
  [365, "1 Yıl 0 Ay 0 Gün", false],
  [724, "1 Yıl 11 Ay 29 Gün", false],
  [729, "1 Yıl 364 Gün", true],
  [2207, "6 Yıl 0 Ay 17 Gün", false],
];
for (const [gun, metin, sinir] of gosterim) {
  const t = convertDaysToYilAyGun(gun);
  check(`${gun} gün gösterimi`, formatYilAyGun(t), metin);
  check(`${gun} gün sınır durumu`, isKalanGunSinirDurumu(t), sinir);
}

check("2.207 gün brüt (36.500 × 2207 / 365)", calculateBrutKidem(BRUT, convertDaysToYilAyGun(2207)), 220700);
check("364 gün brüt < 365 gün brüt", calculateBrutKidem(BRUT, convertDaysToYilAyGun(364)) < BRUT, true);

let onceki = -1;
let monoton = true;
let ayAsimi = 0;
let gunAsimi = 0;
let toplamUyumsuz = 0;
let payUyumsuz = 0;
for (let d = 0; d <= 5000; d++) {
  const t = convertDaysToYilAyGun(d);
  if (t.ay > 11 || (t.gun >= 30 && t.ay !== 0)) ayAsimi += 1;
  if (t.gun < 0 || (t.gun > 29 && (t.gun < 360 || t.gun > 364))) gunAsimi += 1;
  if (t.yil * 365 + t.ay * 30 + t.gun !== d) toplamUyumsuz += 1;
  const brut = calculateBrutKidem(BRUT, t);
  const p = calculateKidemPaylari(BRUT, t);
  if (Math.abs(p.yilTutar + p.ayTutar + p.gunTutar - brut) > 1e-6) payUyumsuz += 1;
  if (brut < onceki) monoton = false;
  onceki = brut;
}
check("0–5000 gün: ay en fazla 11, sınır durumunda 0", ayAsimi, 0);
check("0–5000 gün: gün 0–29 ya da sınır durumunda 360–364", gunAsimi, 0);
check("0–5000 gün: yıl×365 + ay×30 + gün = toplam gün", toplamUyumsuz, 0);
check("0–5000 gün: paylar toplamı = brüt kıdem", payUyumsuz, 0);
check("0–5000 gün: tutar gün arttıkça azalmaz", monoton, true);

const form = {
  ...createEmptyMevsimlikForm(),
  manualTotalDaysOverride: "2207",
  ciplakBrut: "36.500,00",
};
const r = deriveMevsimlikResult(form);
check("sonuç: toplam gün", r.toplamGun, 2207);
check("sonuç: 6 yıl 0 ay 17 gün", [r.yil, r.ay, r.gun], [6, 0, 17]);
check("sonuç: yıl payı", r.yilTutar, 219000);
check("sonuç: ay payı", r.ayTutar, 0);
check("sonuç: gün payı (36.500 / 365 × 17)", r.gunTutar, 1700);
check("sonuç: brüt kıdem", r.brutKidem, 220700);
check("sonuç: damga (binde 7,59)", r.damgaVergisi, Math.round(220700 * 0.00759 * 100) / 100);
check("sonuç: net", r.netKidem, Math.round((220700 - r.damgaVergisi) * 100) / 100);

const r364 = deriveMevsimlikResult({ ...form, manualTotalDaysOverride: "364" });
check("364 gün: 0 yıl 0 ay 364 gün", [r364.yil, r364.ay, r364.gun], [0, 0, 364]);
check("364 gün: ay payı yok", r364.ayTutar, 0);
check("364 gün: gün payı (36.500 / 365 × 364)", r364.gunTutar, 36400);
check("364 gün: brüt", r364.brutKidem, 36400);

const r729 = deriveMevsimlikResult({ ...form, manualTotalDaysOverride: "729" });
check("729 gün: yıl payı", r729.yilTutar, 36500);
check("729 gün: gün payı (36.500 / 365 × 364)", r729.gunTutar, 36400);
check("729 gün: brüt", r729.brutKidem, 72900);

if (failures.length > 0) {
  console.error(`mevsimlik kidem365.test: ${failures.length} test başarısız, ${passed} geçti`);
  for (const f of failures) console.error(" -", f.label, "→ gerçek:", f.actual, "beklenen:", f.expected);
  throw new Error(`mevsimlik kidem365.test: ${failures.length} failure(s)`);
}
console.log(`mevsimlik kidem365.test: ${passed} test geçti ✔`);
