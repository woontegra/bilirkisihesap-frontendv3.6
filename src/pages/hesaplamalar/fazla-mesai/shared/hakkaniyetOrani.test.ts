/**
 * Fazla mesai hakkaniyet indirimi oranı seçimi — 10 modül için regresyon testleri.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/fazla-mesai/shared/hakkaniyetOrani.test.ts
 * Ağ isteği yoktur; motor, kayıt payload'u, backend eşleyicisi ve yerel kayıt göçü doğrulanır.
 * 1/3 sonuçları, oran seçimi eklenmeden önce üretilen hakkaniyetOrani.baseline.json ile birebir karşılaştırılır.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  HAKKANIYET_ORANLARI,
  VARSAYILAN_HAKKANIYET_ORANI,
  hakkaniyetOraniEtiketi,
  hesaplaHakkaniyetIndirimi,
  normalizeHakkaniyetOrani,
  type HakkaniyetOrani,
} from "./hakkaniyetOrani";
import {
  FM_MODULES,
  MAHSUP_SCENARIOS,
  buildScenarioForm,
  summarizeResult,
  type AnyForm,
  type FmModule,
} from "./hakkaniyetOrani.fixtures.test";
import { round2 as round2Yeralti } from "../yeralti-isci/engine";
import { round2 as round2Gemi724 } from "../gemi-adami-7-24/engine";
import { migrateLegacyLocalForm } from "../gemi-adami-7-24/backendCase";

type Failure = { label: string; actual: unknown; expected: unknown };

const failures: Failure[] = [];
let passed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected) && (typeof actual !== "number" || Object.is(actual, expected))) {
    passed += 1;
  } else {
    failures.push({ label, actual, expected });
  }
}

const BASELINE = JSON.parse(
  readFileSync(fileURLToPath(new URL("./hakkaniyetOrani.baseline.json", import.meta.url)), "utf8"),
) as Record<string, ReturnType<typeof summarizeResult>>;

const YUZDE: Record<HakkaniyetOrani, number | null> = {
  "1/3": null,
  "%20": 20,
  "%25": 25,
  "%30": 30,
  "%35": 35,
  "%40": 40,
  "%45": 45,
};

function moduleRound2(m: FmModule): ((v: number) => number) | null {
  if (!m.rounded) return null;
  return m.key === "yeralti-isci" ? round2Yeralti : round2Gemi724;
}

function withoutField(form: AnyForm): AnyForm {
  const copy = { ...form };
  delete copy.hakkaniyetOrani;
  return copy;
}

/** Kayıt payload'undaki tüm form kopyalarından oran alanını siler (alan eklenmeden önceki kayıt). */
function stripFromPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripFromPayload);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "hakkaniyetOrani") continue;
    out[k] = stripFromPayload(v);
  }
  return out;
}

function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => containsKey(v, key));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([k, v]) => k === key || containsKey(v, key));
}

/* ── Ortak yardımcı ── */
check("seçenek listesi", [...HAKKANIYET_ORANLARI], ["1/3", "%20", "%25", "%30", "%35", "%40", "%45"]);
check("varsayılan 1/3", VARSAYILAN_HAKKANIYET_ORANI, "1/3");
for (const bad of [undefined, null, "", 3, 0.2, 20, "20", "%33,33", "33.33", "0.3333", "1/4", {}, "%50"]) {
  check(`geçersiz değer → 1/3 (${JSON.stringify(bad)})`, normalizeHakkaniyetOrani(bad), "1/3");
}
for (const total of [56652.34, 33047.189999999995, 0.01, 1, 100, 123456.78]) {
  check(`1/3 tam olarak toplam/3 (${total})`, hesaplaHakkaniyetIndirimi(total, "1/3"), total / 3);
  check(`alan yoksa toplam/3 (${total})`, hesaplaHakkaniyetIndirimi(total, undefined), total / 3);
}
check("%20 tutarı", hesaplaHakkaniyetIndirimi(1000, "%20"), 200);
check("%45 tutarı", hesaplaHakkaniyetIndirimi(1000, "%45"), 450);
check("1/3 ≠ %33,33", hesaplaHakkaniyetIndirimi(300, "1/3") === 100 && normalizeHakkaniyetOrani("%33") === "1/3", true);
check("etiket 1/3", hakkaniyetOraniEtiketi("1/3"), "1/3");
check("etiket %30", hakkaniyetOraniEtiketi("%30"), "%30");
check("etiket eski kayıt", hakkaniyetOraniEtiketi(undefined), "1/3");

