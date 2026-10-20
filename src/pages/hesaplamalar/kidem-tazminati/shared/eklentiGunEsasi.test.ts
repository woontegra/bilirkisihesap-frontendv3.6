/**
 * Kıdem Tazminatı — 12 aylık eklenti hesabında 360/365 gün esası regresyon testleri.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/kidem-tazminati/shared/eklentiGunEsasi.test.ts
 * Ağ isteği yoktur; yalnızca motor, boş form, backend mapper ve kayıt payload'ı doğrulanır.
 */

import { computeEklentiResult as eklentiIsKanunu } from "../is-kanunu/engine";
import { computeEklentiResult as eklentiBasin } from "../basin-is/engine";
import { computeEklentiResult as eklentiGemi } from "../gemi-adamlari/engine";
import { computeEklentiResult as eklentiKismi } from "../kismi-sureli/engine";
import { computeEklentiResult as eklentiMevsimlik } from "../mevsimlik-isci/engine";
import { createEmptyForm as emptyIsKanunu } from "../is-kanunu/model";
import { emptyForm as emptyBasin } from "../basin-is/model";
import { createEmptyGemiForm as emptyGemi } from "../gemi-adamlari/model";
import { emptyForm as emptyKismi } from "../kismi-sureli/model";
import { createEmptyMevsimlikForm as emptyMevsimlik } from "../mevsimlik-isci/model";
import { mapIsKanunuFormFromBackend } from "../is-kanunu/backendCase";
import { mapBasinFormFromBackend } from "../basin-is/backendCase";
import { mapGemiFormFromBackend } from "../gemi-adamlari/backendCase";
import { mapKismiFormFromBackend } from "../kismi-sureli/backendCase";
import { mapMevsimlikFormFromBackend } from "../mevsimlik-isci/backendCase";
import { buildKidemSaveData } from "./kidemCaseCrud";

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

type AnyCompute = (months: string[], gunEsasi?: number) => number;
type AnyForm = Record<string, unknown>;
type AnyMapper = (data: unknown) => AnyForm | null;

/** 12 × 9.125 = 109.500 → 360: 9.125,00 / 365: 9.000,00 */
const MONTHS = Array<string>(12).fill("9125");

const variants: Array<{
  name: string;
  compute: AnyCompute;
  empty: () => AnyForm;
  map: AnyMapper;
  legacyForm: AnyForm;
}> = [
  {
    name: "İş Kanunu",
    compute: eklentiIsKanunu as AnyCompute,
    empty: emptyIsKanunu as () => AnyForm,
    map: mapIsKanunuFormFromBackend as AnyMapper,
    legacyForm: {
      iseGirisTarihi: "2015-03-01",
      istenCikisTarihi: "2024-06-30",
      ciplakBrut: "30.000,00",
      prim: "1.500,00",
      ikramiye: "",
      yol: "750,00",
      yemek: "",
      extras: [],
      notes: "",
    },
  },
  {
    name: "Basın İş",
    compute: eklentiBasin as AnyCompute,
    empty: emptyBasin as () => AnyForm,
    map: mapBasinFormFromBackend as AnyMapper,
    legacyForm: {
      meslegeBaslangic: "2010-01-01",
      iseGiris: "2015-03-01",
      istenCikis: "2024-06-30",
      denemeSuresiGun: "",
      ciplakBrut: "30.000,00",
      prim: "1.500,00",
      ikramiye: "",
      yol: "",
      yemek: "",
      diger: "",
      extras: [],
      notes: "",
    },
  },
  {
    name: "Gemi Adamları",
    compute: eklentiGemi as AnyCompute,
    empty: emptyGemi as () => AnyForm,
    map: mapGemiFormFromBackend as AnyMapper,
    legacyForm: { ...(emptyGemi() as AnyForm), ciplakBrut: "30.000,00", prim: "1.500,00" },
  },
  {
    name: "Kısmi Süreli",
    compute: eklentiKismi as AnyCompute,
    empty: emptyKismi as () => AnyForm,
    map: mapKismiFormFromBackend as AnyMapper,
    legacyForm: { ...(emptyKismi() as AnyForm), ciplakBrut: "30.000,00", prim: "1.500,00" },
  },
  {
    name: "Mevsimlik İşçi",
    compute: eklentiMevsimlik as AnyCompute,
    empty: emptyMevsimlik as () => AnyForm,
    map: mapMevsimlikFormFromBackend as AnyMapper,
    legacyForm: { ...(emptyMevsimlik() as AnyForm), ciplakBrut: "30.000,00", prim: "1.500,00" },
  },
];

