/**
 * Fazla mesai "Kat Sayı Hesapla" → form → motor → kayıt → yeniden açma regresyon testleri (10 modül).
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/fazla-mesai/shared/katsayiForm.test.ts
 * Ağ isteği yoktur. Senaryolar: 11.310 / 10.000 → 1,1310 ve 13.350 / 10.000 → 1,3350.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatKatsayiForForm, parseDecimalKatsayi } from "./katsayiForm";
import { FM_MODULES, type AnyForm, type AnyResult, type FmModule } from "./hakkaniyetOrani.fixtures.test";
import * as standart from "../standart/engine";
import * as tanikli from "../tanikli-standart/engine";
import * as karma from "../haftalik-karma/engine";
import * as donemsel from "../donemsel/engine";
import * as donemselHaftalik from "../donemsel-haftalik/engine";
import * as yeralti from "../yeralti-isci/engine";
import * as vardiya24 from "../vardiya-24/engine";
import * as vardiya48 from "../vardiya-48/engine";
import * as gemiGunluk from "../gemi-adami-gunluk/engine";
import * as gemi724 from "../gemi-adami-7-24/engine";

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

function near(label: string, actual: number, expected: number, relTol: number): void {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= Math.abs(expected) * relTol;
  check(label, ok ? "yakın" : actual, ok ? "yakın" : expected);
}

type Parsers = { parseMoneyInput: (v: string) => number; parseKatsayi: (v: string) => number };

const PARSERS: Record<string, Parsers> = {
  standart,
  "tanikli-standart": tanikli,
  "haftalik-karma": karma,
  donemsel,
  "donemsel-haftalik": donemselHaftalik,
  "yeralti-isci": yeralti,
  "vardiya-24": vardiya24,
  "vardiya-48": vardiya48,
  "gemi-adami-gunluk": gemiGunluk,
  "gemi-adami-7-24": gemi724,
};

/** Kat Sayı penceresi ve sayfanın Uygula işleminin yazdığı form alanı. */
const KATSAYI_FIELD: Record<string, string> = Object.fromEntries(
  FM_MODULES.map((m) => [m.key, m.key === "yeralti-isci" ? "katsayi" : "katSayi"]),
);

/**
 * Sayfaların Kat Sayı penceresi "Uygula" ile form alanına yazdığı değer (sayfa kodundaki onApply ile aynı).
 * Gemi Adamı 7/24 V3'ten beri noktalı ondalık saklar; okuyucuları da noktayı ondalık sayar.
 */
const UYGULA_YAZIMI: Record<string, (k: number) => string> = {
  standart: (k) => String(k).replace(".", ","),
  "tanikli-standart": (k) => String(k).replace(".", ","),
  "haftalik-karma": formatKatsayiForForm,
  donemsel: formatKatsayiForForm,
  "donemsel-haftalik": formatKatsayiForForm,
  "yeralti-isci": (k) => String(k).replace(".", ","),
  "vardiya-24": formatKatsayiForForm,
  "vardiya-48": formatKatsayiForForm,
  "gemi-adami-gunluk": (k) => k.toFixed(4).replace(".", ","),
  "gemi-adami-7-24": (k) => String(k),
};

/** Kayıtlardaki noktalı katsayıyı ondalık okuyan sayfalar; diğerleri noktayı binlik ayırıcı sayar. */
const NOKTA_ONDALIK = new Set(["gemi-adami-7-24"]);

const BEKLENEN = 1.131;
const PENCERE_K = Number((11310 / 10000).toFixed(4));

function total(m: FmModule, r: AnyResult): number {
  return Number(r[m.totalField]) || 0;
}

function rowsOf(r: AnyResult): Array<Record<string, unknown>> {
  return Array.isArray(r.rows) ? (r.rows as Array<Record<string, unknown>>) : [];
}

function roundTrip(m: FmModule, form: AnyForm): AnyForm | null {
  const data = JSON.parse(JSON.stringify(m.buildSaveData(form, m.compute(form))));
  return m.mapFromBackend(data);
}

