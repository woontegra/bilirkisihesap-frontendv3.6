/**
 * V3 API UBGT kayıt payload → V3.5 lokal UbgtForm.
 * Hesaplama yapmaz; yalnızca form alanlarını eşler.
 * Backend’e yazmaz.
 */
import {
  createEmptyForm,
  newLocalId,
  type PeriodOverride,
  type UbgtExcludedDayRow,
  type UbgtForm,
  type WitnessRow,
} from "./model";
import type { UbgtExclusionRule, UbgtHolidayType } from "./filterExcludedUbgtHolidays";
import type { UbgtMahsuplasamaMatrix } from "./mahsuplasama";
import { sumMahsuplasamaMatrix } from "./mahsuplasama";
import { formatMoney, parseCoef, parseNum } from "./engine";
import { manualPeriodsFromLegacy } from "./ubgtCetvelRows";

/** Minimal kayıt kimliği — @/api bağımlılığı olmadan test edilebilir. */
export type LegacySavedCaseRef = {
  id?: number | string;
  name?: string | null;
  kayit_adi?: string | null;
  type?: string;
  hesaplama_tipi?: string;
};

export type LegacyUbgtAdapterReport = {
  mode: "standart" | "bilirkisi";
  mappedFields: string[];
  skippedFields: string[];
  warnings: string[];
};

export type LegacyUbgtMappedCase = {
  form: UbgtForm;
  displayName: string;
  sourceCaseId: string;
  /** V3 results (yalnızca karşılaştırma / bilgi; hesap için kullanılmaz). */
  expected?: {
    brut?: number;
    net?: number;
    totalDays?: number;
  };
  report: LegacyUbgtAdapterReport;
};

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

/** V3: form | data.form | formValues | kök. */
function pickForm(payload: Record<string, unknown>): Record<string, unknown> {
  const direct = asRecord(payload.form);
  if (direct) return direct;
  const nestedData = asRecord(payload.data);
  const nestedForm = nestedData ? asRecord(nestedData.form) : null;
  if (nestedForm) return nestedForm;
  const formValues = asRecord(payload.formValues);
  if (formValues) return formValues;
  return payload;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** YYYY-MM-DD veya GG.AA.YYYY → YYYY-MM-DD (timezone kayması yok). */
export function normalizeDateInput(value: unknown): string {
  const v = str(value).trim();
  if (!v) return "";
  const iso = v.includes("T") ? v.split("T")[0]! : v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  if (iso.includes(".")) {
    const [gun, ay, yil] = iso.split(".");
    if (gun && ay && yil && yil.length === 4) {
      return `${yil}-${ay.padStart(2, "0")}-${gun.padStart(2, "0")}`;
    }
  }
  return iso;
}

function normalizeWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => Number(d))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
}

function normalizeExcludedDays(raw: unknown): UbgtExcludedDayRow[] {
  if (!Array.isArray(raw)) return [];
  const out: UbgtExcludedDayRow[] = [];
  for (const row of raw) {
    const r = asRecord(row);
    if (!r) continue;
    const start = normalizeDateInput(r.start ?? r.date);
    const end = normalizeDateInput(r.end ?? r.date) || start;
    if (!start) continue;
    const typeRaw = str(r.type);
    const type: UbgtExcludedDayRow["type"] =
      typeRaw === "Rapor" || typeRaw === "Diğer" || typeRaw === "Yıllık İzin" ? typeRaw : "Yıllık İzin";
    const days = Number(r.days);
    out.push({
      id: str(r.id) || newLocalId("ex"),
      type,
      start,
      end,
      days: Number.isFinite(days) && days > 0 ? days : 0,
    });
  }
  return out;
}

const KNOWN_HOLIDAY_TYPES = new Set<string>([
  "OCT_28_HALF",
  "OCT_29",
  "APR_23",
  "MAY_19",
  "AUG_30",
  "JAN_1",
  "MAY_1",
  "JUL_15",
  "RAMADAN_AREFE_HALF",
  "RAMADAN_1",
  "RAMADAN_2",
  "RAMADAN_3",
  "KURBAN_AREFE_HALF",
  "KURBAN_1",
  "KURBAN_2",
  "KURBAN_3",
  "KURBAN_4",
]);

