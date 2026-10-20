/**
 * Hafta Tatili (Standart, Gemi Adamı, Basın İş) ve UBGT (Standart, Bilirkişi) hakkaniyet oranı testleri için
 * ortak örnek formlar ve sayfa hesap akışının (hesap → önizleme → kayıt payload'ı) birebir tekrarı.
 * Birim, referans ve tarayıcı testleri bu dosyayı kullanır.
 */

import { createHash } from "node:crypto";
import type { PreviewSection } from "@/components/calculation-preview";
import type { CalcSaveResult } from "./calcBackendCrud";
import type { HaftaTatiliComputeResult } from "../hafta-tatili/lib/HaftaTatiliCalcPage";
import { computeStandardHaftaTatili } from "../hafta-tatili/standard/engine";
import { computeGemiHaftaTatili } from "../hafta-tatili/gemi/engine";
import { computeBasinHaftaTatili } from "../hafta-tatili/basin/engine";
import { createEmptyForm as createStandardHtForm, type StandardForm } from "../hafta-tatili/standard/model";
import { createEmptyForm as createGemiHtForm, type GemiForm } from "../hafta-tatili/gemi/model";
import { createEmptyForm as createBasinHtForm, type BasinForm } from "../hafta-tatili/basin/model";
import {
  buildHtStandartSaveResult,
  buildRowOverridesFromRows,
  mapHtStandartFormFromBackend,
} from "../hafta-tatili/standard/backendCase";
import { buildHtGemiSaveResult, mapHtGemiFormFromBackend } from "../hafta-tatili/gemi/backendCase";
import { buildHtBasinSaveResult, mapHtBasinFormFromBackend } from "../hafta-tatili/basin/backendCase";
import { buildStandartHtSaveData } from "../hafta-tatili/standard/buildStandartHtSaveData";
import { buildGemiHtSaveData } from "../hafta-tatili/gemi/buildGemiHtSaveData";
import { buildBasinHtSaveData } from "../hafta-tatili/basin/buildBasinHtSaveData";
import { buildStandartHtPreviewSections } from "../hafta-tatili/standard/buildStandartHtPreviewSections";
import { buildGemiHtPreviewSections } from "../hafta-tatili/gemi/buildGemiHtPreviewSections";
import { buildBasinHtPreviewSections } from "../hafta-tatili/basin/buildBasinHtPreviewSections";
import {
  buildTanikRanges,
  calcHakkaniyet,
  calcMahsupSonucuBilirkisi,
  calcMahsupSonucuStandart,
  collectDavaciHolidayIds,
  computeUbgt,
  deriveTaxYear,
  parseNum,
  type UbgtNetResult,
} from "../ubgt/engine";
import { createEmptyForm as createUbgtForm, type UbgtForm } from "../ubgt/model";
import { buildUbgtSaveResult, mapUbgtFormFromBackend } from "../ubgt/backendCase";
import { buildStandartUbgtSaveData } from "../ubgt/standart/buildStandartUbgtSaveData";
import { buildBilirkisiUbgtSaveData } from "../ubgt/bilirkisi/buildBilirkisiUbgtSaveData";
import { buildStandartUbgtPreviewSections } from "../ubgt/standart/buildStandartUbgtPreviewSections";
import { buildBilirkisiUbgtPreviewSections } from "../ubgt/bilirkisi/buildBilirkisiUbgtPreviewSections";
import { buildCetvelDisplayRows, sumCetvelTotals } from "../ubgt/ubgtCetvelRows";

export const MAHSUP_SCENARIOS = ["", "5.000,50", "99999999"] as const;

/** Sayfa hesabının hakkaniyet ile ilgili çıktıları (Hafta Tatili ve UBGT için ortak biçim). */
export type PageCalc = {
  brut: number;
  hakkaniyet: number;
  mahsupSonucu: number;
  net: { ssk: number; issizlik: number; gelirVergisi: number; damgaVergisi: number; netAmount: number };
  rowCount: number;
  totalDays: number;
  preview: PreviewSection[];
  saveData: Record<string, unknown>;
};

type AnyForm = Record<string, unknown> & { settleAmount: string };

export type HtUbgtModule = {
  key: "ht-standart" | "ht-gemi" | "ht-basin" | "ubgt-standart" | "ubgt-bilirkisi";
  name: string;
  kind: "ht" | "ubgt";
  route: string;
  recordType: string;
  /** Hakkaniyet ve mahsup sonucu round2 ile yuvarlanır mı (Hafta Tatili evet, UBGT hayır). */
  rounded: boolean;
  /** Sayfanın mahsup sonucu formülü. */
  mahsupFormula: "brut-hk-mahsup" | "net-hk";
  buildForm: (settleAmount: string) => AnyForm;
  calc: (form: AnyForm) => PageCalc;
  mapFromBackend: (data: unknown) => AnyForm | null;
};

