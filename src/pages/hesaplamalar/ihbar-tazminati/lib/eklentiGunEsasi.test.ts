/**
 * İhbar Tazminatı — 12 aylık eklenti hesabında 360/365 gün esası regresyon testleri.
 * Çalıştır: npx vite-node --config vite.config.ts src/pages/hesaplamalar/ihbar-tazminati/lib/eklentiGunEsasi.test.ts
 * Ağ isteği yoktur; yalnızca motor, form modeli, backend mapper ve kayıt payload'ı doğrulanır.
 */

import { computeEklentiResult } from "./core";
import * as model30 from "../is-kanunu/model";
import * as modelBasin from "../basin/model";
import * as modelBelirli from "../belirli/model";
import * as modelBorclar from "../borclar/model";
import * as modelGemi from "../gemi/model";
import * as modelKismi from "../kismi/model";
import * as modelMevsim from "../mevsim/model";
import {
  ihbar30Backend,
  ihbarBasinBackend,
  ihbarBelirliBackend,
  ihbarBorclarBackend,
  ihbarGemiBackend,
  ihbarKismiBackend,
  ihbarMevsimBackend,
} from "./ihbarBackendInstances";

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

/** 12 × 9.125 = 109.500 → 360: 9.125,00 / 365: 9.000,00 */
const MONTHS = Array<string>(12).fill("9125");

const unwrapComputeEklenti = computeEklentiResult as (months: string[], gunEsasi?: number) => number;
check("core: eklenti varsayılan (360)", unwrapComputeEklenti(MONTHS), 9125);
check("core: eklenti 360 gün", unwrapComputeEklenti(MONTHS, 360), 9125);
check("core: eklenti 365 gün", unwrapComputeEklenti(MONTHS, 365), 9000);
check("core: mevcut (sum/360)*30 örneği değişmez", unwrapComputeEklenti(["3600", ...Array<string>(11).fill("0")]), 300);

const variants: Array<{ name: string; model: AnyModel; backend: AnyBackend; legacyForm: AnyForm }> = [
  { name: "İş Kanunu", model: model30 as unknown as AnyModel, backend: ihbar30Backend as unknown as AnyBackend, legacyForm: {} },
  {
    name: "Basın İş",
    model: modelBasin as unknown as AnyModel,
    backend: ihbarBasinBackend as unknown as AnyBackend,
    legacyForm: { meslegeBaslangic: "2010-01-01" },
  },
  { name: "Belirli Süreli", model: modelBelirli as unknown as AnyModel, backend: ihbarBelirliBackend as unknown as AnyBackend, legacyForm: {} },
  { name: "Borçlar Kanunu", model: modelBorclar as unknown as AnyModel, backend: ihbarBorclarBackend as unknown as AnyBackend, legacyForm: {} },
  { name: "Gemi Adamları", model: modelGemi as unknown as AnyModel, backend: ihbarGemiBackend as unknown as AnyBackend, legacyForm: {} },
  { name: "Kısmi Süreli", model: modelKismi as unknown as AnyModel, backend: ihbarKismiBackend as unknown as AnyBackend, legacyForm: {} },
  { name: "Mevsimlik", model: modelMevsim as unknown as AnyModel, backend: ihbarMevsimBackend as unknown as AnyBackend, legacyForm: {} },
];

function withoutGunEsasi(form: AnyForm | null | undefined): AnyForm | null | undefined {
  if (!form) return form;
  const { eklentiGunEsasi: _ignored, ...rest } = form;
  return rest;
}