function withoutGunEsasi(form: AnyForm | null): AnyForm | null {
  if (!form) return form;
  const { eklentiGunEsasi: _ignored, ...rest } = form;
  return rest;
}

for (const v of variants) {
  const n = v.name;

  check(`${n}: eklenti varsayılan (360)`, v.compute(MONTHS), 9125);
  check(`${n}: eklenti 360 gün`, v.compute(MONTHS, 360), 9125);
  check(`${n}: eklenti 365 gün`, v.compute(MONTHS, 365), 9000);
  check(`${n}: boş ay listesi 365`, v.compute(Array<string>(12).fill(""), 365), 0);

  check(`${n}: boş form gün esası 360`, v.empty().eklentiGunEsasi, 360);

  const storedLegacyForm = { ...v.legacyForm };
  delete storedLegacyForm.eklentiGunEsasi;
  const legacyData = {
    form: storedLegacyForm,
    formValues: storedLegacyForm,
    brut_total: 100,
    net_total: 90,
    results: { brut: 100, net: 90 },
  };
  const legacy = v.map(legacyData);
  check(`${n}: eski kayıt (alan yok) → 360`, legacy?.eklentiGunEsasi, 360);
  check(`${n}: eski kayıt prim değeri aynen korunur`, legacy?.prim, "1.500,00");
  check(`${n}: eski kayıt brüt değeri aynen korunur`, legacy?.ciplakBrut, "30.000,00");
  check(
    `${n}: eski kayıt diğer alanları gün esası eklenmesinden etkilenmez`,
    withoutGunEsasi(v.map({ form: { ...storedLegacyForm, eklentiGunEsasi: 365 } })),
    withoutGunEsasi(legacy),
  );

  check(`${n}: geçersiz değer (300) → 360`, v.map({ form: { ...storedLegacyForm, eklentiGunEsasi: 300 } })?.eklentiGunEsasi, 360);
  check(`${n}: metin "365" → 365`, v.map({ form: { ...storedLegacyForm, eklentiGunEsasi: "365" } })?.eklentiGunEsasi, 365);

  const form365 = { ...v.empty(), ...v.legacyForm, eklentiGunEsasi: 365 };
  const saved = buildKidemSaveData(form365, { brut: 100, net: 90 });
  check(`${n}: kayıt payload form.eklentiGunEsasi = 365`, (saved.form as AnyForm).eklentiGunEsasi, 365);
  check(`${n}: kayıt payload formValues.eklentiGunEsasi = 365`, (saved.formValues as AnyForm).eklentiGunEsasi, 365);
  check(`${n}: yeni kayıt geri yükleme → 365`, v.map(saved)?.eklentiGunEsasi, 365);
  check(`${n}: yeni kayıt (data sarmalı + JSON) → 365`, v.map(JSON.stringify({ data: saved }))?.eklentiGunEsasi, 365);

  const form360 = { ...v.empty(), ...v.legacyForm, eklentiGunEsasi: 360 };
  check(`${n}: 360 kaydı geri yükleme → 360`, v.map(buildKidemSaveData(form360, { brut: 1, net: 1 }))?.eklentiGunEsasi, 360);
}

if (failures.length > 0) {
  console.error(`kidem eklentiGunEsasi.test: ${failures.length} test başarısız, ${passed} geçti`);
  for (const f of failures) console.error(" -", f.label, "→ gerçek:", f.actual, "beklenen:", f.expected);
  throw new Error(`kidem eklentiGunEsasi.test: ${failures.length} failure(s)`);
}
console.log(`kidem eklentiGunEsasi.test: ${passed} test geçti ✔`);
