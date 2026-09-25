/**
 * Dönemsel klasik — saat / desen / metin yardımcıları (V3 utils simple variant).
 */

import { MONTH_OPTIONS, WEEKLY_HOLIDAY_REFERENCE_HOURS, WEEKLY_WORK_LIMIT } from "./constants";
import type { DonemselWitness, SeasonalPattern, SevenDayMode } from "./model";

export function fmtHours(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

export function workDaysFromPattern(pattern: SeasonalPattern, legacyFallback?: number): number {
  const w = Number(String(pattern.workDays ?? "").replace(",", "."));
  if (Number.isFinite(w)) {
    const n = Math.floor(w);
    if (n >= 1 && n <= 7) return n;
  }
  if (legacyFallback != null && Number.isFinite(legacyFallback)) {
    return Math.max(1, Math.min(7, Math.floor(legacyFallback)));
  }
  return 6;
}

export function sevenModeFromPattern(
  pattern: SeasonalPattern,
  legacy?: SevenDayMode,
): SevenDayMode {
  if (pattern.sevenDayMode === "tatilli" || pattern.sevenDayMode === "tatilsiz") {
    return pattern.sevenDayMode;
  }
  return legacy ?? "tatilsiz";
}

export function classicSevenTabForWitnessOrDavaci(
  pattern: SeasonalPattern,
  davaciSameSeason: SeasonalPattern | undefined,
  isWitness: boolean,
  legacy?: SevenDayMode,
): SevenDayMode {
  if (isWitness && davaciSameSeason && workDaysFromPattern(pattern) === 7) {
    return sevenModeFromPattern(davaciSameSeason, legacy);
  }
  return sevenModeFromPattern(pattern, legacy);
}

export function effectiveClassicWorkDays(
  segmentPattern: SeasonalPattern,
  davaciSameSeason: SeasonalPattern,
  hasWitness: boolean,
  legacyFallback?: number,
): number {
  const raw = workDaysFromPattern(segmentPattern, legacyFallback);
  if (!hasWitness) return raw;
  const cap = workDaysFromPattern(davaciSameSeason, legacyFallback);
  return Math.min(raw, cap);
}

export function calcDailyBrutBreakNet(
  startTime: string,
  endTime: string,
): { brut: number; breakH: number; net: number } {
  const s = (startTime || "").trim();
  const e = (endTime || "").trim();
  if (!s || !e) return { brut: 0, breakH: 0, net: 0 };
  const [girH, girM] = s.split(":").map(Number);
  const [cikH, cikM] = e.split(":").map(Number);
  let girMin = girH * 60 + (girM || 0);
  let cikMin = cikH * 60 + (cikM || 0);
  if (!Number.isFinite(girMin) || !Number.isFinite(cikMin)) return { brut: 0, breakH: 0, net: 0 };
  if (cikMin <= girMin) cikMin += 24 * 60;
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

/** V3 ceilWeeklyWorkHoursToHalfHour. */
export function ceilWeeklyWorkHoursToHalfHour(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  const doubled = hours * 2;
  if (Math.abs(doubled - Math.round(doubled)) < 1e-9) return hours;
  return Math.ceil(doubled) / 2;
}

export function calcFmHoursPerWeek(
  pattern: SeasonalPattern,
  workDays: number,
  activeTab: SevenDayMode,
): number {
  const dailyNet = calcDailyNetHours(pattern.startTime, pattern.endTime);
  if (workDays === 7 && activeTab === "tatilli") {
    const weeklyNormal = 6 * dailyNet;
    const holidayOT = Math.max(0, dailyNet - WEEKLY_HOLIDAY_REFERENCE_HOURS);
    const weeklyTotal = weeklyNormal + holidayOT;
    return Math.max(0, ceilWeeklyWorkHoursToHalfHour(weeklyTotal) - WEEKLY_WORK_LIMIT);
  }
  const weeklyTotal = dailyNet * workDays;
  return Math.max(0, ceilWeeklyWorkHoursToHalfHour(weeklyTotal) - WEEKLY_WORK_LIMIT);
}

export function weeklyIgnoredWeekdayFromPattern(pattern: SeasonalPattern): number | null {
  if (workDaysFromPattern(pattern) !== 7) return null;
  if (sevenModeFromPattern(pattern) !== "tatilli") return null;
  const w = pattern.weeklyHolidayWeekday;
  if (w != null && Number.isFinite(w) && w >= 0 && w <= 6) return Math.floor(Number(w));
  return null;
}

export function annualLeaveMetaFromPattern(
  pattern: SeasonalPattern,
  legacyWeeklyDays?: number,
  legacyActiveTab?: SevenDayMode,
): { dailyNet: number; annualLeaveHg: number; annualLeaveSevenDay: SevenDayMode } {
  const dailyNet = calcDailyNetHours(pattern.startTime, pattern.endTime);
  const annualLeaveHg = workDaysFromPattern(pattern, legacyWeeklyDays);
  const annualLeaveSevenDay = sevenModeFromPattern(pattern, legacyActiveTab);
  return { dailyNet, annualLeaveHg, annualLeaveSevenDay };
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

export function clampWitnessSeasonalToDavaci(
  davaci: SeasonalPattern,
  witness: SeasonalPattern,
): SeasonalPattern {
  const w = { ...witness };
  const c = clampTimePair(w.startTime, w.endTime, davaci.startTime, davaci.endTime);
  w.startTime = c.start;
  w.endTime = c.end;
  const dw = workDaysFromPattern(davaci);
  const ww = workDaysFromPattern(witness);
  const wd = Math.min(dw, ww);
  w.workDays = String(wd);
  if (wd === 7 && dw === 7) {
    w.sevenDayMode = sevenModeFromPattern(davaci);
    w.weeklyHolidayWeekday = davaci.weeklyHolidayWeekday;
  } else {
    w.sevenDayMode = "tatilsiz";
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
  return "";
}

export function clampDonemselWitnessDateRangeOnly(
  dateIn: string,
  dateOut: string,
  witnesses: DonemselWitness[],
): DonemselWitness[] {
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
  davaciSummer: SeasonalPattern,
  davaciWinter: SeasonalPattern,
  witnesses: DonemselWitness[],
  clampSeasonal = true,
): DonemselWitness[] {
  const dated = clampDonemselWitnessDateRangeOnly(dateIn, dateOut, witnesses);
  return dated.map((w) => ({
    ...w,
    summerPattern: clampSeasonal
      ? clampWitnessSeasonalToDavaci(davaciSummer, w.summerPattern)
      : w.summerPattern,
    winterPattern: clampSeasonal
      ? clampWitnessSeasonalToDavaci(davaciWinter, w.winterPattern)
      : w.winterPattern,
  }));
}

function applyWitnessOverlapSplit(witnesses: DonemselWitness[]): DonemselWitness[] {
  const filtered = witnesses.filter((w) => w.dateIn && w.dateOut && w.dateIn < w.dateOut);
  if (filtered.length === 0) return [];
  const sorted = [...filtered].sort((a, b) => a.dateIn.localeCompare(b.dateIn));
  const result: DonemselWitness[] = [];
  sorted.forEach((w, idx) => {
    const wStart = new Date(w.dateIn);
    const wEnd = new Date(w.dateOut);
    const overlapping = sorted.filter((o, oi) => {
      if (oi === idx) return false;
      const oStart = new Date(o.dateIn);
      return oStart > wStart && oStart < wEnd;
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
            dateIn: toISO(cur),
            dateOut: toISO(segEnd),
          });
        }
      }
      const next = new Date(ovEnd);
      next.setDate(next.getDate() + 1);
      cur = next;
    });
    if (cur <= wEnd) {
      result.push({ ...w, dateIn: toISO(cur), dateOut: toISO(wEnd) });
    }
  });
  return result;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type WitnessInterval = {
  start: string;
  end: string;
  start_time: string;
  end_time: string;
  witnessData?: DonemselWitness;
};

export function buildIntervalsFromWitnesses(
  dateIn: string,
  dateOut: string,
  davaciSummer: SeasonalPattern,
  _davaciWinter: SeasonalPattern,
  witnesses: DonemselWitness[],
): WitnessInterval[] {
  const splitWitnesses = applyWitnessOverlapSplit(witnesses);
  const filtered =
    splitWitnesses.length > 0 ? splitWitnesses : witnesses.filter((w) => w.dateIn && w.dateOut);
  if (filtered.length === 0) {
    return [
      {
        start: dateIn,
        end: dateOut,
        start_time: davaciSummer.startTime,
        end_time: davaciSummer.endTime,
      },
    ];
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
      const month = new Date(s).getMonth() + 1;
      const isYaz = inRange.summerPattern.months.includes(month);
      const p = isYaz ? inRange.summerPattern : inRange.winterPattern;
      intervals.push({
        start: s,
        end: e,
        start_time: p.startTime,
        end_time: p.endTime,
        witnessData: inRange,
      });
    }
  }
  if (intervals.length === 0) {
    return [
      {
        start: dateIn,
        end: dateOut,
        start_time: davaciSummer.startTime,
        end_time: davaciSummer.endTime,
      },
    ];
  }
  return intervals;
}