function normalizeExclusionRules(raw: unknown, legacyTypes: unknown): UbgtExclusionRule[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((row) => {
        const r = asRecord(row);
        if (!r) return null;
        const startYear = Number(r.startYear);
        const endYear = Number(r.endYear);
        const types = Array.isArray(r.excludedHolidayTypes)
          ? (r.excludedHolidayTypes.filter((t) => KNOWN_HOLIDAY_TYPES.has(String(t))) as UbgtHolidayType[])
          : [];
        if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
        return { startYear, endYear, excludedHolidayTypes: types };
      })
      .filter((x): x is UbgtExclusionRule => x !== null);
  }
  // V3 legacy: excludedUbgtHolidays = UbgtHolidayType[]
  if (Array.isArray(legacyTypes) && legacyTypes.length > 0) {
    const types = legacyTypes.filter((t) => KNOWN_HOLIDAY_TYPES.has(String(t))) as UbgtHolidayType[];
    if (types.length > 0) {
      return [{ startYear: 2000, endYear: 2100, excludedHolidayTypes: types }];
    }
  }
  return [];
}

function normalizeMahsupMatrix(raw: unknown): UbgtMahsuplasamaMatrix {
  const r = asRecord(raw);
  if (!r) return {};
  const out: UbgtMahsuplasamaMatrix = {};
  for (const [yearKey, holidays] of Object.entries(r)) {
    const year = Number(yearKey);
    if (!Number.isFinite(year)) continue;
    const h = asRecord(holidays);
    if (!h) continue;
    const yearMap: Record<string, number> = {};
    for (const [name, amount] of Object.entries(h)) {
      const n = typeof amount === "number" ? amount : parseNum(String(amount));
      if (Number.isFinite(n) && n !== 0) yearMap[name] = n;
    }
    if (Object.keys(yearMap).length) out[year] = yearMap;
  }
  return out;
}

function formatSettleAmount(value: unknown, matrix: UbgtMahsuplasamaMatrix): string {
  const fromField = str(value).trim();
  if (fromField) {
    // Already TR formatted or plain number
    const n = parseNum(fromField);
    if (n > 0) return formatMoney(n);
    if (/[0-9]/.test(fromField)) return fromField.replace(/₺/g, "").trim();
  }
  const sum = sumMahsuplasamaMatrix(matrix);
  return sum > 0 ? formatMoney(sum) : "";
}

function coerceCoefString(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(4).replace(".", ",") : "1";
  }
  const s = str(value).trim();
  if (!s) return "1";
  // EN ondalık (1.5) → TR (1,5000); parseNum("1.5") yanlışlıkla 15 yapar
  if (/^\d+\.\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n.toFixed(4).replace(".", ",") : "1";
  }
  if (/^\d+,\d+$/.test(s) || /^\d+$/.test(s)) return s.includes(",") ? s : s;
  const n = parseCoef(s);
  return n.toFixed(4).replace(".", ",");
}

function mapPeriodOverrides(form: Record<string, unknown>): Record<string, PeriodOverride> {
  const out: Record<string, PeriodOverride> = {};
  const rowOv = asRecord(form.rowOverrides);
  if (rowOv) {
    const entries = Object.entries(rowOv);
    entries.forEach(([key, val], index) => {
      const r = asRecord(val);
      if (!r) return;
      const patch: PeriodOverride = {};
      if (r.wage != null && str(r.wage) !== "") {
        patch.wage = typeof r.wage === "number" ? formatMoney(r.wage) : str(r.wage);
        if (r.wageManual || r.manual) patch.wageManual = true;
      }
      if (r.coefficient != null && str(r.coefficient) !== "") {
        patch.coefficient = coerceCoefString(r.coefficient);
      }
      if (r.ubgtDays != null && str(r.ubgtDays) !== "") {
        patch.ubgtDays = coerceCoefString(r.ubgtDays);
      }
      if (Object.keys(patch).length === 0) return;
      const idxKey = /^\d+$/.test(key) ? key : String(index);
      out[idxKey] = { ...out[idxKey], ...patch };
    });
  }
  // periods[] — wage (manual) + any saved coefficient
  if (Array.isArray(form.periods)) {
    form.periods.forEach((p, i) => {
      const r = asRecord(p);
      if (!r) return;
      const patch: PeriodOverride = { ...(out[String(i)] ?? {}) };
      let touched = Object.keys(patch).length > 0;
      if ((r.manual || r.wageManual) && r.wage != null) {
        patch.wage = typeof r.wage === "number" ? formatMoney(Number(r.wage)) : str(r.wage);
        patch.wageManual = true;
        touched = true;
      }
      if (r.coefficient != null && str(r.coefficient) !== "") {
        patch.coefficient = coerceCoefString(r.coefficient);
        touched = true;
      }
      if (r.ubgtDays != null && str(r.ubgtDays) !== "" && (r.manual || r.ubgtDaysManual)) {
        patch.ubgtDays = coerceCoefString(r.ubgtDays);
        touched = true;
      }
      if (touched) out[String(i)] = patch;
    });
  }
  // V3 top-level katsayi → tüm dönem indekslerine uygula
  if (form.katsayi != null && str(form.katsayi) !== "") {
    const coefNum =
      typeof form.katsayi === "number" ? form.katsayi : parseCoef(String(form.katsayi));
    if (Number.isFinite(coefNum) && coefNum !== 1) {
      const coef = coerceCoefString(coefNum);
      const periodLen = Array.isArray(form.periods) ? form.periods.length : 0;
      const indices = new Set<string>(Object.keys(out));
      if (periodLen > 0) {
        for (let i = 0; i < periodLen; i++) indices.add(String(i));
      }
      if (indices.size === 0) indices.add("0");
      for (const k of indices) {
        out[k] = { ...out[k], coefficient: coef };
      }
    }
  }
  return out;
}