/* ── 1. Pencere: ücret ayrıştırma ve 4 haneli katsayı ── */
for (const m of FM_MODULES) {
  const p = PARSERS[m.key];
  const modal = (known: string, min: string) => Number((p.parseMoneyInput(known) / p.parseMoneyInput(min)).toFixed(4));
  check(`${m.name}: pencere 11.310 / 10.000`, modal("11.310", "10.000"), BEKLENEN);
  check(`${m.name}: pencere 11.310,00 / 10.000,00`, modal("11.310,00", "10.000,00"), BEKLENEN);
  check(`${m.name}: pencere 11310 / 10000`, modal("11310", "10000"), BEKLENEN);
  check(`${m.name}: pencere 20.000 / 10.000 (tam sayı)`, modal("20.000", "10.000"), 2);
  check(`${m.name}: pencere 11.312,50 / 10.000`, modal("11.312,50", "10.000"), 1.1313);
  check(`${m.name}: pencere 13.350 / 10.000`, modal("13.350", "10.000"), 1.335);
  check(`${m.name}: pencere 13350 / 10000`, modal("13350", "10000"), 1.335);
}

/* ── 2. Form alanı biçimi: TR ondalık, binlik ayırıcı yok ── */
check("biçim 1.131", formatKatsayiForForm(1.131), "1,131");
check("biçim 11310/10000", formatKatsayiForForm(11310 / 10000), "1,131");
check("biçim 1.1312", formatKatsayiForForm(1.1312), "1,1312");
check("biçim 2", formatKatsayiForForm(2), "2");
check("biçim 0.85", formatKatsayiForForm(0.85), "0,85");
check("biçim 1234.5 (binlik ayırıcı eklenmez)", formatKatsayiForForm(1234.5), "1234,5");
check("biçim 1.13125 → 4 hane", formatKatsayiForForm(1.13125).split(",")[1]?.length ?? 0, 4);
check("biçim geçersiz → 1", formatKatsayiForForm(Number.NaN), "1");
check("biçim 0 → 1", formatKatsayiForForm(0), "1");

/* ── 3. Her sayfanın ayrıştırıcısı: Uygula çıktısı, TR elle giriş, tam sayı ── */
for (const m of FM_MODULES) {
  const p = PARSERS[m.key];
  for (const k of [1, 2, BEKLENEN, 1.1312, 0.85, 3.5, 12.3456]) {
    check(`${m.name}: ayrıştır(biçim(${k}))`, p.parseKatsayi(formatKatsayiForForm(k)), k);
  }
  check(`${m.name}: TR giriş "1,1310"`, p.parseKatsayi("1,1310"), BEKLENEN);
  check(`${m.name}: TR giriş "1,131"`, p.parseKatsayi("1,131"), BEKLENEN);
  check(`${m.name}: tam sayı "2"`, p.parseKatsayi("2"), 2);
  check(`${m.name}: boş → 1`, p.parseKatsayi(""), 1);
  check(`${m.name}: ücret "11.310,00"`, p.parseMoneyInput("11.310,00"), 11310);
  check(`${m.name}: Uygula yazımı geri okunur`, p.parseKatsayi(UYGULA_YAZIMI[m.key](PENCERE_K)), BEKLENEN);
  check(
    `${m.name}: kayıttaki noktalı "1.131" okuması değişmez`,
    p.parseKatsayi("1.131"),
    NOKTA_ONDALIK.has(m.key) ? BEKLENEN : 1131,
  );
}

check("ondalık okuyucu 1.131", parseDecimalKatsayi("1.131"), BEKLENEN);
check("ondalık okuyucu 1,131", parseDecimalKatsayi("1,131"), BEKLENEN);
check("ondalık okuyucu 1.234,5", parseDecimalKatsayi("1.234,5"), 1234.5);
check("ondalık okuyucu sayı 1.131", parseDecimalKatsayi(1.131), BEKLENEN);
check("ondalık okuyucu 2", parseDecimalKatsayi("2"), 2);
check("ondalık okuyucu boş → 1", parseDecimalKatsayi(""), 1);
check("ondalık okuyucu geçersiz → 1", parseDecimalKatsayi("abc"), 1);
check("ondalık okuyucu negatif → 1", parseDecimalKatsayi("-2"), 1);

