import { VARDIYA24_CASES_KEY } from "./storage";
/**
 * V3 backend kayıt → 24 Saat Vardiya form eşlemesi.
 * Fallback: form || formValues || data; inner = raw?.data?.form || raw
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import {
  buildFmBaseSavePayload,
  createFmBackendCrud,
  type FmSaveResult,
} from "../shared/fmBackendCrud";
import {
  createEmptyForm,
  createEmptyWitness,
  EXCLUSION_TYPES,
  newLocalId,
  type ExclusionItem,
  type ExclusionType,
  type Mode270,
  type PeriodRow,
  type RowOverride,
  type Vardiya24FormSnapshot,
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

function normalizeExclusionType(value: unknown): ExclusionType | null {
  const t = str(value).trim();
  if ((EXCLUSION_TYPES as readonly string[]).includes(t)) return t as ExclusionType;
  if (t === "Puantaj-Bordro") return "Puantaj/Bordro";
  return null;
}

function normalizeExclusions(raw: unknown): ExclusionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
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
    })
    .filter((x): x is ExclusionItem => x !== null);
}

function mapWitnesses(raw: unknown): Witness[] {
  if (!Array.isArray(raw) || raw.length === 0) return [createEmptyWitness()];
  const mapped = raw
    .map((row) => {
      const r = asRecord(row);
      if (!r) return null;
      return {
        id: str(r.id) || newLocalId(),
        name: str(r.name ?? ""),
        dateIn: normalizeDateInput(r.dateIn ?? r.start ?? r.startISO),
        dateOut: normalizeDateInput(r.dateOut ?? r.end ?? r.endISO),
      } satisfies Witness;
    })
    .filter((x): x is Witness => !!x);
  return mapped.length ? mapped : [createEmptyWitness()];
}

function mapZamanasimi(raw: unknown): ZamanasimiInfo {
  const r = asRecord(raw);
  if (!r) return null;
  const nihai = normalizeDateInput(r.nihaiBaslangic ?? r.nihai);
  if (!nihai) return null;
  return {
    davaTarihi: normalizeDateInput(r.davaTarihi ?? r.dava),
    arabuluculukBaslangic: normalizeDateInput(r.arabuluculukBaslangic ?? r.bas),
    arabuluculukBitis: normalizeDateInput(r.arabuluculukBitis ?? r.bit),
    nihaiBaslangic: nihai,
  };
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
      fmHours: o.fmHours != null ? Number(o.fmHours) : undefined,
      startISO: o.startISO != null ? normalizeDateInput(o.startISO) : undefined,
      endISO: o.endISO != null ? normalizeDateInput(o.endISO) : undefined,
      hidden: o.hidden === true ? true : undefined,
      brutManual: o.brutManual === true ? true : undefined,
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
    out.push({
      id: str(r.id) || newLocalId(),
      startISO: normalizeDateInput(r.startISO),
      endISO: normalizeDateInput(r.endISO),
      weeks: Number(r.weeks) || 0,
      brut: Number(r.brut) || 0,
      katsayi: Number(r.katsayi) || 1,
      fmHours: Number(r.fmHours) || 0,
      fm: Number(r.fm) || 0,
      weekTypeLabel: str(r.weekTypeLabel) || "-",
      note: str(r.note || r.yillikIzinAciklama) || undefined,
      yillikIzinAciklama: str(r.yillikIzinAciklama || r.note) || undefined,
      isManual: true,
      insertAfter: str(r.insertAfter) || undefined,
      isDeductionRow: Boolean(r.isDeductionRow),
    });
  }
  return out;
}

function normalizeMode270(value: unknown): Mode270 {
  const v = str(value);
  if (v === "simple" || v === "detailed") return v;
  return "none";
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function mapVardiya24FormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): Vardiya24FormSnapshot {
  try {
    const payload = unwrapData(data);
    const raw = asRecord(payload.form) ?? asRecord(payload.formValues) ?? payload;
    const inner = asRecord(asRecord(raw)?.data)?.form
      ? (asRecord(asRecord(raw)?.data)?.form as Record<string, unknown>)
      : (asRecord(asRecord(payload.data)?.form) ?? raw);

    const form = asRecord(inner) ?? {};
    const empty = createEmptyForm();

    const taniklarRaw = form.taniklar ?? form.witnessRanges ?? form.witnesses;
    const exclusionsRaw = form.exclusions ?? payload.exclusions;
    const zamanasimiRaw = form.zamanasimi ?? payload.zamanasimi;
    const rowOverridesRaw = form.rowOverrides ?? payload.rowOverrides ?? asRecord(raw)?.rowOverrides;
    const manualRowsRaw = form.manualRows ?? payload.manualRows;

    const anchor =
      form.anchorIsWorkDay === undefined
        ? true
        : Boolean(form.anchorIsWorkDay);

    return {
      ...empty,
      iseGiris: normalizeDateInput(
        form.iseGiris ?? form.iseGirisTarihi ?? form.startDate ?? record?.ise_giris,
      ),
      istenCikis: normalizeDateInput(
        form.istenCikis ?? form.istenCikisTarihi ?? form.endDate ?? record?.isten_cikis,
      ),
      anchorIsWorkDay: anchor,
      taniklar: mapWitnesses(taniklarRaw),
      exclusions: normalizeExclusions(exclusionsRaw),
      katSayi: str(form.katSayi ?? form.katsayi ?? "1") || "1",
      mode270: normalizeMode270(form.mode270 ?? payload.mode270),
      mahsup: str(form.mahsup ?? form.mahsuplasmaMiktari ?? payload.mahsuplasmaMiktari),
      notes: str(form.notes),
      zamanasimi: mapZamanasimi(zamanasimiRaw),
      rowOverrides: mapRowOverrides(rowOverridesRaw),
      manualRows: mapManualRows(manualRowsRaw),
    };
  } catch {
    return createEmptyForm();
  }
}

export const VARDIYA_24_FM_RECORD_TYPE = "fazla_mesai_vardiya_24";

function isVardiya24FmRecordType(type: string | undefined): boolean {
  return type === VARDIYA_24_FM_RECORD_TYPE;
}

export function buildVardiya24SaveData(
  form: Vardiya24FormSnapshot,
  result: FmSaveResult,
): Record<string, unknown> {
  const formForV3 = {
    ...form,
    vardiyaMode: "24",
    anchorIsWorkDay: form.anchorIsWorkDay,
    pageType: "vardiya-24",
    mahsuplasmaMiktari: form.mahsup,
    katSayi: form.katSayi,
  };
  return buildFmBaseSavePayload({
    form: formForV3,
    result,
    iseGiris: form.iseGiris,
    istenCikis: form.istenCikis,
    extra: {
      exclusions: form.exclusions,
      mode270: "none",
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

const vardiya24Crud = createFmBackendCrud({
  recordType: VARDIYA_24_FM_RECORD_TYPE,
  isRecordType: isVardiya24FmRecordType,
  mapFormFromBackend: mapVardiya24FormFromBackend,
  buildSaveData: buildVardiya24SaveData,
  localStorageKey: VARDIYA24_CASES_KEY,
});

export const listVardiya24FmCases = vardiya24Crud.listCases;
export const loadVardiya24FmCase = vardiya24Crud.loadCase;
export const saveVardiya24FmCase = vardiya24Crud.saveCase;
export const removeVardiya24FmCase = vardiya24Crud.removeCase;
