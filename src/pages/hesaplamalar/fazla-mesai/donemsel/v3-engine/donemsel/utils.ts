/**
 * Dönemsel Fazla Mesai - Hesaplama yardımcıları
 */
import { format } from "date-fns";
import { splitByAsgariUcretPeriods, getAsgariUcretByDate } from "../lib/fazlaMesaiShared";
import { ceilWeeklyWorkHoursToHalfHour } from "../lib/fazlaMesai/weeklyHoursRounding";
import { MONTHS, type DonemselWitness, type SeasonalPattern } from "./types";

const HTML_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Takvimde var olan gün mü (artık yıl vb.) ve yıl iş hukuku aralığında mı. */
function isValidCalendarYmd(ymd: string): boolean {
  if (!HTML_DATE_RE.test(ymd)) return false;
  const y = parseInt(ymd.slice(0, 4), 10);
  const mo = parseInt(ymd.slice(5, 7), 10);
  const da = parseInt(ymd.slice(8, 10), 10);
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(y, mo - 1, da);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === da;
}

/**
 * `<input type="date">` `value` — yalnızca geçerli `YYYY-MM-DD`. ISO datetime yerel takvime çevrilir; geçersiz / imkânsız günse `""`.
 */
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

const DAMGA_VERGISI = 0.00759;

/** Klasik dönemsel: sezonda tanımlı haftalık gün; yoksa yedek (eski tek alan). */
export function workDaysFromPattern(pattern: SeasonalPattern, legacyFallback?: number): number {
  const w = pattern.workDays;
  if (w != null && Number.isFinite(w)) {
    const n = Math.floor(Number(w));
    if (n >= 1 && n <= 7) return n;
  }
  if (legacyFallback != null && Number.isFinite(legacyFallback)) {
    return Math.max(1, Math.min(7, Math.floor(legacyFallback)));
  }
  return 6;
}

/** Klasik dönemsel: 7 günde tatilli / tatilsiz; yoksa yedek. */
export function sevenModeFromPattern(
  pattern: SeasonalPattern,
  legacy?: "tatilsiz" | "tatilli"
): "tatilsiz" | "tatilli" {
  if (pattern.sevenDayMode === "tatilli" || pattern.sevenDayMode === "tatilsiz") {
    return pattern.sevenDayMode;
  }
  return legacy ?? "tatilsiz";
}

/**
 * Klasik dönemsel: tanıkta haftada 7 gün seçiliyse hafta tatilli/tatilsiz davacı beyanından alınır (tanık kartında ayrı düğme yok).
 * Davacı 7 / tanık 6 ise tanığın 6 günü kullanılır; tanık 7 ise davacının seçimi uygulanır.
 */
export function classicSevenTabForDonemselWitnessOrDavaci(
  pattern: SeasonalPattern,
  davaciSameSeason: SeasonalPattern | undefined,
  isWitness: boolean,
  legacy?: "tatilsiz" | "tatilli"
): "tatilsiz" | "tatilli" {
  if (isWitness && davaciSameSeason && workDaysFromPattern(pattern) === 7) {
    return sevenModeFromPattern(davaciSameSeason, legacy);
  }
  return sevenModeFromPattern(pattern, legacy);
}

/**
 * Klasik dönemsel: tanığın beyan ettiği haftalık gün davacı aynı sezon beyanını aşamaz (davacı 6 / tanık 7 → 6).
 * Haftalık modda değişiklik yok; davacı satırında `hasWitness` false verilir.
 */
export function effectiveClassicWorkDaysForWitnessOrDavaci(
  segmentPattern: SeasonalPattern,
  davaciSameSeason: SeasonalPattern,
  hasWitness: boolean,
  haftalikMode: boolean,
  legacyFallback?: number
): number {
  const raw = workDaysFromPattern(segmentPattern, legacyFallback);
  if (haftalikMode || !hasWitness) return raw;
  const cap = workDaysFromPattern(davaciSameSeason, legacyFallback);
  return Math.min(raw, cap);
}
const GELIR_VERGISI = 0.15;

