import { KISMI_CASES_KEY } from "./storage";
/**
 * V3 backend kayıt → Kısmi Süreli kıdem form mapping.
 * Yalnızca form alanlarını doldurur; sonuçları backend'den almaz.
 */

import type { SavedCaseRecord } from "@/api/savedCases";
import { type CalcSaveResult } from "../../shared/calcBackendCrud";
import { createKidemCrud, KIDEM_KISMI_SURELI_TYPE } from "../shared/kidemCaseCrud";
import { formatKidemMoneyFields } from "../shared/formatKidemMoneyFields";
import { extractKidemBrutNet, recordUpdatedAt } from "../shared/kidemRecordMapper";
import { calculatePeriodDays } from "./engine";
import { emptyPeriod, newLocalId, type ExtraItem, type KismiFormSnapshot, type SavedCase, type WorkPeriod } from "./model";

export { KIDEM_KISMI_SURELI_TYPE };

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

function mapPeriods(raw: unknown): WorkPeriod[] {
  if (!Array.isArray(raw)) return [emptyPeriod()];
  const periods = raw
    .map((row) => {
      const r = asRecord(row);
      if (!r) return null;
      const start = normalizeDateInput(r.start ?? r.startDate ?? r.baslangic);
      const end = normalizeDateInput(r.end ?? r.endDate ?? r.bitis);
      const daysRaw = Number(r.days);
      const days =
        Number.isFinite(daysRaw) && daysRaw > 0
          ? daysRaw
          : start && end
            ? calculatePeriodDays(start, end)
            : 0;
      return {
        id: str(r.id) || newLocalId(),
        start,
        end,
        days,
      } satisfies WorkPeriod;
    })
    .filter((x): x is WorkPeriod => !!x);
  return periods.length > 0 ? periods : [emptyPeriod()];
}

export function resolveSavedCaseDisplayName(record: SavedCaseRecord): string {
  const name = record.name ?? record.kayit_adi;
  return name && String(name).trim() ? String(name).trim() : `Kayıt #${record.id}`;
}

export function mapKismiFormFromBackend(data: unknown): KismiFormSnapshot | null {
  try {
    const payload = unwrapData(data);
    const form = pickForm(payload);
    const periodsRaw = form.periods ?? payload.periods;
    const totalDaysManual = str(
      form.totalDaysManual ?? form.manualTotalDaysOverride ?? form.manualTotalDays,
    );
    const exitDateOverride = normalizeDateInput(
      form.exitDateOverride ?? form.exitDate ?? form.endDate ?? form.istenCikis,
    );
    const isManualOverride =
      form.isManualOverride === true ||
      form.isManualOverride === "true" ||
      (totalDaysManual.trim() !== "" && form.isManualOverride !== false);

    return formatKidemMoneyFields({
      periods: mapPeriods(periodsRaw),
      totalDaysManual,
      isManualOverride: Boolean(isManualOverride && totalDaysManual.trim()),
      exitDateOverride,
      ciplakBrut: str(form.brutUcret ?? form.brut ?? form.ciplakBrut),
      prim: str(form.prim),
      ikramiye: str(form.ikramiye),
      yemek: str(form.yemek),
      yol: str(form.yol),
      diger: str(form.diger),
      extras: mapExtras(form.extras),
      notes: str(form.notes),
    });
  } catch {
    return null;
  }
}

export const kismiCaseCrud = createKidemCrud(KIDEM_KISMI_SURELI_TYPE, mapKismiFormFromBackend, KISMI_CASES_KEY);

export function mapKismiRecordToSavedCase(record: SavedCaseRecord): SavedCase | null {
  const form = mapKismiFormFromBackend(record.data);
  if (!form) return null;
  const { brut, net } = extractKidemBrutNet(record);
  return {
    id: String(record.id),
    name: resolveSavedCaseDisplayName(record),
    version: 1,
    updatedAt: recordUpdatedAt(record),
    form,
    results: { brut, net },
  };
}

export function buildKismiSaveResult(brut: number, net: number): CalcSaveResult {
  return { brut, net };
}