const HT_DATE_RANGES = [{ id: "dr-1", start: "2019-01-01", end: "2021-12-31" }];
const HT_EXCLUDED = [
  { id: "ex-1", type: "Yıllık İzin" as const, start: "2020-07-01", end: "2020-07-14", days: 14 },
];

function htStandardForm(settleAmount: string): StandardForm {
  return {
    ...createStandardHtForm(),
    dateRanges: HT_DATE_RANGES.map((r) => ({ ...r })),
    excludedDays: HT_EXCLUDED.map((d) => ({ ...d })),
    kullanimBaslangic: "01.06",
    kullanimBitis: "30.09",
    kullanimGunSayisi: 3,
    settleAmount,
  };
}

function htGemiForm(settleAmount: string): GemiForm {
  return {
    ...createGemiHtForm(),
    dateRanges: HT_DATE_RANGES.map((r) => ({ ...r })),
    excludedDays: HT_EXCLUDED.map((d) => ({ ...d })),
    globalCoefficient: 1.25,
    settleAmount,
  };
}

function htBasinForm(settleAmount: string): BasinForm {
  return {
    ...createBasinHtForm(),
    dateRanges: HT_DATE_RANGES.map((r) => ({ ...r })),
    excludedDays: HT_EXCLUDED.map((d) => ({ ...d })),
    geceCalisan: true,
    settleAmount,
  };
}

type HtPreviewBuilder<F> = (opts: { form: F; result: never; daily50Header?: string }) => PreviewSection[];

/** HaftaTatiliCalcPage: compute → önizleme → buildSaveResult → buildSaveData akışı. */
function htCalc<F extends AnyForm>(
  form: F,
  compute: (f: F) => HaftaTatiliComputeResult,
  buildPreview: HtPreviewBuilder<F>,
  buildSaveResult: typeof buildHtStandartSaveResult,
  buildSaveData: (f: F, r: CalcSaveResult) => Record<string, unknown>,
  daily50Header: string,
): PageCalc {
  const result = compute(form);
  const saveResult = buildSaveResult({
    totalBrut: result.totalBrut,
    netAmount: result.net.netAmount,
    rows: result.rows,
    hakkaniyet: result.hakkaniyet,
    settleAmount: form.settleAmount,
    net: result.net,
    globalCoefficient: Number(form.globalCoefficient ?? 1),
    rowOverrides: buildRowOverridesFromRows(result.rows),
  });
  return {
    brut: result.totalBrut,
    hakkaniyet: result.hakkaniyet,
    mahsupSonucu: result.mahsupSonuc,
    net: result.net,
    rowCount: result.rows.length,
    totalDays: 0,
    preview: buildPreview({ form, result: result as never, daily50Header }),
    saveData: buildSaveData(form, saveResult),
  };
}

const UBGT_HOLIDAYS = [
  "1-ocak",
  "23-nisan",
  "1-mayis",
  "19-mayis",
  "15-temmuz",
  "30-agustos",
  "29-ekim",
  "ramazan-1",
  "ramazan-2",
  "kurban-1",
  "kurban-2",
  "kurban-3",
];

function ubgtStandartForm(settleAmount: string): UbgtForm {
  return {
    ...createUbgtForm("standart"),
    dateRanges: [{ id: "range-1", start: "2019-01-01", end: "2021-12-31" }],
    selectedHolidayIds: [...UBGT_HOLIDAYS],
    year: 2021,
    settleAmount,
  };
}

function ubgtBilirkisiForm(settleAmount: string): UbgtForm {
  return {
    ...createUbgtForm("bilirkisi"),
    dateRanges: [
      {
        id: "range-1",
        start: "2019-01-01",
        end: "2021-12-31",
        person: "Davacı",
        selectedHolidayIds: [...UBGT_HOLIDAYS],
      },
    ],
    witnesses: [
      {
        id: "tanik-1",
        name: "Tanık 1",
        start: "2019-06-01",
        end: "2021-12-31",
        selectedHolidayIds: ["1-ocak", "1-mayis", "29-ekim", "kurban-1", "kurban-2"],
      },
    ],
    year: 2021,
    settleAmount,
  };
}

