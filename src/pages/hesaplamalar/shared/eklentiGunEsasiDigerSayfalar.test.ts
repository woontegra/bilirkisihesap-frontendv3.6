/**
 * Boşta Geçen Süre, Davacı Ücreti, Kötü Niyet Tazminatı, Bakiye Ücret Alacağı —
 * 12 aylık eklenti hesabında 360/365 gün esası ve döküm saklama regresyon testleri.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/shared/eklentiGunEsasiDigerSayfalar.test.ts
 * Ağ isteği yoktur; yalnızca motor, boş form, backend mapper ve kayıt payload'ı doğrulanır.
 */

import { computeEklentiResult as eklentiBosta } from "../bosta-gecen-sure-ucreti/engine";
import { computeEklentiResult as eklentiDavaci } from "../davaci-ucreti/engine";
import { computeEklentiResult as eklentiKotuNiyet } from "../kotu-niyet-tazminati/engine";
import { computeEklentiResult as eklentiBakiye } from "../bakiye-ucret-alacagi/engine";
import { createEmptyForm as emptyBosta } from "../bosta-gecen-sure-ucreti/model";
import { createEmptyForm as emptyKotuNiyet } from "../kotu-niyet-tazminati/model";
import { createEmptyForm as emptyBakiye } from "../bakiye-ucret-alacagi/model";
import { mapBostaFormFromBackend } from "../bosta-gecen-sure-ucreti/backendCase";
import { mapKotuNiyetFormFromBackend } from "../kotu-niyet-tazminati/backendCase";
import { mapBakiyeFormFromBackend } from "../bakiye-ucret-alacagi/backendCase";
import { buildDavaciSavePayload, mapDavaciFormFromBackend } from "../davaci-ucreti/backendCase";
import { eklentiDokumleriniFormaYerlestir } from "./eklentiDokumu";

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

type AnyCompute = (months: string[], gunEsasi?: 360 | 365) => number;
type AnyForm = Record<string, unknown>;
type AnyMapper = (data: unknown) => AnyForm | null;

/** 12 × 9.125 = 109.500 → 360: 9.125,00 / 365: 9.000,00 */
const MONTHS = Array<string>(12).fill("9125");
const BICIMLI = Array<string>(12).fill("3.041,67");

const engines: Array<[string, AnyCompute]> = [
  ["Boşta Geçen Süre", eklentiBosta],
  ["Davacı Ücreti", eklentiDavaci],
  ["Kötü Niyet", eklentiKotuNiyet],
  ["Bakiye Ücret", eklentiBakiye],
];

for (const [n, compute] of engines) {
  check(`${n}: eklenti varsayılan (360)`, compute(MONTHS), 9125);
  check(`${n}: eklenti 360 gün`, compute(MONTHS, 360), 9125);
  check(`${n}: eklenti 365 gün`, compute(MONTHS, 365), 9000);
  check(`${n}: biçimli tutar 360`, compute(BICIMLI, 360), (3041.67 * 12 * 30) / 360);
  check(`${n}: biçimli tutar 365`, compute(BICIMLI, 365), (3041.67 * 12 * 30) / 365);
  check(`${n}: boş ay listesi 365`, compute(Array<string>(12).fill(""), 365), 0);
}

const forms: Array<{ name: string; empty: () => AnyForm; map: AnyMapper }> = [
  { name: "Boşta Geçen Süre", empty: emptyBosta as () => AnyForm, map: mapBostaFormFromBackend as AnyMapper },
  { name: "Kötü Niyet", empty: emptyKotuNiyet as () => AnyForm, map: mapKotuNiyetFormFromBackend as AnyMapper },
  { name: "Bakiye Ücret", empty: emptyBakiye as () => AnyForm, map: mapBakiyeFormFromBackend as AnyMapper },
];

function withoutEklenti(form: AnyForm | null): AnyForm | null {
  if (!form) return form;
  const { eklentiGunEsasi: _g, eklentiDokumleri: _d, ...rest } = form;
  return rest;
}

