/**
 * Hafta Tatili ve UBGT hakkaniyet oranı birim testi.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/shared/hakkaniyetOraniHtUbgt.test.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HAKKANIYET_ORANLARI, type HakkaniyetOrani } from "../fazla-mesai/shared/hakkaniyetOrani";
import { formatMoney } from "../hafta-tatili/lib/money";
import { snapshotKey as htStandardSnapshot } from "../hafta-tatili/standard/model";
import { snapshotKey as htGemiSnapshot } from "../hafta-tatili/gemi/model";
import { snapshotKey as htBasinSnapshot } from "../hafta-tatili/basin/model";
import * as htStandardStorage from "../hafta-tatili/standard/storage";
import * as htGemiStorage from "../hafta-tatili/gemi/storage";
import * as htBasinStorage from "../hafta-tatili/basin/storage";
import { buildStandartHtSaveData } from "../hafta-tatili/standard/buildStandartHtSaveData";
import { buildGemiHtSaveData } from "../hafta-tatili/gemi/buildGemiHtSaveData";
import { buildBasinHtSaveData } from "../hafta-tatili/basin/buildBasinHtSaveData";
import { snapshotKey as ubgtSnapshot, STORAGE_KEY as UBGT_STORAGE_KEY, type UbgtForm } from "../ubgt/model";
import * as ubgtStorage from "../ubgt/storage";
import { buildStandartUbgtSaveData } from "../ubgt/standart/buildStandartUbgtSaveData";
import { buildBilirkisiUbgtSaveData } from "../ubgt/bilirkisi/buildBilirkisiUbgtSaveData";
import {
  HT_UBGT_MODULES,
  MAHSUP_SCENARIOS,
  stripKeys,
  summarizeCalc,
  type HtUbgtModule,
  type PageCalc,
} from "./hakkaniyetOraniHtUbgt.fixtures.test";

let passed = 0;
const failures: string[] = [];
function check(condition: unknown, message: string, detail?: unknown) {
  if (condition) passed += 1;
  else failures.push(detail === undefined ? message : `${message} → ${JSON.stringify(detail)}`);
}

const baseline = JSON.parse(
  readFileSync(fileURLToPath(new URL("./hakkaniyetOraniHtUbgt.baseline.json", import.meta.url)), "utf8"),
) as Record<string, ReturnType<typeof summarizeCalc>>;

const YUZDE: Record<HakkaniyetOrani, number | null> = {
  "1/3": null,
  "%20": 20,
  "%25": 25,
  "%30": 30,
  "%35": 35,
  "%40": 40,
  "%45": 45,
};
const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
const parseSettle = (s: string) => Number(String(s ?? "").replace(/\./g, "").replace(",", ".").replace("₺", "").trim()) || 0;

function expectedHakkaniyet(m: HtUbgtModule, brut: number, oran: HakkaniyetOrani): number {
  const p = YUZDE[oran];
  const raw = p === null ? brut / 3 : (brut * p) / 100;
  return m.rounded ? round2(raw) : raw;
}

function expectedMahsup(m: HtUbgtModule, calc: PageCalc, hk: number, settle: string): number {
  if (m.mahsupFormula === "net-hk") return Math.max(0, calc.net.netAmount - hk);
  const raw = Math.max(0, calc.brut - hk - parseSettle(settle));
  return m.rounded ? round2(raw) : raw;
}

function hakkaniyetLabel(m: HtUbgtModule, oran: string): string {
  return m.key === "ubgt-bilirkisi" ? `${oran} hakkaniyet indirimi` : `${oran} Hakkaniyet İndirimi`;
}

function previewRows(calc: PageCalc): string[][] {
  return calc.preview.flatMap((s) => s.rows as string[][]);
}

function payloadForms(data: Record<string, unknown>): Record<string, unknown>[] {
  const inner = (data.data as Record<string, unknown> | undefined)?.form as Record<string, unknown> | undefined;
  return [inner, data.form as Record<string, unknown>, data.formValues as Record<string, unknown>].filter(Boolean) as Record<
    string,
    unknown
  >[];
}

const SNAPSHOT: Record<HtUbgtModule["key"], (f: never) => string> = {
  "ht-standart": htStandardSnapshot as never,
  "ht-gemi": htGemiSnapshot as never,
  "ht-basin": htBasinSnapshot as never,
  "ubgt-standart": ubgtSnapshot as never,
  "ubgt-bilirkisi": ubgtSnapshot as never,
};

// 1) Seçenekler
check(
  JSON.stringify(HAKKANIYET_ORANLARI) === JSON.stringify(["1/3", "%20", "%25", "%30", "%35", "%40", "%45"]),
  "7 oran seçeneği ve varsayılan 1/3 ilk sırada",
);

for (const m of HT_UBGT_MODULES) {
  const n = m.name;

  for (const settle of MAHSUP_SCENARIOS) {
    const ref = baseline[`${m.key}|${settle}`];
    check(ref, `${n} [${settle}]: referans senaryosu mevcut`);
    if (!ref) continue;

    const base13 = m.calc(m.buildForm(settle));
    // 2) 1/3 ve alanın olmaması referansla birebir aynı
    check(
      JSON.stringify(summarizeCalc(base13, ["hakkaniyetOrani"])) === JSON.stringify(ref),
      `${n} [${settle}]: varsayılan 1/3 referansla birebir aynı`,
    );
    const noField = m.buildForm(settle);
    delete (noField as Record<string, unknown>).hakkaniyetOrani;
    check(
      JSON.stringify(summarizeCalc(m.calc(noField), ["hakkaniyetOrani"])) === JSON.stringify(ref),
      `${n} [${settle}]: oran alanı olmayan form referansla birebir aynı`,
    );
    for (const bad of ["%33,33", "0.3", 0.3, "%50", null, "1/4"]) {
      const f = { ...m.buildForm(settle), hakkaniyetOrani: bad };
      check(
        JSON.stringify(summarizeCalc(m.calc(f), ["hakkaniyetOrani"])) === JSON.stringify(ref),
        `${n} [${settle}]: geçersiz oran (${JSON.stringify(bad)}) 1/3 kabul edilir`,
      );
    }
    const preview13 = previewRows(base13).map((r) => r.join(" | ")).join("\n");
    check(preview13.includes(hakkaniyetLabel(m, "1/3")), `${n} [${settle}]: önizlemede "${hakkaniyetLabel(m, "1/3")}"`);

    const stripVolatile = (d: Record<string, unknown>) =>
      JSON.stringify(stripKeys(d, ["id", "hakkaniyetOrani", "hakkaniyet", "sonuc"]));
    const baseSaveStripped = stripVolatile(base13.saveData);

    for (const oran of HAKKANIYET_ORANLARI) {
      const form = { ...m.buildForm(settle), hakkaniyetOrani: oran };
      const calc = m.calc(form);
      const hk = expectedHakkaniyet(m, calc.brut, oran);
      // 3) Tutarlar
      check(calc.brut === ref.brut, `${n} [${settle}] ${oran}: brüt değişmez`, [calc.brut, ref.brut]);
      check(
        JSON.stringify(calc.net) === JSON.stringify({ ...ref.net, gelirVergisiDilimleri: calc.net.gelirVergisiDilimleri }) ||
          (calc.net.netAmount === ref.net.netAmount &&
            calc.net.ssk === ref.net.ssk &&
            calc.net.gelirVergisi === ref.net.gelirVergisi &&
            calc.net.damgaVergisi === ref.net.damgaVergisi),
        `${n} [${settle}] ${oran}: brütten nete kalemleri değişmez`,
      );
      check(calc.hakkaniyet === hk, `${n} [${settle}] ${oran}: hakkaniyet ${hk}`, calc.hakkaniyet);
      check(
        calc.mahsupSonucu === expectedMahsup(m, calc, hk, settle),
        `${n} [${settle}] ${oran}: mahsup sonucu`,
        [calc.mahsupSonucu, expectedMahsup(m, calc, hk, settle)],
      );
      check(calc.rowCount === ref.rowCount && calc.totalDays === ref.totalDays, `${n} [${settle}] ${oran}: satır/gün değişmez`);

      // 4) Önizleme / rapor metinleri
      const rows = previewRows(calc);
      const hkRow = rows.find((r) => r[0] === hakkaniyetLabel(m, oran));
      check(hkRow && hkRow[1] === `−${formatMoney(hk)} ₺`, `${n} [${settle}] ${oran}: önizleme hakkaniyet satırı`, hkRow);
      if (oran !== "1/3") {
        check(
          !rows.some((r) => r[0] === hakkaniyetLabel(m, "1/3")),
          `${n} [${settle}] ${oran}: önizlemede 1/3 etiketi kalmaz`,
        );
      }
      const sonucRow = rows.find((r) => /^Mahsuplaşma [Ss]onucu$/.test(r[0]));
      check(
        sonucRow && sonucRow[1] === `${formatMoney(calc.mahsupSonucu)} ₺`,
        `${n} [${settle}] ${oran}: önizleme mahsup sonucu`,
        sonucRow,
      );
      const otherSections = (c: PageCalc) => JSON.stringify(c.preview.filter((s) => s.id !== "mahsuplasma"));
      check(otherSections(calc) === otherSections(base13), `${n} [${settle}] ${oran}: diğer önizleme bölümleri değişmez`);

      // 5) Kayıt payload'ı
      const forms = payloadForms(calc.saveData);
      check(forms.length >= 3, `${n} [${settle}] ${oran}: data.form / form / formValues mevcut`);
      check(
        forms.every((f) => f.hakkaniyetOrani === oran),
        `${n} [${settle}] ${oran}: kayıtta hakkaniyetOrani = ${oran}`,
        forms.map((f) => f.hakkaniyetOrani),
      );
      const settlement = (forms[0]?.settlement ?? {}) as Record<string, unknown>;
      check(settlement.hakkaniyet === hk, `${n} [${settle}] ${oran}: settlement.hakkaniyet seçilen oranla`, settlement.hakkaniyet);
      check(
        calc.saveData.brut_total === ref.brut && calc.saveData.net_total === base13.saveData.net_total,
        `${n} [${settle}] ${oran}: brut_total / net_total değişmez`,
      );
      check(
        stripVolatile(calc.saveData) === baseSaveStripped,
        `${n} [${settle}] ${oran}: kayıtta oran dışındaki alanlar 1/3 ile aynı`,
      );

      // 6) Kaydet → aç döngüsü (düz, string, {data} sarmalı, ikinci döngü)
      for (const [label, payload] of [
        ["düz", calc.saveData],
        ["string", JSON.stringify(calc.saveData)],
        ["{data}", { data: calc.saveData }],
      ] as const) {
        const reopened = m.mapFromBackend(payload);
        check(reopened?.hakkaniyetOrani === oran, `${n} [${settle}] ${oran}: aç (${label}) → ${oran}`, reopened?.hakkaniyetOrani);
        if (label === "düz" && reopened) {
          const again = m.calc(reopened);
          check(again.hakkaniyet === calc.hakkaniyet, `${n} [${settle}] ${oran}: yeniden açınca hakkaniyet aynı`, [
            again.hakkaniyet,
            calc.hakkaniyet,
          ]);
          check(again.mahsupSonucu === calc.mahsupSonucu, `${n} [${settle}] ${oran}: yeniden açınca mahsup sonucu aynı`);
          check(again.brut === calc.brut, `${n} [${settle}] ${oran}: yeniden açınca brüt aynı`);
          const second = m.mapFromBackend(again.saveData);
          check(second?.hakkaniyetOrani === oran, `${n} [${settle}] ${oran}: ikinci kaydet-aç döngüsü`);
        }
      }

      // 7) Değişiklik algılama
      const snap = SNAPSHOT[m.key];
      if (oran !== "1/3") {
        check(
          snap(form as never) !== snap({ ...form, hakkaniyetOrani: "1/3" } as never),
          `${n} ${oran}: oran değişikliği kaydedilmemiş değişiklik sayılır`,
        );
      }
    }

    // 8) Eski kayıt: alan yok → 1/3 ve referans tutarlar
    const legacy = stripKeys(base13.saveData, ["hakkaniyetOrani"]) as Record<string, unknown>;
    const legacyForm = m.mapFromBackend(legacy);
    check(legacyForm?.hakkaniyetOrani === "1/3", `${n} [${settle}]: eski kayıt (alan yok) 1/3 açılır`);
    if (legacyForm) {
      const lc = m.calc(legacyForm);
      check(lc.hakkaniyet === ref.hakkaniyet, `${n} [${settle}]: eski kayıt hakkaniyeti değişmez`, [lc.hakkaniyet, ref.hakkaniyet]);
      check(lc.mahsupSonucu === ref.mahsupSonucu, `${n} [${settle}]: eski kayıt mahsup sonucu değişmez`);
      check(lc.brut === ref.brut, `${n} [${settle}]: eski kayıt brüt değişmez`);
      check(SNAPSHOT[m.key](legacyForm as never) === SNAPSHOT[m.key](legacyForm as never), `${n}: eski kayıt kararlı anahtar`);
    }
    for (const bad of ["%33,33", 33.33, "", "yüzde 30"]) {
      const broken = JSON.parse(JSON.stringify(base13.saveData)) as Record<string, unknown>;
      for (const f of payloadForms(broken)) f.hakkaniyetOrani = bad;
      check(m.mapFromBackend(broken)?.hakkaniyetOrani === "1/3", `${n} [${settle}]: bozuk oran (${JSON.stringify(bad)}) → 1/3`);
    }
  }
}

// 9) Yerel kayıt (localStorage) geri yükleme ve sunucuya taşıma
const memory = new Map<string, string>();
Object.assign(globalThis, {
  window: globalThis,
  localStorage: {
    getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
    setItem: (k: string, v: string) => void memory.set(k, String(v)),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
  },
});

const HT_STORAGES = [
  { m: HT_UBGT_MODULES[0], storage: htStandardStorage, build: buildStandartHtSaveData },
  { m: HT_UBGT_MODULES[1], storage: htGemiStorage, build: buildGemiHtSaveData },
  { m: HT_UBGT_MODULES[2], storage: htBasinStorage, build: buildBasinHtSaveData },
] as const;

for (const { m, storage, build } of HT_STORAGES) {
  memory.clear();
  const form = { ...m.buildForm("5.000,50"), hakkaniyetOrani: "%35" };
  const saved = storage.saveCase("Yerel %35", form as never, { totalBrut: 1, netAmount: 1 });
  check(saved, `${m.name}: yerel kayıt yazıldı`);
  const loaded = storage.loadCasesSafe();
  check(loaded.ok && loaded.items[0]?.form.hakkaniyetOrani === "%35", `${m.name}: yerel kayıt %35 geri yüklenir`);

  const raw = JSON.parse(memory.get(storage.STORAGE_KEY)!) as { cases: { form: Record<string, unknown> }[] };
  delete raw.cases[0].form.hakkaniyetOrani;
  memory.set(storage.STORAGE_KEY, JSON.stringify(raw));
  const legacyLoaded = storage.loadCasesSafe();
  check(legacyLoaded.items[0]?.form.hakkaniyetOrani === "1/3", `${m.name}: eski yerel kayıt (alan yok) 1/3 yüklenir`);

  const legacyLocalForm = { ...m.buildForm("") } as Record<string, unknown>;
  delete legacyLocalForm.hakkaniyetOrani;
  const migrated = build(legacyLocalForm as never, { brut: 0, net: 0 });
  check(
    payloadForms(migrated).every((f) => f.hakkaniyetOrani === "1/3"),
    `${m.name}: eski yerel kayıt sunucuya 1/3 ile taşınır`,
  );
  const migratedNew = build({ ...m.buildForm(""), hakkaniyetOrani: "%25" } as never, { brut: 0, net: 0 });
  check(m.mapFromBackend(migratedNew)?.hakkaniyetOrani === "%25", `${m.name}: yeni yerel kayıt oranıyla taşınır`);
}

for (const [mode, m, build] of [
  ["standart", HT_UBGT_MODULES[3], buildStandartUbgtSaveData],
  ["bilirkisi", HT_UBGT_MODULES[4], buildBilirkisiUbgtSaveData],
] as const) {
  memory.clear();
  const form = { ...m.buildForm("5.000,50"), hakkaniyetOrani: "%40" } as unknown as UbgtForm;
  const results = { periods: [], ubgtDayEntries: [], toplamBrut: 1, toplamNet: m.calc(form as never).net as never, totalDays: 1 };
  check(ubgtStorage.saveCase(mode, "Yerel %40", form, results), `${m.name}: yerel kayıt yazıldı`);
  const loaded = ubgtStorage.loadCasesSafe(mode);
  check(loaded.items[0]?.form.hakkaniyetOrani === "%40", `${m.name}: yerel kayıt %40 geri yüklenir`);
  const raw = JSON.parse(memory.get(UBGT_STORAGE_KEY)!) as { cases: { form: Record<string, unknown> }[] };
  delete raw.cases[0].form.hakkaniyetOrani;
  memory.set(UBGT_STORAGE_KEY, JSON.stringify(raw));
  check(ubgtStorage.loadCasesSafe(mode).items[0]?.form.hakkaniyetOrani === "1/3", `${m.name}: eski yerel kayıt 1/3 yüklenir`);

  const legacyLocalForm = { ...m.buildForm("") } as Record<string, unknown>;
  delete legacyLocalForm.hakkaniyetOrani;
  const migrated = build(legacyLocalForm as never, { brut: 0, net: 0 });
  check(payloadForms(migrated).every((f) => f.hakkaniyetOrani === "1/3"), `${m.name}: eski yerel kayıt sunucuya 1/3 ile taşınır`);
  const migratedNew = build({ ...m.buildForm(""), hakkaniyetOrani: "%20" } as never, { brut: 0, net: 0 });
  check(m.mapFromBackend(migratedNew)?.hakkaniyetOrani === "%20", `${m.name}: yeni yerel kayıt oranıyla taşınır`);
  const formValuesOnly = { formValues: (migratedNew as Record<string, unknown>).formValues };
  check(m.mapFromBackend(formValuesOnly)?.hakkaniyetOrani === "%20", `${m.name}: yalnız formValues içeren kayıt da açılır`);
}

if (failures.length) {
  console.error(failures.slice(0, 40).join("\n"));
  console.error(`hakkaniyetOraniHtUbgt: ${failures.length} hata, ${passed} geçti`);
  process.exit(1);
}
console.log(`hakkaniyetOraniHtUbgt: ${passed} kontrol geçti`);
