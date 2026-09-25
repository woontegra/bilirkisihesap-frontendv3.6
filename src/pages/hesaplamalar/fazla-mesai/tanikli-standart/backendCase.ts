import { TANIKLI_FM_CASES_KEY } from "./storage";
/**
 * V3 backend kayıt → Tanıklı Standart form mapping.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildFmBaseSavePayload,
  createFmBackendCrud,
  type FmSaveResult,
} from "../shared/fmBackendCrud";
import {
  createEmptyWitness,
  EXCLUSION_TYPES,
  newLocalId,
  type ExclusionItem,
  type ExclusionType,
  type PeriodRow,
  type RowOverride,
  type SevenDayMode,
  type TanikliFormSnapshot,
  type Witness,
  type ZamanasimiInfo,
} from "./model";
import { isValidIsoDate } from "./engine";

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
  return asRecord(payload.form) ?? asRecord(payload.formValues) ?? {};
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

function normalizeWeeklyDaysOptional(value: unknown): number | "" {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 7 ? n : "";
}

function normalizeExclusionType(value: unknown): ExclusionType | null {
  const t = str(value).trim();
  if ((EXCLUSION_TYPES as readonly string[]).includes(t)) return t as ExclusionType;
  if (t === "Puantaj/Bordro") return "Puantaj-Bordro";
  return null;
}

function normalizeExclusions(raw: unknown): ExclusionItem[] {
  if (!Array.isArray(raw)) return [];
  const mapped: (ExclusionItem | null)[] = raw.map((row) => {
    const r = asRecord(row);
    if (!r) return null;
    const type = normalizeExclusionType(r.type);
    const start = normalizeDateInput(r.start ?? r.date);
    if (!type || !start) return null;
    const end = normalizeDateInput(r.end ?? r.date) || start;
    const daysValue = Number(r.days);
    const halfDay = Boolean(r.halfDay);
    const days = Number.isFinite(daysValue) && daysValue > 0 ? daysValue : halfDay ? 0.5 : 1;
    return { id: str(r.id) || newLocalId(), type, start, end, days };
  });
  return mapped.filter((x): x is ExclusionItem => x !== null);
}

function normalizeWitnesses(raw: unknown): Witness[] {
  if (!Array.isArray(raw) || raw.length === 0) return [createEmptyWitness()];
  const mapped: (Witness | null)[] = raw.map((row) => {
    const r = asRecord(row);
    if (!r) return null;
    return {
      id: str(r.id) || newLocalId(),
      name: str(r.name) || undefined,
      dateIn: normalizeDateInput(r.dateIn ?? r.start),
      dateOut: normalizeDateInput(r.dateOut ?? r.end),
      in: str(r.in),
      out: str(r.out),
      weeklyDays: normalizeWeeklyDaysOptional(r.weeklyDays),
    };
  });
  const list = mapped.filter((x): x is Witness => x !== null);
  return list.length > 0 ? list : [createEmptyWitness()];
}

function normalizeZamanasimi(raw: unknown): ZamanasimiInfo {
  const r = asRecord(raw);
  if (!r) return null;
  const nihai = normalizeDateInput(r.nihaiBaslangic);
  if (!isValidIsoDate(nihai)) return null;
  return {
    davaTarihi: normalizeDateInput(r.davaTarihi),
    arabuluculukBaslangic: normalizeDateInput(r.arabuluculukBaslangic),
    arabuluculukBitis: normalizeDateInput(r.arabuluculukBitis),
    nihaiBaslangic: nihai,
  };
}

function normalizeRowOverrides(raw: unknown): Record<string, RowOverride> {
  const r = asRecord(raw);
  if (!r) return {};
  const out: Record<string, RowOverride> = {};
  for (const [id, val] of Object.entries(r)) {
    const v = asRecord(val);
    if (!v) continue;
    out[id] = {
      weeks: typeof v.weeks === "number" ? v.weeks : undefined,
      brut: typeof v.brut === "number" ? v.brut : undefined,
      fmHours: typeof v.fmHours === "number" ? v.fmHours : undefined,
      startISO: typeof v.startISO === "string" ? v.startISO : undefined,
      endISO: typeof v.endISO === "string" ? v.endISO : undefined,
      hidden: typeof v.hidden === "boolean" ? v.hidden : undefined,
    };
  }
  return out;
}

function normalizeManualRows(raw: unknown): PeriodRow[] {
  if (!Array.isArray(raw)) return [];
  const out: PeriodRow[] = [];
  for (const row of raw) {
    const r = asRecord(row);
    if (!r) continue;
    out.push({
      id: str(r.id) || newLocalId(),
      startISO: normalizeDateInput(r.startISO),
      endISO: normalizeDateInput(r.endISO),
      weeks: toNumberOr(r.weeks, 0),
      brut: toNumberOr(r.brut, 0),
      katsayi: toNumberOr(r.katsayi, 1),
      fmHours: toNumberOr(r.fmHours, 0),
      fm: toNumberOr(r.fm, 0),
      isDeductionRow: Boolean(r.isDeductionRow),
      isManual: true,
      insertAfter: typeof r.insertAfter === "string" ? r.insertAfter : undefined,
      note: typeof r.note === "string" ? r.note : undefined,
    });
  }
  return out;
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function mapTanikliFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): TanikliFormSnapshot | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const davaci = asRecord(form.davaci) ?? {};

    return {
      iseGiris: normalizeDateInput(form.iseGiris ?? form.startDate ?? record?.ise_giris),
      istenCikis: normalizeDateInput(form.istenCikis ?? form.endDate ?? record?.isten_cikis),
      weeklyDays: toNumberOr(form.weeklyDays, 6),
      sevenDayMode: normalizeSevenDayMode(form.sevenDayMode ?? form.activeTab),
      haftaTatiliGunu: normalizeHaftaTatiliGunu(form.haftaTatiliGunu),
      davaciIn: str(davaci.in ?? form.davaciIn),
      davaciOut: str(davaci.out ?? form.davaciOut),
      taniklar: normalizeWitnesses(form.taniklar),
      exclusions: normalizeExclusions(form.exclusions),
      katSayi: str(form.katSayi ?? "1") || "1",
      mode270: form.mode270 === "simple" || form.mode270 === "detailed" ? form.mode270 : "none",
      mahsup: str(form.mahsup ?? form.mahsuplasmaMiktari),
      notes: str(form.notes),
      zamanasimi: normalizeZamanasimi(form.zamanasimi),
      rowOverrides: normalizeRowOverrides(form.rowOverrides ?? payload.rowOverrides),
      manualRows: normalizeManualRows(form.manualRows ?? payload.manualRows),
    };
  } catch {
    return null;
  }
}

export const TANIKLI_FM_RECORD_TYPE = "tanikli_standart_fazla_mesai";

function isTanikliFmRecordType(type: string | undefined): boolean {
  return type === TANIKLI_FM_RECORD_TYPE;
}

export function buildTanikliSaveData(
  form: TanikliFormSnapshot,
  result: FmSaveResult,
): Record<string, unknown> {
  const formForV3 = {
    iseGiris: form.iseGiris,
    istenCikis: form.istenCikis,
    weeklyDays: form.weeklyDays,
    sevenDayMode: form.sevenDayMode,
    haftaTatiliGunu: form.haftaTatiliGunu,
    davaci: {
      dateIn: form.iseGiris,
      dateOut: form.istenCikis,
      in: form.davaciIn,
      out: form.davaciOut,
    },
    davaciIn: form.davaciIn,
    davaciOut: form.davaciOut,
    taniklar: form.taniklar,
    mode270: form.mode270,
    katSayi: form.katSayi,
    mahsuplasmaMiktari: form.mahsup,
    zamanasimi: form.zamanasimi,
    exclusions: form.exclusions,
    rowOverrides: form.rowOverrides,
    manualRows: form.manualRows ?? [],
    notes: form.notes,
  };
  return buildFmBaseSavePayload({
    form: formForV3,
    result,
    iseGiris: form.iseGiris,
    istenCikis: form.istenCikis,
    extra: {
      exclusions: form.exclusions,
      rowOverrides: form.rowOverrides,
      manualRows: form.manualRows ?? [],
      mode270: form.mode270,
      katSayi: form.katSayi,
      mahsuplasmaMiktari: form.mahsup,
      data: {
        form: formForV3,
        results: { brut: result.toplamFm, net: result.sonNet },
      },
    },
  });
}

const tanikliCrud = createFmBackendCrud({
  recordType: TANIKLI_FM_RECORD_TYPE,
  isRecordType: isTanikliFmRecordType,
  mapFormFromBackend: mapTanikliFormFromBackend,
  buildSaveData: buildTanikliSaveData,
  localStorageKey: TANIKLI_FM_CASES_KEY,
});

export const listTanikliFmCases = tanikliCrud.listCases;
export const loadTanikliFmCase = tanikliCrud.loadCase;
export const saveTanikliFmCase = tanikliCrud.saveCase;
export const removeTanikliFmCase = tanikliCrud.removeCase;
