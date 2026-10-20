/**
 * 12 aylık eklenti dökümü — saklama, geri yükleme ve eski kayıt uyumluluğu testleri.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/shared/eklentiDokumu.test.ts
 * Ağ isteği yoktur; yardımcılar, Kıdem/İhbar backend mapper'ları, form modelleri ve kayıt payload'ı doğrulanır.
 */

import {
  bosEklentiAylari,
  eklentiDokumleriAnahtari,
  eklentiDokumleriniBuda,
  eklentiDokumleriniFormaYerlestir,
  eklentiDokumuYaz,
  normalizeEklentiDokumleri,
  type EklentiDokumleri,
} from "./eklentiDokumu";
import { computeEklentiResult as eklentiIsKanunu } from "../kidem-tazminati/is-kanunu/engine";
import { computeEklentiResult as eklentiBasin } from "../kidem-tazminati/basin-is/engine";
import { computeEklentiResult as eklentiGemi } from "../kidem-tazminati/gemi-adamlari/engine";
import { computeEklentiResult as eklentiKismi } from "../kidem-tazminati/kismi-sureli/engine";
import { computeEklentiResult as eklentiMevsimlik } from "../kidem-tazminati/mevsimlik-isci/engine";
import { computeEklentiResult as eklentiIhbar } from "../ihbar-tazminati/lib/core";
import { createEmptyForm as emptyIsKanunu } from "../kidem-tazminati/is-kanunu/model";
import { emptyForm as emptyBasin } from "../kidem-tazminati/basin-is/model";
import { createEmptyGemiForm as emptyGemi } from "../kidem-tazminati/gemi-adamlari/model";
import { emptyForm as emptyKismi } from "../kidem-tazminati/kismi-sureli/model";
import { createEmptyMevsimlikForm as emptyMevsimlik } from "../kidem-tazminati/mevsimlik-isci/model";
import { mapIsKanunuFormFromBackend } from "../kidem-tazminati/is-kanunu/backendCase";
import { mapBasinFormFromBackend } from "../kidem-tazminati/basin-is/backendCase";
import { mapGemiFormFromBackend } from "../kidem-tazminati/gemi-adamlari/backendCase";
import { mapKismiFormFromBackend } from "../kidem-tazminati/kismi-sureli/backendCase";
import { mapMevsimlikFormFromBackend } from "../kidem-tazminati/mevsimlik-isci/backendCase";
import { buildKidemSaveData } from "../kidem-tazminati/shared/kidemCaseCrud";
import * as model30 from "../ihbar-tazminati/is-kanunu/model";
import * as modelBasin from "../ihbar-tazminati/basin/model";
import * as modelBelirli from "../ihbar-tazminati/belirli/model";
import * as modelBorclar from "../ihbar-tazminati/borclar/model";
import * as modelGemi from "../ihbar-tazminati/gemi/model";
import * as modelKismi from "../ihbar-tazminati/kismi/model";
import * as modelMevsim from "../ihbar-tazminati/mevsim/model";
import {
  ihbar30Backend,
  ihbarBasinBackend,
  ihbarBelirliBackend,
  ihbarBorclarBackend,
  ihbarGemiBackend,
  ihbarKismiBackend,
  ihbarMevsimBackend,
} from "../ihbar-tazminati/lib/ihbarBackendInstances";

type Failure = { label: string; actual: unknown; expected: unknown };

const failures: Failure[] = [];
let passed = 0;

function isEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  return JSON.stringify(a) === JSON.stringify(b);
}

function check(label: string, actual: unknown, expected: unknown): void {
  if (isEqual(actual, expected)) passed += 1;
  else failures.push({ label, actual, expected });
}

type AnyForm = Record<string, unknown>;

/** 12 farklı tutar; toplam 18.727,10 → 360: 1.560,5916… / 365: 1.539,2137… */
const AYLAR = ["1000", "1100,50", "1200", "1350,25", "1400", "1500", "1625,75", "1700", "1800", "1950,60", "2000", "2100"];
const TOPLAM = 1000 + 1100.5 + 1200 + 1350.25 + 1400 + 1500 + 1625.75 + 1700 + 1800 + 1950.6 + 2000 + 2100;
const AYLAR_5_DEGISTI = AYLAR.map((v, i) => (i === 4 ? "2600" : v));
const EXTRA = { id: "x1", name: "Yakacak", label: "Yakacak", value: "600,00" };

