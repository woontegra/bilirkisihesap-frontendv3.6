import { DONEMSEL_HAFTALIK_CASES_KEY } from "./storage";
/**
 * V3 backend kayıt → Dönemsel Haftalık form eşlemesi.
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
  createEmptyDonemselHaftalikForm,
  EXCLUSION_TYPES,
  newLocalId,
  type ExclusionItem,
  type ExclusionType,
  type DonemselHaftalikFormSnapshot,
  type DonemselHaftalikWitness,
  type PeriodRow,
  type RowOverride,
  type SeasonalHaftalikPattern,
  type ZamanasimiInfo,
} from "./model";
import { toHtmlDateInputValue } from "./seasonalHours";

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
  const mapped: (ExclusionItem | null)[] = raw.map((row) => {
    const r = asRecord(row);
    if (!r) return null;
    const type = normalizeExclusionType(r.type) ?? ("Yıllık İzin" as ExclusionType);
    const start = toHtmlDateInputValue(str(r.start ?? r.startDate ?? r.date));
    if (!start) return null;
    const end = toHtmlDateInputValue(str(r.end ?? r.endDate ?? r.date)) || start;
    const daysValue = Number(r.days);
    const halfDay = Boolean(r.halfDay);
    const days = Number.isFinite(daysValue) && daysValue > 0 ? daysValue : halfDay ? 0.5 : 1;
    return { id: str(r.id) || newLocalId(), type, start, end, days };
  });
  return mapped.filter((x): x is ExclusionItem => x !== null);
}

function mapPattern(raw: unknown, fallback: SeasonalHaftalikPattern): SeasonalHaftalikPattern {
  const r = asRecord(raw);
  if (!r) return { ...fallback };
  const months = Array.isArray(r.months)
    ? (r.months as unknown[]).map(Number).filter((m) => m >= 1 && m <= 12)
    : fallback.months;
  const days1 =
    r.days1 === undefined || r.days1 === null || r.days1 === ""
      ? ""
      : String(Number.isFinite(Number(r.days1)) ? Math.floor(Number(r.days1)) : r.days1);
  const days2 =
    r.days2 === undefined || r.days2 === null || r.days2 === ""
      ? ""
      : String(Number.isFinite(Number(r.days2)) ? Math.floor(Number(r.days2)) : r.days2);
  const holidayRow = Number(r.weeklyHolidayRow) === 1 ? 1 : 2;
  const wh = Number(r.weeklyHolidayWeekday);
  return {
    months: months.length ? months : fallback.months,
    days1: days1 === "0" && Number(r.days1) !== 0 ? "" : days1,
    startTime: str(r.startTime ?? r.startTime1 ?? ""),
    endTime: str(r.endTime ?? r.endTime1 ?? ""),
    days2: days2 === "0" && Number(r.days2) !== 0 ? "" : days2,
    startTime2: str(r.startTime2 ?? ""),
    endTime2: str(r.endTime2 ?? ""),
    hasWeeklyHoliday: Boolean(r.hasWeeklyHoliday),
    weeklyHolidayRow: holidayRow as 1 | 2,
    weeklyHolidayWeekday: Number.isFinite(wh) && wh >= 0 && wh <= 6 ? Math.floor(wh) : 0,
  };
}

function mapWitnesses(raw: unknown): DonemselHaftalikWitness[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, idx) => {
    const r = asRecord(item) ?? {};
    const s = asRecord(r.summerPattern) ?? {};
    const w = asRecord(r.winterPattern) ?? {};
    return {
      id: str(r.id) || String(idx + 1),
      name: str(r.name) || `Tanık ${idx + 1}`,
      dateIn: toHtmlDateInputValue(str(r.dateIn ?? r.startDateISO ?? r.startISO ?? "")),
      dateOut: toHtmlDateInputValue(str(r.dateOut ?? r.endDateISO ?? r.endISO ?? "")),
      summerPattern: mapPattern(s, {
        ...createDefaultSummerPattern(),
        months: [6, 7, 8],
      }),
      winterPattern: mapPattern(w, {
        ...createDefaultWinterPattern(),
        months: [1, 2, 12],
      }),
    };
  });
}

function normalizeZamanasimi(raw: unknown): ZamanasimiInfo {
  const r = asRecord(raw);
  if (!r) return null;
  const nihai = toHtmlDateInputValue(str(r.nihaiBaslangic));
  if (!isValidIsoDate(nihai)) return null;
  return {
    davaTarihi: toHtmlDateInputValue(str(r.davaTarihi)),
    arabuluculukBaslangic: toHtmlDateInputValue(str(r.arabuluculukBaslangic)),
    arabuluculukBitis: toHtmlDateInputValue(str(r.arabuluculukBitis)),
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
      startISO: toHtmlDateInputValue(str(r.startISO)),
      endISO: toHtmlDateInputValue(str(r.endISO)),
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

export function mapDonemselHaftalikFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): DonemselHaftalikFormSnapshot {
  const empty = createEmptyDonemselHaftalikForm();
  try {
    const payload = unwrapData(data);
    const form = asRecord(payload.form) ?? asRecord(payload.formValues) ?? payload;
    const raw = form;
    const d =
      asRecord(raw.donemselState) ??
      asRecord(payload.donemselState) ??
      raw;

    return {
      dateIn: toHtmlDateInputValue(
        str(
          d.dateIn ??
            raw.dateIn ??
            raw.iseGiris ??
            record?.ise_giris ??
            "",
        ),
      ),
      dateOut: toHtmlDateInputValue(
        str(
          d.dateOut ??
            raw.dateOut ??
            raw.istenCikis ??
            record?.isten_cikis ??
            "",
        ),
      ),
      summerPattern: mapPattern(d.summerPattern ?? raw.summerPattern, createDefaultSummerPattern()),
      winterPattern: mapPattern(d.winterPattern ?? raw.winterPattern, createDefaultWinterPattern()),
      witnessesSeasons: mapWitnesses(
        d.witnessesSeasons ?? raw.witnessesSeasons ?? raw.witnesses ?? [],
      ),
      exclusions: normalizeExclusions(raw.exclusions ?? payload.exclusions),
      katSayi: str(raw.katSayi ?? raw.katsayi ?? payload.katSayi ?? "1") || "1",
      mode270:
        raw.mode270 === "simple" ||
        raw.mode270 === "detailed" ||
        payload.mode270 === "simple" ||
        payload.mode270 === "detailed"
          ? ((raw.mode270 ?? payload.mode270) as "simple" | "detailed")
          : "none",
      zamanasimi: normalizeZamanasimi(raw.zamanasimi ?? payload.zamanasimi),
      mahsup: str(raw.mahsup ?? raw.mahsuplasmaMiktari ?? payload.mahsuplasmaMiktari),
      notes: str(raw.notes),
      rowOverrides: normalizeRowOverrides(raw.rowOverrides ?? payload.rowOverrides),
      manualRows: normalizeManualRows(raw.manualRows ?? payload.manualRows),
    };
  } catch {
    return empty;
  }
}

export const DONEMSEL_HAFTALIK_FM_RECORD_TYPE = "donemsel_haftalik_fazla_mesai";

function isDonemselHaftalikFmRecordType(type: string | undefined): boolean {
  return type === DONEMSEL_HAFTALIK_FM_RECORD_TYPE;
}

function donemselHaftalikFormToState(form: DonemselHaftalikFormSnapshot) {
  return {
    dateIn: form.dateIn,
    dateOut: form.dateOut,
    summerPattern: form.summerPattern,
    winterPattern: form.winterPattern,
    witnessesSeasons: form.witnessesSeasons,
  };
}

export function buildDonemselHaftalikSaveData(
  form: DonemselHaftalikFormSnapshot,
  result: FmSaveResult,
): Record<string, unknown> {
  const donemselState = donemselHaftalikFormToState(form);
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

const donemselHaftalikCrud = createFmBackendCrud({
  recordType: DONEMSEL_HAFTALIK_FM_RECORD_TYPE,
  isRecordType: isDonemselHaftalikFmRecordType,
  mapFormFromBackend: mapDonemselHaftalikFormFromBackend,
  buildSaveData: buildDonemselHaftalikSaveData,
  localStorageKey: DONEMSEL_HAFTALIK_CASES_KEY,
});

export const listDonemselHaftalikFmCases = donemselHaftalikCrud.listCases;
export const loadDonemselHaftalikFmCase = donemselHaftalikCrud.loadCase;
export const saveDonemselHaftalikFmCase = donemselHaftalikCrud.saveCase;
export const removeDonemselHaftalikFmCase = donemselHaftalikCrud.removeCase;
