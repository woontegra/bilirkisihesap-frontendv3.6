/**
 * Dönemsel Haftalık — saat / desen / metin yardımcıları (V3 utils haftalikMode).
 */

import { MONTH_OPTIONS, WEEKLY_HOLIDAY_REFERENCE_HOURS, WEEKLY_WORK_LIMIT } from "./constants";
import type { DonemselHaftalikWitness, SeasonalHaftalikPattern } from "./model";

export type DeductionDailyHourStrategy = "MIN" | "MAX" | "GROUP_1" | "GROUP_2";
export const deductionDailyHourStrategy: DeductionDailyHourStrategy = "MIN";

/** V3 donemsel calcDailyBrutBreakNet — ara dinlenme. */
export function calcDailyBrutBreakNet(
  startTime: string,
  endTime: string,
): { brut: number; breakH: number; net: number } {
  const s = (startTime || "").trim();
  const e = (endTime || "").trim();
  if (!s || !e) return { brut: 0, breakH: 0, net: 0 };
  const [girH, girM] = s.split(":").map(Number);
  const [cikH, cikM] = e.split(":").map(Number);
  const girMin = girH * 60 + (girM || 0);
  const cikMin = cikH * 60 + (cikM || 0);
  const dailyBrut = (cikMin - girMin) / 60;
  let breakH = 1;
  if (dailyBrut >= 15) breakH = 3;
  else if (dailyBrut >= 14) breakH = 2;
  else if (dailyBrut >= 11) breakH = 1.5;
  const net = Math.max(0, dailyBrut - breakH);
  return { brut: dailyBrut, breakH, net };
}

export function calcDailyNetHours(startTime: string, endTime: string): number {
  return calcDailyBrutBreakNet(startTime, endTime).net;
}

export function ceilWeeklyWorkHoursToHalfHour(weeklyTotal: number): number {
  if (!Number.isFinite(weeklyTotal) || weeklyTotal <= 0) return 0;
  const EPS = 1e-7;
  const doubled = weeklyTotal * 2;
  const nearestHalf = Math.round(doubled);
  if (Math.abs(doubled - nearestHalf) < EPS) return nearestHalf / 2;
  return Math.ceil(doubled - EPS) / 2;
}

export function fmtHour(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

export function patternDays1(p: SeasonalHaftalikPattern): number {
  const n = Number(p.days1);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(7, Math.floor(n)));
}

export function patternDays2(p: SeasonalHaftalikPattern): number {
  const n = Number(p.days2);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(7, Math.floor(n)));
}

/** V3 calcFmHoursPerWeekHaftalik. */
export function calcFmHoursPerWeekHaftalik(pattern: SeasonalHaftalikPattern): number {
  const d1 = patternDays1(pattern);
  const d2 = patternDays2(pattern);
  const net1 =
    pattern.startTime && pattern.endTime ? calcDailyNetHours(pattern.startTime, pattern.endTime) : 0;
  const net2 =
    pattern.startTime2 && pattern.endTime2
      ? calcDailyNetHours(pattern.startTime2, pattern.endTime2)
      : 0;

  const totalDays = d1 + d2;
  const useHoliday = Boolean(pattern.hasWeeklyHoliday) && totalDays === 7 && (d1 > 0 || d2 > 0);
  const holidayRow = pattern.weeklyHolidayRow === 1 ? 1 : 2;

  let weeklyTotal = 0;
  if (!useHoliday) {
    weeklyTotal = d1 * net1 + d2 * net2;
  } else {
    const g1H = holidayRow === 1 && d1 > 0;
    const g2H = holidayRow === 2 && d2 > 0;
    if (g1H) {
      weeklyTotal += (d1 - 1) * net1 + Math.max(0, net1 - WEEKLY_HOLIDAY_REFERENCE_HOURS);
    } else {
      weeklyTotal += d1 * net1;
    }
    if (g2H) {
      weeklyTotal += (d2 - 1) * net2 + Math.max(0, net2 - WEEKLY_HOLIDAY_REFERENCE_HOURS);
    } else {
      weeklyTotal += d2 * net2;
    }
  }
  return Math.max(0, ceilWeeklyWorkHoursToHalfHour(weeklyTotal) - WEEKLY_WORK_LIMIT);
}

