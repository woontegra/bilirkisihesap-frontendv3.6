/**
 * Hakkaniyet indirimi oranı testleri için ortak örnek formlar ve modül tablosu.
 * Yalnızca test betiklerinden içe aktarılır; uygulama paketine girmez.
 */

import { computeStandartFmResultV3 } from "../standart/v3-engine/adapter";
import { createEmptyForm as emptyStandart } from "../standart/model";
import { buildStandartSaveData, mapStandartFormFromBackend } from "../standart/backendCase";
import { computeTanikliFmResultV3 } from "../tanikli-standart/v3-engine/adapter";
import { createEmptyForm as emptyTanikli } from "../tanikli-standart/model";
import { buildTanikliSaveData, mapTanikliFormFromBackend } from "../tanikli-standart/backendCase";
import { computeHaftalikKarmaResultV3 } from "../haftalik-karma/v3-engine/adapter";
import { createEmptyHaftalikKarmaForm } from "../haftalik-karma/model";
import { buildHaftalikKarmaSaveData, mapHaftalikKarmaFormFromBackend } from "../haftalik-karma/backendCase";
import { computeDonemselResultV3 } from "../donemsel/v3-engine/adapter";
import { createEmptyDonemselForm } from "../donemsel/model";
import { buildDonemselSaveData, mapDonemselFormFromBackend } from "../donemsel/backendCase";
import { computeDonemselHaftalikResultV3 } from "../donemsel-haftalik/v3-engine/adapter";
import { createEmptyDonemselHaftalikForm } from "../donemsel-haftalik/model";
import {
  buildDonemselHaftalikSaveData,
  mapDonemselHaftalikFormFromBackend,
} from "../donemsel-haftalik/backendCase";
import { computeYeraltiResultV3 } from "../yeralti-isci/v3-engine/adapter";
import { createEmptyForm as emptyYeralti } from "../yeralti-isci/model";
import { buildYeraltiSaveData, mapYeraltiFormFromBackend } from "../yeralti-isci/backendCase";
import { computeVardiya24Result } from "../vardiya-24/engine";
import { createEmptyForm as emptyVardiya24 } from "../vardiya-24/model";
import { buildVardiya24SaveData, mapVardiya24FormFromBackend } from "../vardiya-24/backendCase";
import { computeVardiya48Result } from "../vardiya-48/engine";
import { createEmptyForm as emptyVardiya48 } from "../vardiya-48/model";
import { buildVardiya48SaveData, mapVardiya48FormFromBackend } from "../vardiya-48/backendCase";
import { computeGemiGunlukResult } from "../gemi-adami-gunluk/engine";
import { createEmptyForm as emptyGemiGunluk } from "../gemi-adami-gunluk/model";
import { buildGemiGunlukSaveData, mapGemiGunlukFormFromBackend } from "../gemi-adami-gunluk/backendCase";
import { computeGemi724Result } from "../gemi-adami-7-24/engine";
import { createEmptyForm as emptyGemi724 } from "../gemi-adami-7-24/model";
import { buildGemi724SaveData, mapGemi724FormFromBackend } from "../gemi-adami-7-24/backendCase";

export type AnyForm = Record<string, unknown>;
export type AnyResult = Record<string, unknown>;

export type FmModule = {
  key: string;
  name: string;
  /** Hakkaniyet tutarı round2 ile yuvarlanan modüller (Yeraltı, Gemi 7/24). */
  rounded: boolean;
  totalField: "toplamFm" | "totalFm";
  hakkaniyetField: "hakkaniyetIndirimi" | "hakkaniyetOneri";
  netField: "sonNet" | "mahsupSonrasiNet";
  mahsupField: "mahsup" | "mahsuplasmaMiktari";
  compute: (form: AnyForm) => AnyResult;
  buildForm: () => AnyForm;
  buildSaveData: (form: AnyForm, result: AnyResult) => Record<string, unknown>;
  mapFromBackend: (data: unknown) => AnyForm | null;
};

const ISE_GIRIS = "2019-01-01";
const ISTEN_CIKIS = "2021-12-31";

function fmSaveResult(m: Pick<FmModule, "totalField" | "netField">, result: AnyResult) {
  return {
    toplamFm: Number(result[m.totalField]) || 0,
    sonNet: Number(result[m.netField]) || 0,
    rowCount: Array.isArray(result.rows) ? result.rows.length : 0,
  };
}