const DOKUMLER: EklentiDokumleri = {
  "field:prim": { aylar: AYLAR, gunEsasi: 365 },
  "extra:x1": { aylar: Array<string>(12).fill("600"), gunEsasi: 360 },
};

/* ── Motor: 12 farklı tutar, 360/365 (formül değişmedi) ── */
const engines: Array<[string, (m: string[], g?: number) => number]> = [
  ["Kıdem İş Kanunu", eklentiIsKanunu as (m: string[], g?: number) => number],
  ["Kıdem Basın", eklentiBasin as (m: string[], g?: number) => number],
  ["Kıdem Gemi", eklentiGemi as (m: string[], g?: number) => number],
  ["Kıdem Kısmi", eklentiKismi as (m: string[], g?: number) => number],
  ["Kıdem Mevsimlik", eklentiMevsimlik as (m: string[], g?: number) => number],
  ["İhbar core", eklentiIhbar as (m: string[], g?: number) => number],
];
check("toplam 18.727,10", TOPLAM, 18727.1);
for (const [n, compute] of engines) {
  check(`${n}: 12 farklı ay, 360`, compute(AYLAR, 360), (TOPLAM / 360) * 30);
  check(`${n}: 12 farklı ay, 365`, compute(AYLAR, 365), (TOPLAM / 365) * 30);
  check(`${n}: 360 → 1.560,59`, Math.round(compute(AYLAR, 360) * 100) / 100, 1560.59);
  check(`${n}: 365 → 1.539,21`, Math.round(compute(AYLAR, 365) * 100) / 100, 1539.21);
  check(`${n}: yalnızca 5. ay 2600 → 1.637,84`, Math.round(compute(AYLAR_5_DEGISTI, 365) * 100) / 100, 1637.84);
}

/* ── Yardımcılar ── */
check("boş aylar 12 elemanlı", bosEklentiAylari(), Array<string>(12).fill(""));
check("normalize: undefined → {}", normalizeEklentiDokumleri(undefined), {});
check("normalize: dizi → {}", normalizeEklentiDokumleri([1, 2]), {});
check("normalize: metin → {}", normalizeEklentiDokumleri("x"), {});
check("normalize: geçerli döküm aynen", normalizeEklentiDokumleri(DOKUMLER), DOKUMLER);
check(
  "normalize: eksik aylar 12'ye tamamlanır, fazlası atılır",
  normalizeEklentiDokumleri({
    a: { aylar: ["1", "2"], gunEsasi: 365 },
    b: { aylar: Array<string>(15).fill("7"), gunEsasi: 360 },
  }),
  {
    a: { aylar: ["1", "2", ...Array<string>(10).fill("")], gunEsasi: 365 },
    b: { aylar: Array<string>(12).fill("7"), gunEsasi: 360 },
  },
);
check(
  "normalize: sayı → metin, geçersiz → boş",
  normalizeEklentiDokumleri({ a: { aylar: [1500, null, {}, Number.NaN, "2,5"], gunEsasi: 365 } }).a?.aylar.slice(0, 5),
  ["1500", "", "", "", "2,5"],
);
check(
  "normalize: geçersiz gün esası → 360, metin '365' → 365",
  normalizeEklentiDokumleri({ a: { aylar: ["1"], gunEsasi: 300 }, b: { aylar: ["1"], gunEsasi: "365" } }),
  {
    a: { aylar: ["1", ...Array<string>(11).fill("")], gunEsasi: 360 },
    b: { aylar: ["1", ...Array<string>(11).fill("")], gunEsasi: 365 },
  },
);
check(
  "normalize: tamamen boş veya aysız kalemler atlanır",
  normalizeEklentiDokumleri({ a: { aylar: Array<string>(12).fill(" "), gunEsasi: 365 }, b: { gunEsasi: 365 }, c: null }),
  {},
);

