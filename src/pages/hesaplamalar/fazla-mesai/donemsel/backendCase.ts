import { DONEMSEL_CASES_KEY } from "./storage";
/**
 * V3 backend kayıt → Dönemsel form eşlemesi.
 * raw = form || formValues || payload; d = raw.donemselState || raw
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildFmBaseSavePayload,
  createFmBackendCrud,
  type FmSaveResult,
} from "../shared/fmBackendCrud";
import {
  createDefaultSummerPattern,
  createDefaultWinterPattern,
  EXCLUSION_TYPES,
  newLocalId,
  type DonemselFormSnapshot,
  type DonemselWitness,
  type ExclusionItem,
  type ExclusionType,
  type PeriodRow,
  type RowOverride,
  type SeasonalPattern,
  type SevenDayMode,
  type ZamanasimiInfo,
} from "./model";

function isValidIsoDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? "").trim());
}

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

function normalizeExclusionType(value: unknown): ExclusionType | null {
  const t = str(value).trim();
  if ((EXCLUSION_TYPES as readonly string[]).includes(t)) return t as ExclusionType;
  if (t === "Puantaj-Bordro") return "Puantaj/Bordro";
  return null;
}

function normalizeExclusions(raw: unknown): ExclusionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ExclusionItem[] = [];
  for (const row of raw) {
    const r = asRecord(row);
    if (!r) continue;
    const type = normalizeExclusionType(r.type) ?? ("Yıllık İzin" as ExclusionType);
    const start = normalizeDateInput(r.start ?? r.startDate ?? r.date ?? r.startISO);
    if (!start) continue;
    const end = normalizeDateInput(r.end ?? r.endDate ?? r.date ?? r.endISO) || start;
    const daysValue = Number(r.days);
    const halfDay = Boolean(r.halfDay);
    const days = Number.isFinite(daysValue) && daysValue > 0 ? daysValue : halfDay ? 0.5 : 1;
    out.push({ id: str(r.id) || newLocalId(), type, start, end, days });
  }
  return out;
}

/** Eski V3.5 deductions[] → ExclusionItem. */
function mapLegacyDeductions(raw: unknown): ExclusionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ExclusionItem[] = [];
  for (const row of raw) {
    const r = asRecord(row);
    if (!r) continue;
    const kind = str(r.kind);
    const type: ExclusionType = kind === "izin" ? "Yıllık İzin" : "UBGT";
    const start = normalizeDateInput(r.startISO ?? r.start);
    if (!start) continue;
    const end = normalizeDateInput(r.endISO ?? r.end) || start;
    out.push({ id: str(r.id) || newLocalId(), type, start, end, days: 1 });
  }
  return out;
}

function mapMonths(raw: unknown, fallback: number[]): number[] {
  if (!Array.isArray(raw)) return fallback;
  const months = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 12);
  return months.length > 0 ? months : fallback;
}

function mapPattern(raw: unknown, fallback: SeasonalPattern, legacyWeeklyDays?: number, legacyTab?: SevenDayMode): SeasonalPattern {
  const r = asRecord(raw);
  if (!r) {
    if (legacyWeeklyDays != null || legacyTab) {
      return {
        ...fallback,
        workDays: legacyWeeklyDays != null ? String(legacyWeeklyDays) : fallback.workDays,
        sevenDayMode: legacyTab ?? fallback.sevenDayMode,
      };
    }
    return fallback;
  }
  const sevenDayMode: SevenDayMode = r.sevenDayMode === "tatilli" ? "tatilli" : "tatilsiz";
  const weekday = Number(r.weeklyHolidayWeekday);
  const wdRaw = r.workDays ?? legacyWeeklyDays ?? fallback.workDays;
  const wdNum = Number(wdRaw);
  const workDays =
    Number.isFinite(wdNum) && wdNum >= 1 && wdNum <= 7
      ? String(Math.floor(wdNum))
      : str(wdRaw) || fallback.workDays;
  return {
    months: mapMonths(r.months, fallback.months),
    startTime: str(r.startTime ?? fallback.startTime),
    endTime: str(r.endTime ?? fallback.endTime),
    workDays,
    sevenDayMode: r.sevenDayMode != null ? sevenDayMode : legacyTab ?? fallback.sevenDayMode,
    weeklyHolidayWeekday:
      Number.isFinite(weekday) && weekday >= 0 && weekday <= 6 ? Math.floor(weekday) : fallback.weeklyHolidayWeekday,
  };
}