export function weeklyNetFromHaftalikPattern(pattern: SeasonalHaftalikPattern): number {
  return calcFmHoursPerWeekHaftalik(pattern) + WEEKLY_WORK_LIMIT;
}

export function collectSeasonalGroupNetDailiesInOrder(pattern: SeasonalHaftalikPattern): number[] {
  const d1 = patternDays1(pattern);
  const d2 = patternDays2(pattern);
  const net1 =
    d1 > 0 && pattern.startTime && pattern.endTime
      ? calcDailyNetHours(pattern.startTime, pattern.endTime)
      : 0;
  const net2 =
    d2 > 0 && pattern.startTime2 && pattern.endTime2
      ? calcDailyNetHours(pattern.startTime2, pattern.endTime2)
      : 0;
  return [net1, net2];
}

export function resolveDeductionMarginalNetHours(
  groupNetDailiesInOrder: number[],
  strategy: DeductionDailyHourStrategy = deductionDailyHourStrategy,
): number {
  const positive = groupNetDailiesInOrder.filter((n) => Number.isFinite(n) && n > 0);
  switch (strategy) {
    case "MIN":
      return positive.length ? Math.min(...positive) : 0;
    case "MAX":
      return positive.length ? Math.max(...positive) : 0;
    case "GROUP_1":
      return groupNetDailiesInOrder[0] ?? 0;
    case "GROUP_2":
      return groupNetDailiesInOrder[1] ?? 0;
    default:
      return 0;
  }
}

export function calculateDonemselHaftalikDeductionFmHours(opts: {
  pattern: SeasonalHaftalikPattern;
  deductionDates: Array<{ dateISO: string; dayWeight: number }>;
}): number {
  const { pattern, deductionDates } = opts;
  if (!deductionDates?.length) return calcFmHoursPerWeekHaftalik(pattern);

  let weeklyNet = weeklyNetFromHaftalikPattern(pattern);
  const marginalPerDay = resolveDeductionMarginalNetHours(
    collectSeasonalGroupNetDailiesInOrder(pattern),
  );
  if (marginalPerDay <= 0) return calcFmHoursPerWeekHaftalik(pattern);

  const seen = new Set<string>();
  for (const item of deductionDates) {
    const dateISO = String(item.dateISO || "").slice(0, 10);
    if (!dateISO || seen.has(dateISO)) continue;
    seen.add(dateISO);
    const weight = Math.max(0, Math.min(1, Number(item.dayWeight) || 1));
    weeklyNet = Math.max(0, weeklyNet - marginalPerDay * weight);
  }

  const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(weeklyNet);
  const h = Math.max(0, roundedWeekly - WEEKLY_WORK_LIMIT);
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Number(h.toFixed(2));
}

export function annualLeaveMetaFromHaftalikPattern(pattern: SeasonalHaftalikPattern): {
  dailyNet: number;
  annualLeaveHg: number;
  annualLeaveSevenDay: "tatilli" | "tatilsiz";
} {
  const d1 = patternDays1(pattern);
  const d2 = patternDays2(pattern);
  const net1 =
    pattern.startTime && pattern.endTime ? calcDailyNetHours(pattern.startTime, pattern.endTime) : 0;
  const net2 =
    pattern.startTime2 && pattern.endTime2
      ? calcDailyNetHours(pattern.startTime2, pattern.endTime2)
      : net1;
  const denom = d1 + d2;
  const dailyNet = denom > 0 ? (d1 * net1 + d2 * net2) / denom : net1;
  const totalDays = d1 + d2;
  const useHoliday = Boolean(pattern.hasWeeklyHoliday) && totalDays === 7 && (d1 > 0 || d2 > 0);
  return {
    dailyNet,
    annualLeaveHg: Math.max(1, Math.min(7, totalDays || 6)),
    annualLeaveSevenDay: useHoliday ? "tatilli" : "tatilsiz",
  };
}