const yazildi = eklentiDokumuYaz(undefined, "field:prim", { aylar: AYLAR, gunEsasi: 365 });
check("yaz: yeni döküm eklenir", yazildi, { "field:prim": { aylar: AYLAR, gunEsasi: 365 } });
check("yaz: girdi nesnesi değiştirilmez", Object.keys(DOKUMLER).length, 2);
const guncellendi = eklentiDokumuYaz(yazildi, "field:prim", { aylar: AYLAR_5_DEGISTI, gunEsasi: 360 });
check("yaz: aynı kalem güncellenir", guncellendi["field:prim"], { aylar: AYLAR_5_DEGISTI, gunEsasi: 360 });
check("yaz: önceki nesne korunur (İptal/önceki uygulama etkilenmez)", yazildi["field:prim"].aylar, AYLAR);
check("yaz: bütün aylar boşsa döküm kaldırılır", eklentiDokumuYaz(yazildi, "field:prim", { aylar: bosEklentiAylari(), gunEsasi: 365 }), {});
const kopya = [...AYLAR];
const ayrik = eklentiDokumuYaz({}, "k", { aylar: kopya, gunEsasi: 360 });
kopya[0] = "9999";
check("yaz: ay dizisi kopyalanır", ayrik.k.aylar[0], "1000");

check("buda: mevcut ekstra korunur", eklentiDokumleriniBuda(DOKUMLER, [EXTRA]), DOKUMLER);
check("buda: hiçbir şey silinmezse aynı nesne", eklentiDokumleriniBuda(DOKUMLER, [EXTRA]) === DOKUMLER, true);
check("buda: silinen ekstra ayıklanır", eklentiDokumleriniBuda(DOKUMLER, []), { "field:prim": DOKUMLER["field:prim"] });
check("buda: undefined → {}", eklentiDokumleriniBuda(undefined, []), {});

check("anahtar: döküm yoksa undefined (eski değişiklik anahtarı aynı kalır)", eklentiDokumleriAnahtari(undefined, []), undefined);
check("anahtar: boş nesne → undefined", eklentiDokumleriAnahtari({}, []), undefined);
check("anahtar: yalnız silinmiş ekstra → undefined", eklentiDokumleriAnahtari({ "extra:z": DOKUMLER["extra:x1"] }, []), undefined);
check(
  "anahtar: anahtar sırası farkı değişiklik sayılmaz",
  eklentiDokumleriAnahtari({ "extra:x1": DOKUMLER["extra:x1"], "field:prim": DOKUMLER["field:prim"] }, [EXTRA]),
  eklentiDokumleriAnahtari(DOKUMLER, [EXTRA]),
);
check(
  "anahtar: tek ay farkı değişiklik sayılır",
  eklentiDokumleriAnahtari(DOKUMLER, [EXTRA]) !==
    eklentiDokumleriAnahtari({ ...DOKUMLER, "field:prim": { aylar: AYLAR_5_DEGISTI, gunEsasi: 365 } }, [EXTRA]),
  true,
);
check(
  "anahtar: kalemin gün esası farkı değişiklik sayılır",
  eklentiDokumleriAnahtari(DOKUMLER, [EXTRA]) !==
    eklentiDokumleriAnahtari({ ...DOKUMLER, "field:prim": { aylar: AYLAR, gunEsasi: 360 } }, [EXTRA]),
  true,
);

check("yerleştir: alan yoksa aynı nesne", (() => { const f = { prim: "1" }; return eklentiDokumleriniFormaYerlestir(f) === f; })(), true);
check("yerleştir: boş döküm alanı yazılmaz", "eklentiDokumleri" in eklentiDokumleriniFormaYerlestir({ prim: "1", eklentiDokumleri: {} }), false);
check(
  "yerleştir: undefined döküm alanı yazılmaz",
  "eklentiDokumleri" in eklentiDokumleriniFormaYerlestir({ prim: "1", eklentiDokumleri: undefined }),
  false,
);
check(
  "yerleştir: silinen ekstranın dökümü kayda girmez",
  eklentiDokumleriniFormaYerlestir({ extras: [], eklentiDokumleri: DOKUMLER }).eklentiDokumleri,
  { "field:prim": DOKUMLER["field:prim"] },
);
check(
  "yerleştir: geçerli döküm aynen yazılır",
  eklentiDokumleriniFormaYerlestir({ extras: [EXTRA], eklentiDokumleri: DOKUMLER }).eklentiDokumleri,
  DOKUMLER,
);

