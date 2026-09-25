/**
 * Tanıklı Standart — toplam hafta koruma (ondalık yok, yeni hafta üretilmez).
 * Yuvarlama/oranlama yok; fark, en çok haftası olan satırlardan başlayarak ±1 ile kapanır.
 */

import { startOfDay } from "date-fns";
import type { FazlaMesaiRowBase } from "../lib/fazlaMesaiShared";

/** 7 günlük adımlarla tam sayı hafta (Math.round / gün÷7 kullanılmaz). */
export function countWeeksBySevenDaySteps(start: Date, end: Date): number {
  if (end < start) return 0;
  let cursor = startOfDay(start);
  const until = startOfDay(end);
  let weeks = 0;
  const MS = 86400000;
  while (cursor <= until) {
    weeks += 1;
    cursor = new Date(cursor.getTime() + 7 * MS);
  }
  return weeks;
}

function segmentDaySpan(row: FazlaMesaiRowBase): number {
  const s = String(row.startISO || "").slice(0, 10);
  const e = String(row.endISO || "").slice(0, 10);
  if (!s || !e) return 0;
  const a = startOfDay(new Date(s));
  const b = startOfDay(new Date(e));
  if (Number.isNaN(+a) || Number.isNaN(+b) || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

/**
 * Satırların hafta toplamını `originalTotalWeeks` ile eşitler; yalnızca tamsayı ±1 ayarlanır.
 */
export function preserveWeeks<T extends FazlaMesaiRowBase>(rows: T[], originalTotalWeeks: number): T[] {
  if (rows.length === 0) return rows;
  const out = rows.map((r) => {
    const s = String(r.startISO || "").slice(0, 10);
    const e = String(r.endISO || "").slice(0, 10);
    if (!s || !e) return { ...r, weeks: 0 } as T;
    const a = startOfDay(new Date(s));
    const b = startOfDay(new Date(e));
    if (Number.isNaN(+a) || Number.isNaN(+b) || b < a) return { ...r, weeks: 0 } as T;
    const pre = (r as { prePreserveWeeks?: number }).prePreserveWeeks;
    const w =
      pre != null && Number.isFinite(pre) && pre >= 0 ? Math.floor(pre) : countWeeksBySevenDaySteps(a, b);
    return { ...r, weeks: w, originalWeekCount: w } as T;
  });

  let sum = 0;
  for (const r of out) sum += Math.max(0, Math.floor(Number(r.weeks) || 0));
  let diff = originalTotalWeeks - sum;
  if (diff === 0) return out.map((r) => ({ ...r, originalWeekCount: r.weeks })) as T[];

  const order = out
    .map((r, i) => ({ i, span: segmentDaySpan(r), w: Math.max(0, Math.floor(Number(r.weeks) || 0)) }))
    .sort((a, b) => b.span - a.span || a.i - b.i)
    .map((x) => x.i);

  let addPtr = 0;
  while (diff > 0 && addPtr < 100000) {
    const i = order[addPtr % order.length];
    const cur = out[i];
    out[i] = { ...cur, weeks: Math.max(0, Math.floor(Number(cur.weeks) || 0)) + 1 } as T;
    diff -= 1;
    addPtr += 1;
  }

  let subPtr = 0;
  while (diff < 0 && subPtr < 100000) {
    let done = false;
    for (let k = 0; k < order.length; k++) {
      const i = order[(subPtr + k) % order.length];
      const cur = out[i];
      const w0 = Math.max(0, Math.floor(Number(cur.weeks) || 0));
      if (w0 > 0) {
        out[i] = { ...cur, weeks: w0 - 1 } as T;
        diff += 1;
        done = true;
        break;
      }
    }
    if (!done) break;
    subPtr += 1;
  }

  return out.map((r) => ({ ...r, originalWeekCount: r.weeks })) as T[];
}