/* ── 4. Motor, cetvel satırları, kayıt ve yeniden açma ── */
for (const m of FM_MODULES) {
  const field = KATSAYI_FIELD[m.key];
  const form = m.buildForm();
  const applied = UYGULA_YAZIMI[m.key](PENCERE_K);
  const r1 = m.compute({ ...form, [field]: "1" });
  const rk = m.compute({ ...form, [field]: applied });
  const rows = rowsOf(rk).filter((r) => r.katsayi !== undefined);
  check(`${m.name}: cetvelde katsayılı satır var`, rows.length > 0, true);
  check(
    `${m.name}: cetvel satırlarının hepsi 1,131`,
    rows.filter((r) => Number(r.katsayi) !== BEKLENEN).map((r) => r.katsayi),
    [],
  );
  check(`${m.name}: toplam pozitif`, total(m, r1) > 0, true);
  near(`${m.name}: toplam ≈ katsayısız × 1,131`, total(m, rk), total(m, r1) * BEKLENEN, 0.002);

  const loaded = roundTrip(m, { ...form, [field]: applied });
  check(`${m.name}: kayıt → yeniden açma katsayı metni`, loaded?.[field], applied);
  if (loaded) {
    check(`${m.name}: yeniden açınca toplam aynı`, total(m, m.compute(loaded)), total(m, rk));
    const loadedRows = rowsOf(m.compute(loaded)).filter((r) => r.katsayi !== undefined);
    check(`${m.name}: yeniden açınca cetvel 1,131`, loadedRows.every((r) => Number(r.katsayi) === BEKLENEN), true);
  }

  const elle = m.compute({ ...form, [field]: "1,1310" });
  check(`${m.name}: elle "1,1310" ile aynı toplam`, total(m, elle), total(m, rk));
}

/* ── 4b. 13.350 / 10.000 = 1,335: Uygula → cetvel → sonuç → kayıt → yeniden açma ── */
{
  const K = Number((13350 / 10000).toFixed(4));
  check("13.350 / 10.000 biçimi", formatKatsayiForForm(K), "1,335");
  for (const m of FM_MODULES) {
    const field = KATSAYI_FIELD[m.key];
    const form = m.buildForm();
    const applied = UYGULA_YAZIMI[m.key](K);
    check(`${m.name}: 1,335 Uygula yazımı geri okunur`, PARSERS[m.key].parseKatsayi(applied), 1.335);
    const r1 = m.compute({ ...form, [field]: "1" });
    const rk = m.compute({ ...form, [field]: applied });
    const rows = rowsOf(rk).filter((r) => r.katsayi !== undefined);
    check(`${m.name}: cetvel satırlarının hepsi 1,335`, rows.length > 0 && rows.every((r) => Number(r.katsayi) === 1.335), true);
    near(`${m.name}: toplam ≈ katsayısız × 1,335`, total(m, rk), total(m, r1) * 1.335, 0.002);
    check(`${m.name}: 1335 ile hesaplanmaz`, total(m, rk) < total(m, r1) * 2, true);
    const loaded = roundTrip(m, { ...form, [field]: applied });
    check(`${m.name}: 1,335 kayıt → yeniden açma toplamı`, loaded ? total(m, m.compute(loaded)) : null, total(m, rk));
  }
}

/* ── 5. Elle eklenen satır ve satır bazlı elle katsayı (cetvel hücresi, sayı) ── */
const ELLE_SATIR: Record<string, (k: number) => Record<string, unknown>> = {
  "vardiya-48": (k) => vardiya48.createManualPeriodRow("", k),
  "gemi-adami-gunluk": (k) => gemiGunluk.createManualPeriodRow(k),
  "gemi-adami-7-24": (k) => gemi724.createManualPeriodRow("", k),
};
for (const [key, create] of Object.entries(ELLE_SATIR)) {
  const m = FM_MODULES.find((x) => x.key === key)!;
  const applied = UYGULA_YAZIMI[key](PENCERE_K);
  const manual = create(PARSERS[key].parseKatsayi(applied));
  const id = String(manual.id);
  const form = { ...m.buildForm(), katSayi: applied, manualRows: [manual] };
  const rows = rowsOf(m.compute(form));
  check(`${m.name}: elle eklenen satır katsayısı 1,131`, Number(rows.find((r) => r.id === id)?.katsayi), BEKLENEN);
  const withOverride = { ...form, rowOverrides: { [id]: { katsayi: 1.25 } } };
  const overridden = rowsOf(m.compute(withOverride));
  check(`${m.name}: satır katsayısı elle 1,25`, Number(overridden.find((r) => r.id === id)?.katsayi), 1.25);
  check(
    `${m.name}: diğer satırlar 1,131`,
    overridden.filter((r) => r.id !== id && r.katsayi !== undefined).every((r) => Number(r.katsayi) === BEKLENEN),
    true,
  );
  const loaded = roundTrip(m, withOverride);
  const loadedRows = loaded ? rowsOf(m.compute(loaded)) : [];
  check(`${m.name}: elle satır katsayısı kayıttan geri gelir`, Number(loadedRows.find((r) => r.id === id)?.katsayi), 1.25);
}