/* ── Kıdem: mapper + kayıt payload'ı ── */
type KidemVariant = {
  name: string;
  empty: () => AnyForm;
  map: (data: unknown) => AnyForm | null;
  primKey: string;
};
const kidemVariants: KidemVariant[] = [
  { name: "Kıdem İş Kanunu", empty: emptyIsKanunu as () => AnyForm, map: mapIsKanunuFormFromBackend as KidemVariant["map"], primKey: "field:prim" },
  { name: "Kıdem Basın İş", empty: emptyBasin as () => AnyForm, map: mapBasinFormFromBackend as KidemVariant["map"], primKey: "field:prim" },
  { name: "Kıdem Gemi", empty: emptyGemi as () => AnyForm, map: mapGemiFormFromBackend as KidemVariant["map"], primKey: "field:prim" },
  { name: "Kıdem Kısmi Süreli", empty: emptyKismi as () => AnyForm, map: mapKismiFormFromBackend as KidemVariant["map"], primKey: "fixed:prim" },
  { name: "Kıdem Mevsimlik", empty: emptyMevsimlik as () => AnyForm, map: mapMevsimlikFormFromBackend as KidemVariant["map"], primKey: "field:prim" },
];

for (const v of kidemVariants) {
  const n = v.name;
  const dokumler: EklentiDokumleri = { [v.primKey]: DOKUMLER["field:prim"], "extra:x1": DOKUMLER["extra:x1"] };
  const base: AnyForm = { ...v.empty(), ciplakBrut: "30.000,00", prim: "1.539,21", extras: [EXTRA] };

  check(`${n}: boş formda döküm yok`, normalizeEklentiDokumleri(v.empty().eklentiDokumleri), {});

  const legacyForm: AnyForm = { ...base, prim: "1.500,00", eklentiGunEsasi: 365 };
  delete legacyForm.eklentiDokumleri;
  const legacy = v.map({ form: legacyForm, formValues: legacyForm, brut_total: 100, net_total: 90 });
  check(`${n}: dökümsüz kayıt → boş döküm`, legacy?.eklentiDokumleri, {});
  check(`${n}: dökümsüz kayıt prim aynen`, legacy?.prim, "1.500,00");
  check(`${n}: dökümsüz kayıt 365 korunur`, legacy?.eklentiGunEsasi, 365);
  check(`${n}: dökümsüz kayıt ekstra id korunur`, (legacy?.extras as Array<{ id: string }> | undefined)?.[0]?.id, "x1");
  const legacyResave = buildKidemSaveData(legacy as AnyForm, { brut: 100, net: 90 });
  check(`${n}: dökümsüz kayıt yeniden kaydedilince döküm alanı eklenmez`, "eklentiDokumleri" in (legacyResave.form as AnyForm), false);
  check(`${n}: dökümsüz kayıt yeniden kaydı formValues'ta da alan yok`, "eklentiDokumleri" in (legacyResave.formValues as AnyForm), false);

  const saved = buildKidemSaveData({ ...base, eklentiGunEsasi: 365, eklentiDokumleri: dokumler }, { brut: 100, net: 90 });
  check(`${n}: payload form dökümü`, (saved.form as AnyForm).eklentiDokumleri, dokumler);
  check(`${n}: payload formValues dökümü`, (saved.formValues as AnyForm).eklentiDokumleri, dokumler);
  check(`${n}: geri yükleme dökümü aynen`, v.map(saved)?.eklentiDokumleri, dokumler);
  check(`${n}: geri yükleme (data sarmalı + JSON)`, v.map(JSON.stringify({ data: saved }))?.eklentiDokumleri, dokumler);
  check(`${n}: geri yükleme prim tutarı aynen`, v.map(saved)?.prim, "1.539,21");
  check(`${n}: geri yükleme 365 korunur`, v.map(saved)?.eklentiGunEsasi, 365);

  const silindi = buildKidemSaveData({ ...base, extras: [], eklentiGunEsasi: 365, eklentiDokumleri: dokumler }, { brut: 1, net: 1 });
  check(`${n}: silinen ekstranın dökümü kayda girmez`, (silindi.form as AnyForm).eklentiDokumleri, { [v.primKey]: dokumler[v.primKey] });
  const bozuk = v.map({ form: { ...base, eklentiDokumleri: "bozuk" } });
  check(`${n}: bozuk döküm verisi → boş döküm`, bozuk?.eklentiDokumleri, {});
  check(`${n}: bozuk döküm prim tutarını etkilemez`, bozuk?.prim, "1.539,21");
}

