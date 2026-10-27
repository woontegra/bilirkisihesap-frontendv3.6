/**
 * UBGT Son Brüt / Son Net — Desktop ile aynı sonuç (Standart + Bilirkişi).
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/ubgt/ubgtSonNet.test.ts
 */
import { SON_NET_LABEL } from "../shared/EquityNetLines";
import { calcHakkaniyet, calcSonBrutAlacak, calculateNet, formatMoney, type UbgtNetResult } from "./engine";
import { createEmptyForm } from "./model";
import { buildStandartUbgtPreviewSections } from "./standart/buildStandartUbgtPreviewSections";
import { buildBilirkisiUbgtPreviewSections } from "./bilirkisi/buildBilirkisiUbgtPreviewSections";
import { buildStandartUbgtSaveData } from "./standart/buildStandartUbgtSaveData";
import { buildBilirkisiUbgtSaveData } from "./bilirkisi/buildBilirkisiUbgtSaveData";

/** Desktop `ubgt/engine.ts` (calcSonBrutAlacak + calculateNet) çıktıları. */
const DESKTOP = [
  { brut: 13089.99, settle: 2000, year: 2025, sonBrut: 6726.66, sgk: 941.73, issizlik: 67.27, gv: 857.65, damga: 51.06, net: 4808.95 },
  { brut: 13089.99, settle: 2000, year: 2026, sonBrut: 6726.66, sgk: 941.73, issizlik: 67.27, gv: 857.65, damga: 51.06, net: 4808.95 },
  { brut: 100000, settle: 10000, year: 2025, sonBrut: 56666.67, sgk: 7933.33, issizlik: 566.67, gv: 7225, damga: 430.1, net: 40511.57 },
  { brut: 30000, settle: 25000, year: 2025, sonBrut: 0, sgk: 0, issizlik: 0, gv: 0, damga: 0, net: 0 },
  { brut: 1500000, settle: 50000, year: 2026, sonBrut: 950000, sgk: 133000, issizlik: 9500, gv: 180525, damga: 7210.5, net: 619764.5 },
];

let failures = 0;
let passed = 0;
function check(ok: boolean, label: string, detail?: unknown) {
  if (ok) passed++;
  else {
    failures++;
    console.error(`HATA: ${label}`, detail ?? "");
  }
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

for (const d of DESKTOP) {
  const tag = `${d.brut}/${d.settle}/${d.year}`;
  const hakkaniyet = calcHakkaniyet(d.brut, "1/3");
  const sonBrut = calcSonBrutAlacak(d.brut, hakkaniyet, d.settle);
  const k = calculateNet(sonBrut, d.year);
  check(near(sonBrut, d.sonBrut), `${tag} son brüt`, [sonBrut, d.sonBrut]);
  check(near(k.ssk, d.sgk) && near(k.issizlik, d.issizlik), `${tag} SGK/işsizlik`, k);
  check(near(k.gelirVergisi, d.gv) && near(k.damgaVergisi, d.damga), `${tag} GV/damga`, k);
  check(near(k.netAmount, d.net), `${tag} son net`, [k.netAmount, d.net]);

  const equityNet = {
    sgk: k.ssk,
    issizlik: k.issizlik,
    gelirVergisi: k.gelirVergisi,
    gelirVergisiDilimleri: k.gelirVergisiDilimleri,
    damgaVergisi: k.damgaVergisi,
    net: k.netAmount,
  };
  const effectiveNet: UbgtNetResult = calculateNet(d.brut, d.year);
  for (const mode of ["standart", "bilirkisi"] as const) {
    const form = { ...createEmptyForm(mode), settleAmount: formatMoney(d.settle) };
    const common = {
      form,
      displayPeriods: [],
      displayTotalDays: 0,
      displayBrutForNet: d.brut,
      effectiveNet,
      hakkaniyet,
      settleNum: d.settle,
      sonBrutAlacak: sonBrut,
      equityNet,
    };
    const sections =
      mode === "standart" ? buildStandartUbgtPreviewSections(common) : buildBilirkisiUbgtPreviewSections(common);
    const rows = sections.find((s) => s.id === "mahsuplasma")?.rows ?? [];
    const val = (label: string) => rows.find((r) => r[0] === label)?.[1];
    check(val("Mahsuplaşma Tutarı") === `−${formatMoney(d.settle)} ₺`, `${tag} ${mode} önizleme mahsup`, rows);
    check(val("Son Brüt Alacak") === `${formatMoney(d.sonBrut)} ₺`, `${tag} ${mode} önizleme son brüt`, rows);
    check(val(SON_NET_LABEL) === `${formatMoney(d.net)} ₺`, `${tag} ${mode} önizleme son net`, rows);
    check(val("SGK primi (%14)") === `-${formatMoney(d.sgk)} ₺`, `${tag} ${mode} önizleme SGK`, rows);
    check(val("Damga vergisi (binde 7,59)") === `-${formatMoney(d.damga)} ₺`, `${tag} ${mode} önizleme damga`, rows);

    const saveInput = {
      toplamBrut: d.brut,
      toplamNet: effectiveNet,
      sonBrutAlacak: sonBrut,
      sonNetAlacak: k.netAmount,
    } as unknown as Parameters<typeof buildStandartUbgtSaveData>[1];
    const saved = mode === "standart" ? buildStandartUbgtSaveData(form, saveInput) : buildBilirkisiUbgtSaveData(form, saveInput);
    const settlement = (saved as { settlement?: { sonBrutAlacak?: number; sonNetAlacak?: number } }).settlement;
    check(
      settlement?.sonBrutAlacak === sonBrut && settlement?.sonNetAlacak === k.netAmount,
      `${tag} ${mode} kayıt son brüt/net`,
      settlement,
    );
  }
}

console.log(`ubgtSonNet: ${passed} kontrol geçti, ${failures} hata`);
if (failures) process.exitCode = 1;
