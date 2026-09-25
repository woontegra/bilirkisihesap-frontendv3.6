import { IS_KANUNU_CASES_KEY } from "./storage";
/**
 * V3 backend kayıt → İş Kanunu kıdem form mapping.
 * Yalnızca form alanlarını doldurur; sonuçları backend'den almaz.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import { unwrapCalcData, type CalcSaveResult } from "../../shared/calcBackendCrud";
import { createKidemCrud, KIDEM_30ISCI_TYPE } from "../shared/kidemCaseCrud";
import { formatKidemMoneyFields } from "../shared/formatKidemMoneyFields";
import { newLocalId, type ExtraItem, type IsKanunuFormSnapshot, type SavedCase } from "./model";

export { KIDEM_30ISCI_TYPE };

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

function mapExtras(raw: unknown): ExtraItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const r = asRecord(row);
      if (!r) return null;
      return {
        id: str(r.id) || newLocalId(),
        name: str(r.name ?? r.label),
        value: r.value === null || r.value === undefined ? "" : String(r.value),
      } satisfies ExtraItem;
    })
    .filter((x): x is ExtraItem => !!x);
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export const isKanunuCaseCrud = createKidemCrud(KIDEM_30ISCI_TYPE, mapIsKanunuFormFromBackend, IS_KANUNU_CASES_KEY);

export function mapIsKanunuRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapIsKanunuFormFromBackend(record.data, record);
  if (!form) return null;
  const payload = unwrapCalcData(record.data);
  const results = payload.results as Record<string, unknown> | undefined;
  const brutKidem = Number(payload.brut_total ?? results?.brut ?? results?.brutKidem ?? 0);
  const netKidem = Number(payload.net_total ?? results?.net ?? results?.netKidem ?? 0);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    form,
    result: {
      brutKidem: Number.isFinite(brutKidem) ? brutKidem : 0,
      netKidem: Number.isFinite(netKidem) ? netKidem : 0,
      durationLabel: String(results?.durationLabel ?? ""),
    },
  };
}

export function buildIsKanunuSaveResult(result: {
  brutKidem: number;
  netKidem: number;
  durationLabel: string;
}): CalcSaveResult {
  return {
    brut: result.brutKidem,
    net: result.netKidem,
    durationLabel: result.durationLabel,
    brutKidem: result.brutKidem,
    netKidem: result.netKidem,
  };
}

export function mapIsKanunuFormFromBackend(
  data: unknown,
  record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
): IsKanunuFormSnapshot | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const iseGirisTarihi = normalizeDateInput(
      form.startDate ?? form.iseGiris ?? form.iseGirisTarihi ?? record?.ise_giris,
    );
    const istenCikisTarihi = normalizeDateInput(
      form.endDate ?? form.exitDate ?? form.istenCikis ?? form.istenCikisTarihi ?? record?.isten_cikis,
    );

    return formatKidemMoneyFields({
      iseGirisTarihi,
      istenCikisTarihi,
      ciplakBrut: str(form.brutUcret ?? form.brut ?? form.ciplakBrut),
      prim: str(form.prim),
      ikramiye: str(form.ikramiye),
      yol: str(form.yol),
      yemek: str(form.yemek),
      extras: mapExtras(form.extras),
      notes: str(form.notes),
    });
  } catch {
    return null;
  }
}
