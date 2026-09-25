/**
 * Fazla Mesai — 24 Saat Vardiya — uçtan uca motor (V3 paritesi, izole).
 */

import { DAMGA_ORAN, FM_DENOMINATOR, FM_KATSAYI, ISSIZLIK_ORANI, PANDEMI_BASLANGIC, PANDEMI_BITIS, PANDEMI_SABIT_GUN, SGK_ORANI } from "./constants";
import { getAsgariUcretByDate } from "./asgariUcret";
import { calculate24System, type PeriodSummary24Row } from "./calculate24System";
import {
  exclusionsNeedLegacySplit,
  expandVardiya24RowsForDeductions,
  isVardiya24MotorDeductionNote,
  isVardiya24TransitionDeductionNote,
  partitionVardiya24Exclusions,
} from "./expandRowsForDeductions";
import { calculateIncomeTaxWithBrackets } from "./incomeTax";
import {
  createEmptyForm,
  newLocalId,
  type PeriodRow,
  type RowOverride,
  type Vardiya24FormSnapshot,
  type Vardiya24Result,
  type Witness,
} from "./model";
import { parseISODateLocal } from "./workDays24";
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
  const s = parseISODateLocal(start);
  const e = parseISODateLocal(end);
  if (!s || !e) return null;
  if (e < s) return "İşten çıkış tarihi, işe giriş tarihinden önce olamaz.";
  return null;
}

function isoToUtcDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetweenIsoInclusive(startISO: string, endISO: string): number {
  return isoToUtcDays(endISO) - isoToUtcDays(startISO) + 1;
}

/** weeks = round(gün/7) — V3 calculateWeeksBetweenDates. */
export function calculateWeeksBetweenDates(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const s = parseISODateLocal(startISO);
  const e = parseISODateLocal(endISO);
  if (!s || !e || e < s) return 0;
  const diffDays = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  return Math.max(0, Math.round(diffDays / 7));
}

