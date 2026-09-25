import { GEMI_724_FM_CASES_KEY } from "./storage";
/**
 * V3 backend kayıt → Gemi Adamı 7/24 form eşlemesi.
 * raw = form || formValues || payload
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildFmBaseSavePayload,
  createFmBackendCrud,
  type FmSaveResult,
} from "../shared/fmBackendCrud";
import {
  createEmptyForm,
  EXCLUSION_TYPES,
  newLocalId,
  type ExclusionItem,
  type ExclusionType,
  type Gemi724FormSnapshot,
  type PeriodRow,
  type RowOverride,
  type WitnessInput,
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
  if (t === "YILLIK_IZIN" || t === "Yillik Izin" || t === "Yillik İzin") return "Yıllık İzin";
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

function mapWitnesses(raw: unknown): WitnessInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const r = asRecord(row);
      if (!r) return null;
      return {
        id: str(r.id) || newLocalId(),
        name: str(r.name),
        dateIn: normalizeDateInput(r.dateIn ?? r.startISO ?? r.startDateISO ?? r.start),
        dateOut: normalizeDateInput(r.dateOut ?? r.endISO ?? r.endDateISO ?? r.end),
      } satisfies WitnessInput;
    })
    .filter((x): x is WitnessInput => !!x);
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
      katsayi: typeof v.katsayi === "number" ? v.katsayi : undefined,
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
      net: toNumberOr(r.net, 0),
      isDeductionRow: Boolean(r.isDeductionRow),
      isManual: true,
      insertAfter: typeof r.insertAfter === "string" ? r.insertAfter : undefined,
      yillikIzinAciklama: typeof r.yillikIzinAciklama === "string" ? r.yillikIzinAciklama : undefined,
      note: typeof r.note === "string" ? r.note : undefined,
    });
  }
  return out;
}

function normalizeMode270(raw: unknown, include270?: unknown): Gemi724FormSnapshot["mode270"] {
  if (raw === "simple" || raw === "detailed" || raw === "none") return raw;
  if (include270 === true || include270 === "true" || include270 === 1) {
    return raw === "detailed" ? "detailed" : "simple";
  }
  return "none";
}

function normalizeHaftaTatiliGunu(value: unknown): number | "" {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 6 ? n : "";
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

/**
 * V3 kayıt formatını okur: form || formValues || data; rows/rowOverrides fallback.
 */
export function mapGemi724FormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): Gemi724FormSnapshot {
  const empty = createEmptyForm();
  try {
    const payload = unwrapData(data);
    const form = asRecord(payload.form) ?? asRecord(payload.formValues) ?? payload;
    const raw = form;
    const davaci = asRecord(raw.davaci) ?? asRecord(payload.davaci);

    const iseGiris = normalizeDateInput(
      raw.iseGiris ??
        raw.davaciDateIn ??
        davaci?.dateIn ??
        raw.startDate ??
        record?.ise_giris,
    );
    const istenCikis = normalizeDateInput(
      raw.istenCikis ??
        raw.davaciDateOut ??
        davaci?.dateOut ??
        raw.endDate ??
        record?.isten_cikis,
    );

    let witnesses = mapWitnesses(raw.witnesses ?? raw.taniklar ?? payload.witnesses);
    if (witnesses.length === 0 && Array.isArray(raw.taniklar)) {
      witnesses = mapWitnesses(raw.taniklar);
    }
    if (witnesses.length === 0) {
      // boş bırak — V3'te tanık opsiyonel
    }

    const mode270 = normalizeMode270(raw.mode270 ?? payload.mode270, raw.include270 ?? payload.include270);

    return {
      iseGiris,
      istenCikis,
      katSayi: str(raw.katSayi ?? raw.katsayi ?? payload.katSayi ?? "1") || "1",
      witnesses: witnesses.length > 0 ? witnesses : [],
      exclusions: normalizeExclusions(raw.exclusions ?? payload.exclusions),
      mode270,
      zamanasimi: normalizeZamanasimi(raw.zamanasimi ?? payload.zamanasimi),
      mahsup: str(raw.mahsup ?? raw.mahsuplasmaMiktari ?? payload.mahsuplasmaMiktari),
      notes: str(raw.notes),
      rowOverrides: normalizeRowOverrides(raw.rowOverrides ?? payload.rowOverrides),
      manualRows: normalizeManualRows(raw.manualRows ?? payload.manualRows),
      haftaTatiliGunu: normalizeHaftaTatiliGunu(raw.haftaTatiliGunu ?? payload.haftaTatiliGunu),
    };
  } catch {
    return empty;
  }
}