/* ── İhbar: model + backend ── */
type AnyModel = {
  createEmptyForm: () => AnyForm;
  normalizeForm: (raw: AnyForm | null | undefined) => AnyForm;
  snapshotKey: (form: AnyForm) => string;
};
type AnyBackend = {
  mapFormFromBackend: (data: unknown, record?: unknown) => AnyForm | null;
  mapRecordToSavedCase: (record: unknown) => { form: AnyForm } | null;
  buildSaveData?: (form: AnyForm, result: { brut: number; net: number }) => Record<string, unknown>;
};
const ihbarVariants: Array<{ name: string; model: AnyModel; backend: AnyBackend; extra: AnyForm }> = [
  { name: "İhbar İş Kanunu", model: model30 as unknown as AnyModel, backend: ihbar30Backend as unknown as AnyBackend, extra: {} },
  { name: "İhbar Basın İş", model: modelBasin as unknown as AnyModel, backend: ihbarBasinBackend as unknown as AnyBackend, extra: { meslegeBaslangic: "2010-01-01" } },
  { name: "İhbar Belirli Süreli", model: modelBelirli as unknown as AnyModel, backend: ihbarBelirliBackend as unknown as AnyBackend, extra: {} },
  { name: "İhbar Borçlar", model: modelBorclar as unknown as AnyModel, backend: ihbarBorclarBackend as unknown as AnyBackend, extra: {} },
  { name: "İhbar Gemi", model: modelGemi as unknown as AnyModel, backend: ihbarGemiBackend as unknown as AnyBackend, extra: {} },
  { name: "İhbar Kısmi", model: modelKismi as unknown as AnyModel, backend: ihbarKismiBackend as unknown as AnyBackend, extra: {} },
  { name: "İhbar Mevsimlik", model: modelMevsim as unknown as AnyModel, backend: ihbarMevsimBackend as unknown as AnyBackend, extra: {} },
];