function formatSeasonMonths(months: number[]): string {
  const u = [...new Set((months || []).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
  if (u.length === 0) return "—";
  return u.map((m) => MONTH_OPTIONS.find((x) => x.value === m)?.label ?? String(m)).join(", ");
}

function donemselSeasonBlockSimple(
  seasonTitle: string,
  monthLabel: string,
  pattern: SeasonalPattern,
  davaciSameSeason?: SeasonalPattern,
  isWitnessCard?: boolean,
): string {
  const H = fmtHours;
  const st = (pattern.startTime || "").trim();
  const et = (pattern.endTime || "").trim();
  const head = `${seasonTitle} (${monthLabel})`;
  if (!st || !et) {
    return `${head}\nBu dönem için giriş ve çıkış saatlerini giriniz.`;
  }
  const { brut, breakH, net } = calcDailyBrutBreakNet(st, et);
  const wd =
    isWitnessCard && davaciSameSeason
      ? effectiveClassicWorkDays(pattern, davaciSameSeason, true)
      : workDaysFromPattern(pattern);
  const tab =
    isWitnessCard && davaciSameSeason && wd === 7
      ? classicSevenTabForWitnessOrDavaci(pattern, davaciSameSeason, true)
      : wd === 7
        ? sevenModeFromPattern(pattern)
        : "tatilsiz";
  const fmHours = calcFmHoursPerWeek(pattern, wd, tab);
  const lines: string[] = [
    head,
    `${st} - ${et} = ${H(brut)} saat çalışma`,
    `- ${H(breakH)} saat ara dinlenme`,
    `= ${H(net)} saat günlük çalışma`,
  ];
  if (wd === 7 && tab === "tatilli") {
    const weeklyNormal = 6 * net;
    const extraHT = Math.max(0, net - WEEKLY_HOLIDAY_REFERENCE_HOURS);
    const weeklyTotal = weeklyNormal + extraHT;
    const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(weeklyTotal);
    lines.push(`6 x ${H(net)} = ${H(weeklyNormal)} saat çalışma`);
    lines.push(`${H(net)} - 7,5 = ${H(extraHT)} saat hafta tatili fazla çalışma`);
    lines.push(`= ${H(weeklyTotal)} saat haftalık çalışma`);
    lines.push(`= ${H(roundedWeekly)} saat haftalık çalışma`);
  } else if (wd === 7 && tab === "tatilsiz") {
    const weeklyTotal = net * 7;
    const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(weeklyTotal);
    lines.push(`7 x ${H(net)} = ${H(weeklyTotal)} saat çalışma`);
    lines.push(`= ${H(roundedWeekly)} saat haftalık çalışma`);
  } else {
    const weeklyTotal = net * wd;
    const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(weeklyTotal);
    lines.push(`${wd} x ${H(net)} = ${H(weeklyTotal)} saat çalışma`);
    lines.push(`= ${H(roundedWeekly)} saat haftalık çalışma`);
  }
  lines.push(`- ${WEEKLY_WORK_LIMIT} saat haftalık çalışma saati`);
  lines.push(`= ${H(fmHours)} saat haftalık fazla mesai`);
  return lines.join("\n");
}

/** V3 buildDonemselFmMetinCards — simple variant. */
export function buildDonemselFmMetinCards(opts: {
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalPattern;
  winterPattern: SeasonalPattern;
  witnesses: DonemselWitness[];
}): Array<{ key: string; text: string }> {
  const witnessesForMetin = clampDonemselWitnessesToDavaci(
    opts.dateIn,
    opts.dateOut,
    opts.summerPattern,
    opts.winterPattern,
    opts.witnesses,
  );

  const seasonBlocks = (
    sumP: SeasonalPattern,
    winP: SeasonalPattern,
    davaciYaz?: SeasonalPattern,
    davaciKis?: SeasonalPattern,
    isWitness?: boolean,
  ) => {
    const yazM = formatSeasonMonths(sumP.months);
    const kisM = formatSeasonMonths(winP.months);
    const yaz = donemselSeasonBlockSimple("YAZ", yazM, sumP, davaciYaz, isWitness);
    const kis = donemselSeasonBlockSimple("KIŞ", kisM, winP, davaciKis, isWitness);
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
        seasonBlocks(w.summerPattern, w.winterPattern, opts.summerPattern, opts.winterPattern, true),
      ].join("\n"),
    });
  });

  return out;
}
