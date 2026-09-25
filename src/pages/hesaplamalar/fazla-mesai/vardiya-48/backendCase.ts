import { VARDIYA48_CASES_KEY } from "./storage";
/**
 * V3.5 backend kayıt → 48 Saat Vardiya form mapping.
 * V3 JSON şeması (iseGiris / taniklar / katSayi / mahsuplasmaMiktari / zamanasimi) fallback ile okunur.
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
  newLocalId,
  type ExclusionItem,
  type ExclusionType,
  type Mode270,
  type PeriodRow,
  type RowOverride,
  type Vardiya48FormSnapshot,
  type Witness,
  type ZamanasimiInfo,
} from "./model";

const VALID_TYPES = new Set<string>(["UBGT", "Yıllık İzin", "Rapor", "Diğer", "Puantaj/Bordro", "Puantaj-Bordro"]);

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
  const deeper = nested ? asRecord(nested.form) ?? nested : null;
  return deeper ?? asRecord(root.form) ?? root;
}

function pickForm(payload: Record<string, unknown>): Record<string, unknown> {
  return asRecord(payload.form) ?? asRecord(payload.formValues) ?? payload;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeDateInput(value: unknown): string {
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

function mapWitnesses(raw: unknown): Witness[] {
  if (!Array.isArray(raw) || raw.length === 0) return [createEmptyWitness()];
  return raw.map((row) => {
    const r = asRecord(row) ?? {};
    return {
      id: str(r.id) || newLocalId(),
      name: str(r.name),
      dateIn: normalizeDateInput(r.dateIn ?? r.start ?? r.startISO),
      dateOut: normalizeDateInput(r.dateOut ?? r.end ?? r.endISO),
    };
  });
}

function mapExclusions(raw: unknown): ExclusionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const r = asRecord(row);
      if (!r) return null;
      let type = str(r.type);
      if (type === "Puantaj-Bordro") type = "Puantaj/Bordro";
      if (!VALID_TYPES.has(type)) return null;
      const start = normalizeDateInput(r.start ?? r.startDate);
      const end = normalizeDateInput(r.end ?? r.endDate);
      const rawDays = r.days ?? r.gun;
      const parsedDays =
        typeof rawDays === "string" ? parseFloat(String(rawDays).replace(",", ".")) : Number(rawDays);
      const days = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 1;
      return {
        id: str(r.id) || newLocalId(),
        type: type as ExclusionType,
        start,
        end,
        days,
      } satisfies ExclusionItem;
    })
    .filter((x): x is ExclusionItem => !!x && !!x.start && !!x.end);
}

function mapZamanasimi(raw: unknown): ZamanasimiInfo {
  const r = asRecord(raw);
  if (!r) return null;
  const nihai = normalizeDateInput(r.nihaiBaslangic);
  if (!nihai) return null;
  return {
    davaTarihi: normalizeDateInput(r.davaTarihi),
    arabuluculukBaslangic: normalizeDateInput(r.arabuluculukBaslangic),
    arabuluculukBitis: normalizeDateInput(r.arabuluculukBitis),
    nihaiBaslangic: nihai,
  };
}

function mapMode270(raw: unknown): Mode270 {
  const v = str(raw);
  if (v === "simple" || v === "detailed" || v === "none") return v;
  return "none";
}

function mapRowOverrides(raw: unknown): Record<string, RowOverride> {
  const r = asRecord(raw);
  if (!r) return {};
  const out: Record<string, RowOverride> = {};
  Object.entries(r).forEach(([id, val]) => {
    const o = asRecord(val);
    if (!o) return;
    out[id] = {
      weeks: typeof o.weeks === "number" ? o.weeks : undefined,
      brut: typeof o.brut === "number" ? o.brut : undefined,
      katsayi: typeof o.katsayi === "number" ? o.katsayi : undefined,
      fmHours: typeof o.fmHours === "number" ? o.fmHours : undefined,
      startISO: o.startISO != null ? normalizeDateInput(o.startISO) : undefined,
      endISO: o.endISO != null ? normalizeDateInput(o.endISO) : undefined,
      hidden: o.hidden === true,
      brutManual: o.brutManual === true,
    };
  });
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
    const insertAfter = str(r.insertAfter);
    out.push({
      id: str(r.id) || newLocalId(),
      isManual: true,
      insertAfter: insertAfter || undefined,
      startISO: normalizeDateInput(r.startISO),
      endISO: normalizeDateInput(r.endISO),
      weeks: Number(r.weeks) || 0,
      brut: Number(r.brut) || 0,
      katsayi: Number(r.katsayi) || 1,
      fmHours: Number(r.fmHours) || 0,
      fm: Number(r.fm) || 0,
      weekTypeLabel: str(r.weekTypeLabel) || undefined,
      yillikIzinAciklama: str(r.yillikIzinAciklama || r.note) || undefined,
    });
  }
  return out;
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function mapVardiya48FormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): Vardiya48FormSnapshot | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();
    const davaci = asRecord(form.davaci);

    return {
      ...empty,
      iseGiris: normalizeDateInput(
        form.iseGiris ?? form.iseGirisTarihi ?? davaci?.dateIn ?? record?.ise_giris,
      ),
      istenCikis: normalizeDateInput(
        form.istenCikis ?? form.istenCikisTarihi ?? davaci?.dateOut ?? record?.isten_cikis,
      ),
      anchorIsWorkDay: form.anchorIsWorkDay === undefined ? true : Boolean(form.anchorIsWorkDay),
      taniklar: mapWitnesses(form.taniklar ?? form.witnessRanges),
      exclusions: mapExclusions(form.exclusions ?? payload.exclusions),
      katSayi: str((form.katSayi ?? form.katsayi) || "1") || "1",
      mode270: mapMode270(form.mode270 ?? payload.mode270),
      zamanasimi: mapZamanasimi(form.zamanasimi),
      mahsuplasmaMiktari: str(form.mahsuplasmaMiktari ?? form.mahsup),
      notes: str(form.notes),
      rowOverrides: mapRowOverrides(form.rowOverrides ?? payload.rowOverrides),
      manualRows: mapManualRows(form.manualRows ?? payload.manualRows),
    };
  } catch {
    return null;
  }
}

export const VARDIYA_48_FM_RECORD_TYPE = "fazla_mesai_vardiya_48";

function isVardiya48FmRecordType(type: string | undefined): boolean {
  return type === VARDIYA_48_FM_RECORD_TYPE;
}

export function buildVardiya48SaveData(
  form: Vardiya48FormSnapshot,
  result: FmSaveResult,
): Record<string, unknown> {
  const formForV3 = {
    ...form,
    vardiyaMode: "48",
    anchorIsWorkDay: form.anchorIsWorkDay,
    pageType: "vardiya-48",
    mahsuplasmaMiktari: form.mahsuplasmaMiktari,
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
      mahsuplasmaMiktari: form.mahsuplasmaMiktari,
      rowOverrides: form.rowOverrides,
      manualRows: form.manualRows,
      data: {
        form: formForV3,
        results: { totalBrut: result.toplamFm, totalNet: result.sonNet },
      },
    },
  });
}

const vardiya48Crud = createFmBackendCrud({
  recordType: VARDIYA_48_FM_RECORD_TYPE,
  isRecordType: isVardiya48FmRecordType,
  mapFormFromBackend: mapVardiya48FormFromBackend,
  buildSaveData: buildVardiya48SaveData,
  localStorageKey: VARDIYA48_CASES_KEY,
});

export const listVardiya48FmCases = vardiya48Crud.listCases;
export const loadVardiya48FmCase = vardiya48Crud.loadCase;
export const saveVardiya48FmCase = vardiya48Crud.saveCase;
export const removeVardiya48FmCase = vardiya48Crud.removeCase;
