/**
 * Fazla Mesai — 48 Saat Vardiya — hesap orkestrasyonu (V3 Vardiya48Page mantığı).
 * Motor zinciri: calculate48System + expandRowsForDeductions + preserve weeks + para.
 * (V3 gibi mode270 uygulanmaz.)
 */

import { DAMGA_ORAN, FM_DENOMINATOR, FM_KATSAYI, ISSIZLIK_ORANI, PANDEMI_BASLANGIC, PANDEMI_BITIS, PANDEMI_SABIT_GUN, SGK_ORANI } from "./constants";
import { getAsgariUcretByDate } from "./asgariUcret";
import { calculate48System } from "./calculate48System";
import {
  expandVardiya48RowsForDeductions,
  exclusionsNeedLegacySplit,
  partitionVardiya48Exclusions,
} from "./expandRowsForDeductions";
import { isV48TransitionMotorNote } from "./vardiya48TransitionNotes";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import type {
  ExclusionItem,
  PeriodRow,
  RowOverride,
  Vardiya48FormSnapshot,
  Vardiya48Result,
  Witness,
} from "./model";
import { newLocalId } from "./model";
import { buildMergedWitnessSegments } from "./witnessSegments";

/* ── yardımcılar ── */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parseMoneyInput(value: string | number | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? "").trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function parseKatsayi(value: string | number | undefined): number {
  const n = parseMoneyInput(value);
  return n > 0 ? n : 1;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export { sanitizeMoneyTyping } from "@/utils/moneyInput";

export function isValidIsoDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? "").trim());
}

export function validateDateRange(start: string, end: string): string | null {
  if (!start || !end) return null;
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) return null;
  if (end < start) return "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.";
  return null;
}

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoToUtcDays(iso: string): number {
  return isoToUtcMs(iso) / 86400000;
}

export function daysBetweenIsoInclusive(startISO: string, endISO: string): number {
  return isoToUtcDays(endISO) - isoToUtcDays(startISO) + 1;
}