/* ── 5b. Hesaplanan satırların kimliği her hesaplamada aynı: cetvel hücresindeki elle katsayı kaybolmaz ── */
for (const m of FM_MODULES) {
  const field = KATSAYI_FIELD[m.key];
  const form = { ...m.buildForm(), [field]: "1" };
  const a = rowsOf(m.compute(form)).map((r) => String(r.id));
  const b = rowsOf(m.compute(form)).map((r) => String(r.id));
  check(`${m.name}: satır kimlikleri iki hesaplamada aynı`, a.length > 0 && a.every((id, i) => id === b[i]), true);
  check(`${m.name}: satır kimlikleri benzersiz`, new Set(a).size, a.length);
}
for (const key of Object.keys(ELLE_SATIR)) {
  const m = FM_MODULES.find((x) => x.key === key)!;
  const applied = UYGULA_YAZIMI[key](1.335);
  const form = { ...m.buildForm(), katSayi: applied };
  const base = m.compute(form);
  const id = String(rowsOf(base)[0]?.id);
  const withOverride = { ...form, rowOverrides: { [id]: { katsayi: 1.25 } } };
  const ov = m.compute(withOverride);
  const ovRows = rowsOf(ov);
  check(`${m.name}: hesaplanan satıra elle 1,25 uygulanır`, Number(ovRows.find((r) => r.id === id)?.katsayi), 1.25);
  check(
    `${m.name}: diğer hesaplanan satırlar 1,335 kalır`,
    ovRows.filter((r) => r.id !== id && r.katsayi !== undefined).every((r) => Number(r.katsayi) === 1.335),
    true,
  );
  check(`${m.name}: elle satır katsayısı toplamı değiştirir`, total(m, ov) < total(m, base), true);
  const loaded = roundTrip(m, withOverride);
  const loadedResult = loaded ? m.compute(loaded) : null;
  check(
    `${m.name}: hesaplanan satırdaki elle katsayı kayıttan geri gelir`,
    loadedResult ? Number(rowsOf(loadedResult).find((r) => r.id === id)?.katsayi) : null,
    1.25,
  );
  check(`${m.name}: yeniden açınca elle katsayılı toplam`, loadedResult ? total(m, loadedResult) : null, total(m, ov));
  const eskiAnahtar = { ...form, rowOverrides: { "de9933fd-ded9-472b-ac55-ad5315de6106": { katsayi: 1.25 } } };
  check(`${m.name}: eski rastgele anahtarlı kayıt sonucu değişmez`, total(m, m.compute(eskiAnahtar)), total(m, base));
}

/* ── 6. Gemi 7/24: birleşen dönem satırları ve elle satır aynı katsayıyı kullanır ── */
{
  const m = FM_MODULES.find((x) => x.key === "gemi-adami-7-24")!;
  const base = m.buildForm();
  const form = {
    ...base,
    witnesses: [
      { id: "w1", name: "Tanık 1", dateIn: "2019-01-01", dateOut: "2019-06-30" },
      { id: "w2", name: "Tanık 2", dateIn: "2019-07-01", dateOut: "2021-12-31" },
    ],
  };
  const r1 = m.compute({ ...form, katSayi: "1" });
  for (const k of ["1.131", "1,131"]) {
    const rk = m.compute({ ...form, katSayi: k });
    near(`Gemi 7/24 iki tanık "${k}": toplam ≈ katsayısız × 1,131`, total(m, rk), total(m, r1) * BEKLENEN, 0.002);
    check(
      `Gemi 7/24 iki tanık "${k}": satır tutarı = katsayısız × 1,131`,
      rowsOf(rk).every((r, i) => Math.abs(Number(r.fm) - Number(rowsOf(r1)[i]?.fm) * BEKLENEN) < 0.05),
      true,
    );
  }
  check("Gemi 7/24 iki tanık: 2019 dönemleri birleşir (3 satır)", rowsOf(r1).length, 3);
  const manual = gemi724.createManualPeriodRow("x", gemi724.parseKatsayi(UYGULA_YAZIMI[m.key](PENCERE_K)));
  check("Gemi 7/24: yeni elle satır katsayısı 1,131", manual.katsayi, BEKLENEN);
}