export function weeklyIgnoredWeekdayFromHaftalikPattern(
  pattern: SeasonalHaftalikPattern,
): number | null {
  const d1 = patternDays1(pattern);
  const d2 = patternDays2(pattern);
  if (!pattern.hasWeeklyHoliday || d1 + d2 !== 7) return null;
  const w = pattern.weeklyHolidayWeekday;
  if (w != null && Number.isFinite(w) && w >= 0 && w <= 6) return Math.floor(Number(w));
  return null;
}

function timeToMins(t: string): number {
  const [h, m] = (t || "").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function minsToTime(mins: number): string {
  const x = Math.max(0, Math.min(24 * 60 - 1, mins));
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
}

function clampTimePair(
  wStart: string,
  wEnd: string,
  dStart: string,
  dEnd: string,
): { start: string; end: string } {
  const ds = (dStart || "").trim();
  const de = (dEnd || "").trim();
  const ws = (wStart || "").trim();
  const we = (wEnd || "").trim();
  if (!ws || !we) return { start: ws, end: we };
  if (!ds || !de) return { start: ws, end: we };
  const gIn = Math.max(timeToMins(ws), timeToMins(ds));
  const gOut = Math.min(timeToMins(we), timeToMins(de));
  if (gIn >= gOut) return { start: ds, end: de };
  return { start: minsToTime(gIn), end: minsToTime(gOut) };
}

function witnessHaftalikDaysCappedToTotal(
  w1Raw: number,
  w2Raw: number,
  d1: number,
  d2: number,
): { days1: number; days2: number } {
  const w1 = Math.max(0, Math.min(7, w1Raw));
  const w2 = Math.max(0, Math.min(7, w2Raw));
  const dSum = Math.max(0, Math.min(14, d1 + d2));
  const T = Math.min(w1 + w2, dSum);
  let w1p = Math.min(w1, T);
  let w2p = T - w1p;
  if (w2p > w2) {
    w2p = w2;
    w1p = T - w2p;
  }
  if (w1p > w1) {
    w1p = w1;
    w2p = T - w1p;
  }
  return { days1: w1p, days2: w2p };
}

export function clampWitnessSeasonalToDavaci(
  davaci: SeasonalHaftalikPattern,
  witness: SeasonalHaftalikPattern,
): SeasonalHaftalikPattern {
  const w = { ...witness };
  const d1 = patternDays1(davaci);
  const d2 = patternDays2(davaci);
  const w1 = patternDays1(w);
  const w2 = patternDays2(w);
  const capped = witnessHaftalikDaysCappedToTotal(w1, w2, d1, d2);
  w.days1 = capped.days1 > 0 ? String(capped.days1) : "";
  w.days2 = capped.days2 > 0 ? String(capped.days2) : "";
  const dSum = d1 + d2;
  const wSum = capped.days1 + capped.days2;
  if (dSum < 7 || wSum < 7) {
    w.hasWeeklyHoliday = false;
  } else {
    w.hasWeeklyHoliday = Boolean(davaci.hasWeeklyHoliday);
    if (w.hasWeeklyHoliday) {
      w.weeklyHolidayRow = davaci.weeklyHolidayRow === 1 ? 1 : 2;
      const wh = davaci.weeklyHolidayWeekday;
      w.weeklyHolidayWeekday =
        wh != null && Number.isFinite(wh) && wh >= 0 && wh <= 6 ? Math.floor(Number(wh)) : 0;
    }
  }
  const c1 = clampTimePair(w.startTime, w.endTime, davaci.startTime, davaci.endTime);
  w.startTime = c1.start;
  w.endTime = c1.end;
  const d2s = (davaci.startTime2 || davaci.startTime || "").trim();
  const d2e = (davaci.endTime2 || davaci.endTime || "").trim();
  const w2s = (w.startTime2 || "").trim();
  const w2e = (w.endTime2 || "").trim();
  if (w2s && w2e) {
    const c2 = clampTimePair(w2s, w2e, d2s, d2e);
    w.startTime2 = c2.start;
    w.endTime2 = c2.end;
  }
  return w;
}

const HTML_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarYmd(ymd: string): boolean {
  if (!HTML_DATE_RE.test(ymd)) return false;
  const y = parseInt(ymd.slice(0, 4), 10);
  const mo = parseInt(ymd.slice(5, 7), 10);
  const da = parseInt(ymd.slice(8, 10), 10);
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(y, mo - 1, da);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === da;
}

export function toHtmlDateInputValue(raw: string | undefined | null): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const head = s.slice(0, 10);
  if (HTML_DATE_RE.test(head) && isValidCalendarYmd(head)) return head;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const out = `${y}-${m}-${day}`;
  if (!HTML_DATE_RE.test(out) || !isValidCalendarYmd(out)) return "";
  if (y < 1900 || y > 2100) return "";
  return out;
}