for (const m of FM_MODULES) {
  const r2 = moduleRound2(m);

  /* ── Boş form ── */
  check(`${m.name}: yeni form varsayılanı`, m.buildForm().hakkaniyetOrani, "1/3");

  for (const mahsup of MAHSUP_SCENARIOS) {
    const baseline = BASELINE[`${m.key}|${mahsup}`];
    const tag = `${m.name} [mahsup=${mahsup || "yok"}]`;
    if (!baseline) {
      failures.push({ label: `${tag}: referans yok`, actual: undefined, expected: "referans" });
      continue;
    }

    /* ── 1/3 ve alan yokken referansla birebir aynı ── */
    const form = buildScenarioForm(m, mahsup);
    check(`${tag}: 1/3 referansla birebir`, summarizeResult(m, m.compute({ ...form, hakkaniyetOrani: "1/3" })), baseline);
    check(`${tag}: alan yok (eski kayıt) referansla birebir`, summarizeResult(m, m.compute(withoutField(form))), baseline);
    check(`${tag}: geçersiz alan → referans`, summarizeResult(m, m.compute({ ...form, hakkaniyetOrani: "33.33" })), baseline);

    /* ── Yüzdelik seçenekler ── */
    for (const oran of HAKKANIYET_ORANLARI) {
      const yuzde = YUZDE[oran];
      if (yuzde === null) continue;
      const s = summarizeResult(m, m.compute({ ...form, hakkaniyetOrani: oran }));
      const total = baseline.total as number;
      const mahsupTutari = baseline.mahsupTutari as number;
      const rawHk = (total * yuzde) / 100;
      const expectedHk = r2 ? r2(rawHk) : rawHk;
      const rawNet = total - expectedHk - mahsupTutari;
      const expectedNet = Math.max(0, r2 ? r2(rawNet) : rawNet);
      check(`${tag} ${oran}: hakkaniyet tutarı`, s.hakkaniyet, expectedHk);
      check(`${tag} ${oran}: mahsup sonrası tutar`, s.net, expectedNet);
      check(`${tag} ${oran}: toplam ve brütten nete değişmez`, { ...s, hakkaniyet: 0, net: 0 }, { ...baseline, hakkaniyet: 0, net: 0 });
      check(`${tag} ${oran}: 1/3'ten farklı`, s.hakkaniyet !== baseline.hakkaniyet, true);
    }
  }

  /* ── Kaydet → aç döngüsü ── */
  for (const oran of HAKKANIYET_ORANLARI) {
    const form = { ...buildScenarioForm(m, "5.000,50"), hakkaniyetOrani: oran };
    const result = m.compute(form);
    const payload = JSON.parse(JSON.stringify(m.buildSaveData(form, result))) as Record<string, unknown>;
    const savedForm = payload.form as Record<string, unknown>;
    check(`${m.name} ${oran}: form içinde saklanır`, savedForm?.hakkaniyetOrani, oran);
    check(`${m.name} ${oran}: formValues içinde saklanır`, (payload.formValues as Record<string, unknown>)?.hakkaniyetOrani, oran);
    const restored = m.mapFromBackend(payload);
    check(`${m.name} ${oran}: yeniden açınca geri yüklenir`, restored?.hakkaniyetOrani, oran);
    if (restored) {
      check(
        `${m.name} ${oran}: yeniden hesap aynı`,
        summarizeResult(m, m.compute(restored)),
        summarizeResult(m, result),
      );
      const again = m.mapFromBackend(JSON.parse(JSON.stringify(m.buildSaveData(restored, m.compute(restored)))));
      check(`${m.name} ${oran}: ikinci kaydet-aç döngüsü`, again?.hakkaniyetOrani, oran);
    }
    const wrapped = m.mapFromBackend(JSON.stringify({ data: payload }));
    check(`${m.name} ${oran}: data sarmalı JSON metin kaydı`, wrapped?.hakkaniyetOrani, oran);
  }

  /* ── Eski kayıt: alan hiç yok ── */
  {
    const form = buildScenarioForm(m, "5.000,50");
    const result = m.compute(form);
    const legacyPayload = stripFromPayload(JSON.parse(JSON.stringify(m.buildSaveData(form, result))));
    check(`${m.name}: eski kayıtta alan gerçekten yok`, containsKey(legacyPayload, "hakkaniyetOrani"), false);
    const restored = m.mapFromBackend(legacyPayload);
    check(`${m.name}: eski kayıt 1/3 açılır`, restored?.hakkaniyetOrani, "1/3");
    if (restored) {
      check(
        `${m.name}: eski kayıt tutarları değişmez`,
        summarizeResult(m, m.compute(restored)),
        BASELINE[`${m.key}|5.000,50`],
      );
    }
    const legacyBroken = { form: { ...(legacyPayload as { form: AnyForm }).form, hakkaniyetOrani: 0.25 } };
    check(`${m.name}: bozuk değer 1/3 açılır`, m.mapFromBackend(legacyBroken)?.hakkaniyetOrani, "1/3");
  }

  /* ── Yerel kayıt göçü (localStorage → sunucu): buildSaveData eski/yeni yerel formu alır ── */
  {
    const localOld = withoutField(buildScenarioForm(m, ""));
    const migratedOld = JSON.parse(JSON.stringify(m.buildSaveData(localOld, { toplamFm: 0, sonNet: 0, rowCount: 0 })));
    check(`${m.name}: eski yerel kayıt göçte 1/3`, m.mapFromBackend(migratedOld)?.hakkaniyetOrani, "1/3");
    const localNew = { ...buildScenarioForm(m, ""), hakkaniyetOrani: "%35" };
    const migratedNew = JSON.parse(JSON.stringify(m.buildSaveData(localNew, { toplamFm: 0, sonNet: 0, rowCount: 0 })));
    check(`${m.name}: yeni yerel kayıt göçte korunur`, m.mapFromBackend(migratedNew)?.hakkaniyetOrani, "%35");
    check(`${m.name}: yerel form doğrudan eşlenir`, m.mapFromBackend({ form: localNew })?.hakkaniyetOrani, "%35");
  }

  /* ── Değişiklik algılama: sayfalar JSON.stringify(form) kullanır ── */
  {
    const loaded = m.mapFromBackend(JSON.parse(JSON.stringify(m.buildSaveData(buildScenarioForm(m, ""), m.compute(buildScenarioForm(m, ""))))));
    if (loaded) {
      const same = { ...loaded };
      check(`${m.name}: açılan kayıt kirli görünmez`, JSON.stringify(same) === JSON.stringify(loaded), true);
      const changed = { ...loaded, hakkaniyetOrani: "%25" };
      check(`${m.name}: oran değişince kirli`, JSON.stringify(changed) !== JSON.stringify(loaded), true);
    }
  }
}

/* ── Gemi 7/24 eski V3.5 yerel biçimi ── */
check(
  "Gemi 7/24: V3.5 yerel kayıt 1/3",
  migrateLegacyLocalForm({ davaciDateIn: "2019-01-01", davaciDateOut: "2021-12-31", include270: false }).hakkaniyetOrani,
  "1/3",
);
check(
  "Gemi 7/24: yeni yerel kayıt korunur",
  migrateLegacyLocalForm({ iseGiris: "2019-01-01", istenCikis: "2021-12-31", hakkaniyetOrani: "%40" }).hakkaniyetOrani,
  "%40",
);

if (failures.length > 0) {
  console.error(`hakkaniyetOrani: ${passed} geçti, ${failures.length} başarısız`);
  for (const f of failures.slice(0, 40)) {
    console.error(` - ${f.label}\n     beklenen: ${JSON.stringify(f.expected)}\n     gelen:    ${JSON.stringify(f.actual)}`);
  }
  process.exitCode = 1;
} else {
  console.log(`hakkaniyetOrani: ${passed} kontrol geçti`);
}