function mapWitnesses(raw: unknown): DonemselWitness[] {
  if (!Array.isArray(raw)) return [];
  const out: DonemselWitness[] = [];
  raw.forEach((row, idx) => {
    const r = asRecord(row);
    if (!r) return;
    out.push({
      id: str(r.id) || newLocalId(),
      name: str(r.name) || `Tanık ${idx + 1}`,
      dateIn: normalizeDateInput(r.dateIn ?? r.startISO ?? r.startDateISO ?? r.start),
      dateOut: normalizeDateInput(r.dateOut ?? r.endISO ?? r.endDateISO ?? r.end),
      summerPattern: mapPattern(r.summerPattern, createDefaultSummerPattern()),
      winterPattern: mapPattern(r.winterPattern, createDefaultWinterPattern()),
    });
  });
  return out;
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
      brutManual: typeof v.brutManual === "boolean" ? v.brutManual : undefined,
      originalWeekCount: typeof v.originalWeekCount === "number" ? v.originalWeekCount : undefined,
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
      yillikIzinAciklama: typeof r.yillikIzinAciklama === "string" ? r.yillikIzinAciklama : undefined,
    });
  }
  return out;
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function mapDonemselFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): DonemselFormSnapshot | null {
  try {
    const payload = unwrapData(data);
    const form =
      asRecord(payload.form) ?? asRecord(payload.formValues) ?? asRecord(payload) ?? {};
    const state =
      asRecord(form.donemselState) ??
      asRecord(payload.donemselState) ??
      form;

    const legacyWd =
      state.weeklyDays != null
        ? toNumberOr(state.weeklyDays, 6)
        : form.weeklyDays != null
          ? toNumberOr(form.weeklyDays, 6)
          : undefined;
    const legacyTab: SevenDayMode | undefined =
      state.activeTab === "tatilli" || form.activeTab === "tatilli"
        ? "tatilli"
        : state.activeTab === "tatilsiz" || form.activeTab === "tatilsiz"
          ? "tatilsiz"
          : undefined;

    const exclusionsFromForm = normalizeExclusions(form.exclusions ?? state.exclusions);
    const exclusions =
      exclusionsFromForm.length > 0
        ? exclusionsFromForm
        : mapLegacyDeductions(form.deductions ?? state.deductions);

    return {
      dateIn: normalizeDateInput(
        state.dateIn ?? form.dateIn ?? form.iseGiris ?? form.startDate ?? record?.ise_giris,
      ),
      dateOut: normalizeDateInput(
        state.dateOut ?? form.dateOut ?? form.istenCikis ?? form.endDate ?? record?.isten_cikis,
      ),
      summerPattern: mapPattern(
        state.summerPattern ?? form.summerPattern,
        createDefaultSummerPattern(),
        legacyWd,
        legacyTab,
      ),
      winterPattern: mapPattern(
        state.winterPattern ?? form.winterPattern,
        createDefaultWinterPattern(),
        legacyWd,
        legacyTab,
      ),
      witnessesSeasons: mapWitnesses(
        state.witnessesSeasons ?? form.witnessesSeasons ?? form.witnesses ?? state.witnesses,
      ),
      exclusions,
      katSayi: str(form.katSayi ?? form.katsayi ?? state.katSayi ?? "1") || "1",
      mode270:
        form.mode270 === "simple" || form.mode270 === "detailed" || state.mode270 === "simple" || state.mode270 === "detailed"
          ? ((form.mode270 ?? state.mode270) as "simple" | "detailed")
          : "none",
      zamanasimi: normalizeZamanasimi(form.zamanasimi ?? state.zamanasimi),
      mahsup: str(form.mahsup ?? form.mahsuplasmaMiktari ?? state.mahsuplasmaMiktari ?? ""),
      notes: str(form.notes ?? state.notes ?? ""),
      rowOverrides: normalizeRowOverrides(form.rowOverrides ?? state.rowOverrides ?? payload.rowOverrides),
      manualRows: normalizeManualRows(form.manualRows ?? state.manualRows ?? payload.manualRows),
    };
  } catch {
    return null;
  }
}

export const DONEMSEL_FM_RECORD_TYPE = "donemsel_fazla_mesai";

function isDonemselFmRecordType(type: string | undefined): boolean {
  return type === DONEMSEL_FM_RECORD_TYPE;
}

function donemselFormToState(form: DonemselFormSnapshot) {
  return {
    dateIn: form.dateIn,
    dateOut: form.dateOut,
    summerPattern: form.summerPattern,
    winterPattern: form.winterPattern,
    witnessesSeasons: form.witnessesSeasons,
  };
}

export function buildDonemselSaveData(
  form: DonemselFormSnapshot,
  result: FmSaveResult,
): Record<string, unknown> {
  const donemselState = donemselFormToState(form);
  const formForV3 = {
    donemselState,
    katSayi: form.katSayi,
    mode270: form.mode270,
    mahsuplasmaMiktari: form.mahsup,
    zamanasimi: form.zamanasimi,
    exclusions: form.exclusions,
    manualRows: form.manualRows,
    rowOverrides: form.rowOverrides,
    notes: form.notes,
  };
  return buildFmBaseSavePayload({
    form: formForV3,
    result,
    iseGiris: form.dateIn,
    istenCikis: form.dateOut,
    extra: {
      donemselState,
      exclusions: form.exclusions,
      mode270: form.mode270,
      katSayi: form.katSayi,
      mahsuplasmaMiktari: form.mahsup,
      manualRows: form.manualRows,
      rowOverrides: form.rowOverrides,
    },
  });
}

const donemselCrud = createFmBackendCrud({
  recordType: DONEMSEL_FM_RECORD_TYPE,
  isRecordType: isDonemselFmRecordType,
  mapFormFromBackend: mapDonemselFormFromBackend,
  buildSaveData: buildDonemselSaveData,
  localStorageKey: DONEMSEL_CASES_KEY,
});

export const listDonemselFmCases = donemselCrud.listCases;
export const loadDonemselFmCase = donemselCrud.loadCase;
export const saveDonemselFmCase = donemselCrud.saveCase;
export const removeDonemselFmCase = donemselCrud.removeCase;
