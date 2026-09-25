import { YERALTI_FM_CASES_KEY } from "./storage";
/**
 * V3 backend kayıt → Yeraltı İşçisi Fazla Mesai form mapping.
 * Yalnızca form alanlarını doldurur; sonuçlar her zaman lokalde yeniden
 * hesaplanır (backend'den sonuç alınmaz). V3 JSON şeması, birden çok olası
 * sarmalamayla (data.form / formValues / kök) fallback okunur.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildFmBaseSavePayload,
  createFmBackendCrud,
  type FmSaveResult,
} from "../shared/fmBackendCrud";
import {
  EXCLUSION_TYPES,
  newLocalId,
  type ExclusionItem,
  type ExclusionType,
  type SevenDayMode,
  type Mode270,
  type WitnessInput,
  type YeraltiFormSnapshot,
  type ZamanasimiInfo,
} from "./model";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function unwrapData(data: unknown): Record<string, unknown> {
  let payload: unknown = data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return {};
    }
  }
  const root = asRecord(payload) ?? {};
  const nested = asRecord(root.data);
  return nested ?? root;
}

function pickForm(payload: Record<string, unknown>): Record<string, unknown> {
  const form = asRecord(payload.form) ?? asRecord(payload.formValues) ?? {};
  // V3 bazen data.form.data.form gibi ikinci kat sarmalama yapabilir.
  const inner = asRecord(form.form) ?? asRecord((asRecord(form.data) ?? {}).form);
  return inner ?? form;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function normalizeDateInput(value: unknown): string {
  const v = str(value).trim();
  if (!v) return "";
  const iso = v.includes("T") ? v.split("T")[0] : v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  if (iso.includes(".")) {
    const [gun, ay, yil] = iso.split(".");
    if (gun && ay && yil && yil.length === 4) {
      return `${yil}-${ay.padStart(2, "0")}-${gun.padStart(2, "0")}`;
    }
  }
  return iso;
}

function toNumberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSevenDayMode(value: unknown): SevenDayMode {
  return value === "tatilli" ? "tatilli" : "tatilsiz";
}

function normalizeHaftaTatiliGunu(value: unknown): number | "" {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 6 ? n : "";
}

function normalizeMode270(value: unknown): Mode270 {
  return value === "simple" || value === "detailed" ? value : "none";
}

function normalizeExclusionType(value: unknown): ExclusionType | null {
  return EXCLUSION_TYPES.includes(value as ExclusionType) ? (value as ExclusionType) : null;
}

function normalizeExclusions(raw: unknown): ExclusionItem[] {
  if (!Array.isArray(raw)) return [];
  const mapped: (ExclusionItem | null)[] = raw.map((row) => {
    const r = asRecord(row);
    if (!r) return null;
    const type = normalizeExclusionType(r.type) ?? "Yıllık İzin";
    const start = normalizeDateInput(r.start ?? r.startDate ?? r.date);
    if (!start) return null;
    const end = normalizeDateInput(r.end ?? r.endDate ?? r.date) || start;
    const daysValue = Number(r.days);
    const days = Number.isFinite(daysValue) && daysValue > 0 ? daysValue : 1;
    return { id: str(r.id) || newLocalId("ex"), type, start, end, days };
  });
  return mapped.filter((x): x is ExclusionItem => x !== null);
}

function normalizeWitnesses(raw: unknown): WitnessInput[] {
  if (!Array.isArray(raw)) return [];
  const mapped: (WitnessInput | null)[] = raw.map((row) => {
    const r = asRecord(row);
    if (!r) return null;
    const dateIn = normalizeDateInput(r.dateIn ?? r.startDate);
    const dateOut = normalizeDateInput(r.dateOut ?? r.endDate);
    const wd = r.weeklyDays;
    const weeklyDays = wd === "" || wd === null || wd === undefined ? "" : toNumberOr(wd, 0) || "";
    return {
      id: str(r.id) || newLocalId("w"),
      name: str(r.name),
      dateIn,
      dateOut,
      in: str(r.in),
      out: str(r.out),
      weeklyDays,
    };
  });
  return mapped.filter((x): x is WitnessInput => x !== null);
}

function normalizeZamanasimi(raw: unknown): ZamanasimiInfo {
  const r = asRecord(raw);
  if (!r) return null;
  const davaTarihi = normalizeDateInput(r.davaTarihi);
  const nihaiBaslangic = normalizeDateInput(r.nihaiBaslangic);
  if (!davaTarihi && !nihaiBaslangic) return null;
  return {
    davaTarihi,
    arabuluculukBaslangic: normalizeDateInput(r.arabuluculukBaslangic),
    arabuluculukBitis: normalizeDateInput(r.arabuluculukBitis),
    nihaiBaslangic,
  };
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function mapYeraltiFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): YeraltiFormSnapshot | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const davaci = asRecord(form.davaci) ?? {};

    const davaciDateIn = normalizeDateInput(form.iseGiris ?? davaci.dateIn ?? record?.ise_giris);
    const davaciDateOut = normalizeDateInput(form.istenCikis ?? davaci.dateOut ?? record?.isten_cikis);

    return {
      davaciDateIn,
      davaciDateOut,
      davaciIn: str(davaci.in ?? form.davaciIn),
      davaciOut: str(davaci.out ?? form.davaciOut),
      weeklyDays: Math.min(7, Math.max(1, Math.round(toNumberOr(form.weeklyDays, 6)))),
      sevenDayMode: normalizeSevenDayMode(form.activeTab ?? form.sevenDayMode),
      haftaTatiliGunu: normalizeHaftaTatiliGunu(form.haftaTatiliGunu),
      katsayi: str(form.katSayi ?? form.katsayi ?? "1") || "1",
      witnesses: normalizeWitnesses(form.taniklar ?? form.witnesses),
      exclusions: normalizeExclusions(form.exclusions),
      mode270: normalizeMode270(form.mode270),
      mahsup: str(form.mahsuplasmaMiktari ?? form.mahsup),
      notes: str(form.notes ?? form.notlar),
      zamanasimi: normalizeZamanasimi(form.zamanasimi),
      rowOverrides: {},
      manualRows: [],
    };
  } catch {
    return null;
  }
}

export const YERALTI_FM_RECORD_TYPE = "fazla_mesai_yeralti_isci";

function isYeraltiFmRecordType(type: string | undefined): boolean {
  return type === YERALTI_FM_RECORD_TYPE;
}

export function buildYeraltiSaveData(
  form: YeraltiFormSnapshot,
  result: FmSaveResult,
): Record<string, unknown> {
  const formForV3 = {
    iseGiris: form.davaciDateIn,
    istenCikis: form.davaciDateOut,
    davaci: {
      dateIn: form.davaciDateIn,
      dateOut: form.davaciDateOut,
      in: form.davaciIn,
      out: form.davaciOut,
    },
    weeklyDays: form.weeklyDays,
    activeTab: form.sevenDayMode,
    haftaTatiliGunu: form.haftaTatiliGunu,
    taniklar: form.witnesses,
    mode270: form.mode270,
    katSayi: form.katsayi,
    mahsuplasmaMiktari: form.mahsup,
    zamanasimi: form.zamanasimi,
    exclusions: form.exclusions,
    rowOverrides: form.rowOverrides,
    manualRows: form.manualRows,
    notes: form.notes,
    pageType: "yeralti-isci",
  };
  return buildFmBaseSavePayload({
    form: formForV3,
    result,
    iseGiris: form.davaciDateIn,
    istenCikis: form.davaciDateOut,
    extra: {
      exclusions: form.exclusions,
      mode270: form.mode270,
      katSayi: form.katsayi,
      mahsuplasmaMiktari: form.mahsup,
      rowOverrides: form.rowOverrides,
      manualRows: form.manualRows,
      data: {
        form: formForV3,
        results: { totalBrut: result.toplamFm, totalNet: result.sonNet },
      },
    },
  });
}

const yeraltiCrud = createFmBackendCrud({
  recordType: YERALTI_FM_RECORD_TYPE,
  isRecordType: isYeraltiFmRecordType,
  mapFormFromBackend: mapYeraltiFormFromBackend,
  buildSaveData: buildYeraltiSaveData,
  localStorageKey: YERALTI_FM_CASES_KEY,
});

export const listYeraltiFmCases = yeraltiCrud.listCases;
export const loadYeraltiFmCase = yeraltiCrud.loadCase;
export const saveYeraltiFmCase = yeraltiCrud.saveCase;
export const removeYeraltiFmCase = yeraltiCrud.removeCase;