export function clampDonemselWitnessDateRangeOnly(
  dateIn: string,
  dateOut: string,
  witnesses: DonemselHaftalikWitness[],
): DonemselHaftalikWitness[] {
  const di = toHtmlDateInputValue(dateIn);
  const dout = toHtmlDateInputValue(dateOut);
  return witnesses.map((w) => {
    const rawIn = String(w.dateIn ?? "").trim();
    const rawOut = String(w.dateOut ?? "").trim();
    let dateInW = rawIn.length > 10 ? rawIn.slice(0, 10) : rawIn;
    let dateOutW = rawOut.length > 10 ? rawOut.slice(0, 10) : rawOut;
    const inOk = HTML_DATE_RE.test(dateInW) && isValidCalendarYmd(dateInW);
    const outOk = HTML_DATE_RE.test(dateOutW) && isValidCalendarYmd(dateOutW);
    if (HTML_DATE_RE.test(di) && HTML_DATE_RE.test(dout) && inOk && outOk) {
      if (dateOutW > dout) dateOutW = dout;
      if (dateInW > dateOutW) {
        dateInW = di;
        dateOutW = di;
      }
    }
    return { ...w, dateIn: dateInW, dateOut: dateOutW };
  });
}

export function clampDonemselWitnessesToDavaci(
  dateIn: string,
  dateOut: string,
  davaciSummer: SeasonalHaftalikPattern,
  davaciWinter: SeasonalHaftalikPattern,
  witnesses: DonemselHaftalikWitness[],
): DonemselHaftalikWitness[] {
  const dated = clampDonemselWitnessDateRangeOnly(dateIn, dateOut, witnesses);
  return dated.map((w) => ({
    ...w,
    summerPattern: clampWitnessSeasonalToDavaci(davaciSummer, w.summerPattern),
    winterPattern: clampWitnessSeasonalToDavaci(davaciWinter, w.winterPattern),
  }));
}

export function applyWitnessOverlapSplit(
  witnesses: DonemselHaftalikWitness[],
): DonemselHaftalikWitness[] {
  const filtered = witnesses.filter((w) => w.dateIn && w.dateOut && w.dateIn < w.dateOut);
  if (filtered.length === 0) return [];
  const sorted = [...filtered].sort(
    (a, b) => new Date(a.dateIn).getTime() - new Date(b.dateIn).getTime(),
  );
  const result: DonemselHaftalikWitness[] = [];
  sorted.forEach((w, idx) => {
    const wStart = new Date(w.dateIn);
    const wEnd = new Date(w.dateOut);
    const overlapping = sorted.filter((o, oi) => {
      if (oi === idx) return false;
      const oStart = new Date(o.dateIn);
      const _oEnd = new Date(o.dateOut);
      return oStart > wStart && oStart < wEnd && _oEnd > wStart;
    });
    if (overlapping.length === 0) {
      result.push(w);
      return;
    }
    let cur = new Date(wStart);
    overlapping.sort((a, b) => new Date(a.dateIn).getTime() - new Date(b.dateIn).getTime());
    overlapping.forEach((ov) => {
      const ovStart = new Date(ov.dateIn);
      const ovEnd = new Date(ov.dateOut);
      if (cur < ovStart) {
        const segEnd = new Date(ovStart);
        segEnd.setDate(segEnd.getDate() - 1);
        if (segEnd >= cur) {
          result.push({
            ...w,
            dateIn: cur.toISOString().slice(0, 10),
            dateOut: segEnd.toISOString().slice(0, 10),
          });
        }
      }
      const next = new Date(ovEnd);
      next.setDate(next.getDate() + 1);
      cur = next;
    });
    if (cur <= wEnd) {
      result.push({
        ...w,
        dateIn: cur.toISOString().slice(0, 10),
        dateOut: wEnd.toISOString().slice(0, 10),
      });
    }
  });
  return result;
}

