/**
 * V3 `preserveWeeks.rule` — izolasyon içinde yeniden yazım (date-fns yok).
 * Toplam haftayı `originalTotalWeeks` ile eşitler; yalnızca tamsayı ±1 ayarlanır.
 */

import type { PeriodRow } from "./model";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLocalDay(iso: string): Date | null {
  const head = String(iso || "").trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return startOfLocalDay(dt);
}

/** 7 günlük adımlarla tam sayı hafta (Math.round / gün÷7 kullanılmaz). */
export function countWeeksBySevenDaySteps(start: Date, end: Date): number {
  if (end < start) return 0;
  let cursor = startOfLocalDay(start);
  const until = startOfLocalDay(end);
  let weeks = 0;
  const MS = 86400000;
  while (cursor <= until) {
    weeks += 1;
    cursor = new Date(cursor.getTime() + 7 * MS);
  }
  return weeks;
}

function segmentDaySpan(row: PeriodRow): number {
  const a = parseLocalDay(row.startISO || "");
  const b = parseLocalDay(row.endISO || "");
  if (!a || !b || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

export function preserveWeeks(rows: PeriodRow[], originalTotalWeeks: number): PeriodRow[] {
  if (rows.length === 0) return rows;
  const out = rows.map((r) => {
    const a = parseLocalDay(r.startISO || "");
    const b = parseLocalDay(r.endISO || "");
    if (!a || !b || b < a) return { ...r, weeks: 0 };
    const pre = r.prePreserveWeeks;
    const w =
      pre != null && Number.isFinite(pre) && pre >= 0
        ? Math.floor(pre)
        : countWeeksBySevenDaySteps(a, b);
    return { ...r, weeks: w, originalWeekCount: w };
  });

  let sum = 0;
  for (const r of out) sum += Math.max(0, Math.floor(Number(r.weeks) || 0));
  let diff = originalTotalWeeks - sum;
  if (diff === 0) return out.map((r) => ({ ...r, originalWeekCount: r.weeks }));

  const order = out
    .map((r, i) => ({ i, span: segmentDaySpan(r), w: Math.max(0, Math.floor(Number(r.weeks) || 0)) }))
    .sort((a, b) => b.span - a.span || a.i - b.i)
    .map((x) => x.i);

  let addPtr = 0;
  while (diff > 0 && addPtr < 100000) {
    const i = order[addPtr % order.length];
    const cur = out[i];
    out[i] = { ...cur, weeks: Math.max(0, Math.floor(Number(cur.weeks) || 0)) + 1 };
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
        out[i] = { ...cur, weeks: w0 - 1 };
        diff += 1;
        done = true;
        break;
      }
    }
    if (!done) break;
    subPtr += 1;
  }

  return out.map((r) => ({ ...r, originalWeekCount: r.weeks }));
}
