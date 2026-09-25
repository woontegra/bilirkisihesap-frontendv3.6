import { HAFTALIK_KARMA_CASES_KEY } from "./storage";
/**
 * V3 backend kayıt → Haftalık Karma form eşlemesi.
 * raw = form || formValues || payload; hk = raw.haftalikKarmaState || payload.haftalikKarmaState
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildFmBaseSavePayload,
  createFmBackendCrud,
  type FmSaveResult,
} from "../shared/fmBackendCrud";
import {
  createEmptyDayGroup,
  createEmptyHaftalikKarmaForm,
  createEmptyWitnessDayGroup,
  EXCLUSION_TYPES,
  newLocalId,
  type DayGroup,
  type ExclusionItem,
  type ExclusionType,
  type HaftalikKarmaFormSnapshot,
  type PeriodRow,
  type RowOverride,
  type Witness,
  type WitnessDayGroup,
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

function normalizeHaftaTatiliGunu(value: unknown): number | "" {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 6 ? n : "";
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
    const start = normalizeDateInput(r.start ?? r.startDate ?? r.date);
    if (!start) return null;
    const end = normalizeDateInput(r.end ?? r.endDate ?? r.date) || start;
    const daysValue = Number(r.days);
    const halfDay = Boolean(r.halfDay);
    const days = Number.isFinite(daysValue) && daysValue > 0 ? daysValue : halfDay ? 0.5 : 1;
    return { id: str(r.id) || newLocalId(), type, start, end, days };
  });
  return mapped.filter((x): x is ExclusionItem => x !== null);
}

function mapDayGroups(raw: unknown): DayGroup[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [createEmptyDayGroup(), createEmptyDayGroup()];
  }
  const groups = raw
    .map((row) => {
      const r = asRecord(row);
      if (!r) return null;
      const dayCountRaw = r.dayCount ?? r.days ?? "";
      const dayCount =
        dayCountRaw === 0 || dayCountRaw === "0" ? "0" : str(dayCountRaw) === "0" ? "0" : str(dayCountRaw);
      return {
        id: str(r.id) || newLocalId(),
        dayCount: dayCount === "" || dayCount === "0" ? (Number(dayCountRaw) === 0 ? "" : dayCount) : dayCount,
        startTime: str(r.startTime ?? r.start ?? ""),
        endTime: str(r.endTime ?? r.end ?? ""),
      } satisfies DayGroup;
    })
    .filter((x): x is DayGroup => !!x);

  // V3 kayıtlarda dayCount number 0 → boş string UI
  const normalized = groups.map((g) => ({
    ...g,
    dayCount: g.dayCount === "0" ? "" : g.dayCount,
  }));

  while (normalized.length < 2) normalized.push(createEmptyDayGroup());
  return normalized;
}

function mapWitnessDayGroups(raw: unknown, fallbackWitness?: Record<string, unknown>): WitnessDayGroup[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const first = asRecord(raw[0]);
    const hasGroupShape =
      !!first &&
      (first.days != null ||
        first.dayCount != null ||
        first.startTime != null ||
        first.endTime != null);

    if (hasGroupShape) {
      const mapped = raw
        .map((row) => {
          const r = asRecord(row);
          if (!r) return null;
          const dc = r.days ?? r.dayCount ?? "";
          return {
            id: str(r.id) || newLocalId(),
            dayCount: dc === 0 || dc === "0" ? "" : str(dc),
            startTime: str(r.startTime ?? "09:00"),
            endTime: str(r.endTime ?? "18:00"),
          } satisfies WitnessDayGroup;
        })
        .filter((x): x is WitnessDayGroup => !!x);
      if (mapped.length > 0) return mapped;
    }
  }

  // Eski format: düz startTime/endTime
  if (fallbackWitness) {
    return [
      {
        id: newLocalId(),
        dayCount: "6",
        startTime: str(fallbackWitness.startTime ?? "09:00"),
        endTime: str(fallbackWitness.endTime ?? "18:00"),
      },
    ];
  }
  return [createEmptyWitnessDayGroup()];
}

function mapWitnesses(raw: unknown): Witness[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const r = asRecord(row);
      if (!r) return null;
      return {
        id: str(r.id) || newLocalId(),
        name: str(r.name),
        startISO: normalizeDateInput(r.startISO ?? r.startDateISO ?? r.start),
        endISO: normalizeDateInput(r.endISO ?? r.endDateISO ?? r.end),
        dayGroups: mapWitnessDayGroups(r.dayGroups, r),
      } satisfies Witness;
    })
    .filter((x): x is Witness => !!x);
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

/**
 * V3 kayıt formatını okur; null dönmez — mümkün olan her alanı doldurur.
 */