export type WitnessInterval = {
  start: string;
  end: string;
  witnessData?: DonemselHaftalikWitness;
};

export function buildIntervalsFromWitnesses(
  dateIn: string,
  dateOut: string,
  witnesses: DonemselHaftalikWitness[],
): WitnessInterval[] {
  const splitWitnesses = applyWitnessOverlapSplit(witnesses);
  const filtered =
    splitWitnesses.length > 0
      ? splitWitnesses
      : witnesses.filter((w) => w.dateIn && w.dateOut);
  if (filtered.length === 0) {
    return [{ start: dateIn, end: dateOut }];
  }
  const dates = new Set<string>();
  dates.add(dateIn);
  dates.add(dateOut);
  filtered.forEach((w) => {
    const s = w.dateIn < dateIn ? dateIn : w.dateIn;
    const e = w.dateOut > dateOut ? dateOut : w.dateOut;
    if (s < e) {
      dates.add(s);
      dates.add(e);
    }
  });
  const sorted = Array.from(dates).sort();
  const intervals: WitnessInterval[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    const inRange = filtered.find((w) => {
      const ws = w.dateIn < dateIn ? dateIn : w.dateIn;
      const we = w.dateOut > dateOut ? dateOut : w.dateOut;
      return ws <= s && we >= e;
    });
    if (inRange) {
      intervals.push({ start: s, end: e, witnessData: inRange });
    }
  }
  if (intervals.length === 0) {
    return [{ start: dateIn, end: dateOut }];
  }
  return intervals;
}