export function computeZamanasimiNihaiBaslangic(
  davaTarihi: string,
  arabuluculukBaslangic: string,
  arabuluculukBitis: string,
  iseGiris: string,
): string | null {
  if (!isValidIsoDate(davaTarihi)) return null;
  const davaMs = isoToUtcMs(davaTarihi);
  const dObj = new Date(davaMs);
  const limitMs = Date.UTC(dObj.getUTCFullYear() - 5, dObj.getUTCMonth(), dObj.getUTCDate());

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
  const d = new Date(nihaiMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Para: Number(((weeks*fmHours*brut*katsayi)/225*1.5).toFixed(2)) */
export function calcRowFm(brut: number, katsayi: number, weeks: number, fmHours: number): number {
  if (!brut || !fmHours || weeks <= 0) return 0;
  const k = katsayi > 0 ? katsayi : 1;
  return Number((((weeks * fmHours * brut * k) / FM_DENOMINATOR) * FM_KATSAYI).toFixed(2));
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

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Tanık aralıklarından segmentler (V3 `Vardiya24Page.buildWitnessSegments`). */
export function buildWitnessSegments(
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

export function anchorForSegment(
  globalStart: string,
  segmentStart: string,
  baseAnchorIsWorkDay: boolean,
): boolean {
  const gs = parseISODateLocal(globalStart);
  const ss = parseISODateLocal(segmentStart);
  if (!gs || !ss) return baseAnchorIsWorkDay;
  const diffDays = Math.floor((startOfDay(ss).getTime() - startOfDay(gs).getTime()) / 86400000);
  if (diffDays <= 0) return baseAnchorIsWorkDay;
  return diffDays % 2 === 0 ? baseAnchorIsWorkDay : !baseAnchorIsWorkDay;
}

function summaryToRows(
  summary: PeriodSummary24Row[],
  idPrefix: string,
  katsayi: number,
): PeriodRow[] {
  return summary.map((w, idx) => {
    const weeks = Math.max(0, Math.round(Number(w.weekCount) || 0));
    const fmHours = Number(w.weeklyFmHours) || 0;
    const brut = getAsgariUcretByDate(w.startDate) || 0;
    const note = w.note || undefined;
    return {
      id: `${idPrefix}-${idx}-${w.startDate}`,
      isManual: false,
      startISO: w.startDate,
      endISO: w.endDate,
      weeks,
      brut,
      katsayi,
      fmHours,
      fm: calcRowFm(brut, katsayi, weeks, fmHours),
      weekTypeLabel: `${w.weekType} gün`,
      note,
      yillikIzinAciklama: note,
      isDeductionRow: !!note,
    };
  });
}

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
    const weeks = (Number(base.weeks) || 0) + 1;
    patched.set(best.id || "", {
      ...base,
      weeks,
      fm: calcRowFm(base.brut, base.katsayi, weeks, base.fmHours),
    });
    toDrop.add(singleton.id || "");
  });

  if (toDrop.size === 0 && patched.size === 0) return rows;
  return rows.filter((r) => !toDrop.has(r.id || "")).map((r) => patched.get(r.id || "") || r);
}

function normalize24RowsFromBaseline(
  rows: PeriodRow[],
  baselineRows: PeriodSummary24Row[],
): PeriodRow[] {
  if (!rows.length || !baselineRows.length) return rows;
  const out = rows.map((r) => ({ ...r }));
  const trRe = /\((\d+)\s*->\s*(\d+)\s*gün\)/i;

  const baselineMap = new Map<string, number>();
  baselineRows.forEach((b) => {
    baselineMap.set(
      `${b.startDate}|${b.endDate}|${String(b.weekType)}`,
      Math.max(0, Math.round(Number(b.weekCount) || 0)),
    );
  });

  const periodsWithTransition = new Set<string>();
  const periodsWithMotorDeduction = new Set<string>();

  out.forEach((r) => {
    if (!trRe.test(String(r.yillikIzinAciklama || r.note || ""))) return;
    const rs = (r.startISO || "").slice(0, 10);
    const container = out.find((x) => {
      const note = String(x.yillikIzinAciklama || x.note || "");
      if (trRe.test(note)) return false;
      const xs = (x.startISO || "").slice(0, 10);
      const xe = (x.endISO || "").slice(0, 10);
      return !!rs && !!xs && !!xe && xs <= rs && rs <= xe;
    });
    if (!container) return;
    periodsWithTransition.add(
      `${(container.startISO || "").slice(0, 10)}|${(container.endISO || "").slice(0, 10)}`,
    );
  });

  out.forEach((r) => {
    if (!isVardiya24MotorDeductionNote(r.yillikIzinAciklama || r.note)) return;
    const rs = (r.startISO || "").slice(0, 10);
    const re = (r.endISO || "").slice(0, 10);
    const wageContainer = out.find((x) => {
      if (isVardiya24MotorDeductionNote(x.yillikIzinAciklama || x.note)) return false;
      if (isVardiya24TransitionDeductionNote(x.yillikIzinAciklama || x.note)) return false;
      const xs = (x.startISO || "").slice(0, 10);
      const xe = (x.endISO || "").slice(0, 10);
      return !!rs && !!re && xs <= rs && re <= xe && (xs !== rs || xe !== re);
    });
    if (!wageContainer) return;
    periodsWithMotorDeduction.add(
      `${(wageContainer.startISO || "").slice(0, 10)}|${(wageContainer.endISO || "").slice(0, 10)}`,
    );
  });

  out.forEach((r, i) => {
    if (trRe.test(String(r.yillikIzinAciklama || r.note || ""))) return;
    const periodKey = `${(r.startISO || "").slice(0, 10)}|${(r.endISO || "").slice(0, 10)}`;
    if (periodsWithTransition.has(periodKey) || periodsWithMotorDeduction.has(periodKey)) return;
    const weekType = String(parseInt(String(r.weekTypeLabel || "").split(" ")[0] || "0", 10) || 0);
    const bw = baselineMap.get(
      `${(r.startISO || "").slice(0, 10)}|${(r.endISO || "").slice(0, 10)}|${weekType}`,
    );
    if (bw != null) out[i].weeks = bw;
  });

  const periodTransitionWeeks = new Map<string, number>();
  const periodAddBack4Weeks = new Map<string, number>();
  out.forEach((r, idx) => {
    const originalNote = String(r.yillikIzinAciklama || r.note || "");
    const m = trRe.exec(originalNote);
    if (!m) return;
    const before = Number(m[1]);
    const after = Number(m[2]);
    const trWeeks = Math.max(0, Math.round(Number(r.weeks) || 0));
    const rs = (r.startISO || "").slice(0, 10);
    const container = out.find((x) => {
      const note = String(x.yillikIzinAciklama || x.note || "");
      if (trRe.test(note)) return false;
      const xs = (x.startISO || "").slice(0, 10);
      const xe = (x.endISO || "").slice(0, 10);
      return !!rs && !!xs && !!xe && xs <= rs && rs <= xe;
    });
    if (!container) return;
    const key = `${(container.startISO || "").slice(0, 10)}|${(container.endISO || "").slice(0, 10)}`;
    if (before === 4) periodAddBack4Weeks.set(key, (periodAddBack4Weeks.get(key) || 0) + trWeeks);
    if (Number.isFinite(before) && Number.isFinite(after) && before === 4) {
      const mappedBefore = 3;
      const mappedAfter = Math.max(0, after - 1);
      const mappedNote = originalNote.replace(
        /\((\d+)\s*->\s*(\d+)\s*gün\)/i,
        `(${mappedBefore}->${mappedAfter} gün)`,
      );
      out[idx].yillikIzinAciklama = mappedNote;
      out[idx].note = mappedNote;
      out[idx].weekTypeLabel = `${mappedAfter} gün`;
      out[idx].fmHours = mappedAfter * 3;
    }
    periodTransitionWeeks.set(key, (periodTransitionWeeks.get(key) || 0) + trWeeks);
  });

  periodTransitionWeeks.forEach((sumWeeks, key) => {
    const [cs, ce] = key.split("|");
    const donorIdx = out.findIndex((x) => {
      const note = String(x.yillikIzinAciklama || x.note || "");
      if (trRe.test(note)) return false;
      if ((x.startISO || "").slice(0, 10) !== cs) return false;
      if ((x.endISO || "").slice(0, 10) !== ce) return false;
      return (parseInt(String(x.weekTypeLabel || "").split(" ")[0] || "0", 10) || 0) === 3;
    });
    const idx4 = out.findIndex((x) => {
      const note = String(x.yillikIzinAciklama || x.note || "");
      if (trRe.test(note)) return false;
      if ((x.startISO || "").slice(0, 10) !== cs) return false;
      if ((x.endISO || "").slice(0, 10) !== ce) return false;
      return (parseInt(String(x.weekTypeLabel || "").split(" ")[0] || "0", 10) || 0) === 4;
    });
    if (donorIdx >= 0) {
      out[donorIdx].weeks = Math.max(0, Math.round(Number(out[donorIdx].weeks) || 0) - sumWeeks);
    }
    const addBack4 = Math.max(0, Math.round(Number(periodAddBack4Weeks.get(key) || 0)));
    if (idx4 >= 0 && addBack4 > 0) {
      out[idx4].weeks = Math.max(0, Math.round(Number(out[idx4].weeks) || 0) + addBack4);
    }
  });

  return out;
}

/** Dönem toplam haftasını round(gün/7) ile eşitle (V3 preserveWeeks eşdeğeri). */
function preserveWeeksByPeriod(rows: PeriodRow[]): PeriodRow[] {
  const nextRows = rows.map((r) => ({ ...r, weeks: Math.max(0, Math.round(Number(r.weeks) || 0)) }));
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
      if (!isVardiya24TransitionDeductionNote(r.yillikIzinAciklama || r.note)) return false;
      const rs = (r.startISO || "").slice(0, 10);
      const re = (r.endISO || "").slice(0, 10);
      return rs >= ps && re <= pe;
    });
    if (transitionRowsInWindow.length > 0) return;

    const expectedRoundedWeeks = Math.max(0, calculateWeeksBetweenDates(ps, pe));
    const currentWeeks = nextRows.reduce((acc, r) => {
      const rs = (r.startISO || "").slice(0, 10);
      const re = (r.endISO || "").slice(0, 10);
      if (!rs || !re || rs < ps || re > pe) return acc;
      const isWageSpanRow = rs === ps && re === pe;
      const isMotorDedInside =
        isVardiya24MotorDeductionNote(r.yillikIzinAciklama || r.note) && rs >= ps && re <= pe;
      if (!isWageSpanRow && !isMotorDedInside) return acc;
      return acc + Math.max(0, Math.round(Number(r.weeks) || 0));
    }, 0);

    let deltaWeeks = expectedRoundedWeeks - currentWeeks;
    if (deltaWeeks === 0) return;

    const normalAdjustableIdxs = idxs.filter(
      (i) => !isVardiya24MotorDeductionNote(nextRows[i].yillikIzinAciklama || nextRows[i].note),
    );
    if (!normalAdjustableIdxs.length) return;

    while (deltaWeeks > 0) {
      let targetIdx = normalAdjustableIdxs[0];
      for (let k = 1; k < normalAdjustableIdxs.length; k += 1) {
        const i = normalAdjustableIdxs[k];
        if ((Number(nextRows[i].weeks) || 0) < (Number(nextRows[targetIdx].weeks) || 0)) targetIdx = i;
      }
      nextRows[targetIdx] = {
        ...nextRows[targetIdx],
        weeks: (Number(nextRows[targetIdx].weeks) || 0) + 1,
      };
      deltaWeeks -= 1;
    }

    while (deltaWeeks < 0) {
      let targetIdx = -1;
      for (let k = 0; k < normalAdjustableIdxs.length; k += 1) {
        const i = normalAdjustableIdxs[k];
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

  return nextRows.map((r) => ({
    ...r,
    fm: calcRowFm(r.brut, r.katsayi, r.weeks, r.fmHours),
  }));
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
    if (!ov) {
      if (!row.isManual) return row;
      const fm = calcRowFm(row.brut, row.katsayi || defaultKatsayi, row.weeks, row.fmHours);
      return { ...row, katsayi: row.katsayi || defaultKatsayi, fm };
    }
    const startISO = ov.startISO ?? row.startISO;
    const endISO = ov.endISO ?? row.endISO;
    const hasDateOverride = ov.startISO !== undefined || ov.endISO !== undefined;
    let weeks = ov.weeks ?? row.weeks;
    let brut = ov.brut ?? row.brut;
    if (hasDateOverride && startISO && endISO && startISO.length >= 10 && endISO.length >= 10) {
      if (ov.weeks === undefined) weeks = Math.max(1, calculateWeeksBetweenDates(startISO, endISO) || 1);
      if (ov.brut === undefined) brut = getAsgariUcretByDate(startISO) || 0;
    }
    const fmHours = ov.fmHours ?? row.fmHours;
    const katsayi = row.katsayi || defaultKatsayi;
    return {
      ...row,
      startISO,
      endISO,
      weeks,
      brut,
      fmHours,
      katsayi,
      fm: calcRowFm(brut, katsayi, weeks, fmHours),
    };
  };

  const automatic: PeriodRow[] = [];
  for (const row of rows) {
    const next = applyOne(row);
    if (next) automatic.push(next);
  }

  const manuals = (manualRows ?? [])
    .map((row) => applyOne({ ...row, isManual: true }))
    .filter((r): r is PeriodRow => r != null);

  const result: PeriodRow[] = [];
  const placed = new Set<string>();
  for (const autoRow of automatic) {
    result.push(autoRow);
    for (const m of manuals) {
      if (m.insertAfter === autoRow.id) {
        result.push(m);
        placed.add(m.id);
      }
    }
  }
  for (const m of manuals) {
    if (!placed.has(m.id)) result.push(m);
  }
  return result;
}