for (const v of forms) {
  const n = v.name;
  const empty = v.empty();
  check(`${n}: boş form gün esası 360`, empty.eklentiGunEsasi, 360);

  const legacyForm = { ...empty } as AnyForm;
  delete legacyForm.eklentiGunEsasi;
  const legacy = v.map({ form: legacyForm, formValues: legacyForm });
  check(`${n}: eski kayıt (alan yok) → 360`, legacy?.eklentiGunEsasi, 360);
  check(`${n}: eski kayıt döküm yok`, legacy?.eklentiDokumleri, {});
  check(
    `${n}: eski kayıt diğer alanları etkilenmez`,
    withoutEklenti(v.map({ form: { ...legacyForm, eklentiGunEsasi: 365 } })),
    withoutEklenti(legacy),
  );
  check(`${n}: geçersiz değer (300) → 360`, v.map({ form: { ...legacyForm, eklentiGunEsasi: 300 } })?.eklentiGunEsasi, 360);

  const key = "field:prim";
  const dokum = { aylar: MONTHS, gunEsasi: 365 };
  const kayit = eklentiDokumleriniFormaYerlestir({
    ...empty,
    eklentiGunEsasi: 365,
    eklentiDokumleri: { [key]: dokum, "extra:silinmis": dokum },
  } as AnyForm);
  check(`${n}: kayıtta silinmiş kalem dökümü ayıklanır`, Object.keys(kayit.eklentiDokumleri as AnyForm), [key]);
  const geri = v.map({ form: kayit, formValues: kayit });
  check(`${n}: yeni kayıt geri yükleme → 365`, geri?.eklentiGunEsasi, 365);
  check(`${n}: döküm geri yüklenir`, (geri?.eklentiDokumleri as AnyForm)?.[key], dokum);
}

{
  const n = "Davacı Ücreti";
  const extraItems = [
    { id: "a", name: "Prim", value: "9.000,00" },
    { id: "b", name: "Yol", value: "" },
  ];
  const base = { ciplakBrut: "30.000,00", extraItems, selectedYear: 2024, selectedPeriod: 2 as const, notes: "" };
  const net = {
    gross: 0, sgk: 0, issizlik: 0, gelirVergisi: 0, gelirVergisiDilimleri: "", damgaVergisi: 0, net: 0,
    gelirVergisiBrut: 0, gelirVergisiIstisna: 0, damgaVergisiBrut: 0, damgaVergisiIstisna: 0,
  };

  const legacy = mapDavaciFormFromBackend({ form: base }, 2024);
  check(`${n}: eski kayıt (alan yok) → 360`, legacy?.eklentiGunEsasi, 360);
  check(`${n}: eski kayıt döküm yok`, legacy?.eklentiDokumleri, {});
  check(`${n}: eski kayıt kalem değeri korunur`, legacy?.extraItems[0]?.value, "9.000,00");

  const dokum = { aylar: MONTHS, gunEsasi: 365 as const };
  const saved = buildDavaciSavePayload(
    { ...base, eklentiGunEsasi: 365, eklentiDokumleri: { "extra:a": dokum, "extra:silinmis": dokum } },
    0,
    net,
  );
  const savedForm = saved.form as AnyForm;
  check(`${n}: kayıt payload gün esası 365`, savedForm.eklentiGunEsasi, 365);
  check(`${n}: kayıtta silinmiş kalem dökümü ayıklanır`, Object.keys(savedForm.eklentiDokumleri as AnyForm), ["extra:a"]);
  const geri = mapDavaciFormFromBackend(saved, 2024);
  check(`${n}: yeni kayıt geri yükleme → 365`, geri?.eklentiGunEsasi, 365);
  check(`${n}: döküm geri yüklenir`, geri?.eklentiDokumleri?.["extra:a"], dokum);

  const bos = buildDavaciSavePayload({ ...base }, 0, net).form as AnyForm;
  check(`${n}: döküm yoksa alan yazılmaz`, "eklentiDokumleri" in bos, false);
  check(`${n}: gün esası yoksa 360 yazılır`, bos.eklentiGunEsasi, 360);
}

if (failures.length > 0) {
  console.error(`eklentiGunEsasiDigerSayfalar.test: ${failures.length} test başarısız, ${passed} geçti`);
  for (const f of failures) console.error(" -", f.label, "→ gerçek:", f.actual, "beklenen:", f.expected);
  throw new Error(`eklentiGunEsasiDigerSayfalar.test: ${failures.length} failure(s)`);
}
console.log(`eklentiGunEsasiDigerSayfalar.test: ${passed} test geçti ✔`);