export function computeZamanasimiNihaiBaslangic(
  davaTarihi: string,
  arabuluculukBaslangic: string,
  arabuluculukBitis: string,
  iseGiris: string,
): string | null {
  if (!isValidIsoDate(davaTarihi)) return null;
  const davaMs = isoToUtcMs(davaTarihi);
  const d = new Date(davaMs);
  const limitMs = Date.UTC(d.getUTCFullYear() - 5, d.getUTCMonth(), d.getUTCDate());

  let arabuluculukGun = 0;
  if (isValidIsoDate(arabuluculukBaslangic) && isValidIsoDate(arabuluculukBitis)) {
    arabuluculukGun = Math.max(0, isoToUtcDays(arabuluculukBitis) - isoToUtcDays(arabuluculukBaslangic) + 1);
  }

  let pandemiGun = 0;
  if (isValidIsoDate(iseGiris)) {
    const iseMs = isoToUtcMs(iseGiris);
    const pandemiBasMs = isoToUtcMs(PANDEMI_BASLANGIC);
    const pandemiBitMs = isoToUtcMs(PANDEMI_BITIS);
    if (iseMs < pandemiBasMs) pandemiGun = PANDEMI_SABIT_GUN;
    else if (iseMs >= pandemiBasMs && iseMs <= pandemiBitMs) {
      pandemiGun = Math.max(0, Math.round((pandemiBitMs - iseMs) / 86400000) + 1);
    }
  }

  const nihaiMs = limitMs - arabuluculukGun * 86400000 - pandemiGun * 86400000;
  const nd = new Date(nihaiMs);
  const yy = nd.getUTCFullYear();
  const mm = String(nd.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nd.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function normalizeDateInput(iso: string): string {
  if (!iso) return "";
  const s = String(iso).trim();
  if (s.includes(".")) {
    const [g, a, y] = s.split(".");
    if (!y || !a || !g) return s;
    return `${y}-${String(a).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
  }
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function formatDateTR(iso: string | undefined): string {
  if (!iso) return "";
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!d || !m || !y) return s;
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`;
}

/** weeks = round(gün/7) — V3 calculateWeeksBetweenDates. */
export function calculateWeeksBetweenDates(startISO?: string, endISO?: string): number {
  if (!startISO || !endISO) return 0;
  const s = normalizeDateInput(startISO);
  const e = normalizeDateInput(endISO);
  if (!isValidIsoDate(s) || !isValidIsoDate(e) || e < s) return 0;
  const days = daysBetweenIsoInclusive(s, e);
  return Math.max(0, Math.round(days / 7));
}

/** V3: Number(((weeks*fmHours*brut*katsayi)/225*1.5).toFixed(2)) step-by-step. */
export function calcRowFm(weeks: number, fmHours: number, brut: number, katsayi: number): number {
  const calc225 = FM_DENOMINATOR;
  const factor = FM_KATSAYI;
  const step1 = Number((weeks * brut).toFixed(6));
  const step2 = Number((step1 * katsayi).toFixed(6));
  const step3 = Number((step2 * fmHours).toFixed(6));
  const step4 = Number((step3 / calc225).toFixed(6));
  const step5 = Number((step4 * factor).toFixed(6));
  return Number(step5.toFixed(2));
}

function recalcRow(row: PeriodRow): PeriodRow {
  const fm = calcRowFm(row.weeks, row.fmHours, row.brut, row.katsayi);
  const net = Number((fm * (1 - DAMGA_ORAN - 0.15)).toFixed(2));
  return { ...row, fm, net, calc225: row.calc225 ?? 225, factor: row.factor ?? 1.5 };
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLocalDay(iso: string): Date | null {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : startOfLocalDay(dt);
}

/** Segment başlangıcında global 24/48 fazını koru (V3 anchorForSegment). */
function anchorForSegment(globalStart: string, segmentStart: string, baseAnchorIsWorkDay: boolean): boolean {
  const gs = parseLocalDay(globalStart);
  const ss = parseLocalDay(segmentStart);
  if (!gs || !ss) return baseAnchorIsWorkDay;
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((ss.getTime() - gs.getTime()) / dayMs);
  if (diffDays <= 0) return baseAnchorIsWorkDay;
  return diffDays % 2 === 0 ? baseAnchorIsWorkDay : !baseAnchorIsWorkDay;
}

function buildWitnessSegments(
  dStart: string,
  dEnd: string,
  taniklar: Witness[],
): Array<{ start: string; end: string }> {
  const parseLocalDayToMs = (raw: string): number => {
    const s = String(raw || "").trim();
    if (!s) return Number.NaN;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-").map(Number);
      return Date.UTC(y || 0, (m || 1) - 1, d || 1);
    }
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
      const [d, m, y] = s.split(".").map(Number);
      return Date.UTC(y || 0, (m || 1) - 1, d || 1);
    }
    const n = new Date(s).getTime();
    return Number.isNaN(n) ? Number.NaN : n;
  };

  const dStartMs = parseLocalDayToMs(normalizeDateInput(dStart));
  const dEndMs = parseLocalDayToMs(normalizeDateInput(dEnd));
  if (Number.isNaN(dStartMs) || Number.isNaN(dEndMs) || dStartMs > dEndMs) return [];

  const witnesses = taniklar
    .filter((t) => t.dateIn && t.dateOut)
    .map((t, idx) => ({
      startMs: parseLocalDayToMs(normalizeDateInput(t.dateIn)),
      endMs: parseLocalDayToMs(normalizeDateInput(t.dateOut)),
      // Ortak segmentleyici bitişik parçaları fmHours'a göre birleştirir;
      // tanık önceliği değişimlerini korumak için ayırt edici değer veriyoruz.
      fmHours: idx + 1,
    }))
    .filter((w) => !Number.isNaN(w.startMs) && !Number.isNaN(w.endMs) && w.startMs <= w.endMs);

  if (witnesses.length === 0) return [];

  return buildMergedWitnessSegments(dStart, dEnd, witnesses).map((seg) => ({
    start: seg.start,
    end: seg.end,
  }));
}

/**
 * Bilirkişi kuralı: aynı dönemde 1 haftalık notsuz satırı yüksek FM bloğa taşı.
 */
function rebalanceSingletonWeekRows(rows: PeriodRow[]): PeriodRow[] {
  const autoRows = rows.filter((r) => !r.isManual);
  if (autoRows.length <= 2) return rows;

  const toDrop = new Set<string>();
  const patched = new Map<string, PeriodRow>();

  autoRows.forEach((singleton) => {
    if (Math.round(Number(singleton.weeks) || 0) !== 1) return;
    if ((singleton.yillikIzinAciklama || singleton.note || "").trim().length > 0) return;

    const targets = autoRows.filter((r) => {
      if ((r.id || "") === (singleton.id || "")) return false;
      if (toDrop.has(r.id || "")) return false;
      if ((r.yillikIzinAciklama || r.note || "").trim().length > 0) return false;
      if ((r.startISO || "").slice(0, 10) !== (singleton.startISO || "").slice(0, 10)) return false;
      if ((r.endISO || "").slice(0, 10) !== (singleton.endISO || "").slice(0, 10)) return false;
      if ((Number(r.brut) || 0) !== (Number(singleton.brut) || 0)) return false;
      if ((Number(r.katsayi) || 0) !== (Number(singleton.katsayi) || 0)) return false;
      return (Number(r.weeks) || 0) >= 1;
    });
    if (!targets.length) return;

    let best = targets[0];
    targets.forEach((r) => {
      if ((Number(r.fmHours) || 0) > (Number(best.fmHours) || 0)) best = r;
    });

    const base = patched.get(best.id || "") || best;
    const next = recalcRow({ ...base, weeks: (Number(base.weeks) || 0) + 1 });
    patched.set(best.id || "", next);
    toDrop.add(singleton.id || "");
  });

  if (toDrop.size === 0 && patched.size === 0) return rows;
  return rows.filter((r) => !toDrop.has(r.id || "")).map((r) => patched.get(r.id || "") || r);
}

/** Dönem içi hafta toplamını round(gün/7) ile hizala (V3 preserveWeeks benzeri). */
function preserveWeeksForPeriod(
  rows: PeriodRow[],
  motorExclusions: ExclusionItem[],
  legacyExclusions: ExclusionItem[],
): PeriodRow[] {
  let nextRows = rows.map((r) => ({ ...r, weeks: Math.max(0, Math.round(Number(r.weeks) || 0)) }));
  const byPeriod = new Map<string, number[]>();
  nextRows.forEach((r, idx) => {
    const key = `${(r.startISO || "").slice(0, 10)}|${(r.endISO || "").slice(0, 10)}`;
    const arr = byPeriod.get(key) || [];
    arr.push(idx);
    byPeriod.set(key, arr);
  });

  byPeriod.forEach((idxs, key) => {
    const [ps, pe] = key.split("|");
    if (!ps || !pe) return;

    const transitionRowsInWindow = nextRows.filter((r) => {
      const note = String(r.yillikIzinAciklama || r.note || "");
      if (!isV48TransitionMotorNote(note)) return false;
      const rs = (r.startISO || "").slice(0, 10);
      const re = (r.endISO || "").slice(0, 10);
      return rs >= ps && re <= pe;
    });
    if (transitionRowsInWindow.length > 0) return;

    const expectedRoundedWeeks = Math.max(0, Math.round(calculateWeeksBetweenDates(ps, pe)));
    const currentWeeks = idxs.reduce((acc, i) => acc + Math.max(0, Math.round(Number(nextRows[i].weeks) || 0)), 0);
    let deltaWeeks = expectedRoundedWeeks - currentWeeks;
    if (deltaWeeks === 0) return;
    if ((legacyExclusions.length > 0 || motorExclusions.length > 0) && deltaWeeks > 0) return;

    while (deltaWeeks > 0) {
      let targetIdx = idxs[0];
      for (let k = 1; k < idxs.length; k += 1) {
        const i = idxs[k];
        const w = Number(nextRows[i].weeks) || 0;
        const t = Number(nextRows[targetIdx].weeks) || 0;
        if (w < t) targetIdx = i;
      }
      nextRows[targetIdx] = { ...nextRows[targetIdx], weeks: (Number(nextRows[targetIdx].weeks) || 0) + 1 };
      deltaWeeks -= 1;
    }

    while (deltaWeeks < 0) {
      let targetIdx = -1;
      for (let k = 0; k < idxs.length; k += 1) {
        const i = idxs[k];
        const w = Number(nextRows[i].weeks) || 0;
        if (w <= 0) continue;
        if (targetIdx < 0 || w > (Number(nextRows[targetIdx].weeks) || 0)) targetIdx = i;
      }
      if (targetIdx < 0) break;
      nextRows[targetIdx] = {
        ...nextRows[targetIdx],
        weeks: Math.max(0, (Number(nextRows[targetIdx].weeks) || 0) - 1),
      };
      deltaWeeks += 1;
    }
  });

  return nextRows.map(recalcRow);
}

export function applyRowOverrides(
  rows: PeriodRow[],
  overrides: Record<string, RowOverride>,
  manualRows: PeriodRow[] = [],
  defaultKatsayi = 1,
): PeriodRow[] {
  const applyOne = (row: PeriodRow): PeriodRow | null => {
    const ov = overrides[row.id];
    if (ov?.hidden && !row.isManual) return null;
    let next = { ...row };
    if (ov) {
      if (ov.weeks != null) next.weeks = ov.weeks;
      if (ov.brut != null) next.brut = ov.brut;
      if (ov.katsayi != null) next.katsayi = ov.katsayi;
      if (ov.fmHours != null) next.fmHours = ov.fmHours;
      if (ov.startISO != null) next.startISO = ov.startISO;
      if (ov.endISO != null) next.endISO = ov.endISO;
      if (ov.startISO != null || ov.endISO != null) {
        const s = (next.startISO || "").slice(0, 10);
        const e = (next.endISO || "").slice(0, 10);
        if (s.length >= 10 && e.length >= 10) {
          next.weeks = Math.max(1, calculateWeeksBetweenDates(s, e) || 1);
          next.rangeLabel = `${formatDateTR(s)}–${formatDateTR(e)}`;
          if (ov.brut == null) next.brut = getAsgariUcretByDate(s) || 0;
        }
      }
    }
    return recalcRow(next);
  };

  const auto = rows.map(applyOne).filter((r): r is PeriodRow => !!r);
  const manuals = manualRows.map((m) => {
    const base: PeriodRow = {
      ...m,
      katsayi: m.katsayi || defaultKatsayi,
      isManual: true,
    };
    const applied = applyOne(base);
    return applied || recalcRow(base);
  });

  const autoRowKeys = new Set(
    auto.map(
      (r) =>
        `${(r.startISO || "").slice(0, 10)}|${(r.endISO || "").slice(0, 10)}|${r.weekTypeLabel || ""}|${Number(r.fmHours) || 0}`,
    ),
  );
  const uniqueManuals = manuals.filter((m) => {
    const key = `${(m.startISO || "").slice(0, 10)}|${(m.endISO || "").slice(0, 10)}|${m.weekTypeLabel || ""}|${Number(m.fmHours) || 0}`;
    return !autoRowKeys.has(key);
  });

  if (uniqueManuals.length === 0) return auto;

  const out: PeriodRow[] = [];
  const inserted = new Set<string>();
  for (const r of auto) {
    out.push(r);
    uniqueManuals
      .filter((m) => m.insertAfter === r.id)
      .forEach((m) => {
        out.push(m);
        inserted.add(m.id);
      });
  }
  uniqueManuals.filter((m) => !inserted.has(m.id)).forEach((m) => out.push(m));
  return out;
}

export function createManualPeriodRow(afterId: string, katsayi: number): PeriodRow {
  return {
    id: newLocalId(),
    isManual: true,
    insertAfter: afterId,
    startISO: "",
    endISO: "",
    rangeLabel: "",
    weeks: 0,
    brut: 0,
    katsayi,
    fmHours: 0,
    calc225: 225,
    factor: 1.5,
    fm: 0,
    net: 0,
  };
}

function emptyResult(warnings: string[] = []): Vardiya48Result {
  return {
    rows: [],
    toplamFm: 0,
    sgk: 0,
    issizlik: 0,
    gelirVergisi: 0,
    gelirVergisiDilimleri: "",
    damgaVergisi: 0,
    netYillik: 0,
    hakkaniyetIndirimi: 0,
    mahsupTutari: 0,
    sonNet: 0,
    warnings,
  };
}

export function computeTotalsFromRows(
  rows: { fm: number }[],
  exitYear: number,
  mahsupInput: string,
): Omit<Vardiya48Result, "rows" | "warnings"> {
  const toplamFm = rows.reduce((sum, r) => sum + (Number(r.fm) || 0), 0);
  const sgk = Math.round(toplamFm * SGK_ORANI * 100) / 100;
  const issizlik = Math.round(toplamFm * ISSIZLIK_ORANI * 100) / 100;
  const matrah = Math.max(0, toplamFm - sgk - issizlik);
  const gv = calculateIncomeTaxWithBrackets(exitYear, matrah);
  const gelirVergisi = Math.round(gv.tax * 100) / 100;
  const damgaVergisi = Math.round(toplamFm * DAMGA_ORAN * 100) / 100;
  const netYillik = Math.round((toplamFm - sgk - issizlik - gelirVergisi - damgaVergisi) * 100) / 100;
  const hakkaniyetIndirimi = toplamFm / 3;
  const mahsupTutari = parseMoneyInput(mahsupInput);
  const sonNet = Math.max(0, toplamFm - hakkaniyetIndirimi - mahsupTutari);
  return {
    toplamFm,
    sgk,
    issizlik,
    gelirVergisi,
    gelirVergisiDilimleri: gv.summary,
    damgaVergisi,
    netYillik,
    hakkaniyetIndirimi,
    mahsupTutari,
    sonNet,
  };
}

export function computeVardiya48Result(form: Vardiya48FormSnapshot): Vardiya48Result {
  const dateError = validateDateRange(form.iseGiris, form.istenCikis);
  const warnings: string[] = [];
  if (dateError) warnings.push(dateError);
  if (dateError || !form.iseGiris || !form.istenCikis) {
    return emptyResult(warnings);
  }

  const dStart = normalizeDateInput(form.iseGiris);
  const dEnd = normalizeDateInput(form.istenCikis);
  const katSayi = parseKatsayi(form.katSayi);
  const zamanasimiBaslangic = form.zamanasimi?.nihaiBaslangic || null;
  const zNorm48 = zamanasimiBaslangic ? normalizeDateInput(zamanasimiBaslangic) : null;

  const { motor: motorExclusions48, legacy: legacyExclusions48 } = partitionVardiya48Exclusions(form.exclusions);
  const useLegacyDeductionPath48 = exclusionsNeedLegacySplit(form.exclusions);

  let witnessIntervals48 = buildWitnessSegments(dStart, dEnd, form.taniklar);
  if (witnessIntervals48.length === 0) {
    witnessIntervals48 = [{ start: dStart, end: dEnd }];
  }

  const summaryRows48 = witnessIntervals48.flatMap((seg) => {
    const segAnchor = anchorForSegment(dStart, seg.start, form.anchorIsWorkDay);
    const calcExclusions = useLegacyDeductionPath48 ? form.exclusions : legacyExclusions48;
    const baselineSummary = calculate48System({
      witnessSegments: [{ start: seg.start, end: seg.end }],
      anchorStartDate: dStart,
      weekBucketAnchorDate: dStart,
      anchorIsWorkDay: segAnchor,
      exclusions: calcExclusions,
      zNorm: zNorm48,
      davaStart: seg.start,
      davaEnd: seg.end,
    });

    if (useLegacyDeductionPath48 || motorExclusions48.length === 0) {
      return baselineSummary;
    }

    const segId = `v48-${seg.start}-${seg.end}`;
    const segRows = baselineSummary.map((w, idx) => ({
      id: `${segId}-${idx}-${w.startDate}`,
      isManual: false,
      rangeLabel: `${formatDateTR(w.startDate)}–${formatDateTR(w.endDate)}`,
      weeks: w.weekCount,
      brut: getAsgariUcretByDate(w.startDate) || 0,
      katsayi: katSayi,
      fmHours: w.weeklyFmHours,
      calc225: 225,
      factor: 1.5,
      fm: 0,
      net: 0,
      startISO: w.startDate,
      endISO: w.endDate,
      weekTypeLabel: `${w.weekType} gün`,
      yillikIzinAciklama: w.note,
    }));

    const expandedRows = expandVardiya48RowsForDeductions(segRows, motorExclusions48, {
      anchorStartDate: dStart,
      anchorIsWorkDay: segAnchor,
      segmentStart: seg.start,
      segmentEnd: seg.end,
    });

    return expandedRows.map((r) => ({
      startDate: r.startISO,
      endDate: r.endISO,
      weekType: String(parseInt(String(r.weekTypeLabel || "").split(" ")[0] || "0", 10) || 0),
      weekCount: r.weeks,
      weeklyFmHours: r.fmHours,
      note: r.yillikIzinAciklama,
    }));
  });

  const visibleRows48 = summaryRows48.filter((w) => {
    if ((Number(w.weekCount) || 0) <= 0) return false;
    const wt = Number(w.weekType) || 0;
    const fmH = Number(w.weeklyFmHours) || 0;
    return !(wt === 0 && fmH === 0);
  });

  let apiRows: PeriodRow[] = visibleRows48.map((w) => {
    const row: PeriodRow = {
      id: newLocalId(),
      isManual: false,
      rangeLabel: `${formatDateTR(w.startDate)}–${formatDateTR(w.endDate)}`,
      weeks: w.weekCount,
      brut: getAsgariUcretByDate(w.startDate) || 0,
      katsayi: katSayi,
      fmHours: w.weeklyFmHours,
      calc225: 225,
      factor: 1.5,
      fm: 0,
      net: 0,
      startISO: w.startDate,
      endISO: w.endDate,
      weekTypeLabel: `${w.weekType} gün`,
      yillikIzinAciklama: w.note,
      note: w.note,
      isDeductionRow: !!(w.note && String(w.note).trim()),
    };
    return recalcRow(row);
  });

  apiRows = rebalanceSingletonWeekRows(apiRows);
  apiRows = preserveWeeksForPeriod(apiRows, motorExclusions48, legacyExclusions48);

  // mode270: V3 Vardiya48Page her zaman "none" kaydeder ve uygulamıyor — motor parity.

  const withOverrides = applyRowOverrides(apiRows, form.rowOverrides, form.manualRows, katSayi);

  const exitYear = dEnd ? Number(dEnd.slice(0, 4)) : new Date().getFullYear();
  const totals = computeTotalsFromRows(withOverrides, exitYear, form.mahsuplasmaMiktari);

  return {
    rows: withOverrides,
    ...totals,
    warnings,
  };
}
