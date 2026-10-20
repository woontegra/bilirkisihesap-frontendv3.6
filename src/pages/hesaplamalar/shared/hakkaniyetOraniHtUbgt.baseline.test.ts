/**
 * Hafta Tatili ve UBGT sayfalarında hakkaniyet oranı seçimi eklenmeden önceki 1/3 sonuçlarını referans dosyasına yazar.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/shared/hakkaniyetOraniHtUbgt.baseline.test.ts
 * Referans dosyası varsa üzerine yazmaz; yalnızca mevcut sonuçları referansla karşılaştırır.
 * Yeni eklenen `hakkaniyetOrani` alanı kayıt özetine katılmaz; diğer her alan referansla aynı olmalıdır.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HT_UBGT_MODULES, MAHSUP_SCENARIOS, summarizeCalc } from "./hakkaniyetOraniHtUbgt.fixtures.test";

const BASELINE_PATH = fileURLToPath(new URL("./hakkaniyetOraniHtUbgt.baseline.json", import.meta.url));

const snapshot: Record<string, ReturnType<typeof summarizeCalc>> = {};
for (const m of HT_UBGT_MODULES) {
  for (const mahsup of MAHSUP_SCENARIOS) {
    snapshot[`${m.key}|${mahsup}`] = summarizeCalc(m.calc(m.buildForm(mahsup)), ["hakkaniyetOrani"]);
  }
}

const json = `${JSON.stringify(snapshot, null, 2)}\n`;
if (existsSync(BASELINE_PATH)) {
  const same = readFileSync(BASELINE_PATH, "utf8") === json;
  console.log(same ? "Referans ile birebir aynı." : "UYARI: mevcut sonuçlar referanstan farklı.");
  if (!same) process.exitCode = 1;
} else {
  writeFileSync(BASELINE_PATH, json, "utf8");
  console.log(`Referans yazıldı: ${Object.keys(snapshot).length} senaryo.`);
}

for (const [key, v] of Object.entries(snapshot)) {
  console.log(
    `${key.padEnd(28)} brüt=${v.brut} hakkaniyet=${v.hakkaniyet} mahsupSonucu=${v.mahsupSonucu} net=${v.net.netAmount} satır=${v.rowCount}`,
  );
}