for (const v of variants) {
  const n = v.name;
  const { model, backend } = v;

  const empty = model.createEmptyForm();
  check(`${n}: boş form gün esası 360`, empty.eklentiGunEsasi, 360);
  check(`${n}: normalizeForm(boş nesne) → 360`, model.normalizeForm({}).eklentiGunEsasi, 360);
  check(`${n}: normalizeForm(null) → 360`, model.normalizeForm(null).eklentiGunEsasi, 360);
  check(`${n}: normalizeForm(365) → 365`, model.normalizeForm({ eklentiGunEsasi: 365 }).eklentiGunEsasi, 365);
  check(`${n}: normalizeForm("365") → 365`, model.normalizeForm({ eklentiGunEsasi: "365" }).eklentiGunEsasi, 365);
  check(`${n}: normalizeForm(300) → 360`, model.normalizeForm({ eklentiGunEsasi: 300 }).eklentiGunEsasi, 360);
  check(
    `${n}: snapshotKey 360/365 farkını görür (kaydedilmemiş değişiklik)`,
    model.snapshotKey({ ...empty, eklentiGunEsasi: 360 }) !== model.snapshotKey({ ...empty, eklentiGunEsasi: 365 }),
    true,
  );

  const legacyStoredForm: AnyForm = {
    startDate: "2015-03-01",
    endDate: "2024-06-30",
    brut: "30.000,00",
    prim: "1.500,00",
    ikramiye: "",
    yol: "750,00",
    yemek: "",
    extras: [],
    brutUcret: "30.000,00",
    iseGiris: "2015-03-01",
    istenCikis: "2024-06-30",
    exitDate: "2024-06-30",
    ...v.legacyForm,
  };
  const legacyData = {
    form: legacyStoredForm,
    formValues: legacyStoredForm,
    brut_total: 100,
    net_total: 90,
    results: { brut: 100, net: 90, toplamBrut: 120 },
  };
  const legacy = backend.mapFormFromBackend(legacyData);
  check(`${n}: eski kayıt (alan yok) → 360`, legacy?.eklentiGunEsasi, 360);
  check(`${n}: eski kayıt brüt aynen korunur`, legacy?.brut, "30.000,00");
  check(`${n}: eski kayıt prim aynen korunur`, legacy?.prim, "1.500,00");
  check(
    `${n}: eski kayıt diğer alanları gün esası eklenmesinden etkilenmez`,
    withoutGunEsasi(backend.mapFormFromBackend({ form: { ...legacyStoredForm, eklentiGunEsasi: 365 } })),
    withoutGunEsasi(legacy),
  );
  check(
    `${n}: eski kayıt listesi (mapRecordToSavedCase) → 360`,
    backend.mapRecordToSavedCase({ id: 7, name: "Eski", type: "x", data: legacyData })?.form.eklentiGunEsasi,
    360,
  );

  check(`${n}: buildSaveData dışa açık`, typeof backend.buildSaveData, "function");
  if (typeof backend.buildSaveData === "function") {
    const form365 = { ...model.normalizeForm(legacyStoredForm), eklentiGunEsasi: 365 };
    const saved = backend.buildSaveData(form365, { brut: 100, net: 90 });
    check(`${n}: kayıt payload form.eklentiGunEsasi = 365`, (saved.form as AnyForm).eklentiGunEsasi, 365);
    check(`${n}: kayıt payload formValues.eklentiGunEsasi = 365`, (saved.formValues as AnyForm).eklentiGunEsasi, 365);
    check(`${n}: yeni kayıt geri yükleme → 365`, backend.mapFormFromBackend(saved)?.eklentiGunEsasi, 365);
    check(
      `${n}: yeni kayıt (data sarmalı + JSON) → 365`,
      backend.mapFormFromBackend(JSON.stringify({ data: saved }))?.eklentiGunEsasi,
      365,
    );
    check(
      `${n}: yeni kayıt listesi (mapRecordToSavedCase) → 365`,
      backend.mapRecordToSavedCase({ id: 8, name: "Yeni", type: "x", data: saved })?.form.eklentiGunEsasi,
      365,
    );
    const form360 = { ...model.normalizeForm(legacyStoredForm), eklentiGunEsasi: 360 };
    check(
      `${n}: 360 kaydı geri yükleme → 360`,
      backend.mapFormFromBackend(backend.buildSaveData(form360, { brut: 1, net: 1 }))?.eklentiGunEsasi,
      360,
    );
  }
}

if (failures.length > 0) {
  console.error(`ihbar eklentiGunEsasi.test: ${failures.length} test başarısız, ${passed} geçti`);
  for (const f of failures) console.error(" -", f.label, "→ gerçek:", f.actual, "beklenen:", f.expected);
  throw new Error(`ihbar eklentiGunEsasi.test: ${failures.length} failure(s)`);
}
console.log(`ihbar eklentiGunEsasi.test: ${passed} test geçti ✔`);
