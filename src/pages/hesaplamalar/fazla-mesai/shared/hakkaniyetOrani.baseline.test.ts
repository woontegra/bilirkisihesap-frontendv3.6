/**
 * Hakkaniyet oranı seçimi eklenmeden önceki 1/3 sonuçlarını referans dosyasına yazar.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/fazla-mesai/shared/hakkaniyetOrani.baseline.test.ts
 * Referans dosyası varsa üzerine yazmaz; yalnızca mevcut referansla karşılaştırır.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FM_MODULES, MAHSUP_SCENARIOS, buildScenarioForm, summarizeResult } from "./hakkaniyetOrani.fixtures.test";

const BASELINE_PATH = fileURLToPath(new URL("./hakkaniyetOrani.baseline.json", import.meta.url));

const snapshot: Record<string, unknown> = {};
for (const m of FM_MODULES) {
  for (const mahsup of MAHSUP_SCENARIOS) {
    const result = m.compute(buildScenarioForm(m, mahsup));
    snapshot[`${m.key}|${mahsup}`] = summarizeResult(m, result);
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

for (const [key, value] of Object.entries(snapshot)) {
  const v = value as { total: number; hakkaniyet: number; net: number; rowCount: number };
  console.log(`${key.padEnd(30)} toplam=${v.total} hakkaniyet=${v.hakkaniyet} net=${v.net} satır=${v.rowCount}`);
}
