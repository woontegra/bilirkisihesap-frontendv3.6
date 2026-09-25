/**
 * Tanıklı Standart — UBGT / izin: ana dönem satırı BÖLÜNMEZ; yalnızca 7 günlük blok(lar) için ayrı satır eklenir.
 * Blok başlangıcı ilk seçilen dışlama günüdür (Pazartesi bazlı hafta kullanılmaz).
 */

import { addDays, startOfDay } from "date-fns";
import { countWeeksBySevenDaySteps } from "./preserveWeeks.rule";
import type { ExcludedDay } from "../types/exclusionStorage";
import type { FazlaMesaiRowBase } from "../lib/fazlaMesaiShared";
import { getAsgariUcretByDate } from "../lib/fazlaMesaiShared";

const FM_TYPES = new Set([
  "Yıllık İzin",
  "UBGT",
  "Rapor",
  "Diğer",
  "Puantaj/Bordro",
]);

export type TanikliSplitContext = {
  /** Haftalık tatil günü (0=Pazar); null = tüm günler dışlamaya açık */
  weeklyOffDay: number | null;
};

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(s: string): Date | null {
  const head = String(s || "").trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return startOfDay(dt);
}

function dateMax(a: Date, b: Date): Date {
  return a > b ? a : b;
}

function dateMin(a: Date, b: Date): Date {
  return a < b ? a : b;
}

function isWorkDay(d: Date, weeklyOff: number | null): boolean {
  if (weeklyOff == null) return true;
  return d.getDay() !== weeklyOff;
}

/** [start,end] kapanık aralıkta haftalık tatil hariç gün sayısı */
function countWorkDaysInInclusiveRange(start: Date, end: Date, weeklyOff: number | null): number {
  let n = 0;
  let cur = new Date(start);
  while (cur <= end) {
    if (isWorkDay(cur, weeklyOff)) n += 1;
    cur = addDays(cur, 1);
  }
  return n;
}

/** Dışlama kayıtlarından takvim günleri (tatil günü atlanır; days > 0 ise üst sınır). */
function materializeAnchors(exclusions: ExcludedDay[], weeklyOff: number | null): Date[] {
  const out: Date[] = [];
  for (const ex of exclusions) {
    if (!FM_TYPES.has(String(ex.type || ""))) continue;
    const s = parseIsoDate(ex.start);
    const e = parseIsoDate(ex.end);
    if (!s || !e || s > e) continue;
    const cap = Number(ex.days) > 0 && Number.isFinite(Number(ex.days)) ? Math.floor(Number(ex.days)) : null;
    let used = 0;
    let cur = new Date(s);
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      if (isWorkDay(cur, weeklyOff)) {
        out.push(startOfDay(cur));
        if (cap != null) used += 1;
      }
      cur = addDays(cur, 1);
    }
  }
  out.sort((a, b) => a.getTime() - b.getTime());
  const seen = new Set<string>();
  const uniq: Date[] = [];
  for (const d of out) {
    const k = toISODate(d);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(d);
  }
  return uniq;
}

type MergedBlock = { start: Date; end: Date; anchors: Date[] };

function buildMergedBlocks(anchors: Date[]): MergedBlock[] {
  if (anchors.length === 0) return [];
  const sorted = [...anchors].sort((a, b) => a.getTime() - b.getTime());
  const out: MergedBlock[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = startOfDay(sorted[i]);
    const end = addDays(start, 6);
    const group: Date[] = [];
    while (i < sorted.length && sorted[i].getTime() <= end.getTime()) {
      group.push(startOfDay(sorted[i]));
      i += 1;
    }
    out.push({ start, end, anchors: group });
  }
  return out;
}

function blockCaption(anchorsInSlice: number): string {
  if (anchorsInSlice <= 0) return "";
  return `(${anchorsInSlice} gün dışlama düşülmüştür)`;
}

/**
 * Ana cetvel satırı tarih aralığında kalır; kesişen her dışlama bloğu için ek satır üretilir.
 */