/** UbgtCalcPage: computeRanges → computeUbgt → cetvel → net → hakkaniyet → mahsup → önizleme → kayıt. */
function ubgtCalc(form: UbgtForm): PageCalc {
  const mode = form.mode;
  const davaciHolidayIds = mode === "bilirkisi" ? collectDavaciHolidayIds(form.dateRanges) : [];
  const computeRanges =
    mode === "bilirkisi"
      ? buildTanikRanges(
          form.dateRanges
            .filter((r) => r.start && r.end)
            .map((r) => ({ start: r.start, end: r.end, selectedHolidayIds: r.selectedHolidayIds ?? [] })),
          form.witnesses.map((w) => ({
            id: w.id,
            name: w.name || "Tanık",
            start: w.start,
            end: w.end,
            selectedHolidayIds: w.selectedHolidayIds ?? [],
          })),
          davaciHolidayIds,
        ).map((t) => ({ start: t.start, end: t.end, person: t.person, selectedHolidayIds: t.selectedHolidayIds }))
      : form.dateRanges.filter((r) => r.start && r.end).map((r) => ({ start: r.start, end: r.end }));
  const taxYear =
    mode === "bilirkisi"
      ? deriveTaxYear([...form.dateRanges.map((r) => ({ end: r.end })), ...computeRanges.map((r) => ({ end: r.end }))])
      : deriveTaxYear(form.dateRanges);
  const result = computeUbgt({
    dateRanges: computeRanges,
    selectedHolidayIds: mode === "bilirkisi" ? [] : form.selectedHolidayIds,
    ubgtExcludedDays: form.ubgtExcludedDays,
    ubgtExpiryStart: form.ubgtExpiryStart || null,
    excludedWeekdays: form.excludedWeekdays,
    year: taxYear,
    periodOverrides: form.periodOverrides,
    ubgtExclusionRules: form.ubgtExclusionRules,
  });
  const displayCetvelRows = buildCetvelDisplayRows(
    result.periods,
    form.periodOverrides,
    form.manualPeriodRows,
    form.hiddenPeriodIds,
  );
  const totals = sumCetvelTotals(displayCetvelRows);
  const displayBrutForNet = totals.totalBrut;
  const effectiveNet: UbgtNetResult = result.toplamNet;
  const hakkaniyet = (calcHakkaniyet as (brut: number, oran?: unknown) => number)(
    displayBrutForNet,
    form.hakkaniyetOrani,
  );
  const settleNum = parseNum(form.settleAmount);
  const mahsupSonucu =
    mode === "bilirkisi"
      ? calcMahsupSonucuBilirkisi(displayBrutForNet, hakkaniyet, settleNum)
      : calcMahsupSonucuStandart(effectiveNet.netAmount, hakkaniyet);
  const preview =
    mode === "standart"
      ? buildStandartUbgtPreviewSections({
          form,
          displayPeriods: displayCetvelRows,
          displayTotalDays: totals.totalDays,
          displayBrutForNet,
          effectiveNet,
          hakkaniyet,
        })
      : buildBilirkisiUbgtPreviewSections({
          form,
          displayPeriods: displayCetvelRows,
          displayTotalDays: totals.totalDays,
          displayBrutForNet,
          effectiveNet,
          hakkaniyet,
          settleNum,
        });
  const baseSave = buildUbgtSaveResult({
    periods: displayCetvelRows,
    ubgtDayEntries: result.ubgtDayEntries,
    toplamBrut: displayBrutForNet,
    toplamNet: effectiveNet,
    totalDays: totals.totalDays,
  });
  const enrichedSave = {
    ...baseSave,
    v3Periods: displayCetvelRows,
    katsayi: 1,
    excludedWeekdayHolidays: result.excludedWeekdayHolidays ?? [],
    ubgtDayEntries: result.ubgtDayEntries,
    netConversion: {
      ...effectiveNet,
      brut: displayBrutForNet,
      hakkaniyet,
      settleAmount: mode === "bilirkisi" ? form.settleAmount : settleNum,
      gelir: effectiveNet.gelirVergisi,
      gelirDilimleri: effectiveNet.gelirVergisiDilimleri,
      damga: effectiveNet.damgaVergisi,
      net: effectiveNet.netAmount,
      ssk: effectiveNet.ssk + effectiveNet.issizlik,
    },
  };
  const saveData =
    mode === "standart"
      ? buildStandartUbgtSaveData({ ...form, mode }, enrichedSave)
      : buildBilirkisiUbgtSaveData({ ...form, mode }, enrichedSave);
  return {
    brut: displayBrutForNet,
    hakkaniyet,
    mahsupSonucu,
    net: effectiveNet,
    rowCount: displayCetvelRows.length,
    totalDays: totals.totalDays,
    preview,
    saveData,
  };
}

