/**
 * V3 `hafta_tatili_standart` kayıtları → V3.5 StandardForm.
 */
import type { SavedCaseRecord } from "@/api/savedCases";
import { unwrapCalcData } from "../../shared/calcBackendCrud";
import { newLocalId } from "../lib/money";
import type { ExcludedDay, TableRow } from "../lib/types";
import { createEmptyForm, type StandardForm } from "./model";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeDateInput(value: unknown): string {
  const s = str(value).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

function pickForm(payload: Record<string, unknown>): Record<string, unknown> {
  const data = asRecord(payload.data);
  const nested = asRecord(data?.form);
  const flat = asRecord(payload.form);
  return nested ?? flat ?? payload;
}

function mapExcludedDays(raw: unknown): ExcludedDay[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const d = asRecord(item) ?? {};
    const typeRaw = str(d.type || "Diğer");
    const type = (["Yıllık İzin", "Rapor", "Diğer", "UBGT"].includes(typeRaw)
      ? typeRaw
      : "Diğer") as ExcludedDay["type"];
    return {
      id: str(d.id) || newLocalId("ex"),
      type,
      start: normalizeDateInput(d.start),
      end: normalizeDateInput(d.end),
      days: Number(d.days) || 0,
    };
  });
}

function mapDateRanges(raw: unknown): StandardForm["dateRanges"] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return createEmptyForm().dateRanges;
  }
  return raw.map((item) => {
    const r = asRecord(item) ?? {};
    return {
      id: str(r.id) || newLocalId("dr"),
      start: normalizeDateInput(r.start),
      end: normalizeDateInput(r.end),
    };
  });
}

function withHtRowIds(rows: TableRow[]): TableRow[] {
  return rows.map((r) => ({
    ...r,
    id: r.id && String(r.id).length > 0 ? r.id : newLocalId("row"),
  }));
}

function mapPeriodRows(raw: unknown, rowOverrides?: Record<string, unknown>): TableRow[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw.map((item) => {
    const r = asRecord(item) ?? {};
    const wage = Number(r.wage ?? 0) || 0;
    return {
      id: str(r.id) || newLocalId("row"),
      period: str(r.period),
      startISO: normalizeDateInput(r.start ?? r.startISO),
      endISO: normalizeDateInput(r.end ?? r.endISO),
      weekCount: Number(r.weekCount ?? 0) || 0,
      wage,
      coefficient: Number(r.coefficient ?? 1) || 1,
      dailyWage: Number(r.dailyWage ?? 0) || 0,
      daily50: Number(r.daily50 ?? 0) || 0,
      haftaTatiliDays: Number(r.haftaTatiliDays ?? 0) || 0,
      haftaTatiliTotal: Number(r.haftaTatiliTotal ?? 0) || 0,
      manual: Boolean(r.manual),
      manualWeekCount: Boolean(r.manualWeekCount),
      brutManual: false,
    } satisfies TableRow;
  });

  if (!rowOverrides || typeof rowOverrides !== "object") {
    return withHtRowIds(rows);
  }

  return withHtRowIds(
    rows.map((row, index) => {
      const ov =
        asRecord(rowOverrides[String(index)]) ??
        asRecord(rowOverrides[row.id]) ??
        null;
      if (!ov) return row;
      const brut = Number(ov.brut ?? ov.wage ?? 0);
      if (brut > 0 && ov.brutManual === true) {
        return { ...row, wage: brut, brutManual: true };
      }
      return row;
    }),
  );
}

export function resolveSavedCaseDisplayName(record?: SavedCaseRecord): string {
  const name = record?.name ?? record?.kayit_adi;
  if (name && String(name).trim()) return String(name).trim();
  if (record?.id != null) return `Kayıt #${record.id}`;
  return "Hafta Tatili";
}

export function mapLegacyStandardHaftaTatiliCase(
  data: unknown,
  _record?: SavedCaseRecord,
): StandardForm | null {
  try {
    const payload = unwrapCalcData(data);
    const form = pickForm(payload);
    const empty = createEmptyForm();

    const workerPeriods = form.workerPeriods ?? form.dateRanges;
    const dateRanges = mapDateRanges(workerPeriods);

    const zamanasimi = asRecord(form.zamanasimi);
    const expiryStart =
      normalizeDateInput(form.expiryStart) ||
      normalizeDateInput(form.haftaTatiliExpiryStart) ||
      normalizeDateInput(zamanasimi?.start) ||
      null;

    const kullanim = asRecord(form.haftaTatiliKullanim);
    const kullanimBaslangic = str(kullanim?.baslangic ?? form.kullanimBaslangic);
    const kullanimBitis = str(kullanim?.bitis ?? form.kullanimBitis);
    const gunRaw = Number(kullanim?.gunSayisi ?? form.kullanimGunSayisi ?? 4);
    const kullanimGunSayisi = ([1, 2, 3, 4] as const).includes(gunRaw as 1 | 2 | 3 | 4)
      ? (gunRaw as 1 | 2 | 3 | 4)
      : 4;

    const settlement = asRecord(form.settlement);
    const settleAmount = str(settlement?.settleAmount ?? form.settleAmount);

    const rowOverrides = asRecord(form.rowOverrides) ?? undefined;
    const periods = form.periods ?? payload.periods;
    const rows = mapPeriodRows(periods, rowOverrides as Record<string, unknown> | undefined);

    const katsayi = Number(form.katsayi ?? form.globalCoefficient ?? 1) || 1;

    return {
      ...empty,
      dateRanges,
      excludedDays: mapExcludedDays(form.excludedDays ?? form.haftaTatiliExcludedDays),
      expiryStart: expiryStart || null,
      kullanimBaslangic,
      kullanimBitis,
      kullanimGunSayisi,
      selectedHolidayIds: Array.isArray(form.selectedHolidays)
        ? form.selectedHolidays.map(String)
        : Array.isArray(form.selectedHolidayIds)
          ? form.selectedHolidayIds.map(String)
          : [],
      rows,
      settleAmount,
      globalCoefficient: katsayi,
    };
  } catch (e) {
    console.error("[legacyHaftaTatiliCaseAdapter] map failed", e);
    return null;
  }
}