/* ── 7. Eski kayıtlar: kayıttaki katsayı metni sessizce dönüştürülmez ── */
const ESKI_GEMI724_TOPLAM = 97334.32;
for (const m of FM_MODULES) {
  const field = KATSAYI_FIELD[m.key];
  const legacyForm = { ...m.buildForm(), [field]: "1.131" };
  const loaded = roundTrip(m, legacyForm);
  if (m.key === "standart") continue;
  check(`${m.name}: eski "1.131" metni olduğu gibi açılır`, loaded?.[field], "1.131");
  if (!loaded) continue;
  const reopened = total(m, m.compute(loaded));
  if (NOKTA_ONDALIK.has(m.key)) {
    check(`${m.name}: eski "1.131" kaydı düzeltme öncesi toplamla açılır`, reopened, ESKI_GEMI724_TOPLAM);
  } else {
    check(
      `${m.name}: eski "1.131" kaydı önceki gibi 1131 ile açılır`,
      reopened,
      total(m, m.compute({ ...m.buildForm(), [field]: "1131" })),
    );
  }
}

/* ── 8. Kat Sayı pencerelerinde bozuk Türkçe karakter yok (UTF-8 baytlarının cp1252 ile okunmuş hali) ── */
const FM_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOJIBAKE =
  /[\u00c3\u00c4\u00c5][\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u2122]|\u00e2\u20ac|\u00e2\u201a/;
const modalFiles = [
  ...readdirSync(FM_DIR)
    .map((d) => path.join(FM_DIR, d, "KatsayiModal.tsx"))
    .filter((f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    }),
  path.resolve(FM_DIR, "..", "ubgt", "UbgtKatsayiModal.tsx"),
];
check("Kat Sayı pencere dosyası sayısı", modalFiles.length, 11);
for (const f of modalFiles) {
  const text = readFileSync(f, "utf8");
  const bad = text.match(MOJIBAKE);
  check(`${path.relative(FM_DIR, f)}: bozuk karakter yok`, bad ? bad[0] : null, null);
}
const dh = readFileSync(path.join(FM_DIR, "donemsel-haftalik", "KatsayiModal.tsx"), "utf8");
for (const label of ["Kat Sayı Hesapla", "Bilinen Ücret", "Asgari Ücret", "Katsayı:", "Sıfırla (1)", "İptal", "Uygula", "₺"]) {
  check(`Dönemsel Haftalık penceresi "${label}"`, dh.includes(label), true);
}
const dhMahsup = readFileSync(path.join(FM_DIR, "donemsel-haftalik", "MahsuplasamaModal.tsx"), "utf8");
for (const label of ["Mahsuplaşma Ekle", "Ay ve yıl bazında", "Şubat", "Mayıs", "Ağustos", "Eylül", "Kasım", "Aralık", "₺", "İptal"]) {
  check(`Dönemsel Haftalık Mahsuplaşma penceresi "${label}"`, dhMahsup.includes(label), true);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(tsx?|css)$/.test(e.name) ? [p] : [];
  });
}
const allFmFiles = [...sourceFiles(FM_DIR), ...sourceFiles(path.resolve(FM_DIR, "..", "ubgt"))];
check("fazla mesai / UBGT kaynak dosyaları taranır", allFmFiles.length > 100, true);
check(
  "fazla mesai / UBGT dosyalarında bozuk Türkçe karakter yok",
  allFmFiles.filter((f) => MOJIBAKE.test(readFileSync(f, "utf8"))).map((f) => path.relative(FM_DIR, f)),
  [],
);

if (failures.length > 0) {
  console.error(`katsayiForm: ${passed} geçti, ${failures.length} başarısız`);
  for (const f of failures.slice(0, 60)) {
    console.error(` - ${f.label}\n     beklenen: ${JSON.stringify(f.expected)}\n     gelen:    ${JSON.stringify(f.actual)}`);
  }
  process.exitCode = 1;
} else {
  console.log(`katsayiForm: ${passed} kontrol geçti`);
}