for (const v of ihbarVariants) {
  const n = v.name;
  const { model, backend } = v;
  const storedLegacy: AnyForm = {
    startDate: "2015-03-01",
    endDate: "2024-06-30",
    brut: "30.000,00",
    prim: "1.500,00",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [EXTRA],
    brutUcret: "30.000,00",
    iseGiris: "2015-03-01",
    istenCikis: "2024-06-30",
    exitDate: "2024-06-30",
    eklentiGunEsasi: 365,
    ...v.extra,
  };

  const empty = model.createEmptyForm();
  check(`${n}: boş formda döküm yok`, normalizeEklentiDokumleri(empty.eklentiDokumleri), {});
  check(`${n}: normalizeForm(null) → boş döküm`, normalizeEklentiDokumleri(model.normalizeForm(null).eklentiDokumleri), {});
  check(`${n}: normalizeForm(dökümsüz) → boş döküm`, model.normalizeForm({ prim: "1.500,00" }).eklentiDokumleri, {});
  check(`${n}: normalizeForm dökümü korur`, model.normalizeForm({ ...storedLegacy, eklentiDokumleri: DOKUMLER }).eklentiDokumleri, DOKUMLER);
  check(
    `${n}: snapshotKey dökümsüz/boş döküm aynı (eski kayıt kirli görünmez)`,
    model.snapshotKey({ ...empty, eklentiDokumleri: {} }) === model.snapshotKey({ ...empty, eklentiDokumleri: undefined }),
    true,
  );
  const withExtra = model.normalizeForm(storedLegacy);
  check(
    `${n}: snapshotKey tek ay farkını görür`,
    model.snapshotKey({ ...withExtra, eklentiDokumleri: DOKUMLER }) !==
      model.snapshotKey({ ...withExtra, eklentiDokumleri: { ...DOKUMLER, "field:prim": { aylar: AYLAR_5_DEGISTI, gunEsasi: 365 } } }),
    true,
  );

  const legacyData = { form: storedLegacy, formValues: storedLegacy, brut_total: 100, net_total: 90, results: { brut: 100, net: 90 } };
  const legacy = backend.mapFormFromBackend(legacyData);
  check(`${n}: dökümsüz kayıt → boş döküm`, legacy?.eklentiDokumleri, {});
  check(`${n}: dökümsüz kayıt prim aynen`, legacy?.prim, "1.500,00");
  check(`${n}: dökümsüz kayıt 365 korunur`, legacy?.eklentiGunEsasi, 365);
  check(`${n}: dökümsüz kayıt listesi → boş döküm`, backend.mapRecordToSavedCase({ id: 7, name: "Eski", type: "x", data: legacyData })?.form.eklentiDokumleri ?? {}, {});

  check(`${n}: buildSaveData dışa açık`, typeof backend.buildSaveData, "function");
  if (typeof backend.buildSaveData !== "function") continue;
  const legacyResave = backend.buildSaveData(model.normalizeForm(legacy ?? {}), { brut: 100, net: 90 });
  check(`${n}: dökümsüz kayıt yeniden kaydedilince döküm alanı eklenmez`, "eklentiDokumleri" in (legacyResave.form as AnyForm), false);

  const form = { ...model.normalizeForm(storedLegacy), prim: "1.539,21", eklentiDokumleri: DOKUMLER };
  const saved = backend.buildSaveData(form, { brut: 100, net: 90 });
  check(`${n}: payload form dökümü`, (saved.form as AnyForm).eklentiDokumleri, DOKUMLER);
  check(`${n}: payload formValues dökümü`, (saved.formValues as AnyForm | undefined)?.eklentiDokumleri, DOKUMLER);
  check(`${n}: geri yükleme dökümü aynen`, backend.mapFormFromBackend(saved)?.eklentiDokumleri, DOKUMLER);
  check(`${n}: geri yükleme (data sarmalı + JSON)`, backend.mapFormFromBackend(JSON.stringify({ data: saved }))?.eklentiDokumleri, DOKUMLER);
  check(`${n}: kayıt listesi dökümü`, backend.mapRecordToSavedCase({ id: 8, name: "Yeni", type: "x", data: saved })?.form.eklentiDokumleri, DOKUMLER);
  check(`${n}: geri yükleme prim tutarı aynen`, backend.mapFormFromBackend(saved)?.prim, "1.539,21");
  check(`${n}: geri yükleme 365 korunur`, backend.mapFormFromBackend(saved)?.eklentiGunEsasi, 365);
  check(
    `${n}: geri yüklenen form normalizeForm sonrası da aynı döküm`,
    model.normalizeForm(backend.mapFormFromBackend(saved)).eklentiDokumleri,
    DOKUMLER,
  );
  const silindi = backend.buildSaveData({ ...form, extras: [] }, { brut: 1, net: 1 });
  check(`${n}: silinen ekstranın dökümü kayda girmez`, (silindi.form as AnyForm).eklentiDokumleri, { "field:prim": DOKUMLER["field:prim"] });
}

if (failures.length > 0) {
  console.error(`eklentiDokumu.test: ${failures.length} test başarısız, ${passed} geçti`);
  for (const f of failures) console.error(" -", f.label, "→ gerçek:", JSON.stringify(f.actual), "beklenen:", JSON.stringify(f.expected));
  throw new Error(`eklentiDokumu.test: ${failures.length} failure(s)`);
}
console.log(`eklentiDokumu.test: ${passed} test geçti ✔`);
