import { GEMI_GUNLUK_FM_CASES_KEY } from "./storage";
/**
 * V3 backend kayıt → Gemi Adamı Günlük form eşlemesi.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildFmBaseSavePayload,
  createFmBackendCrud,
  type FmSaveResult,
} from "../shared/fmBackendCrud";
import {
  EXCLUSION_TYPES,
  createEmptyForm,
  createEmptyWitness,
  newLocalId,
  type ExclusionItem,
  type ExclusionType,
  type GemiGunlukFormSnapshot,
  type Mode270,
  type PeriodRow,
  type RowOverride,
  type SevenDayMode,
  type Witness,
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
  const form = asRecord(payload.form);
  if (form) {
    const nested = asRecord(form.data);
    const nestedForm = nested ? asRecord(nested.form) : null;
    if (nestedForm) return nestedForm;
    return form;
  }
  return asRecord(payload.formValues) ?? payload;
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

function normalizeExclusionType(value: unknown): ExclusionType | null {
  const t = str(value).trim();
  if ((EXCLUSION_TYPES as readonly string[]).includes(t)) return t as ExclusionType;
  if (t === "Puantaj-Bordro") return "Puantaj/Bordro";
  if (t === "YILLIK_IZIN") return "Yıllık İzin";
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

function normalizeZamanasimi(raw: unknown): ZamanasimiInfo {
  const r = asRecord(raw);
  if (!r) return null;
  const nihai = normalizeDateInput(r.nihaiBaslangic);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nihai)) return null;
  return {
    davaTarihi: normalizeDateInput(r.davaTarihi),
    arabuluculukBaslangic: normalizeDateInput(r.arabuluculukBaslangic),
    arabuluculukBitis: normalizeDateInput(r.arabuluculukBitis),
    nihaiBaslangic: nihai,
  };
}

function mapWitnesses(raw: unknown): Witness[] {
  if (!Array.isArray(raw) || raw.length === 0) return [createEmptyWitness(1)];
  const mapped: Witness[] = [];
  for (const row of raw) {
    const r = asRecord(row);
    if (!r) continue;
    mapped.push({
      id: str(r.id) || newLocalId("w"),
      name: str(r.name),
      dateIn: normalizeDateInput(r.dateIn ?? r.startISO ?? r.start),
      dateOut: normalizeDateInput(r.dateOut ?? r.endISO ?? r.end),
      in: str(r.in ?? r.startTime),
      out: str(r.out ?? r.endTime),
      weeklyDays:
        r.weeklyDays === "" || r.weeklyDays == null
          ? undefined
          : Number.isFinite(Number(r.weeklyDays))
            ? Number(r.weeklyDays)
            : undefined,
      sevenDayMode: r.sevenDayMode === "tatilli" ? "tatilli" : undefined,
    });
  }
  return mapped.length > 0 ? mapped : [createEmptyWitness(1)];
}

function mapRowOverrides(raw: unknown): Record<string, RowOverride> {
  const r = asRecord(raw);
  if (!r) return {};
  const out: Record<string, RowOverride> = {};
  for (const [id, val] of Object.entries(r)) {
    const o = asRecord(val);
    if (!o) continue;
    out[id] = {
      weeks: o.weeks != null ? Number(o.weeks) : undefined,
      brut: o.brut != null ? Number(o.brut) : undefined,
      katsayi: o.katsayi != null ? Number(o.katsayi) : undefined,
      fmHours: o.fmHours != null ? Number(o.fmHours) : undefined,
      startISO: o.startISO != null ? normalizeDateInput(o.startISO) : undefined,
      endISO: o.endISO != null ? normalizeDateInput(o.endISO) : undefined,
      hidden: Boolean(o.hidden),
      brutManual: Boolean(o.brutManual),
    };
  }
  return out;
}

function mapManualRows(raw: unknown): PeriodRow[] {
  if (!Array.isArray(raw)) return [];
  const out: PeriodRow[] = [];
  for (const row of raw) {
    const r = asRecord(row);
    if (!r) continue;
    // V3 cetvel satırları `rows` içinde isManual olmadan gelir; yalnızca gerçek manuel satırlar.
    if (r.isManual === false) continue;
    out.push({
      id: str(r.id) || newLocalId("manual"),
      startISO: normalizeDateInput(r.startISO),
      endISO: normalizeDateInput(r.endISO),
      weeks: toNumberOr(r.weeks, 0),
      brut: toNumberOr(r.brut, 0),
      katsayi: toNumberOr(r.katsayi, 1),
      fmHours: toNumberOr(r.fmHours, 0),
      fm: toNumberOr(r.fm, 0),
      isManual: true,
      insertAfter: str(r.insertAfter) || undefined,
      note: str(r.note || r.yillikIzinAciklama) || undefined,
    });
  }
  return out;
}

function normalizeMode270(value: unknown): Mode270 {
  if (value === "simple" || value === "detailed") return value;
  return "none";
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function mapGemiGunlukFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): GemiGunlukFormSnapshot | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    const davaci = asRecord(form.davaci) ?? {};
    const activeTab = form.activeTab === "tatilli" ? "tatilli" : "tatilsiz";

    return {
      ...empty,
      iseGiris: normalizeDateInput(form.iseGiris ?? davaci.dateIn ?? record?.ise_giris),
      istenCikis: normalizeDateInput(form.istenCikis ?? davaci.dateOut ?? record?.isten_cikis),
      weeklyDays: toNumberOr(form.weeklyDays, 6),
      sevenDayMode: normalizeSevenDayMode(form.sevenDayMode ?? form.activeTab ?? activeTab),
      davaciIn: str(davaci.in ?? form.davaciIn),
      davaciOut: str(davaci.out ?? form.davaciOut),
      witnesses: mapWitnesses(form.taniklar ?? form.witnesses),
      exclusions: normalizeExclusions(form.exclusions ?? payload.exclusions),
      haftaTatiliGunu: normalizeHaftaTatiliGunu(form.haftaTatiliGunu),
      katSayi: str(form.katSayi ?? form.katsayi ?? "1") || "1",
      mode270: normalizeMode270(form.mode270),
      zamanasimi: normalizeZamanasimi(form.zamanasimi),
      mahsup: str(form.mahsup ?? form.mahsuplasmaMiktari),
      notes: str(form.notes),
      rowOverrides: mapRowOverrides(form.rowOverrides ?? payload.rowOverrides),
      manualRows: mapManualRows(form.manualRows),
    };
  } catch {
    return null;
  }
}

export const GEMI_GUNLUK_FM_RECORD_TYPE = "fazla_mesai_gemi_gunluk";

function isGemiGunlukFmRecordType(type: string | undefined): boolean {
  return type === GEMI_GUNLUK_FM_RECORD_TYPE;
}

export function buildGemiGunlukSaveData(
  form: GemiGunlukFormSnapshot,
  result: FmSaveResult,
): Record<string, unknown> {
  const formForV3 = {
    iseGiris: form.iseGiris,
    istenCikis: form.istenCikis,
    weeklyDays: form.weeklyDays,
    sevenDayMode: form.sevenDayMode,
    activeTab: form.sevenDayMode,
    haftaTatiliGunu: form.haftaTatiliGunu,
    davaci: {
      dateIn: form.iseGiris,
      dateOut: form.istenCikis,
      in: form.davaciIn,
      out: form.davaciOut,
    },
    davaciIn: form.davaciIn,
    davaciOut: form.davaciOut,
    taniklar: form.witnesses,
    mode270: form.mode270,
    katSayi: form.katSayi,
    mahsuplasmaMiktari: form.mahsup,
    zamanasimi: form.zamanasimi,
    exclusions: form.exclusions,
    rowOverrides: form.rowOverrides,
    manualRows: form.manualRows,
    notes: form.notes,
  };
  return buildFmBaseSavePayload({
    form: formForV3,
    result,
    iseGiris: form.iseGiris,
    istenCikis: form.istenCikis,
    extra: {
      exclusions: form.exclusions,
      mode270: form.mode270,
      katSayi: form.katSayi,
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

const gemiGunlukCrud = createFmBackendCrud({
  recordType: GEMI_GUNLUK_FM_RECORD_TYPE,
  isRecordType: isGemiGunlukFmRecordType,
  mapFormFromBackend: mapGemiGunlukFormFromBackend,
  buildSaveData: buildGemiGunlukSaveData,
  localStorageKey: GEMI_GUNLUK_FM_CASES_KEY,
});

export const listGemiGunlukFmCases = gemiGunlukCrud.listCases;
export const loadGemiGunlukFmCase = gemiGunlukCrud.loadCase;
export const saveGemiGunlukFmCase = gemiGunlukCrud.saveCase;
export const removeGemiGunlukFmCase = gemiGunlukCrud.removeCase;
