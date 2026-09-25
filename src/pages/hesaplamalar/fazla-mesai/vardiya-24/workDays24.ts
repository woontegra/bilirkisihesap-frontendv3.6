/**
 * 24/24 vardiya — çalışma günü üretimi, dışlama, haftalık kova (V3 mantığı, izole).
 */

export type WorkDay = { date: string; isWork: boolean };

export type Weekly24Row = {
  weekStartMonday: string;
  startDate: string;
  endDate: string;
  workDayCount: number;
  fazlaMesaiSaat: number;
};

export type ExclusionLike = {
  type?: string;
  start?: string;
  end?: string;
  days?: number;
};

function parseISODateLocal(iso: string): Date | null {
  const raw = String(iso || "").trim();
  if (!raw) return null;
  const s = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(+dt)) return dt;
  }
  const tr = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  if (tr) {
    const dt = new Date(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1]));
    if (!Number.isNaN(+dt)) return dt;
  }
  const any = new Date(raw);
  if (!Number.isNaN(+any)) return new Date(any.getFullYear(), any.getMonth(), any.getDate());
  return null;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function daySerialUTC(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function diffCalendarDays(a: Date, b: Date): number {
  return daySerialUTC(a) - daySerialUTC(b);
}

/** Gün aşırı çalışma: index=0 ilk gün; anchor=true → ilk gün çalışma. */
export function generateWorkDays24(input: {
  startDate: string;
  endDate: string;
  anchorIsWorkDay: boolean;
}): WorkDay[] {
  const start = parseISODateLocal(input.startDate);
  const end = parseISODateLocal(input.endDate);
  if (!start || !end || end < start) return [];
  const out: WorkDay[] = [];
  const cur = new Date(start);
  let i = 0;
  while (cur <= end) {
    const even = i % 2 === 0;
    out.push({ date: toISODate(cur), isWork: input.anchorIsWorkDay ? even : !even });
    cur.setDate(cur.getDate() + 1);
    i += 1;
  }
  return out;
}

export function getAnchorWeekBucketKey(dateIso: string, anchorStartIso: string): string | null {
  const dt = parseISODateLocal(String(dateIso).slice(0, 10));
  const anchorStart = parseISODateLocal(String(anchorStartIso).slice(0, 10));
  if (!dt || !anchorStart) return null;
  const dayOffset = diffCalendarDays(dt, anchorStart);
  const cycleIndex = dayOffset < 0 ? 0 : Math.floor(dayOffset / 7);
  return toISODate(addDaysLocal(anchorStart, cycleIndex * 7));
}

export function groupWeeks24(
  workDays: WorkDay[],
  opts?: { periodStart?: string; periodEnd?: string },
): Weekly24Row[] {
  if (!workDays.length) return [];
  const ps = opts?.periodStart ? parseISODateLocal(String(opts.periodStart).slice(0, 10)) : null;
  const pe = opts?.periodEnd ? parseISODateLocal(String(opts.periodEnd).slice(0, 10)) : null;
  const anchorStart = ps;

  const weeklyMap = new Map<
    string,
    { weekStartMonday: string; startDate: string; endDate: string; workDayCount: number }
  >();

  workDays.forEach((d) => {
    const dt = parseISODateLocal(d.date);
    if (!dt) return;
    let bucketStart: Date;
    if (anchorStart) {
      const dayOffset = diffCalendarDays(dt, anchorStart);
      const cycleIndex = dayOffset < 0 ? 0 : Math.floor(dayOffset / 7);
      bucketStart = addDaysLocal(anchorStart, cycleIndex * 7);
    } else {
      const day = dt.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      bucketStart = addDaysLocal(dt, diff);
      if (pe) {
        const weekEnd = addDaysLocal(bucketStart, 6);
        if (weekEnd > pe) {
          const prevMon = addDaysLocal(bucketStart, -7);
          const periodStartBound = opts?.periodStart
            ? parseISODateLocal(String(opts.periodStart).slice(0, 10))
            : null;
          if (!periodStartBound || prevMon >= periodStartBound) bucketStart = prevMon;
        }
      }
    }
    const key = toISODate(bucketStart);
    const prev = weeklyMap.get(key);
    const cur = prev || { weekStartMonday: key, startDate: key, endDate: key, workDayCount: 0 };
    const next = { ...cur, weekStartMonday: key };
    if (d.date < next.startDate) next.startDate = d.date;
    if (d.date > next.endDate) next.endDate = d.date;
    if (d.isWork) next.workDayCount += 1;
    weeklyMap.set(key, next);
  });

  return [...weeklyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, w]) => ({
      weekStartMonday: w.weekStartMonday,
      startDate: w.startDate,
      endDate: w.endDate,
      workDayCount: w.workDayCount,
      fazlaMesaiSaat: Math.max(0, w.workDayCount) * 3,
    }))
    .filter((r) => r.workDayCount > 0);
}