/** Eski lokal kayıt (davaciDateIn / include270) → yeni şema. */
export function migrateLegacyLocalForm(raw: unknown): Gemi724FormSnapshot {
  const empty = createEmptyForm();
  const r = asRecord(raw);
  if (!r) return empty;
  if (typeof r.iseGiris === "string" || typeof r.istenCikis === "string") {
    return mapGemi724FormFromBackend({ form: r });
  }
  // Eski V3.5 lokal
  const include270 = Boolean(r.include270);
  const modeRaw = r.mode270;
  const mode270 =
    modeRaw === "simple" || modeRaw === "detailed"
      ? include270
        ? modeRaw
        : "none"
      : include270
        ? "simple"
        : "none";

  const exclusionsRaw = Array.isArray(r.exclusions) ? r.exclusions : [];
  const exclusions: ExclusionItem[] = [];
  for (const row of exclusionsRaw) {
    const e = asRecord(row);
    if (!e) continue;
    const t = str(e.type);
    const type: ExclusionType =
      t === "UBGT" ? "UBGT" : t === "YILLIK_IZIN" || t === "Yıllık İzin" ? "Yıllık İzin" : "Yıllık İzin";
    const start = normalizeDateInput(e.start);
    if (!start) continue;
    const end = normalizeDateInput(e.end) || start;
    exclusions.push({
      id: str(e.id) || newLocalId(),
      type,
      start,
      end,
      days: toNumberOr(e.days, 1),
    });
  }

  return {
    ...empty,
    iseGiris: normalizeDateInput(r.davaciDateIn ?? r.iseGiris),
    istenCikis: normalizeDateInput(r.davaciDateOut ?? r.istenCikis),
    katSayi: str(r.katsayi ?? r.katSayi ?? "1") || "1",
    witnesses: mapWitnesses(r.witnesses),
    exclusions,
    mode270: mode270 as Gemi724FormSnapshot["mode270"],
    mahsup: str(r.mahsup),
    notes: str(r.notes),
    zamanasimi: normalizeZamanasimi(r.zamanasimi),
    rowOverrides: normalizeRowOverrides(r.rowOverrides),
    manualRows: normalizeManualRows(r.manualRows),
    haftaTatiliGunu: "",
  };
}

export const GEMI_724_FM_RECORD_TYPE = "fazla_mesai_gemi_7_24";

function isGemi724FmRecordType(type: string | undefined): boolean {
  return type === GEMI_724_FM_RECORD_TYPE;
}

export function buildGemi724SaveData(
  form: Gemi724FormSnapshot,
  result: FmSaveResult,
): Record<string, unknown> {
  const formForV3 = {
    iseGiris: form.iseGiris,
    istenCikis: form.istenCikis,
    davaciDateIn: form.iseGiris,
    davaciDateOut: form.istenCikis,
    katSayi: form.katSayi,
    katsayi: form.katSayi,
    witnesses: form.witnesses,
    taniklar: form.witnesses,
    mode270: form.mode270,
    mahsuplasmaMiktari: form.mahsup,
    mahsup: form.mahsup,
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

const gemi724Crud = createFmBackendCrud({
  recordType: GEMI_724_FM_RECORD_TYPE,
  isRecordType: isGemi724FmRecordType,
  mapFormFromBackend: mapGemi724FormFromBackend,
  buildSaveData: buildGemi724SaveData,
  localStorageKey: GEMI_724_FM_CASES_KEY,
});

export const listGemi724FmCases = gemi724Crud.listCases;
export const loadGemi724FmCase = gemi724Crud.loadCase;
export const saveGemi724FmCase = gemi724Crud.saveCase;
export const removeGemi724FmCase = gemi724Crud.removeCase;