function base<T>(m: Omit<FmModule, "buildSaveData"> & { save: (form: T, r: AnyResult) => Record<string, unknown> }): FmModule {
  const { save, ...rest } = m;
  return { ...rest, buildSaveData: (form, result) => save(form as T, result) };
}

export const FM_MODULES: FmModule[] = [
  base({
    key: "standart",
    name: "Standart",
    rounded: false,
    totalField: "toplamFm",
    hakkaniyetField: "hakkaniyetIndirimi",
    netField: "sonNet",
    mahsupField: "mahsup",
    compute: (f) => computeStandartFmResultV3(f as never) as unknown as AnyResult,
    buildForm: () => ({
      ...emptyStandart(),
      iseGiris: ISE_GIRIS,
      istenCikis: ISTEN_CIKIS,
      davaciIn: "08:00",
      davaciOut: "20:00",
      weeklyDays: 6,
    }),
    save: (f: never, r) => buildStandartSaveData(f, r as never),
    mapFromBackend: (d) => mapStandartFormFromBackend(d) as unknown as AnyForm | null,
  }),
  base({
    key: "tanikli-standart",
    name: "Tanıklı Standart",
    rounded: false,
    totalField: "toplamFm",
    hakkaniyetField: "hakkaniyetOneri",
    netField: "mahsupSonrasiNet",
    mahsupField: "mahsup",
    compute: (f) => computeTanikliFmResultV3(f as never) as unknown as AnyResult,
    buildForm: () => ({
      ...emptyTanikli(),
      iseGiris: ISE_GIRIS,
      istenCikis: ISTEN_CIKIS,
      davaciIn: "08:00",
      davaciOut: "20:00",
      weeklyDays: 6,
      taniklar: [
        { id: "t1", name: "Tanık 1", dateIn: ISE_GIRIS, dateOut: ISTEN_CIKIS, in: "08:00", out: "20:00" },
      ],
    }),
    save: (f: never, r) => buildTanikliSaveData(f, fmSaveResult({ totalField: "toplamFm", netField: "mahsupSonrasiNet" }, r)),
    mapFromBackend: (d) => mapTanikliFormFromBackend(d) as unknown as AnyForm | null,
  }),
  base({
    key: "haftalik-karma",
    name: "Haftalık Karma",
    rounded: false,
    totalField: "toplamFm",
    hakkaniyetField: "hakkaniyetOneri",
    netField: "mahsupSonrasiNet",
    mahsupField: "mahsup",
    compute: (f) => computeHaftalikKarmaResultV3(f as never) as unknown as AnyResult,
    buildForm: () => ({
      ...createEmptyHaftalikKarmaForm(),
      iseGiris: ISE_GIRIS,
      istenCikis: ISTEN_CIKIS,
      dayGroups: [
        { id: "g1", dayCount: "3", startTime: "08:00", endTime: "20:00" },
        { id: "g2", dayCount: "3", startTime: "08:00", endTime: "19:00" },
      ],
      witnesses: [
        {
          id: "w1",
          name: "Tanık 1",
          startISO: ISE_GIRIS,
          endISO: ISTEN_CIKIS,
          dayGroups: [
            { id: "wg1", dayCount: "3", startTime: "08:00", endTime: "20:00" },
            { id: "wg2", dayCount: "3", startTime: "08:00", endTime: "19:00" },
          ],
        },
      ],
    }),
    save: (f: never, r) =>
      buildHaftalikKarmaSaveData(f, fmSaveResult({ totalField: "toplamFm", netField: "mahsupSonrasiNet" }, r)),
    mapFromBackend: (d) => mapHaftalikKarmaFormFromBackend(d) as unknown as AnyForm | null,
  }),
  base({
    key: "donemsel",
    name: "Dönemsel",
    rounded: false,
    totalField: "toplamFm",
    hakkaniyetField: "hakkaniyetOneri",
    netField: "mahsupSonrasiNet",
    mahsupField: "mahsup",
    compute: (f) => computeDonemselResultV3(f as never) as unknown as AnyResult,
    buildForm: () => {
      const empty = createEmptyDonemselForm();
      const summerPattern = { ...empty.summerPattern, startTime: "08:00", endTime: "21:00" };
      const winterPattern = { ...empty.winterPattern, startTime: "08:00", endTime: "19:00" };
      return {
        ...empty,
        dateIn: ISE_GIRIS,
        dateOut: ISTEN_CIKIS,
        summerPattern,
        winterPattern,
        witnessesSeasons: [
          { id: "w1", name: "Tanık 1", dateIn: ISE_GIRIS, dateOut: ISTEN_CIKIS, summerPattern, winterPattern },
        ],
      };
    },
    save: (f: never, r) =>
      buildDonemselSaveData(f, fmSaveResult({ totalField: "toplamFm", netField: "mahsupSonrasiNet" }, r)),
    mapFromBackend: (d) => mapDonemselFormFromBackend(d) as unknown as AnyForm | null,
  }),
  base({
    key: "donemsel-haftalik",
    name: "Dönemsel Haftalık",
    rounded: false,
    totalField: "toplamFm",
    hakkaniyetField: "hakkaniyetOneri",
    netField: "mahsupSonrasiNet",
    mahsupField: "mahsup",
    compute: (f) => computeDonemselHaftalikResultV3(f as never) as unknown as AnyResult,
    buildForm: () => {
      const empty = createEmptyDonemselHaftalikForm();
      const summerPattern = {
        ...empty.summerPattern,
        days1: "6",
        startTime: "08:00",
        endTime: "21:00",
      };
      const winterPattern = {
        ...empty.winterPattern,
        days1: "6",
        startTime: "08:00",
        endTime: "19:00",
      };
      return {
        ...empty,
        dateIn: ISE_GIRIS,
        dateOut: ISTEN_CIKIS,
        summerPattern,
        winterPattern,
        witnessesSeasons: [
          { id: "w1", name: "Tanık 1", dateIn: ISE_GIRIS, dateOut: ISTEN_CIKIS, summerPattern, winterPattern },
        ],
      };
    },
    save: (f: never, r) =>
      buildDonemselHaftalikSaveData(f, fmSaveResult({ totalField: "toplamFm", netField: "mahsupSonrasiNet" }, r)),
    mapFromBackend: (d) => mapDonemselHaftalikFormFromBackend(d) as unknown as AnyForm | null,
  }),
  base({
    key: "yeralti-isci",
    name: "Yeraltı İşçisi",
    rounded: true,
    totalField: "totalFm",
    hakkaniyetField: "hakkaniyetIndirimi",
    netField: "sonNet",
    mahsupField: "mahsup",
    compute: (f) => computeYeraltiResultV3(f as never) as unknown as AnyResult,
    buildForm: () => ({
      ...emptyYeralti(),
      davaciDateIn: ISE_GIRIS,
      davaciDateOut: ISTEN_CIKIS,
      davaciIn: "08:00",
      davaciOut: "18:00",
      weeklyDays: 6,
      witnesses: [
        { id: "w1", name: "Tanık 1", dateIn: ISE_GIRIS, dateOut: ISTEN_CIKIS, in: "08:00", out: "18:00" },
      ],
    }),
    save: (f: never, r) => buildYeraltiSaveData(f, fmSaveResult({ totalField: "totalFm", netField: "sonNet" }, r)),
    mapFromBackend: (d) => mapYeraltiFormFromBackend(d) as unknown as AnyForm | null,
  }),
  base({
    key: "vardiya-24",
    name: "Vardiya 24",
    rounded: false,
    totalField: "toplamFm",
    hakkaniyetField: "hakkaniyetIndirimi",
    netField: "sonNet",
    mahsupField: "mahsup",
    compute: (f) => computeVardiya24Result(f as never) as unknown as AnyResult,
    buildForm: () => ({
      ...emptyVardiya24(),
      iseGiris: ISE_GIRIS,
      istenCikis: ISTEN_CIKIS,
      taniklar: [{ id: "w1", name: "Tanık 1", dateIn: ISE_GIRIS, dateOut: ISTEN_CIKIS }],
    }),
    save: (f: never, r) => buildVardiya24SaveData(f, fmSaveResult({ totalField: "toplamFm", netField: "sonNet" }, r)),
    mapFromBackend: (d) => mapVardiya24FormFromBackend(d) as unknown as AnyForm | null,
  }),
  base({
    key: "vardiya-48",
    name: "Vardiya 48",
    rounded: false,
    totalField: "toplamFm",
    hakkaniyetField: "hakkaniyetIndirimi",
    netField: "sonNet",
    mahsupField: "mahsuplasmaMiktari",
    compute: (f) => computeVardiya48Result(f as never) as unknown as AnyResult,
    buildForm: () => ({
      ...emptyVardiya48(),
      iseGiris: ISE_GIRIS,
      istenCikis: ISTEN_CIKIS,
      taniklar: [{ id: "w1", name: "Tanık 1", dateIn: ISE_GIRIS, dateOut: ISTEN_CIKIS }],
    }),
    save: (f: never, r) => buildVardiya48SaveData(f, fmSaveResult({ totalField: "toplamFm", netField: "sonNet" }, r)),
    mapFromBackend: (d) => mapVardiya48FormFromBackend(d) as unknown as AnyForm | null,
  }),
  base({
    key: "gemi-adami-gunluk",
    name: "Gemi Adamı Günlük",
    rounded: false,
    totalField: "toplamFm",
    hakkaniyetField: "hakkaniyetIndirimi",
    netField: "sonNet",
    mahsupField: "mahsup",
    compute: (f) => computeGemiGunlukResult(f as never) as unknown as AnyResult,
    buildForm: () => ({
      ...emptyGemiGunluk(),
      iseGiris: ISE_GIRIS,
      istenCikis: ISTEN_CIKIS,
      davaciIn: "07:00",
      davaciOut: "20:00",
      weeklyDays: 6,
      witnesses: [
        { id: "w1", name: "Tanık 1", dateIn: ISE_GIRIS, dateOut: ISTEN_CIKIS, in: "07:00", out: "20:00" },
      ],
    }),
    save: (f: never, r) => buildGemiGunlukSaveData(f, fmSaveResult({ totalField: "toplamFm", netField: "sonNet" }, r)),
    mapFromBackend: (d) => mapGemiGunlukFormFromBackend(d) as unknown as AnyForm | null,
  }),
  base({
    key: "gemi-adami-7-24",
    name: "Gemi Adamı 7/24",
    rounded: true,
    totalField: "totalFm",
    hakkaniyetField: "hakkaniyetIndirimi",
    netField: "sonNet",
    mahsupField: "mahsup",
    compute: (f) => computeGemi724Result(f as never) as unknown as AnyResult,
    buildForm: () => ({
      ...emptyGemi724(),
      iseGiris: ISE_GIRIS,
      istenCikis: ISTEN_CIKIS,
      witnesses: [{ id: "w1", name: "Tanık 1", dateIn: ISE_GIRIS, dateOut: ISTEN_CIKIS }],
    }),
    save: (f: never, r) => buildGemi724SaveData(f, fmSaveResult({ totalField: "totalFm", netField: "sonNet" }, r)),
    mapFromBackend: (d) => mapGemi724FormFromBackend(d) as unknown as AnyForm | null,
  }),
];

/** Mahsup senaryoları: yok, kuruşlu tutar ve sonucu 0'a sabitleyen büyük tutar. */
export const MAHSUP_SCENARIOS = ["", "5.000,50", "99999999"] as const;

export function buildScenarioForm(m: FmModule, mahsup: string): AnyForm {
  return { ...m.buildForm(), [m.mahsupField]: mahsup };
}

/** Referans karşılaştırmasında kullanılan sonuç özeti (satır kimlikleri gibi rastgele alanlar hariç). */
export function summarizeResult(m: FmModule, result: AnyResult) {
  const rows = Array.isArray(result.rows) ? (result.rows as Array<Record<string, unknown>>) : [];
  return {
    total: result[m.totalField],
    hakkaniyet: result[m.hakkaniyetField],
    net: result[m.netField],
    mahsupTutari: result.mahsupTutari,
    sgk: result.sgk,
    issizlik: result.issizlik,
    gelirVergisi: result.gelirVergisi,
    damgaVergisi: result.damgaVergisi,
    netYillik: result.netYillik,
    rowCount: rows.length,
    rowFm: rows.map((r) => r.fm),
  };
}