function pickExpected(payload: Record<string, unknown>, form: Record<string, unknown>): LegacyUbgtMappedCase["expected"] {
  const results = asRecord(payload.results) ?? asRecord(form.results) ?? {};
  const totals = asRecord(results.totals) ?? {};
  const netConv = asRecord(results.netConversion) ?? asRecord(form.netConversion) ?? {};
  const brut =
    Number(totals.brut ?? results.brut ?? netConv.brut ?? form.brut_total ?? payload.brut_total) || undefined;
  const net =
    Number(totals.net ?? results.net ?? netConv.net ?? form.net_total ?? payload.net_total) || undefined;
  const totalDays = Number(form.calculatedUbgtDays ?? results.totalDays) || undefined;
  if (brut == null && net == null && totalDays == null) return undefined;
  return { brut, net, totalDays };
}

export function resolveSavedCaseDisplayName(record: LegacySavedCaseRef): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function detectUbgtModeFromType(type: string | undefined | null): "standart" | "bilirkisi" | null {
  const t = String(type || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
  if (!t.includes("ubgt")) return null;
  if (t.includes("bilirkisi")) return "bilirkisi";
  return "standart";
}

export function mapLegacyStandardUbgtCase(
  data: unknown,
  record?: LegacySavedCaseRef,
): LegacyUbgtMappedCase | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const mappedFields: string[] = [];
    const skippedFields: string[] = [];
    const warnings: string[] = [];

    const empty = createEmptyForm("standart");

    const workerPeriods = form.workerPeriods ?? form.dateRanges;
    let dateRanges = empty.dateRanges;
    if (Array.isArray(workerPeriods) && workerPeriods.length > 0) {
      dateRanges = workerPeriods.map((row) => {
        const r = asRecord(row) ?? {};
        return {
          id: str(r.id) || newLocalId("range"),
          start: normalizeDateInput(r.start),
          end: normalizeDateInput(r.end),
        };
      });
      mappedFields.push("workerPeriods→dateRanges");
    } else {
      warnings.push("workerPeriods boş; varsayılan boş aralık kullanıldı");
    }

    const selectedHolidays = form.selectedHolidays ?? form.selectedHolidayIds;
    let selectedHolidayIds: string[] = [];
    if (Array.isArray(selectedHolidays)) {
      selectedHolidayIds = selectedHolidays.map(String);
      mappedFields.push("selectedHolidays→selectedHolidayIds");
    } else {
      skippedFields.push("selectedHolidays");
    }

    const excludedRaw = form.excludedDays ?? form.ubgtExcludedDays;
    const ubgtExcludedDays = normalizeExcludedDays(excludedRaw);
    if (Array.isArray(excludedRaw)) mappedFields.push("excludedDays→ubgtExcludedDays");

    const ubgtExclusionRules = normalizeExclusionRules(form.ubgtExclusionRules, form.excludedUbgtHolidays);
    if (ubgtExclusionRules.length) mappedFields.push("ubgtExclusionRules");

    const excludedWeekdays = normalizeWeekdays(form.excludedWeekdays);
    if (Array.isArray(form.excludedWeekdays)) mappedFields.push("excludedWeekdays");

    const zamanasimi = asRecord(form.zamanasimi);
    const ubgtExpiryStart =
      normalizeDateInput(zamanasimi?.start) ||
      normalizeDateInput(form.ubgtExpiryStart) ||
      "";
    if (ubgtExpiryStart) mappedFields.push("zamanasimi.start→ubgtExpiryStart");

    const settlement = asRecord(form.settlement) ?? {};
    const mahsuplasamaData = normalizeMahsupMatrix(settlement.mahsuplasamaData);
    if (Object.keys(mahsuplasamaData).length) mappedFields.push("settlement.mahsuplasamaData");
    const settleAmount = formatSettleAmount(settlement.settleAmount, mahsuplasamaData);
    if (settleAmount) mappedFields.push("settlement.settleAmount");

    const periodOverrides = mapPeriodOverrides(form);
    if (Object.keys(periodOverrides).length) mappedFields.push("rowOverrides/periods→periodOverrides");

    const manualPeriodRows = manualPeriodsFromLegacy(form.periods);
    if (manualPeriodRows.length) mappedFields.push("periods.manual→manualPeriodRows");

    if (form.excludedWeekdayHolidays != null) {
      skippedFields.push("excludedWeekdayHolidays (motor yeniden üretir)");
    }
    if (form.periods != null && manualPeriodRows.length === 0) {
      skippedFields.push("periods (lokal motor yeniden hesaplar)");
    } else if (form.periods != null) {
      skippedFields.push("periods.auto (lokal motor yeniden hesaplar)");
    }
    if (form.katsayi != null && str(form.katsayi) !== "" && parseNum(String(form.katsayi)) !== 1) {
      mappedFields.push("katsayi→periodOverrides.coefficient");
    }

    const yearFromRanges = dateRanges
      .map((r) => r.end)
      .filter(Boolean)
      .map((d) => Number(String(d).slice(0, 4)))
      .filter((y) => y >= 2010 && y <= 2100);
    const year =
      yearFromRanges.length > 0 ? Math.max(...yearFromRanges) : empty.year;

    const mapped: UbgtForm = {
      ...empty,
      mode: "standart",
      dateRanges,
      witnesses: [],
      selectedHolidayIds,
      ubgtExcludedDays,
      ubgtExclusionRules,
      ubgtExpiryStart,
      excludedWeekdays,
      year,
      settleAmount,
      mahsuplasamaData,
      periodOverrides,
      manualPeriodRows,
    };

    return {
      form: mapped,
      displayName: record ? resolveSavedCaseDisplayName(record) : "V3 UBGT",
      sourceCaseId: record?.id != null ? String(record.id) : "",
      expected: pickExpected(payload, form),
      report: { mode: "standart", mappedFields, skippedFields, warnings },
    };
  } catch (e) {
    console.error("[legacyUbgtCaseAdapter] standart map failed", e);
    return null;
  }
}