function formatSeasonMonths(months: number[]): string {
  const u = [...new Set((months || []).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
  if (u.length === 0) return "—";
  return u.map((m) => MONTH_OPTIONS.find((x) => x.value === m)?.label ?? String(m)).join(", ");
}

function donemselSeasonBlockHaftalik(
  seasonTitle: string,
  monthLabel: string,
  pattern: SeasonalHaftalikPattern,
): string {
  const H = fmtHour;
  const head = `${seasonTitle} (${monthLabel})`;
  const d1 = patternDays1(pattern);
  const d2 = patternDays2(pattern);
  const st1 = (pattern.startTime || "").trim();
  const et1 = (pattern.endTime || "").trim();
  const st2 = (pattern.startTime2 || "").trim();
  const et2 = (pattern.endTime2 || "").trim();

  if (d1 === 0 && d2 === 0) {
    return `${head}\nGrup gün sayılarını giriniz.`;
  }
  if (d1 > 0 && (!st1 || !et1)) return `${head}\nGrup 1 için giriş ve çıkış saatlerini giriniz.`;
  if (d2 > 0 && (!st2 || !et2)) return `${head}\nGrup 2 için giriş ve çıkış saatlerini giriniz.`;

  const b1 = d1 > 0 ? calcDailyBrutBreakNet(st1, et1) : { brut: 0, breakH: 0, net: 0 };
  const b2 = d2 > 0 ? calcDailyBrutBreakNet(st2, et2) : { brut: 0, breakH: 0, net: 0 };
  const net1 = b1.net;
  const net2 = b2.net;

  const lines: string[] = [head];
  if (d1 > 0) {
    lines.push(
      `Grup 1 — ${d1} gün: ${st1} - ${et1} = ${H(b1.brut)} saat çalışma, - ${H(b1.breakH)} saat ara dinlenme = ${H(net1)} saat günlük net`,
    );
  }
  if (d2 > 0) {
    lines.push(
      `Grup 2 — ${d2} gün: ${st2} - ${et2} = ${H(b2.brut)} saat çalışma, - ${H(b2.breakH)} saat ara dinlenme = ${H(net2)} saat günlük net`,
    );
  }

  const totalDays = d1 + d2;
  const useHoliday = Boolean(pattern.hasWeeklyHoliday) && totalDays === 7 && (d1 > 0 || d2 > 0);
  const holidayRow = pattern.weeklyHolidayRow === 1 ? 1 : 2;

  let weeklyTotal = 0;
  if (!useHoliday) {
    weeklyTotal = d1 * net1 + d2 * net2;
    const parts: string[] = [];
    if (d1 > 0) parts.push(`${d1} × ${H(net1)}`);
    if (d2 > 0) parts.push(`${d2} × ${H(net2)}`);
    lines.push(`Toplam: ${parts.join(" + ")} = ${H(weeklyTotal)} saat`);
  } else {
    lines.push(
      `Toplam 7 gün ve hafta tatili seçili: ${holidayRow === 1 ? "Grup 1" : "Grup 2"} hafta tatili günü 7,5 saat referansına göre düşülür.`,
    );
    const g1H = holidayRow === 1 && d1 > 0;
    const g2H = holidayRow === 2 && d2 > 0;
    if (g1H) {
      const part = (d1 - 1) * net1 + Math.max(0, net1 - WEEKLY_HOLIDAY_REFERENCE_HOURS);
      weeklyTotal += part;
      lines.push(`Grup 1: (${d1} - 1) × ${H(net1)} + (${H(net1)} - 7,5) = ${H(part)} saat`);
    } else {
      const part = d1 * net1;
      weeklyTotal += part;
      if (d1 > 0) lines.push(`Grup 1: ${d1} × ${H(net1)} = ${H(part)} saat`);
    }
    if (g2H) {
      const part = (d2 - 1) * net2 + Math.max(0, net2 - WEEKLY_HOLIDAY_REFERENCE_HOURS);
      weeklyTotal += part;
      lines.push(`Grup 2: (${d2} - 1) × ${H(net2)} + (${H(net2)} - 7,5) = ${H(part)} saat`);
    } else {
      const part = d2 * net2;
      weeklyTotal += part;
      if (d2 > 0) lines.push(`Grup 2: ${d2} × ${H(net2)} = ${H(part)} saat`);
    }
    lines.push(`Ara toplam (yuvarlama öncesi): ${H(weeklyTotal)} saat`);
  }

  const rounded = ceilWeeklyWorkHoursToHalfHour(weeklyTotal);
  const fm = calcFmHoursPerWeekHaftalik(pattern);
  lines.push(`Yuvarlanmış haftalık çalışma: ${H(rounded)} saat`);
  lines.push(
    `${H(rounded)} - ${WEEKLY_WORK_LIMIT} (yasal haftalık çalışma) = ${H(fm)} saat haftalık fazla mesai`,
  );
  return lines.join("\n");
}

export function buildDonemselFmMetinCards(opts: {
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalHaftalikPattern;
  winterPattern: SeasonalHaftalikPattern;
  witnesses: DonemselHaftalikWitness[];
}): Array<{ key: string; text: string }> {
  const witnessesForMetin = clampDonemselWitnessesToDavaci(
    opts.dateIn,
    opts.dateOut,
    opts.summerPattern,
    opts.winterPattern,
    opts.witnesses,
  );

  const seasonBlocks = (sumP: SeasonalHaftalikPattern, winP: SeasonalHaftalikPattern) => {
    const yazM = formatSeasonMonths(sumP.months);
    const kisM = formatSeasonMonths(winP.months);
    const yaz = donemselSeasonBlockHaftalik("YAZ", yazM, sumP);
    const kis = donemselSeasonBlockHaftalik("KIŞ", kisM, winP);
    return [yaz, kis].join("\n\n");
  };

  const out: Array<{ key: string; text: string }> = [];
  out.push({
    key: "davaci",
    text: ["DAVACI:", "", seasonBlocks(opts.summerPattern, opts.winterPattern)].join("\n"),
  });

  witnessesForMetin.forEach((w, i) => {
    const name = ((w.name || "").trim() || `TANIK ${i + 1}`).toUpperCase();
    out.push({
      key: `witness-metin-${i}-${w.id}`,
      text: [
        `${name}:`,
        "",
        seasonBlocks(w.summerPattern, w.winterPattern),
      ].join("\n"),
    });
  });

  return out;
}