export function createManualPeriodRow(afterId: string, katsayi: number): PeriodRow {
  return {
    id: newLocalId(),
    isManual: true,
    insertAfter: afterId,
    startISO: "",
    endISO: "",
    weeks: 0,
    brut: 0,
    katsayi,
    fmHours: 0,
    fm: 0,
    weekTypeLabel: "-",
  };
}

export function computeTotalsFromRows(
  rows: { fm: number }[],
  exitYear: number,
  mahsupInput: string,
): Omit<Vardiya24Result, "rows" | "warnings" | "dateError"> {
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

function emptyResult(dateError: string | null): Vardiya24Result {
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
    mahsupTutari: parseMoneyInput(""),
    sonNet: 0,
    warnings: [],
    dateError,
  };
}

export function computeVardiya24Result(form: Vardiya24FormSnapshot): Vardiya24Result {
  const dateError = validateDateRange(form.iseGiris, form.istenCikis);
  if (dateError || !form.iseGiris || !form.istenCikis) {
    return emptyResult(dateError);
  }

  let dStart = normalizeDateInput(form.iseGiris);
  const dEnd = normalizeDateInput(form.istenCikis);
  const nihai = form.zamanasimi?.nihaiBaslangic;
  if (nihai && isValidIsoDate(nihai) && nihai > dStart) {
    dStart = nihai;
  }
  if (dStart > dEnd) {
    return emptyResult(null);
  }

  const katsayi = parseKatsayi(form.katSayi);
  let witnessIntervals = buildWitnessSegments(dStart, dEnd, form.taniklar || []);
  if (witnessIntervals.length === 0) {
    witnessIntervals = [{ start: dStart, end: dEnd }];
  }

  const useLegacy = exclusionsNeedLegacySplit(form.exclusions);
  const { motor: motorExclusions, legacy: legacyExclusions } = partitionVardiya24Exclusions(
    form.exclusions,
  );

  const summaryRows = witnessIntervals.flatMap((seg) => {
    const segAnchor = anchorForSegment(dStart, seg.start, form.anchorIsWorkDay);
    const calcExclusions = useLegacy ? form.exclusions : legacyExclusions;
    const baselineSummary = calculate24System({
      startDate: seg.start,
      endDate: seg.end,
      exclusions: calcExclusions,
      anchorIsWorkDay: segAnchor,
      anchorStartDate: dStart,
      forceBucketDeductionForAllExclusions: false,
      mergeUbgtChangedIntoSevenDayEnvelope: useLegacy,
    });

    if (useLegacy || motorExclusions.length === 0) {
      return baselineSummary;
    }

    const segId = `v24-${seg.start}-${seg.end}`;
    let segRows = summaryToRows(baselineSummary, segId, katsayi);
    segRows = expandVardiya24RowsForDeductions(segRows, motorExclusions, {
      anchorStartDate: dStart,
      anchorIsWorkDay: segAnchor,
      segmentStart: seg.start,
      segmentEnd: seg.end,
    });

    return segRows.map((r) => ({
      startDate: r.startISO,
      endDate: r.endISO,
      weekType: String(parseInt(String(r.weekTypeLabel || "").split(" ")[0] || "0", 10) || 0),
      weekCount: r.weeks,
      weeklyFmHours: r.fmHours,
      note: r.yillikIzinAciklama || r.note,
    }));
  });

  const baselineSummaryRows = witnessIntervals.flatMap((seg) => {
    const segAnchor = anchorForSegment(dStart, seg.start, form.anchorIsWorkDay);
    return calculate24System({
      startDate: seg.start,
      endDate: seg.end,
      exclusions: [],
      anchorIsWorkDay: segAnchor,
      anchorStartDate: dStart,
    });
  });

  let apiRows = summaryToRows(summaryRows, "v24", katsayi);
  apiRows = rebalanceSingletonWeekRows(apiRows);
  apiRows = normalize24RowsFromBaseline(apiRows, baselineSummaryRows);
  apiRows = preserveWeeksByPeriod(apiRows);

  // mode270: V3 her zaman "none" — simple/detailed UI alanı kayıt için tutulur, motor uygulamıyor.
  const withOverrides = applyRowOverrides(
    apiRows,
    form.rowOverrides || {},
    form.manualRows || [],
    katsayi,
  );

  const exitYear = form.istenCikis
    ? Number(form.istenCikis.slice(0, 4))
    : new Date().getFullYear();
  const totals = computeTotalsFromRows(withOverrides, exitYear, form.mahsup);

  return {
    rows: withOverrides,
    ...totals,
    warnings: [],
    dateError: null,
  };
}

export { createEmptyForm };
