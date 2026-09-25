/**
 * V3.5 DonemselFormSnapshot ↔ taşınmış V3 DonemselFazlaMesaiCore (klasik) motor giriş/çıkışı.
 */

import type {
  DonemselFormSnapshot,
  DonemselResult,
  ExclusionItem,
  PeriodRow,
  RowOverride,
  SeasonalPattern as UiSeasonalPattern,
  DonemselWitness as UiDonemselWitness,
} from "../model";
import type { ExcludedDay } from "./types/exclusionStorage";
import type { FazlaMesaiRowBase } from "./lib/fazlaMesaiShared";
import { calculateIncomeTaxWithBrackets } from "./lib/incomeTaxCore";
import { runDonemselV3Pipeline } from "./pipeline";
import type { DonemselWitness, SeasonalPattern } from "./donemsel/types";
import { parseKatsayi, validateDateRange } from "../engine";

const SSK_ORAN = 0.14;
const ISSIZLIK_ORAN = 0.01;
const DAMGA_VERGISI_ORANI = 0.00759;

function toV3Pattern(p: UiSeasonalPattern): SeasonalPattern {
  const wd = parseInt(String(p.workDays ?? "6"), 10);
  return {
    months: p.months,
    startTime: p.startTime,
    endTime: p.endTime,
    workDays: Number.isFinite(wd) && wd >= 1 && wd <= 7 ? wd : 6,
    sevenDayMode: p.sevenDayMode,
    weeklyHolidayWeekday: p.weeklyHolidayWeekday,
  };
}

function toV3Witnesses(witnesses: UiDonemselWitness[]): DonemselWitness[] {
  return witnesses.map((w, idx) => ({
    id: idx + 1,
    name: w.name,
    dateIn: w.dateIn,
    dateOut: w.dateOut,
    summerPattern: toV3Pattern(w.summerPattern),
    winterPattern: toV3Pattern(w.winterPattern),
  }));
}

function toExcludedDays(items: ExclusionItem[]): ExcludedDay[] {
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    start: item.start,
    end: item.end,
    days: item.days,
  }));
}

function toFazlaMesaiManualRows(rows: PeriodRow[]): FazlaMesaiRowBase[] {
  return rows.map((row) => ({
    id: row.id,
    startISO: row.startISO,
    endISO: row.endISO,
    weeks: row.weeks,
    originalWeekCount: row.originalWeekCount ?? row.weeks,
    brut: row.brut,
    katsayi: row.katsayi,
    fmHours: row.fmHours,
    fm: row.fm,
    dailyNet: row.dailyNet,
    annualLeaveHg: row.annualLeaveHg,
    annualLeaveSevenDay: row.annualLeaveSevenDay,
    segmentWorkDays: row.segmentWorkDays,
    excludedDays: row.excludedDays,
    isExclusionBlock: row.isExclusionBlock,
    prePreserveWeeks: row.prePreserveWeeks,
    isManual: true,
    insertAfter: row.insertAfter,
  }));
}

function toRowOverrides(
  overrides: Record<string, RowOverride>,
): Record<string, Partial<FazlaMesaiRowBase>> {
  return overrides as Record<string, Partial<FazlaMesaiRowBase>>;
}

function v3RowToPeriodRow(row: FazlaMesaiRowBase, katSayi: number): PeriodRow {
  const yillikIzinAciklama = (row as { yillikIzinAciklama?: string }).yillikIzinAciklama;
  const isDeductionRow =
    Boolean((row as { isExclusionBlock?: boolean }).isExclusionBlock) ||
    Boolean(yillikIzinAciklama && String(yillikIzinAciklama).trim());
  return {
    id: row.id,
    startISO: row.startISO ?? "",
    endISO: row.endISO ?? "",
    weeks: Number(row.weeks) || 0,
    originalWeekCount: row.originalWeekCount ?? row.weeks,
    brut: Number(row.brut) || 0,
    katsayi: Number(row.katsayi) || katSayi,
    fmHours: Number(row.fmHours) || 0,
    fm: Number(row.fm) || 0,
    isDeductionRow,
    note: yillikIzinAciklama || undefined,
    yillikIzinAciklama: yillikIzinAciklama || undefined,
    dailyNet: row.dailyNet,
    annualLeaveHg: (row as { annualLeaveHg?: number }).annualLeaveHg,
    annualLeaveSevenDay: (row as { annualLeaveSevenDay?: "tatilli" | "tatilsiz" }).annualLeaveSevenDay,
    segmentWorkDays: (row as { segmentWorkDays?: number }).segmentWorkDays,
    excludedDays: (row as { excludedDays?: number }).excludedDays,
    isExclusionBlock: (row as { isExclusionBlock?: boolean }).isExclusionBlock,
    prePreserveWeeks: (row as { prePreserveWeeks?: number }).prePreserveWeeks,
    isManual: Boolean(row.isManual),
    insertAfter: row.insertAfter,
  };
}

function emptyResult(warnings: string[] = []): DonemselResult {
  return {
    rows: [],
    yazFmHours: 0,
    kisFmHours: 0,
    toplamFm: 0,
    sgk: 0,
    issizlik: 0,
    gelirVergisi: 0,
    gelirVergisiDilimleri: "",
    damgaVergisi: 0,
    netYillik: 0,
    hakkaniyetOneri: 0,
    mahsupTutari: 0,
    mahsupSonrasiNet: 0,
    warnings,
  };
}