export function mapHaftalikKarmaFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): HaftalikKarmaFormSnapshot {
  const empty = createEmptyHaftalikKarmaForm();
  try {
    const payload = unwrapData(data);
    const form = asRecord(payload.form) ?? asRecord(payload.formValues) ?? payload;
    const raw = form;
    const hk =
      asRecord(raw.haftalikKarmaState) ??
      asRecord(payload.haftalikKarmaState) ??
      {};

    const weeklyHolidayGroupRaw = hk.weeklyHolidayGroup ?? raw.weeklyHolidayGroup;
    let weeklyHolidayGroup = toNumberOr(weeklyHolidayGroupRaw, 1);
    if (weeklyHolidayGroup < 1) weeklyHolidayGroup = 1;

    return {
      iseGiris: normalizeDateInput(
        hk.weeklyStartDateISO ??
          raw.iseGiris ??
          raw.weeklyStartDateISO ??
          raw.startDate ??
          record?.ise_giris,
      ),
      istenCikis: normalizeDateInput(
        hk.weeklyEndDateISO ??
          raw.istenCikis ??
          raw.weeklyEndDateISO ??
          raw.endDate ??
          record?.isten_cikis,
      ),
      dayGroups: mapDayGroups(hk.dayGroups ?? raw.dayGroups),
      hasWeeklyHoliday: Boolean(hk.hasWeeklyHoliday ?? raw.hasWeeklyHoliday),
      weeklyHolidayGroup,
      witnesses: mapWitnesses(hk.witnesses ?? raw.witnesses),
      exclusions: normalizeExclusions(raw.exclusions ?? payload.exclusions),
      haftaTatiliGunu: normalizeHaftaTatiliGunu(raw.haftaTatiliGunu ?? payload.haftaTatiliGunu),
      katSayi: str(raw.katSayi ?? raw.katsayi ?? payload.katSayi ?? "1") || "1",
      mode270:
        raw.mode270 === "simple" || raw.mode270 === "detailed" || payload.mode270 === "simple" || payload.mode270 === "detailed"
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

export const HAFTALIK_KARMA_FM_RECORD_TYPE = "haftalik_karma_fazla_mesai";

function isHaftalikKarmaFmRecordType(type: string | undefined): boolean {
  return type === HAFTALIK_KARMA_FM_RECORD_TYPE;
}

export function buildHaftalikKarmaSaveData(
  form: HaftalikKarmaFormSnapshot,
  result: FmSaveResult,
): Record<string, unknown> {
  const haftalikKarmaState = {
    weeklyStartDateISO: form.iseGiris,
    weeklyEndDateISO: form.istenCikis,
    dayGroups: form.dayGroups,
    hasWeeklyHoliday: form.hasWeeklyHoliday,
    weeklyHolidayGroup: form.weeklyHolidayGroup,
    witnesses: form.witnesses,
  };
  const formForV3 = {
    haftalikKarmaState,
    katSayi: form.katSayi,
    mode270: form.mode270,
    mahsuplasmaMiktari: form.mahsup,
    zamanasimi: form.zamanasimi,
    exclusions: form.exclusions,
    manualRows: form.manualRows,
    rowOverrides: form.rowOverrides,
    haftaTatiliGunu: form.haftaTatiliGunu,
    notes: form.notes,
  };
  return buildFmBaseSavePayload({
    form: formForV3,
    result,
    iseGiris: form.iseGiris,
    istenCikis: form.istenCikis,
    extra: {
      haftalikKarmaState,
      exclusions: form.exclusions,
      mode270: form.mode270,
      katSayi: form.katSayi,
      mahsuplasmaMiktari: form.mahsup,
      manualRows: form.manualRows,
      rowOverrides: form.rowOverrides,
      haftaTatiliGunu: form.haftaTatiliGunu,
    },
  });
}

const haftalikKarmaCrud = createFmBackendCrud({
  recordType: HAFTALIK_KARMA_FM_RECORD_TYPE,
  isRecordType: isHaftalikKarmaFmRecordType,
  mapFormFromBackend: mapHaftalikKarmaFormFromBackend,
  buildSaveData: buildHaftalikKarmaSaveData,
  localStorageKey: HAFTALIK_KARMA_CASES_KEY,
});

export const listHaftalikKarmaFmCases = haftalikKarmaCrud.listCases;
export const loadHaftalikKarmaFmCase = haftalikKarmaCrud.loadCase;
export const saveHaftalikKarmaFmCase = haftalikKarmaCrud.saveCase;
export const removeHaftalikKarmaFmCase = haftalikKarmaCrud.removeCase;