export function mapLegacyExpertUbgtCase(
  data: unknown,
  record?: LegacySavedCaseRef,
): LegacyUbgtMappedCase | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const mappedFields: string[] = [];
    const skippedFields: string[] = [];
    const warnings: string[] = [];

    const empty = createEmptyForm("bilirkisi");

    const davaciRaw = form.davaciDateRanges ?? form.workerPeriods;
    let dateRanges = empty.dateRanges;
    if (Array.isArray(davaciRaw) && davaciRaw.length > 0) {
      dateRanges = davaciRaw.map((row) => {
        const r = asRecord(row) ?? {};
        return {
          id: str(r.id) || newLocalId("range"),
          start: normalizeDateInput(r.start),
          end: normalizeDateInput(r.end),
          person: "Davacı",
          selectedHolidayIds: Array.isArray(r.selectedHolidayIds)
            ? r.selectedHolidayIds.map(String)
            : [],
        };
      });
      mappedFields.push("davaciDateRanges→dateRanges");
    } else {
      warnings.push("davaciDateRanges boş");
    }

    let witnesses: WitnessRow[] = empty.witnesses;
    if (Array.isArray(form.witnesses) && form.witnesses.length > 0) {
      witnesses = form.witnesses.map((w, idx) => {
        const r = asRecord(w) ?? {};
        const dr = asRecord(r.dateRange) ?? {};
        // Flat V3.5 local shape also accepted
        const start = normalizeDateInput(dr.start ?? r.start);
        const end = normalizeDateInput(dr.end ?? r.end);
        const selectedHolidayIds = Array.isArray(dr.selectedHolidayIds)
          ? dr.selectedHolidayIds.map(String)
          : Array.isArray(r.selectedHolidayIds)
            ? r.selectedHolidayIds.map(String)
            : [];
        return {
          id: str(r.id) || newLocalId("tanik"),
          name: str(r.name) || `Tanık ${idx + 1}`,
          start,
          end,
          selectedHolidayIds,
        };
      });
      mappedFields.push("witnesses");
    } else {
      warnings.push("witnesses boş; varsayılan tanık satırı");
    }

    const excludedRaw = form.ubgtExcludedDays ?? form.excludedDays;
    const ubgtExcludedDays = normalizeExcludedDays(excludedRaw);
    if (Array.isArray(excludedRaw)) mappedFields.push("ubgtExcludedDays");

    const ubgtExclusionRules = normalizeExclusionRules(form.ubgtExclusionRules, form.excludedUbgtHolidays);
    if (ubgtExclusionRules.length) mappedFields.push("ubgtExclusionRules");

    const excludedWeekdays = normalizeWeekdays(form.excludedWeekdays);
    if (Array.isArray(form.excludedWeekdays)) mappedFields.push("excludedWeekdays");

    const zamanasimi = asRecord(form.zamanasimi);
    const ubgtExpiryStart =
      normalizeDateInput(form.ubgtExpiryStart) ||
      normalizeDateInput(zamanasimi?.start) ||
      "";
    if (ubgtExpiryStart) mappedFields.push("ubgtExpiryStart");

    const settlement = asRecord(form.settlement) ?? {};
    const mahsuplasamaData = normalizeMahsupMatrix(settlement.mahsuplasamaData);
    if (Object.keys(mahsuplasamaData).length) mappedFields.push("settlement.mahsuplasamaData");
    const settleAmount = formatSettleAmount(settlement.settleAmount, mahsuplasamaData);
    if (settleAmount) mappedFields.push("settlement.settleAmount");

    const periodOverrides = mapPeriodOverrides(form);
    if (Object.keys(periodOverrides).length) mappedFields.push("periodOverrides");

    const manualPeriodRows = manualPeriodsFromLegacy(form.periods);
    if (manualPeriodRows.length) mappedFields.push("periods.manual→manualPeriodRows");

    if (form.periods != null && manualPeriodRows.length === 0) {
      skippedFields.push("periods (lokal motor yeniden hesaplar)");
    } else if (form.periods != null) {
      skippedFields.push("periods.auto (lokal motor yeniden hesaplar)");
    }
    if (form.katsayi != null && str(form.katsayi) !== "" && parseNum(String(form.katsayi)) !== 1) {
      mappedFields.push("katsayi→periodOverrides.coefficient");
    }
    if (form.selectedHolidays != null) {
      skippedFields.push("selectedHolidays (bilirkişi: per-range / tanık tatilleri kullanılır)");
    }

    const yearEnds = [
      ...dateRanges.map((r) => r.end),
      ...witnesses.map((w) => w.end),
    ]
      .filter(Boolean)
      .map((d) => Number(String(d).slice(0, 4)))
      .filter((y) => y >= 2010 && y <= 2100);
    const year = yearEnds.length > 0 ? Math.max(...yearEnds) : empty.year;

    const mapped: UbgtForm = {
      ...empty,
      mode: "bilirkisi",
      dateRanges,
      witnesses,
      selectedHolidayIds: [],
      ubgtExcludedDays,
      ubgtExclusionRules,
      ubgtExpiryStart,
      excludedWeekdays,
      year,
      settleAmount,
      mahsuplasamaData,
      periodOverrides,
      manualPeriodRows,
    };

    return {
      form: mapped,
      displayName: record ? resolveSavedCaseDisplayName(record) : "V3 Bilirkişi UBGT",
      sourceCaseId: record?.id != null ? String(record.id) : "",
      expected: pickExpected(payload, form),
      report: { mode: "bilirkisi", mappedFields, skippedFields, warnings },
    };
  } catch (e) {
    console.error("[legacyUbgtCaseAdapter] bilirkisi map failed", e);
    return null;
  }
}

/** type’a göre doğru mapper. */
export function mapLegacyUbgtCase(
  data: unknown,
  record?: LegacySavedCaseRef,
  forcedMode?: "standart" | "bilirkisi",
): LegacyUbgtMappedCase | null {
  const mode =
    forcedMode ??
    detectUbgtModeFromType(record?.type ?? record?.hesaplama_tipi) ??
    "standart";
  return mode === "bilirkisi"
    ? mapLegacyExpertUbgtCase(data, record)
    : mapLegacyStandardUbgtCase(data, record);
}
