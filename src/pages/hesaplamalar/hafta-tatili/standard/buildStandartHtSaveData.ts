/**
 * Standart Hafta Tatili — V3 `prepareHaftaTatiliStandardSave` uyumlu payload.
 */
import type { CalcSaveResult } from "../../shared/calcBackendCrud";
import type { TableRow } from "../lib/types";
import type { StandardForm } from "./model";

export type StandartHtSaveExtras = {
  v3Periods: TableRow[];
  netConversion: {
    brut: number;
    ssk: number;
    issizlik: number;
    gelir: number;
    gelirDilimleri: string;
    damga: number;
    net: number;
    hakkaniyet: number;
    settleAmount: string;
  };
  rowOverrides?: Record<string, unknown>;
  katsayi: number;
  totalDays?: number;
};

function mapExcluded(day: StandardForm["excludedDays"][number]) {
  const typeValue =
    day.type && String(day.type).trim() ? String(day.type).trim() : "Diğer";
  return {
    id: day.id || Math.random().toString(36).slice(2),
    type: typeValue,
    start: day.start || "",
    end: day.end || "",
    days: day.days || 0,
  };
}

function mapPeriodRow(row: TableRow) {
  return {
    period: row.period,
    weekCount: row.weekCount,
    wage: row.wage,
    coefficient: row.coefficient,
    dailyWage: row.dailyWage,
    daily50: row.daily50,
    haftaTatiliDays: row.haftaTatiliDays,
    haftaTatiliTotal: row.haftaTatiliTotal,
    start: row.startISO,
    end: row.endISO,
    startISO: row.startISO,
    endISO: row.endISO,
    manual: row.manual ?? false,
    id: row.id,
  };
}

export function buildStandartHtSaveData(
  form: StandardForm,
  result: CalcSaveResult & Partial<StandartHtSaveExtras>,
): Record<string, unknown> {
  const v3Periods = (result.v3Periods ?? []).map(mapPeriodRow);
  const netConversion = result.netConversion;
  const totalBrut = Number(result.toplamBrut ?? result.brut ?? 0);
  const totalNet = netConversion?.net ?? Number(result.net ?? 0);
  const totalDays = Number(result.totalDays ?? 0);
  const katsayi = Number(result.katsayi ?? form.globalCoefficient ?? 1);

  const startTimes = form.dateRanges
    .filter((r) => r.start)
    .map((r) => new Date(r.start).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  const endTimes = form.dateRanges
    .filter((r) => r.end)
    .map((r) => new Date(r.end).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a);
  const startDateStr = startTimes[0] ? new Date(startTimes[0]).toISOString().slice(0, 10) : null;
  const endDateStr = endTimes[0] ? new Date(endTimes[0]).toISOString().slice(0, 10) : null;

  const excludedMapped = form.excludedDays.map(mapExcluded);

  const settlement = {
    hakkaniyet: netConversion?.hakkaniyet ?? 0,
    settleAmount: netConversion?.settleAmount ?? form.settleAmount ?? "",
    sonuc: Math.max(0, (netConversion?.brut ?? totalBrut) - (netConversion?.hakkaniyet ?? 0)),
  };

  const haftaTatiliData = {
    periods: v3Periods,
    totalBrut,
    totalNet,
    netConversion,
    settlement,
    workerPeriods: form.dateRanges,
    selectedHolidays: form.selectedHolidayIds,
    calculatedHaftaTatiliDays: totalDays,
    katsayi,
    zamanasimi: { active: !!form.expiryStart, start: form.expiryStart || null },
    excludedDays: excludedMapped,
    haftaTatiliKullanim: {
      baslangic: form.kullanimBaslangic,
      bitis: form.kullanimBitis,
      gunSayisi: form.kullanimGunSayisi,
    },
    startDate: startDateStr,
    endDate: endDateStr,
    notes: "",
  };

  const v3Form: Record<string, unknown> = {
    workerPeriods: form.dateRanges,
    selectedHolidays: form.selectedHolidayIds,
    excludedDays: excludedMapped,
    zamanasimi: { active: !!form.expiryStart, start: form.expiryStart || null },
    haftaTatiliKullanim: {
      baslangic: form.kullanimBaslangic,
      bitis: form.kullanimBitis,
      gunSayisi: form.kullanimGunSayisi,
    },
    periods: v3Periods,
    katsayi,
    calculatedHaftaTatiliDays: totalDays,
    settlement,
    settleAmount: form.settleAmount,
  };

  if (result.rowOverrides && Object.keys(result.rowOverrides).length > 0) {
    v3Form.rowOverrides = result.rowOverrides;
  }

  return {
    data: {
      form: v3Form,
      results: {
        totals: { brut: totalBrut, net: totalNet },
        brut: totalBrut,
        net: totalNet,
        netConversion,
      },
    },
    form: v3Form,
    formValues: v3Form,
    start_date: startDateStr,
    end_date: endDateStr,
    brut_total: totalBrut,
    net_total: totalNet,
    ise_giris: startDateStr,
    isten_cikis: endDateStr,
    ...haftaTatiliData,
    results: {
      brut: totalBrut,
      net: totalNet,
      totals: { brut: totalBrut, net: totalNet, totalBrut },
      toplamBrut: totalBrut,
      toplamNet: netConversion,
      netConversion,
    },
  };
}