function parseMahsup(value: string): number {
  const s = String(value || "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Dönemsel FM (klasik) — V3 DonemselFazlaMesaiCore motor zinciri (taşınmış kopya). */
export function computeDonemselResultV3(form: DonemselFormSnapshot): DonemselResult {
  const warnings: string[] = [];
  const dateError = validateDateRange(form.dateIn, form.dateOut);
  if (dateError) warnings.push(dateError);

  if (!form.dateIn || !form.dateOut || dateError) {
    const pipeline = runDonemselV3Pipeline({
      dateIn: form.dateIn,
      dateOut: form.dateOut,
      summerPattern: toV3Pattern(form.summerPattern),
      winterPattern: toV3Pattern(form.winterPattern),
      witnesses: toV3Witnesses(form.witnessesSeasons),
      katSayi: parseKatsayi(form.katSayi),
      mode270: form.mode270,
      zamanasimiBaslangic: form.zamanasimi?.nihaiBaslangic || null,
      exclusions: toExcludedDays(form.exclusions),
      rowOverrides: toRowOverrides(form.rowOverrides ?? {}),
      manualRows: toFazlaMesaiManualRows(form.manualRows ?? []),
    });
    return { ...emptyResult(warnings), yazFmHours: pipeline.yazFmHours, kisFmHours: pipeline.kisFmHours };
  }

  const katsayi = parseKatsayi(form.katSayi);

  const pipeline = runDonemselV3Pipeline({
    dateIn: form.dateIn,
    dateOut: form.dateOut,
    summerPattern: toV3Pattern(form.summerPattern),
    winterPattern: toV3Pattern(form.winterPattern),
    witnesses: toV3Witnesses(form.witnessesSeasons),
    katSayi: katsayi,
    mode270: form.mode270,
    zamanasimiBaslangic: form.zamanasimi?.nihaiBaslangic || null,
    exclusions: toExcludedDays(form.exclusions),
    rowOverrides: toRowOverrides(form.rowOverrides ?? {}),
    manualRows: toFazlaMesaiManualRows(form.manualRows ?? []),
  });

  if (pipeline.tableDisplayRows.length === 0 && pipeline.baseRows.length > 0) {
    warnings.push(
      "Hafta, FM saati veya fazla mesai tutarı 0 olan satırlar gösterilmez; görüntülenecek cetvel satırı yok.",
    );
  }

  const rows = pipeline.tableDisplayRows.map((r) => v3RowToPeriodRow(r, katsayi));
  const toplamFm = Math.round(pipeline.totalBrut * 100) / 100;

  const exitYear = form.dateOut
    ? new Date(form.dateOut).getFullYear()
    : new Date().getFullYear();

  let gelirVergisi = 0;
  let gelirVergisiDilimleri = "";
  let damgaVergisi = 0;
  let netYillik = 0;
  let sgk = 0;
  let issizlik = 0;

  if (toplamFm > 0) {
    sgk = Math.round(toplamFm * SSK_ORAN * 100) / 100;
    issizlik = Math.round(toplamFm * ISSIZLIK_ORAN * 100) / 100;
    const matrah = Math.max(0, toplamFm - sgk - issizlik);
    const gvResult = calculateIncomeTaxWithBrackets(exitYear, matrah);
    gelirVergisi = Math.round(gvResult.tax * 100) / 100;
    gelirVergisiDilimleri = gvResult.brackets;
    damgaVergisi = Math.round(toplamFm * DAMGA_VERGISI_ORANI * 100) / 100;
    netYillik = Math.round((toplamFm - sgk - issizlik - gelirVergisi - damgaVergisi) * 100) / 100;
  }

  const hakkaniyetOneri = toplamFm / 3;
  const mahsupTutari = parseMahsup(form.mahsup);
  const mahsupSonrasiNet = Math.max(0, toplamFm - hakkaniyetOneri - mahsupTutari);

  return {
    rows,
    yazFmHours: pipeline.yazFmHours,
    kisFmHours: pipeline.kisFmHours,
    toplamFm,
    sgk,
    issizlik,
    gelirVergisi,
    gelirVergisiDilimleri,
    damgaVergisi,
    netYillik,
    hakkaniyetOneri,
    mahsupTutari,
    mahsupSonrasiNet,
    warnings,
  };
}

/** Manuel kontrol: konsol özeti (dev). */
export function logDonemselFmV3EngineCheck(form: DonemselFormSnapshot): void {
  const result = computeDonemselResultV3(form);
  // eslint-disable-next-line no-console
  console.info("[Dönemsel v3-engine]", {
    mode270: form.mode270,
    witnessCount: form.witnessesSeasons.filter((w) => w.dateIn && w.dateOut).length,
    exclusionCount: form.exclusions.length,
    zamanasimi: form.zamanasimi?.nihaiBaslangic ?? null,
    yazFmHours: result.yazFmHours,
    kisFmHours: result.kisFmHours,
    rowCount: result.rows.length,
    toplamFm: result.toplamFm,
    mahsupSonrasiNet: result.mahsupSonrasiNet,
    rows: result.rows.map((r) => ({
      id: r.id,
      range: `${r.startISO} – ${r.endISO}`,
      weeks: r.weeks,
      fmHours: r.fmHours,
      fm: r.fm,
      deduction: r.isDeductionRow,
    })),
  });
}