export const HT_UBGT_MODULES: HtUbgtModule[] = [
  {
    key: "ht-standart",
    name: "Hafta Tatili Standart",
    kind: "ht",
    route: "/hafta-tatili/standard",
    recordType: "hafta_tatili_standart",
    rounded: true,
    mahsupFormula: "brut-hk-mahsup",
    buildForm: (s) => htStandardForm(s) as unknown as AnyForm,
    calc: (f) =>
      htCalc(
        f as unknown as StandardForm & AnyForm,
        computeStandardHaftaTatili as never,
        buildStandartHtPreviewSections as never,
        buildHtStandartSaveResult,
        buildStandartHtSaveData as never,
        "Günlük %50 Zamlı",
      ),
    mapFromBackend: (d) => mapHtStandartFormFromBackend(d) as unknown as AnyForm | null,
  },
  {
    key: "ht-gemi",
    name: "Hafta Tatili Gemi Adamı",
    kind: "ht",
    route: "/hafta-tatili/gemi-adami",
    recordType: "hafta_tatili_gemi_adami",
    rounded: true,
    mahsupFormula: "brut-hk-mahsup",
    buildForm: (s) => htGemiForm(s) as unknown as AnyForm,
    calc: (f) =>
      htCalc(
        f as unknown as GemiForm & AnyForm,
        computeGemiHaftaTatili as never,
        buildGemiHtPreviewSections as never,
        buildHtGemiSaveResult,
        buildGemiHtSaveData as never,
        "Günlük %50 Zamlı",
      ),
    mapFromBackend: (d) => mapHtGemiFormFromBackend(d) as unknown as AnyForm | null,
  },
  {
    key: "ht-basin",
    name: "Hafta Tatili Basın İş",
    kind: "ht",
    route: "/hafta-tatili/basin-is",
    recordType: "hafta_tatili_basin_is",
    rounded: true,
    mahsupFormula: "brut-hk-mahsup",
    buildForm: (s) => htBasinForm(s) as unknown as AnyForm,
    calc: (f) =>
      htCalc(
        f as unknown as BasinForm & AnyForm,
        computeBasinHaftaTatili as never,
        buildBasinHtPreviewSections as never,
        buildHtBasinSaveResult,
        buildBasinHtSaveData as never,
        (f as unknown as BasinForm).geceCalisan ? "Günlük %50 Zamlı ×2" : "Günlük %50 Zamlı",
      ),
    mapFromBackend: (d) => mapHtBasinFormFromBackend(d) as unknown as AnyForm | null,
  },
  {
    key: "ubgt-standart",
    name: "UBGT Standart",
    kind: "ubgt",
    route: "/ubgt/alacagi",
    recordType: "ubgt_alacagi",
    rounded: false,
    mahsupFormula: "net-hk",
    buildForm: (s) => ubgtStandartForm(s) as unknown as AnyForm,
    calc: (f) => ubgtCalc(f as unknown as UbgtForm),
    mapFromBackend: (d) => mapUbgtFormFromBackend("standart", d) as unknown as AnyForm | null,
  },
  {
    key: "ubgt-bilirkisi",
    name: "UBGT Bilirkişi",
    kind: "ubgt",
    route: "/ubgt/bilirkisi",
    recordType: "ubgt_bilirkisi",
    rounded: false,
    mahsupFormula: "brut-hk-mahsup",
    buildForm: (s) => ubgtBilirkisiForm(s) as unknown as AnyForm,
    calc: (f) => ubgtCalc(f as unknown as UbgtForm),
    mapFromBackend: (d) => mapUbgtFormFromBackend("bilirkisi", d) as unknown as AnyForm | null,
  },
];

/** Kayıt payload'ındaki rastgele satır kimliklerini ve verilen anahtarları atar. */
export function stripKeys(value: unknown, keys: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => stripKeys(v, keys));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!keys.includes(k)) out[k] = stripKeys(v, keys);
  }
  return out;
}

export function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => containsKey(v, key));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([k, v]) => k === key || containsKey(v, key));
}

export function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Referans dosyasına yazılan özet: tutarlar, önizleme metinleri ve kayıt payload'ının özeti. */
export function summarizeCalc(calc: PageCalc, ignoreKeys: readonly string[] = []) {
  return {
    brut: calc.brut,
    hakkaniyet: calc.hakkaniyet,
    mahsupSonucu: calc.mahsupSonucu,
    net: {
      ssk: calc.net.ssk,
      issizlik: calc.net.issizlik,
      gelirVergisi: calc.net.gelirVergisi,
      damgaVergisi: calc.net.damgaVergisi,
      netAmount: calc.net.netAmount,
    },
    rowCount: calc.rowCount,
    totalDays: calc.totalDays,
    preview: calc.preview,
    saveHash: hashJson(stripKeys(calc.saveData, ["id", ...ignoreKeys])),
  };
}