/** UBGT + Yıllık İzin: ardışık bloklarda 1 düş / 1 atla. */
export function buildEffectiveSequentialDates(exclusions: ExclusionLike[]): Set<string> {
  const raw = new Set<string>();
  exclusions.forEach((ex) => {
    const type = String(ex.type || "").trim();
    if (type !== "UBGT" && type !== "Yıllık İzin") return;
    const s = parseISODateLocal(String(ex.start || ""));
    const e = parseISODateLocal(String(ex.end || ""));
    if (!s || !e || e < s) return;
    const capRaw = Number(ex.days);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : null;
    const cur = new Date(s);
    let used = 0;
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      raw.add(toISODate(cur));
      used += 1;
      cur.setDate(cur.getDate() + 1);
    }
  });

  const sorted = [...raw].sort((a, b) => a.localeCompare(b));
  const effective = new Set<string>();
  let i = 0;
  while (i < sorted.length) {
    const block: string[] = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length) {
      const prev = parseISODateLocal(sorted[j - 1]);
      const curD = parseISODateLocal(sorted[j]);
      if (!prev || !curD) break;
      if (toISODate(addDaysLocal(prev, 1)) !== sorted[j]) break;
      block.push(sorted[j]);
      j += 1;
    }
    for (let k = 0; k < block.length; k += 1) {
      if (k % 2 === 0) effective.add(block[k]);
    }
    i = j;
  }
  return effective;
}

export function buildEffectiveUbgtDates(exclusions: ExclusionLike[]): Set<string> {
  return buildEffectiveSequentialDates(exclusions.filter((e) => String(e.type || "").trim() === "UBGT"));
}

function materializeExclusionDates(exclusions: ExclusionLike[]): { normal: Set<string>; forced: string[] } {
  const normal = new Set<string>();
  const forced: string[] = [];
  const effectiveSeq = buildEffectiveSequentialDates(exclusions);
  exclusions.forEach((ex) => {
    const s = parseISODateLocal(String(ex.start || ""));
    const e = parseISODateLocal(String(ex.end || ""));
    if (!s || !e || e < s) return;
    const type = String(ex.type || "").trim();
    const isForcedType = type === "Puantaj/Bordro" || type === "Puantaj-Bordro";
    const capRaw = Number(ex.days);
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : null;
    const cur = new Date(s);
    let used = 0;
    while (cur <= e) {
      if (cap != null && used >= cap) break;
      const key = toISODate(cur);
      if (type === "UBGT" || type === "Yıllık İzin") {
        if (effectiveSeq.has(key)) forced.push(key);
      } else if (isForcedType) {
        forced.push(key);
      } else {
        normal.add(key);
      }
      used += 1;
      cur.setDate(cur.getDate() + 1);
    }
  });
  return { normal, forced };
}

function buildSevenDayBlocks(dates: Iterable<string>): Array<{ start: string; end: string; count: number }> {
  const sorted = [...new Set(dates)].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) return [];
  const blocks: Array<{ start: string; end: string; count: number }> = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i];
    const startDt = parseISODateLocal(start);
    if (!startDt) {
      i += 1;
      continue;
    }
    const end = toISODate(addDaysLocal(startDt, 6));
    let count = 0;
    while (i < sorted.length && sorted[i] <= end) {
      count += 1;
      i += 1;
    }
    blocks.push({ start, end, count });
  }
  return blocks;
}

/** UBGT/izin yalnız çalışma gününden düşülür. */
export function applyExclusions24(
  workDays: WorkDay[],
  exclusions: ExclusionLike[] | null | undefined,
  _forcedDeductionAnchorIso?: string | null,
  options?: { respectWorkdayFilter?: boolean },
): WorkDay[] {
  if (!exclusions?.length) return workDays;
  const respectWorkdayFilter = options?.respectWorkdayFilter ?? true;
  const { normal, forced } = materializeExclusionDates(exclusions);
  const out = respectWorkdayFilter
    ? workDays.map((d) => (d.isWork && normal.has(d.date) ? { ...d, isWork: false } : { ...d }))
    : workDays.map((d) => ({ ...d }));

  const forcedAll = [...forced];
  if (!respectWorkdayFilter) normal.forEach((iso) => forcedAll.push(iso));
  if (!forcedAll.length) return out;

  buildSevenDayBlocks(forcedAll).forEach((block) => {
    let need = block.count;
    for (let idx = 0; idx < out.length; idx += 1) {
      if (need <= 0) break;
      const dayIso = out[idx].date;
      if (dayIso < block.start || dayIso > block.end) continue;
      if (!out[idx].isWork) continue;
      out[idx] = { ...out[idx], isWork: false };
      need -= 1;
    }
  });
  return out;
}

export { parseISODateLocal, toISODate, addDaysLocal };