export function fmt(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/** Brüt günlük çalışma, ara dinlenme ve net (metin hesabı için). */
export function calcDailyBrutBreakNet(startTime: string, endTime: string): { brut: number; breakH: number; net: number } {
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

/** Günlük saat hesapla: giriş-çıkış - ara dinlenme */
export function calcDailyNetHours(startTime: string, endTime: string): number {
  return calcDailyBrutBreakNet(startTime, endTime).net;
}

/** Haftalık FM saati: (dailyNet * workDays - 45) */
export function calcFmHoursPerWeek(
  pattern: SeasonalPattern,
  workDays: number,
  activeTab: "tatilsiz" | "tatilli"
): number {
  const dailyNet = calcDailyNetHours(pattern.startTime, pattern.endTime);
  if (workDays === 7 && activeTab === "tatilli") {
    const weeklyNormal = 6 * dailyNet;
    const holidayOT = Math.max(0, dailyNet - 7.5);
    const weeklyTotal = weeklyNormal + holidayOT;
    return Math.max(0, ceilWeeklyWorkHoursToHalfHour(weeklyTotal) - 45);
  }
  const weeklyTotal = dailyNet * workDays;
  return Math.max(0, ceilWeeklyWorkHoursToHalfHour(weeklyTotal) - 45);
}

/**
 * Dönemsel haftalık: Grup 1 (gün + giriş/çıkış) + Grup 2; toplam 7 gün ve hafta tatili işaretliyse
 * Haftalık Karma ile aynı mantık (bir grupta 1 gün hafta tatili FM’si).
 */
export function calcFmHoursPerWeekHaftalik(pattern: SeasonalPattern): number {
  const d1 = Math.max(0, Math.min(7, pattern.days1 ?? 0));
  const d2 = Math.max(0, Math.min(7, pattern.days2 ?? 0));
  const net1 =
    pattern.startTime && pattern.endTime ? calcDailyNetHours(pattern.startTime, pattern.endTime) : 0;
  const net2 =
    pattern.startTime2 && pattern.endTime2 ? calcDailyNetHours(pattern.startTime2, pattern.endTime2) : 0;

  const totalDays = d1 + d2;
  const useHoliday =
    Boolean(pattern.hasWeeklyHoliday) && totalDays === 7 && (d1 > 0 || d2 > 0);
  const holidayRow = pattern.weeklyHolidayRow === 1 ? 1 : 2;

  let weeklyTotal = 0;
  if (!useHoliday) {
    weeklyTotal = d1 * net1 + d2 * net2;
  } else {
    const g1H = holidayRow === 1 && d1 > 0;
    const g2H = holidayRow === 2 && d2 > 0;
    if (g1H) {
      weeklyTotal += (d1 - 1) * net1 + Math.max(0, net1 - 7.5);
    } else {
      weeklyTotal += d1 * net1;
    }
    if (g2H) {
      weeklyTotal += (d2 - 1) * net2 + Math.max(0, net2 - 7.5);
    } else {
      weeklyTotal += d2 * net2;
    }
  }
  return Math.max(0, ceilWeeklyWorkHoursToHalfHour(weeklyTotal) - 45);
}

/** Tanık çakışma split: Çakışan tanıkları parçala (eski Donemsel mantığı) */
export function applyWitnessOverlapSplit(witnesses: DonemselWitness[]): DonemselWitness[] {
  const filtered = witnesses.filter((w) => w.dateIn && w.dateOut && w.dateIn < w.dateOut);
  if (filtered.length === 0) return [];
  const sorted = [...filtered].sort((a, b) => new Date(a.dateIn).getTime() - new Date(b.dateIn).getTime());
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

function timeToMins(t: string): number {
  const [h, m] = (t || "").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function minsToTime(mins: number): string {
  const x = Math.max(0, Math.min(24 * 60 - 1, mins));
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
}

/** Tanık giriş/çıkış saatini davacı aralığına kırpar (tanık davacıdan fazla talep edemez). */
function clampTimePair(
  wStart: string,
  wEnd: string,
  dStart: string,
  dEnd: string
): { start: string; end: string } {
  const ds = (dStart || "").trim();
  const de = (dEnd || "").trim();
  const ws = (wStart || "").trim();
  const we = (wEnd || "").trim();
  /** Tanık saati girilmemişse davacı saatini kopyalama — alanlar boş kalsın. */
  if (!ws || !we) return { start: ws, end: we };
  if (!ds || !de) return { start: ws, end: we };
  const gIn = Math.max(timeToMins(ws), timeToMins(ds));
  const gOut = Math.min(timeToMins(we), timeToMins(de));
  if (gIn >= gOut) return { start: ds, end: de };
  return { start: minsToTime(gIn), end: minsToTime(gOut) };
}

/**
 * Haftalık mod: haftalık çalışma günü tavanı klasik dönemseldeki gibi **toplam** gündür (`min(tanık, davacı)`).
 * Grup 1 / Grup 2 dağılımı tanık beyanında kalır; aksi (her grupta ayrı `min(davacı, tanık)`) farklı toplamlarda
 * haksız yere bir gün düşürür (ör. davacı 4+3, tanık 3+4 → yanlışlıkla 3+3).
 */
function witnessHaftalikDaysCappedToTotal(
  w1Raw: number,
  w2Raw: number,
  d1: number,
  d2: number
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

/**
 * Tanığın yaz/kış desenini davacı desenine göre kısıtlar (saat, haftalık gün / hafta tatili, haftalık modda gün sayıları).
 * Tarih aralığı `clampDonemselWitnessDateRangeOnly` ile ayrı kırpılır.
 */
export function clampWitnessSeasonalToDavaci(
  davaci: SeasonalPattern,
  witness: SeasonalPattern,
  haftalikMode: boolean
): SeasonalPattern {
  const w = { ...witness };
  if (haftalikMode) {
    const d1 = Math.max(0, Math.min(7, davaci.days1 ?? 0));
    const d2 = Math.max(0, Math.min(7, davaci.days2 ?? 0));
    const w1 = Math.max(0, Math.min(7, w.days1 ?? 0));
    const w2 = Math.max(0, Math.min(7, w.days2 ?? 0));
    const capped = witnessHaftalikDaysCappedToTotal(w1, w2, d1, d2);
    w.days1 = capped.days1;
    w.days2 = capped.days2;
    const dSum = d1 + d2;
    const wSum = (w.days1 ?? 0) + (w.days2 ?? 0);
    /** Klasik dönemsel ile aynı: hafta tatilli/tatilsiz yalnız davacı kutusundan; tanık toplamı 7 olsa bile davacı 6 ise tatil FM’si yok. */
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
  const c = clampTimePair(w.startTime, w.endTime, davaci.startTime, davaci.endTime);
  w.startTime = c.start;
  w.endTime = c.end;
  const dw = workDaysFromPattern(davaci);
  const ww = workDaysFromPattern(witness);
  const wd = Math.min(dw, ww);
  w.workDays = wd;
  if (wd === 7 && dw === 7) {
    w.sevenDayMode = sevenModeFromPattern(davaci);
  } else {
    w.sevenDayMode = "tatilsiz";
  }
  return w;
}

export type ClampDonemselWitnessesOpts = {
  /**
   * true (varsayılan): yaz/kış saat ve desen davacıya göre kırpılır — cetvel / metin hesabı için.
   * false: yalnızca tarih alanları kısıtlanır; saatler state’te kullanıcı girdiği gibi kalır.
   */
  clampSeasonalToDavaci?: boolean;
};

/**
 * Yalnızca tanık işe giriş / işten çıkış alanlarını davacı tarihlerine göre kırpar; yaz/kış desenine dokunmaz.
 * Davacı iki tarih de geçerliyse: tanık çıkışı davacı çıkışını aşamaz; giriş > çıkış ise davacı girişine çekilir.
 */
export function clampDonemselWitnessDateRangeOnly(
  dateIn: string,
  dateOut: string,
  witnesses: DonemselWitness[]
): DonemselWitness[] {
  const di = toHtmlDateInputValue(dateIn);
  const dout = toHtmlDateInputValue(dateOut);
  return witnesses.map((w) => {
    const rawIn = String(w.dateIn ?? "").trim();
    const rawOut = String(w.dateOut ?? "").trim();
    /** Tarayıcının yazdığı ara değeri yok etme — yalnızca ilk 10 karakter (yyyy-mm-dd veya yazım ortası kısa string). */
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
    return {
      ...w,
      dateIn: dateInW,
      dateOut: dateOutW,
    };
  });
}

/**
 * Tanık beyanlarını davacı işe giriş/çıkışa göre kısıtlar; isteğe bağlı olarak yaz/kış saat-desenini davacı kutusuna kırpar.
 * Tarih: tanık işten çıkışı davacı çıkışını aşamaz; tanık işe girişi davacıdan **önce** olabilir (beyan korunur, cetvelde kesişim `buildIntervalsFromWitnesses` ile alınır).
 */
export function clampDonemselWitnessesToDavaci(
  dateIn: string,
  dateOut: string,
  davaciSummer: SeasonalPattern,
  davaciWinter: SeasonalPattern,
  witnesses: DonemselWitness[],
  haftalikMode: boolean,
  opts?: ClampDonemselWitnessesOpts
): DonemselWitness[] {
  const clampSeasonal = opts?.clampSeasonalToDavaci !== false;
  const dated = clampDonemselWitnessDateRangeOnly(dateIn, dateOut, witnesses);
  return dated.map((w) => {
    const summerPattern = clampSeasonal
      ? clampWitnessSeasonalToDavaci(davaciSummer, w.summerPattern, haftalikMode)
      : w.summerPattern;
    const winterPattern = clampSeasonal
      ? clampWitnessSeasonalToDavaci(davaciWinter, w.winterPattern, haftalikMode)
      : w.winterPattern;
    return {
      ...w,
      summerPattern,
      winterPattern,
    };
  });
}

/** Witness overlap split - tanık aralıklarından interval listesi. Sadece tanıklı dönemler eklenir. */
export function buildIntervalsFromWitnesses(
  dateIn: string,
  dateOut: string,
  davaciSummer: SeasonalPattern,
  _davaciWinter: SeasonalPattern,
  witnesses: DonemselWitness[]
): Array<{ start: string; end: string; start_time: string; end_time: string; witnessData?: DonemselWitness }> {
  const splitWitnesses = applyWitnessOverlapSplit(witnesses);
  const filtered = splitWitnesses.length > 0 ? splitWitnesses : witnesses.filter((w) => w.dateIn && w.dateOut);
  if (filtered.length === 0) {
    return [{ start: dateIn, end: dateOut, start_time: davaciSummer.startTime, end_time: davaciSummer.endTime }];
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
  const intervals: Array<{ start: string; end: string; start_time: string; end_time: string; witnessData?: DonemselWitness }> = [];
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
    return [{ start: dateIn, end: dateOut, start_time: davaciSummer.startTime, end_time: davaciSummer.endTime }];
  }
  return intervals;
}

export interface DonemselRow {
  id: string;
  startISO: string;
  endISO: string;
  rangeLabel: string;
  weeks: number;
  brut: number;
  katsayi: number;
  fmHours: number;
  fm: number;
  net: number;
  originalWeekCount?: number;
  manual?: boolean;
  /** Tanıklı Standart yıllık izin V2 — satır desenine göre doldurulur */
  dailyNet?: number;
  annualLeaveHg?: number;
  annualLeaveSevenDay?: "tatilli" | "tatilsiz";
  /**
   * Bu satırın desenine göre UBGT/izin takviminde atlanacak hafta günü (`Date.getDay()`, 0=Pazar).
   * Yalnızca o satır 7 gün + hafta tatilli iken dolu; 6 günlük tanık satırında `null` → Pazar da sayılır.
   */
  annualLeaveWeeklyIgnoredWeekday?: number | null;
  [k: string]: unknown;
}

/**
 * Sezon deseninden yıllık izin V2 alanları (Tanıklı Standart / Haftalık Karma ile uyumlu).
 */
export function annualLeaveMetaFromSeasonalPattern(
  pattern: SeasonalPattern,
  haftalikMode: boolean,
  legacyWeeklyDays?: number,
  legacyActiveTab?: "tatilsiz" | "tatilli"
): { dailyNet: number; annualLeaveHg: number; annualLeaveSevenDay: "tatilli" | "tatilsiz" } {
  if (!haftalikMode) {
    const dailyNet = calcDailyNetHours(pattern.startTime, pattern.endTime);
    const annualLeaveHg = workDaysFromPattern(pattern, legacyWeeklyDays);
    const annualLeaveSevenDay = sevenModeFromPattern(pattern, legacyActiveTab);
    return { dailyNet, annualLeaveHg, annualLeaveSevenDay };
  }
  const d1 = Math.max(0, Math.min(7, pattern.days1 ?? 0));
  const d2 = Math.max(0, Math.min(7, pattern.days2 ?? 0));
  const net1 =
    pattern.startTime && pattern.endTime ? calcDailyNetHours(pattern.startTime, pattern.endTime) : 0;
  const net2 =
    pattern.startTime2 && pattern.endTime2 ? calcDailyNetHours(pattern.startTime2, pattern.endTime2) : net1;
  const denom = d1 + d2;
  const dailyNet = denom > 0 ? (d1 * net1 + d2 * net2) / denom : net1;
  const totalDays = d1 + d2;
  const useHoliday = Boolean(pattern.hasWeeklyHoliday) && totalDays === 7 && (d1 > 0 || d2 > 0);
  const annualLeaveSevenDay: "tatilli" | "tatilsiz" = useHoliday ? "tatilli" : "tatilsiz";
  const annualLeaveHg = Math.max(1, Math.min(7, totalDays || 6));
  return { dailyNet, annualLeaveHg, annualLeaveSevenDay };
}

/**
 * Yıllık izin / UBGT takvim sayımında atlanacak hafta günü (Tanıklı Standart "Hafta Tatili Günü" ile aynı: `Date.getDay()`, 0=Pazar).
 * Yalnızca haftada 7 gün ve hafta tatilli (klasik) veya toplam 7 gün + haftalık tatil (haftalık) iken, desende gün seçiliyse döner.
 */
export function weeklyIgnoredWeekdayFromSeasonalPattern(
  pattern: SeasonalPattern,
  haftalikMode: boolean
): number | null {
  if (haftalikMode) {
    const d1 = Math.max(0, Math.min(7, pattern.days1 ?? 0));
    const d2 = Math.max(0, Math.min(7, pattern.days2 ?? 0));
    if (!pattern.hasWeeklyHoliday || d1 + d2 !== 7) return null;
    const w = pattern.weeklyHolidayWeekday;
    if (w != null && Number.isFinite(w) && w >= 0 && w <= 6) return Math.floor(Number(w));
    return null;
  }
  if (workDaysFromPattern(pattern) !== 7) return null;
  if (sevenModeFromPattern(pattern) !== "tatilli") return null;
  const w = pattern.weeklyHolidayWeekday;
  if (w != null && Number.isFinite(w) && w >= 0 && w <= 6) return Math.floor(Number(w));
  return null;
}

/**
 * Yaz/Kış segmentlere böl — sezon değişiminde satırı parçalar.
 * Yalnızca `summerMonths` / `winterMonths` içindeki aylar ilgili desenle eşlenir; ikisinde de olmayan aylar kış desenidir.
 */
export function seasonSegmentRow(
  row: DonemselRow,
  summerMonths: number[],
  _winterMonths: number[],
  summerPattern: SeasonalPattern,
  winterPattern: SeasonalPattern,
  katSayi: number,
  haftalikMode = false,
  /** Eski kayıtlar: tek haftalık gün / tatil seçimi */
  legacyWeeklyDays?: number,
  legacyActiveTab?: "tatilsiz" | "tatilli",
  /** Davacı yaz/kış (klasik): tanık haftada 7 gün iken tatilli/tatilsiz + izin/UBGT hafta günü davacıdan */
  davaciSummerClassic?: SeasonalPattern,
  davaciWinterClassic?: SeasonalPattern
): DonemselRow[] {
  const rowStart = new Date(row.startISO);
  const rowEnd = new Date(row.endISO);
  const result: DonemselRow[] = [];
  let cur = new Date(rowStart);
  let segStart = new Date(rowStart);
  let segSeason: "summer" | "winter" | null = null;

  const monthSeason = (month1to12: number): "summer" | "winter" =>
    summerMonths.includes(month1to12) ? "summer" : "winter";

  segSeason = monthSeason(cur.getMonth() + 1);

  while (cur <= rowEnd) {
    const m = cur.getMonth() + 1;
    const newSeason = monthSeason(m);
    const lastDay = cur.getTime() === rowEnd.getTime();
    const changed = newSeason !== segSeason;

    if (changed || lastDay) {
      let segEnd = new Date(cur);
      if (changed) segEnd.setDate(segEnd.getDate() - 1);

      const siso = `${segStart.getFullYear()}-${String(segStart.getMonth() + 1).padStart(2, "0")}-${String(segStart.getDate()).padStart(2, "0")}`;
      const eiso = `${segEnd.getFullYear()}-${String(segEnd.getMonth() + 1).padStart(2, "0")}-${String(segEnd.getDate()).padStart(2, "0")}`;
      const diffMs = segEnd.getTime() - segStart.getTime();
      const diffDays = Math.ceil(diffMs / 86400000) + 1;
      const weeks = Math.round(diffDays / 7);
      const pattern = segSeason === "summer" ? summerPattern : winterPattern;
      const rowW = row as DonemselRow & { witnessData?: DonemselWitness };
      const hasWitness = Boolean(rowW.witnessData);
      const dDavaciSeason =
        segSeason === "summer"
          ? davaciSummerClassic ?? pattern
          : davaciWinterClassic ?? pattern;
      const wd = effectiveClassicWorkDaysForWitnessOrDavaci(
        pattern,
        dDavaciSeason,
        hasWitness,
        haftalikMode,
        legacyWeeklyDays
      );
      const useDavaciSeven =
        !haftalikMode &&
        hasWitness &&
        davaciSummerClassic != null &&
        davaciWinterClassic != null &&
        wd === 7;
      const tab = useDavaciSeven
        ? classicSevenTabForDonemselWitnessOrDavaci(pattern, dDavaciSeason, true, legacyActiveTab)
        : wd === 7
          ? sevenModeFromPattern(pattern, legacyActiveTab)
          : "tatilsiz";
      const fmHours = haftalikMode
        ? calcFmHoursPerWeekHaftalik(pattern)
        : calcFmHoursPerWeek(pattern, wd, tab);
      const dailyNet = calcDailyNetHours(pattern.startTime, pattern.endTime);
      const brut = getAsgariUcretByDate(siso) || 0;
      const fm = (weeks * brut * katSayi * fmHours / 225) * 1.5;
      const net = fm * (1 - DAMGA_VERGISI - GELIR_VERGISI);
      const patternForLeaveMeta: SeasonalPattern =
        useDavaciSeven
          ? {
              ...pattern,
              workDays: 7,
              sevenDayMode: tab,
              weeklyHolidayWeekday: dDavaciSeason.weeklyHolidayWeekday,
            }
          : { ...pattern, workDays: wd, sevenDayMode: wd === 7 ? tab : "tatilsiz" };
      const leaveMeta = annualLeaveMetaFromSeasonalPattern(
        patternForLeaveMeta,
        haftalikMode,
        legacyWeeklyDays,
        legacyActiveTab
      );
      const annualLeaveWeeklyIgnoredWeekday = weeklyIgnoredWeekdayFromSeasonalPattern(
        patternForLeaveMeta,
        haftalikMode
      );

      result.push({
        ...row,
        id: `period-${result.length}`,
        startISO: siso,
        endISO: eiso,
        rangeLabel: `${format(segStart, "dd.MM.yyyy")} – ${format(segEnd, "dd.MM.yyyy")}`,
        weeks,
        originalWeekCount: weeks,
        brut,
        katsayi: katSayi,
        fmHours,
        ...leaveMeta,
        dailyNet,
        fm: Number(fm.toFixed(2)),
        net: Number(net.toFixed(2)),
        annualLeaveWeeklyIgnoredWeekday,
      });

      if (changed && !lastDay) {
        segStart = new Date(cur);
        segSeason = newSeason;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

/** Dönemsel ham satırları üret: intervals → asgari split → sezon split. 270/zamanaşımı/exclusions uygulanmaz. */
export function buildDonemselRows(params: {
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalPattern;
  winterPattern: SeasonalPattern;
  witnesses: DonemselWitness[];
  katSayi: number;
  /** true: Grup1+Grup2 + hafta tatili (v1 dönemsel haftalık) */
  haftalikMode?: boolean;
  /** Eski kayıt: tek `weeklyDays` / `activeTab` (klasik mod) */
  legacyWeeklyDays?: number;
  legacyActiveTab?: "tatilsiz" | "tatilli";
}): DonemselRow[] {
  const {
    dateIn,
    dateOut,
    summerPattern,
    winterPattern,
    witnesses,
    katSayi,
    haftalikMode = false,
    legacyWeeklyDays,
    legacyActiveTab,
  } = params;

  const legacyWd =
    legacyWeeklyDays != null && Number.isFinite(legacyWeeklyDays)
      ? Math.max(1, Math.min(7, Math.floor(legacyWeeklyDays)))
      : undefined;
  const kats = katSayi || 1;

  const witnessesClamped = clampDonemselWitnessesToDavaci(
    dateIn,
    dateOut,
    summerPattern,
    winterPattern,
    witnesses,
    haftalikMode
  );

  const intervals = buildIntervalsFromWitnesses(
    dateIn,
    dateOut,
    summerPattern,
    winterPattern,
    witnessesClamped
  );

  const rawRows: (DonemselRow & { witnessData?: DonemselWitness })[] = [];

  for (const interval of intervals) {
    const intStart = new Date(interval.start);
    const intEnd = new Date(interval.end);
    const segments = splitByAsgariUcretPeriods(intStart, intEnd);

    for (const seg of segments) {
      const segStart = seg.start;
      const segEnd = seg.end;
      const siso = segStart.toISOString().slice(0, 10);
      const eiso = segEnd.toISOString().slice(0, 10);
      const diffDays = Math.round((segEnd.getTime() - segStart.getTime()) / 86400000) + 1;
      const weeks = Math.round(diffDays / 7) || 1;
      const brut = getAsgariUcretByDate(siso) || 0;
      const month = segStart.getMonth() + 1;
      const activeSummer = interval.witnessData?.summerPattern?.months ?? summerPattern.months;
      const isSummer = activeSummer.includes(month);
      const pattern = isSummer
        ? (interval.witnessData?.summerPattern ?? summerPattern)
        : (interval.witnessData?.winterPattern ?? winterPattern);
      const davaciSeasonPat = isSummer ? summerPattern : winterPattern;
      const patWd = effectiveClassicWorkDaysForWitnessOrDavaci(
        pattern,
        davaciSeasonPat,
        Boolean(interval.witnessData),
        haftalikMode,
        legacyWd
      );
      const patTab =
        interval.witnessData && !haftalikMode && patWd === 7
          ? classicSevenTabForDonemselWitnessOrDavaci(pattern, davaciSeasonPat, true, legacyActiveTab)
          : patWd === 7
            ? sevenModeFromPattern(pattern, legacyActiveTab)
            : "tatilsiz";
      const fmHours = haftalikMode
        ? calcFmHoursPerWeekHaftalik(pattern)
        : calcFmHoursPerWeek(pattern, patWd, patTab);
      const dailyNet = calcDailyNetHours(pattern.startTime, pattern.endTime);

      const baseRow: DonemselRow & { witnessData?: DonemselWitness } = {
        id: `period-${rawRows.length}`,
        startISO: siso,
        endISO: eiso,
        rangeLabel: `${format(segStart, "dd.MM.yyyy")} – ${format(segEnd, "dd.MM.yyyy")}`,
        weeks,
        originalWeekCount: weeks,
        brut,
        katsayi: kats,
        fmHours,
        dailyNet,
        fm: 0,
        net: 0,
        witnessData: interval.witnessData,
      };

      const summerMonths = interval.witnessData?.summerPattern?.months ?? summerPattern.months;
      const winterMonths = interval.witnessData?.winterPattern?.months ?? winterPattern.months;
      const activeSummerP = interval.witnessData?.summerPattern ?? summerPattern;
      const activeWinterP = interval.witnessData?.winterPattern ?? winterPattern;

      const seasonRows = seasonSegmentRow(
        baseRow,
        summerMonths,
        winterMonths,
        activeSummerP,
        activeWinterP,
        kats,
        haftalikMode,
        legacyWd,
        legacyActiveTab,
        summerPattern,
        winterPattern
      );

      seasonRows.forEach((r) => {
        const { witnessData: _wd, ...rest } = r as DonemselRow & { witnessData?: DonemselWitness };
        rawRows.push(rest);
      });
    }
  }

  rawRows.forEach((r, i) => {
    r.id = `period-${i}`;
  });

  return rawRows.sort((a, b) => (a.startISO || "").localeCompare(b.startISO || ""));
}

const WEEKLY_LIMIT = 45;
const REF_DAILY_HT = 7.5;

function formatSeasonMonths(months: number[]): string {
  const u = [...new Set((months || []).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
  if (u.length === 0) return "—";
  return u.map((m) => MONTHS.find((x) => x.value === m)?.label ?? String(m)).join(", ");
}

function donemselSeasonBlockSimple(
  seasonTitle: string,
  monthLabel: string,
  pattern: SeasonalPattern,
  davaciSameSeason?: SeasonalPattern,
  isWitnessCard?: boolean
): string {
  const H = fmt;
  const st = (pattern.startTime || "").trim();
  const et = (pattern.endTime || "").trim();
  const head = `${seasonTitle} (${monthLabel})`;
  if (!st || !et) {
    return `${head}\nBu dönem için giriş ve çıkış saatlerini giriniz.`;
  }
  const { brut, breakH, net } = calcDailyBrutBreakNet(st, et);
  const wd =
    isWitnessCard && davaciSameSeason
      ? effectiveClassicWorkDaysForWitnessOrDavaci(pattern, davaciSameSeason, true, false)
      : workDaysFromPattern(pattern);
  const tab =
    isWitnessCard && davaciSameSeason && wd === 7
      ? classicSevenTabForDonemselWitnessOrDavaci(pattern, davaciSameSeason, true)
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
    const extraHT = Math.max(0, net - REF_DAILY_HT);
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
  lines.push(`- ${WEEKLY_LIMIT} saat haftalık çalışma saati`);
  lines.push(`= ${H(fmHours)} saat haftalık fazla mesai`);
  return lines.join("\n");
}

function donemselSeasonBlockHaftalik(seasonTitle: string, monthLabel: string, pattern: SeasonalPattern): string {
  const H = fmt;
  const head = `${seasonTitle} (${monthLabel})`;
  const d1 = Math.max(0, Math.min(7, pattern.days1 ?? 0));
  const d2 = Math.max(0, Math.min(7, pattern.days2 ?? 0));
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
      `Grup 1 — ${d1} gün: ${st1} - ${et1} = ${H(b1.brut)} saat çalışma, - ${H(b1.breakH)} saat ara dinlenme = ${H(net1)} saat günlük net`
    );
  }
  if (d2 > 0) {
    lines.push(
      `Grup 2 — ${d2} gün: ${st2} - ${et2} = ${H(b2.brut)} saat çalışma, - ${H(b2.breakH)} saat ara dinlenme = ${H(net2)} saat günlük net`
    );
  }

  const totalDays = d1 + d2;
  const useHoliday =
    Boolean(pattern.hasWeeklyHoliday) && totalDays === 7 && (d1 > 0 || d2 > 0);
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
      `Toplam 7 gün ve hafta tatili seçili: ${holidayRow === 1 ? "Grup 1" : "Grup 2"} hafta tatili günü 7,5 saat referansına göre düşülür.`
    );
    const g1H = holidayRow === 1 && d1 > 0;
    const g2H = holidayRow === 2 && d2 > 0;
    if (g1H) {
      const part = (d1 - 1) * net1 + Math.max(0, net1 - REF_DAILY_HT);
      weeklyTotal += part;
      lines.push(
        `Grup 1: (${d1} - 1) × ${H(net1)} + (${H(net1)} - 7,5) = ${H(part)} saat`
      );
    } else {
      const part = d1 * net1;
      weeklyTotal += part;
      if (d1 > 0) lines.push(`Grup 1: ${d1} × ${H(net1)} = ${H(part)} saat`);
    }
    if (g2H) {
      const part = (d2 - 1) * net2 + Math.max(0, net2 - REF_DAILY_HT);
      weeklyTotal += part;
      lines.push(
        `Grup 2: (${d2} - 1) × ${H(net2)} + (${H(net2)} - 7,5) = ${H(part)} saat`
      );
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
  lines.push(`${H(rounded)} - ${WEEKLY_LIMIT} (yasal haftalık çalışma) = ${H(fm)} saat haftalık fazla mesai`);
  return lines.join("\n");
}

/**
 * Metin Hesaplaması kartları: davacı + her tanık için yaz/kış FM adımları (aynı formül).
 * Tanıklar cetvelle aynı şekilde kırpılır: tarih aralığı + yaz/kış giriş-çıkış davacı kutusuna (`clampDonemselWitnessesToDavaci`);
 * klasik modda haftalık gün tavanı `donemselSeasonBlockSimple` içindedir.
 */
export function buildDonemselFmMetinCards(opts: {
  variant: "simple" | "haftalik";
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
    opts.variant === "haftalik"
  );

  const out: Array<{ key: string; text: string }> = [];
  const seasonBlocks = (
    sumP: SeasonalPattern,
    winP: SeasonalPattern,
    davaciYaz?: SeasonalPattern,
    davaciKis?: SeasonalPattern,
    isWitness?: boolean
  ) => {
    const yazM = formatSeasonMonths(sumP.months);
    const kisM = formatSeasonMonths(winP.months);
    const yaz =
      opts.variant === "haftalik"
        ? donemselSeasonBlockHaftalik("YAZ", yazM, sumP)
        : donemselSeasonBlockSimple("YAZ", yazM, sumP, davaciYaz, isWitness);
    const kis =
      opts.variant === "haftalik"
        ? donemselSeasonBlockHaftalik("KIŞ", kisM, winP)
        : donemselSeasonBlockSimple("KIŞ", kisM, winP, davaciKis, isWitness);
    return [yaz, kis].join("\n\n");
  };

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
