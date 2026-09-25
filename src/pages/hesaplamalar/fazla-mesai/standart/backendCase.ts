/**

 * V3 backend kayıt sözleşmesi ↔ Standart Fazla Mesai form mapping.

 * Kayıt/yükleme V3 `fazla_mesai_standart` tipi ve `kaydetServisi` payload yapısıyla uyumludur.

 */



import {

  createSavedCase,

  deleteSavedCase,

  getSavedCase,

  listSavedCases,

  updateSavedCase,

  type SavedCaseRecord,

} from "@/api/savedCases";

import {

  EXCLUSION_TYPES,

  createEmptyForm,

  newLocalId,

  type ExclusionItem,

  type ExclusionType,

  type PeriodRow,

  type RowOverride,

  type SevenDayMode,

  type StandartFormSnapshot,

  type StandartResult,

} from "./model";

import { computeStandartFmResult } from "./engine";



export const STANDART_FM_RECORD_TYPE = "fazla_mesai_standart";



export type SavedCaseListItem = {

  id: string;

  name: string;

  updatedAt: string;

  result: {

    toplamFm: number;

    sonNet: number;

    rowCount: number;

  };

};



function asRecord(value: unknown): Record<string, unknown> | null {

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return value as Record<string, unknown>;

}



export function unwrapData(data: unknown): Record<string, unknown> {

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



/** YYYY-MM-DD veya GG.AA.YYYY → YYYY-MM-DD */

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



function normalizeExclusionType(value: unknown): ExclusionType | null {

  return EXCLUSION_TYPES.includes(value as ExclusionType) ? (value as ExclusionType) : null;

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



function normalizeZamanasimi(raw: unknown): StandartFormSnapshot["zamanasimi"] {

  const r = asRecord(raw);

  if (!r) return null;

  const davaTarihi = normalizeDateInput(r.davaTarihi);

  if (!davaTarihi) return null;

  return {

    davaTarihi,

    arabuluculukBaslangic: normalizeDateInput(r.arabuluculukBaslangic),

    arabuluculukBitis: normalizeDateInput(r.arabuluculukBitis),

    nihaiBaslangic: normalizeDateInput(r.nihaiBaslangic),

  };

}



function normalizeRowOverrides(raw: unknown): Record<string, RowOverride> {

  const r = asRecord(raw);

  if (!r) return {};

  const out: Record<string, RowOverride> = {};

  for (const [id, value] of Object.entries(r)) {

    const o = asRecord(value);

    if (!o) continue;

    const ov: RowOverride = {};

    if (o.weeks !== undefined && Number.isFinite(Number(o.weeks))) ov.weeks = Number(o.weeks);

    if (o.brut !== undefined && Number.isFinite(Number(o.brut))) ov.brut = Number(o.brut);

    if (o.fmHours !== undefined && Number.isFinite(Number(o.fmHours))) ov.fmHours = Number(o.fmHours);

    if (o.startISO) ov.startISO = normalizeDateInput(o.startISO);

    if (o.endISO) ov.endISO = normalizeDateInput(o.endISO);

    if (o.hidden === true) ov.hidden = true;

    if (o.brutManual === true) ov.brutManual = true;

    if (Object.keys(ov).length > 0) out[id] = ov;

  }

  return out;

}



function normalizeManualRows(raw: unknown): PeriodRow[] {

  if (!Array.isArray(raw)) return [];

  const rows: PeriodRow[] = [];

  for (const item of raw) {

    const r = asRecord(item);

    if (!r) continue;

    const startISO = normalizeDateInput(r.startISO ?? r.start);

    const endISO = normalizeDateInput(r.endISO ?? r.end);

    rows.push({

      id: str(r.id) || newLocalId(),

      startISO,

      endISO,

      weeks: toNumberOr(r.weeks ?? r.weekCount, 0),

      brut: toNumberOr(r.brut ?? r.wage, 0),

      katsayi: toNumberOr(r.katsayi, 1),

      fmHours: toNumberOr(r.fmHours, 0),

      fm: toNumberOr(r.fm ?? r.overtimeAmount, 0),

      isDeductionRow: Boolean(r.isDeductionRow),

      note: r.note ? str(r.note) : undefined,

      isManual: true,

      insertAfter: r.insertAfter ? str(r.insertAfter) : undefined,

    });

  }

  return rows;

}



function normalizeKatSayi(value: unknown): string {

  if (value === null || value === undefined || value === "") return "1";

  const n = Number(value);

  if (Number.isFinite(n) && n > 0) {

    return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");

  }

  return str(value) || "1";

}



function normalizeMode270(value: unknown): StandartFormSnapshot["mode270"] {

  if (value === "simple" || value === "detailed") return value;

  return "none";

}



export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {

  const name = record.name ?? record.kayit_adi;

  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;

}



export function isStandartFmRecordType(type: unknown): boolean {

  const t = String(type ?? "").toLowerCase();

  return t === STANDART_FM_RECORD_TYPE || t === "fazla_mesai_standart";

}



/** V3 `handleSave` + `kaydetServisi` ile uyumlu payload. */

export function buildStandartSaveData(

  form: StandartFormSnapshot,

  result: StandartResult,

): Record<string, unknown> {

  const formForV3 = {

    ...form,

    davaci: { in: form.davaciIn, out: form.davaciOut },

    mahsuplasmaMiktari: form.mahsup,

  };



  return {

    form: formForV3,

    formValues: formForV3,

    exclusions: form.exclusions,

    rowOverrides: form.rowOverrides,

    manualRows: form.manualRows,

    mode270: form.mode270,

    katSayi: form.katSayi,

    mahsuplasmaMiktari: form.mahsup,

    brut_total: result.toplamFm,

    net_total: result.netYillik,

    ise_giris: form.iseGiris || null,

    isten_cikis: form.istenCikis || null,

    totals: { toplam: result.toplamFm },

    results: {

      totals: { toplam: result.toplamFm },

      brut: result.toplamFm,

      net: result.netYillik,

    },

  };

}



export function mapRecordToListItem(record: SavedCaseRecord): SavedCaseListItem {

  const payload = unwrapData(record.data);

  const brut =

    toNumberOr(payload.brut_total, 0) ||

    toNumberOr(asRecord(payload.results)?.brut, 0);

  const net =

    toNumberOr(payload.net_total, 0) ||

    toNumberOr(asRecord(payload.results)?.net, 0);

  return {

    id: String(record.id),

    name: resolveSavedCaseDisplayName(record),

    updatedAt: str(record.createdAt ?? record.created_at) || new Date().toISOString(),

    result: {

      toplamFm: brut,

      sonNet: net,

      rowCount: Array.isArray(asRecord(payload.form)?.manualRows) ? 0 : 0,

    },

  };

}



export async function listStandartFmCases(): Promise<SavedCaseListItem[]> {
  const { migrateLocalSavedCasesOnce } = await import("../../shared/localCasesMigration");
  const { STANDART_FM_CASES_KEY } = await import("./storage");
  await migrateLocalSavedCasesOnce({
    storageKey: STANDART_FM_CASES_KEY,
    recordType: STANDART_FM_RECORD_TYPE,
    buildData: (local) => {
      if (!local.form) return null;
      return {
        form: local.form,
        formValues: local.form,
        results: local.results ?? {},
      };
    },
  });
  const all = await listSavedCases();
  return all.filter((r) => isStandartFmRecordType(r.type ?? r.hesaplama_tipi)).map(mapRecordToListItem);
}



export async function saveStandartFmCase(

  name: string,

  form: StandartFormSnapshot,

  result: StandartResult,

  existingId?: string | null,

): Promise<SavedCaseRecord> {

  const data = buildStandartSaveData(form, result);

  const payload = { name: name.trim(), type: STANDART_FM_RECORD_TYPE, data };

  const numericId = existingId ? Number(existingId) : NaN;

  if (Number.isFinite(numericId) && numericId > 0) {

    return updateSavedCase(numericId, payload);

  }

  return createSavedCase(payload);

}



export async function removeStandartFmCase(id: string | number): Promise<void> {

  const numericId = Number(id);

  if (!Number.isFinite(numericId) || numericId <= 0) {

    throw new Error("Geçersiz kayıt kimliği");

  }

  await deleteSavedCase(numericId);

}



export function mapStandartFormFromBackend(

  data: unknown,

  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,

): StandartFormSnapshot | null {

  try {

    const payload = unwrapData(data);

    const form = pickForm(payload);

    const davaci = asRecord(form.davaci) ?? {};



    const exclusions =

      normalizeExclusions(payload.exclusions).length > 0

        ? normalizeExclusions(payload.exclusions)

        : normalizeExclusions(form.exclusions);



    const rowOverrides = {

      ...normalizeRowOverrides(form.rowOverrides),

      ...normalizeRowOverrides(payload.rowOverrides),

    };



    const manualRows =

      normalizeManualRows(payload.manualRows).length > 0

        ? normalizeManualRows(payload.manualRows)

        : normalizeManualRows(form.manualRows);



    const mode270 =

      normalizeMode270(payload.mode270) !== "none"

        ? normalizeMode270(payload.mode270)

        : normalizeMode270(form.mode270);



    return {

      iseGiris: normalizeDateInput(form.iseGiris ?? form.startDate ?? record?.ise_giris),

      istenCikis: normalizeDateInput(form.istenCikis ?? form.endDate ?? record?.isten_cikis),

      weeklyDays: toNumberOr(form.weeklyDays, 6),

      sevenDayMode: normalizeSevenDayMode(form.sevenDayMode),

      haftaTatiliGunu: normalizeHaftaTatiliGunu(form.haftaTatiliGunu),

      davaciIn: str(davaci.in ?? form.davaciIn),

      davaciOut: str(davaci.out ?? form.davaciOut),

      exclusions,

      katSayi: normalizeKatSayi(payload.katSayi ?? form.katSayi),

      mode270,

      mahsup: str(form.mahsup ?? form.mahsuplasmaMiktari ?? payload.mahsuplasmaMiktari),

      notes: str(form.notes),

      zamanasimi: normalizeZamanasimi(form.zamanasimi ?? payload.zamanasimi),

      rowOverrides,

      manualRows,

    };

  } catch {

    return null;

  }

}



export async function loadStandartFmCase(id: number): Promise<{

  record: SavedCaseRecord;

  form: StandartFormSnapshot;

}> {

  const record = await getSavedCase(id);

  const form = mapStandartFormFromBackend(record.data, record);

  if (!form) {

    throw new Error("Kayıt verisi okunamadı");

  }

  if (!isStandartFmRecordType(record.type ?? record.hesaplama_tipi)) {

    throw new Error(`Bu kayıt Standart Fazla Mesai değil (${record.type ?? record.hesaplama_tipi})`);

  }

  return { record, form };

}



/** Payload ↔ form round-trip (motor yeniden hesap = kayıt anı toplamı). */
export function runBackendCaseSelfTests(): { passed: number; failures: string[] } {

  const failures: string[] = [];

  let passed = 0;

  const check = (label: string, ok: boolean) => {

    if (ok) passed += 1;

    else failures.push(label);

  };



  const form = createEmptyForm();

  form.iseGiris = "2020-01-15";

  form.istenCikis = "2024-06-30";

  form.weeklyDays = 6;

  form.davaciIn = "08:00";

  form.davaciOut = "18:00";

  form.mode270 = "detailed";

  form.katSayi = "1,5";

  form.exclusions = [

    {

      id: newLocalId(),

      type: "UBGT",

      start: "2022-05-01",

      end: "2022-05-07",

      days: 7,

    },

  ];

  form.rowOverrides = { "row-test": { weeks: 10, fmHours: 5, brut: 25000 } };

  form.manualRows = [

    {

      id: "manual-1",

      startISO: "2023-01-01",

      endISO: "2023-06-30",

      weeks: 4,

      brut: 20000,

      katsayi: 1.5,

      fmHours: 8,

      fm: 1000,

      isDeductionRow: false,

      isManual: true,

      insertAfter: "x",

    },

  ];



  const result = computeStandartFmResult(form);

  const payload = buildStandartSaveData(form, result);

  check("payload.form", Boolean(payload.form && payload.formValues));

  check("payload.exclusions", Array.isArray(payload.exclusions) && (payload.exclusions as unknown[]).length === 1);

  check("payload.rowOverrides", Boolean((payload.rowOverrides as Record<string, unknown>)["row-test"]));

  check("payload.manualRows", Array.isArray(payload.manualRows) && (payload.manualRows as unknown[]).length === 1);

  check("payload.mode270", payload.mode270 === "detailed");

  check("payload.brut_total", Number(payload.brut_total) === result.toplamFm);



  const restored = mapStandartFormFromBackend(payload);

  check("restore non-null", restored !== null);

  if (restored) {

    check("restore dates", restored.iseGiris === form.iseGiris && restored.istenCikis === form.istenCikis);

    check("restore mode270", restored.mode270 === "detailed");

    check("restore exclusions", restored.exclusions.length === 1 && restored.exclusions[0].type === "UBGT");

    check("restore rowOverrides weeks", restored.rowOverrides["row-test"]?.weeks === 10);

    check("restore manualRows", restored.manualRows.length === 1 && restored.manualRows[0].id === "manual-1");

    const recalc = computeStandartFmResult(restored);

    check("recalc total parity", Math.abs(recalc.toplamFm - result.toplamFm) < 0.01);

  }



  return { passed, failures };

}


