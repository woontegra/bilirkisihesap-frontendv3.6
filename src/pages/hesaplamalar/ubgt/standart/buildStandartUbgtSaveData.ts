/**
 * Standart UBGT — V3 `UbgtStandartPage` kayıt şekline uyumlu payload.
 */
import type { CalcSaveResult } from "../../shared/calcBackendCrud";
import type { UbgtForm } from "../model";
import type { CetvelDisplayRow } from "../ubgtCetvelRows";
import type { UbgtNetResult } from "../engine";

export type StandartUbgtSaveExtras = {
  v3Periods: CetvelDisplayRow[];
  netConversion: UbgtNetResult & {
    brut: number;
    hakkaniyet: number;
    settleAmount: number;
    gelir: number;
    gelirDilimleri: string;
    damga: number;
    net: number;
    ssk: number;
  };
  excludedWeekdayHolidays: unknown[];
  katsayi: number;
};

function mapPeriodRow(row: CetvelDisplayRow) {
  return {
    period: row.period,
    wage: row.wage,
    coefficient: row.coefficient,
    dailyWage: row.dailyWage,
    ubgtDays: row.ubgtDays,
    ubgtTotal: row.ubgtTotal,
    start: row.startISO,
    end: row.endISO,
  };
}

export function buildStandartUbgtSaveData(
  form: UbgtForm,
  result: CalcSaveResult & Partial<StandartUbgtSaveExtras>,
): Record<string, unknown> {
  const v3Periods = (result.v3Periods ?? []).map(mapPeriodRow);
  const netConversion = result.netConversion;
  const totalBrut = Number(result.toplamBrut ?? result.brut ?? 0);
  const totalNet = netConversion?.net ?? Number(result.net ?? 0);
  const totalDays = Number(result.totalDays ?? 0);
  const katsayi = Number(result.katsayi ?? 1);

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

  const settlement = {
    hakkaniyet: netConversion?.hakkaniyet ?? 0,
    settleAmount: netConversion?.settleAmount ?? 0,
    sonuc: Math.max(0, totalNet - (netConversion?.hakkaniyet ?? 0)),
    mahsuplasamaData: form.mahsuplasamaData,
  };

  const ubgtData = {
    periods: v3Periods,
    rowOverrides: form.periodOverrides,
    totalBrut,
    totalNet,
    netConversion,
    settlement,
    workerPeriods: form.dateRanges,
    selectedHolidays: form.selectedHolidayIds,
    calculatedUbgtDays: totalDays,
    katsayi,
    zamanasimi: { active: !!form.ubgtExpiryStart, start: form.ubgtExpiryStart || null },
    excludedDays: form.ubgtExcludedDays,
    ubgtExclusionRules: form.ubgtExclusionRules,
    excludedWeekdays: form.excludedWeekdays,
    excludedWeekdayHolidays: result.excludedWeekdayHolidays ?? [],
    startDate: startDateStr,
    endDate: endDateStr,
    notes: "",
  };

  const v3Form = {
    ...form,
    mode: "standart" as const,
    workerPeriods: form.dateRanges,
    selectedHolidays: form.selectedHolidayIds,
    excludedDays: form.ubgtExcludedDays,
    excludedWeekdayHolidays: result.excludedWeekdayHolidays ?? [],
    zamanasimi: { active: !!form.ubgtExpiryStart, start: form.ubgtExpiryStart || null },
    periods: v3Periods,
    rowOverrides: form.periodOverrides,
    katsayi,
    calculatedUbgtDays: totalDays,
    settlement,
  };

  return {
    data: {
      form: v3Form,
      results: {
        totals: { brut: totalBrut, net: totalNet },
        brut: totalBrut,
        net: totalNet,
        netConversion,
        toplamBrut: totalBrut,
        toplamNet: netConversion,
        totalDays,
        periods: v3Periods,
        ubgtDayEntries: result.ubgtDayEntries,
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
    mode: "standart",
    ...ubgtData,
    results: {
      brut: totalBrut,
      net: totalNet,
      totals: { brut: totalBrut, net: totalNet, totalBrut: totalBrut },
      toplamBrut: totalBrut,
      toplamNet: netConversion,
      totalDays,
      periods: v3Periods,
      ubgtDayEntries: result.ubgtDayEntries,
      netConversion,
    },
  };
}
