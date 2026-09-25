/**
 * Bilirkişi UBGT — V3 `UbgtBilirkisiPage` kayıt şekline uyumlu payload.
 */
import type { CalcSaveResult } from "../../shared/calcBackendCrud";
import type { UbgtForm } from "../model";
import type { CetvelDisplayRow } from "../ubgtCetvelRows";
import type { UbgtNetResult } from "../engine";

export type BilirkisiUbgtSaveExtras = {
  v3Periods: CetvelDisplayRow[];
  netConversion: UbgtNetResult & {
    brut: number;
    hakkaniyet: number;
    settleAmount: number | string;
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
    persons: row.persons,
  };
}

function mapDavaciDateRanges(form: UbgtForm) {
  return form.dateRanges.map((r) => ({
    id: r.id,
    start: r.start,
    end: r.end,
    selectedHolidayIds: r.selectedHolidayIds ?? [],
  }));
}

function mapV3Witnesses(form: UbgtForm) {
  return form.witnesses.map((w) => ({
    id: w.id,
    name: w.name,
    dateRange: {
      id: `${w.id}-dr`,
      start: w.start,
      end: w.end,
      selectedHolidayIds: w.selectedHolidayIds,
    },
  }));
}

function buildWorkerPeriods(form: UbgtForm) {
  const davaci = form.dateRanges.map((r) => ({
    id: r.id,
    start: r.start,
    end: r.end,
    selectedHolidayIds: r.selectedHolidayIds ?? [],
  }));
  const witnessRanges = form.witnesses.map((w) => ({
    id: w.id,
    start: w.start,
    end: w.end,
    selectedHolidayIds: w.selectedHolidayIds,
  }));
  return [...davaci, ...witnessRanges];
}

export function buildBilirkisiUbgtSaveData(
  form: UbgtForm,
  result: CalcSaveResult & Partial<BilirkisiUbgtSaveExtras>,
): Record<string, unknown> {
  const v3Periods = (result.v3Periods ?? []).map(mapPeriodRow);
  const netConversion = result.netConversion;
  const totalBrut = Number(result.toplamBrut ?? result.brut ?? 0);
  const totalNet = netConversion?.net ?? Number(result.net ?? 0);
  const totalDays = Number(result.totalDays ?? 0);
  const katsayi = Number(result.katsayi ?? 1);

  const allRanges = buildWorkerPeriods(form);
  const startTimes = allRanges
    .filter((r) => r.start)
    .map((r) => new Date(r.start).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  const endTimes = allRanges
    .filter((r) => r.end)
    .map((r) => new Date(r.end).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a);
  const startDateStr = startTimes[0] ? new Date(startTimes[0]).toISOString().slice(0, 10) : null;
  const endDateStr = endTimes[0] ? new Date(endTimes[0]).toISOString().slice(0, 10) : null;

  const settlement = {
    hakkaniyet: netConversion?.hakkaniyet ?? 0,
    settleAmount: netConversion?.settleAmount ?? form.settleAmount ?? 0,
    sonuc: Math.max(0, totalBrut - (netConversion?.hakkaniyet ?? 0)),
    mahsuplasamaData: form.mahsuplasamaData,
  };

  const davaciDateRanges = mapDavaciDateRanges(form);
  const witnesses = mapV3Witnesses(form);

  const ubgtData = {
    periods: v3Periods,
    totalBrut,
    totalNet,
    netConversion,
    settlement,
    workerPeriods: allRanges,
    selectedHolidays: [] as string[],
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
    davaciDateRanges,
    witnesses,
    excludedWeekdays: form.excludedWeekdays,
    excludedWeekdayHolidays: result.excludedWeekdayHolidays ?? [],
    ubgtExcludedDays: form.ubgtExcludedDays,
    ubgtExclusionRules: form.ubgtExclusionRules,
    ubgtExpiryStart: form.ubgtExpiryStart,
    zamanasimi: { active: !!form.ubgtExpiryStart, start: form.ubgtExpiryStart || null },
    periods: v3Periods,
    rowOverrides: form.periodOverrides,
    katsayi,
    calculatedUbgtDays: totalDays,
    settlement,
    mode: "bilirkisi" as const,
    settleAmount: form.settleAmount,
    mahsuplasamaData: form.mahsuplasamaData,
    year: form.year,
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
    mode: "bilirkisi",
    ...ubgtData,
    results: {
      brut: totalBrut,
      net: totalNet,
      totals: { brut: totalBrut, net: totalNet, totalBrut },
      toplamBrut: totalBrut,
      toplamNet: netConversion,
      totalDays,
      periods: v3Periods,
      ubgtDayEntries: result.ubgtDayEntries,
      netConversion,
    },
  };
}