export function splitByExclusions(
  rows: FazlaMesaiRowBase[],
  exclusions: ExcludedDay[],
  ctx: TanikliSplitContext
): FazlaMesaiRowBase[] {
  if (!exclusions?.length) {
    return rows.map((r) => {
      const s = String(r.startISO || "").slice(0, 10);
      const e = String(r.endISO || "").slice(0, 10);
      const a = parseIsoDate(s);
      const b = parseIsoDate(e);
      const seg = a && b && a <= b ? countWorkDaysInInclusiveRange(a, b, ctx.weeklyOffDay) : 0;
      const Wpre =
        a && b && a <= b
          ? Math.max(0, Math.floor(Number(r.weeks) || 0)) || countWeeksBySevenDaySteps(a, b)
          : Math.max(0, Math.floor(Number(r.weeks) || 0));
      return {
        ...r,
        segmentWorkDays: seg,
        excludedDays: 0,
        totalDays: seg,
        isExclusionBlock: false,
        prePreserveWeeks: Wpre,
      } as FazlaMesaiRowBase;
    });
  }

  const anchors = materializeAnchors(exclusions, ctx.weeklyOffDay);
  const blocks = buildMergedBlocks(anchors);
  if (blocks.length === 0) {
    return rows.map((r) => {
      const s = String(r.startISO || "").slice(0, 10);
      const e = String(r.endISO || "").slice(0, 10);
      const a = parseIsoDate(s);
      const b = parseIsoDate(e);
      const seg = a && b && a <= b ? countWorkDaysInInclusiveRange(a, b, ctx.weeklyOffDay) : 0;
      const Wpre =
        a && b && a <= b
          ? Math.max(0, Math.floor(Number(r.weeks) || 0)) || countWeeksBySevenDaySteps(a, b)
          : Math.max(0, Math.floor(Number(r.weeks) || 0));
      return {
        ...r,
        segmentWorkDays: seg,
        excludedDays: 0,
        totalDays: seg,
        isExclusionBlock: false,
        prePreserveWeeks: Wpre,
      } as FazlaMesaiRowBase;
    });
  }

  const out: FazlaMesaiRowBase[] = [];

  for (const row of rows) {
    const s = String(row.startISO || "").slice(0, 10);
    const e = String(row.endISO || "").slice(0, 10);
    const rowStart = parseIsoDate(s);
    const rowEnd = parseIsoDate(e);
    if (!rowStart || !rowEnd || rowEnd < rowStart) {
      out.push({
        ...row,
        prePreserveWeeks: Math.max(0, Math.floor(Number(row.weeks) || 0)),
      } as FazlaMesaiRowBase);
      continue;
    }

    const overlapping = blocks
      .filter((b) => !(b.end < rowStart || b.start > rowEnd))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    if (overlapping.length === 0) {
      const seg = countWorkDaysInInclusiveRange(rowStart, rowEnd, ctx.weeklyOffDay);
      const Wrow =
        Math.max(0, Math.floor(Number(row.weeks) || 0)) ||
        countWeeksBySevenDaySteps(rowStart, rowEnd);
      out.push({
        ...row,
        segmentWorkDays: seg,
        excludedDays: 0,
        totalDays: seg,
        isExclusionBlock: false,
        prePreserveWeeks: Wrow,
      } as FazlaMesaiRowBase);
      continue;
    }

    const segmentMain = countWorkDaysInInclusiveRange(rowStart, rowEnd, ctx.weeklyOffDay);

    let blockWeeksSum = 0;
    const blockMeta: Array<{ b0: Date; b1: Date; w: number; excl: number; seg: number }> = [];
    for (const blk of overlapping) {
      const b0 = dateMax(rowStart, blk.start);
      const b1 = dateMin(rowEnd, blk.end);
      if (b0 > b1) continue;
      const wBlk = countWeeksBySevenDaySteps(b0, b1);
      blockWeeksSum += wBlk;
      const anchorsInSlice = blk.anchors.filter((d) => d >= b0 && d <= b1);
      const seg = countWorkDaysInInclusiveRange(b0, b1, ctx.weeklyOffDay);
      blockMeta.push({ b0, b1, w: wBlk, excl: anchorsInSlice.length, seg });
    }

    const W =
      Math.max(0, Math.floor(Number(row.weeks) || 0)) ||
      countWeeksBySevenDaySteps(rowStart, rowEnd);
    const mainWeeks = Math.max(0, W - blockWeeksSum);

    const mainStartISO = toISODate(rowStart);
    const mainEndISO = toISODate(rowEnd);
    out.push({
      ...row,
      startISO: mainStartISO,
      endISO: mainEndISO,
      rangeLabel: `${mainStartISO} – ${mainEndISO}`,
      segmentWorkDays: segmentMain,
      /** Blok satırı aynı günleri FM’de taşıdığı için ana satırda tekrar düşülmez (çift sayım yok). */
      excludedDays: 0,
      totalDays: segmentMain,
      isExclusionBlock: false,
      prePreserveWeeks: mainWeeks,
      yillikIzinAciklama: undefined,
    } as FazlaMesaiRowBase);

    for (const bm of blockMeta) {
      const startISO = toISODate(bm.b0);
      const endISO = toISODate(bm.b1);
      const brut = getAsgariUcretByDate(startISO) ?? row.brut;
      out.push({
        ...row,
        id: `${row.id}-b-${startISO}`,
        startISO,
        endISO,
        rangeLabel: `${startISO} – ${endISO}`,
        brut,
        segmentWorkDays: bm.seg,
        excludedDays: bm.excl,
        totalDays: bm.seg,
        yillikIzinAciklama: blockCaption(bm.excl),
        isExclusionBlock: true,
        prePreserveWeeks: bm.w,
      } as FazlaMesaiRowBase);
    }
  }

  return out;
}
