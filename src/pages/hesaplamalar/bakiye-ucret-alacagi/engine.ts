/**
 * Bakiye Ücret Alacağı — lokal motor.
 * Backend `bakiyeUcret.service.js` ile birebir. Başka modülden import yok.
 */
import { getAsgariUcretByDate } from "./asgariUcret";
import { computeNetFromPeriodBrut, round2 } from "./netSegmented";

export const DAYS_PER_MONTH = 30;

export function parseNum(v: string): number {
  return Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

export function formatDateTR(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

export function clampYear(value: string): string {
  if (!value || !value.includes("-")) return value;
  const parts = value.split("-");
  if (parts[0] && parts[0].length > 4) parts[0] = parts[0].substring(0, 4);
  return parts.join("-");
}

export function isDateOrderInvalid(startDate: string, endDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false;
  return new Date(endDate) < new Date(startDate);
}

export type MonthRow = { start: string; end: string; days: number; gross: number; net: number };
export type SummaryRow = { start: string; end: string; days: number; amount: number };

export type BakiyeInput = {
  startDate: string;
  endDate: string;
  resignDate?: string;
  monthly: number;
};

export type BakiyeResult = {
  rows: SummaryRow[];
  monthRows: MonthRow[];
  totalAmount: number;
  error?: string;
};

const ASGARI_BRUT_DONEMLERI = [
  { start: "2022-01-01", end: "2022-06-30", brut: 5004.0 },
  { start: "2022-07-01", end: "2022-12-31", brut: 6471.0 },
  { start: "2023-01-01", end: "2023-06-30", brut: 10008.0 },
  { start: "2023-07-01", end: "2023-12-31", brut: 13414.5 },
  { start: "2024-01-01", end: "2024-12-31", brut: 20002.5 },
  { start: "2025-01-01", end: "2025-12-31", brut: 26005.5 },
  { start: "2026-01-01", end: "2026-12-31", brut: 33030.0 },
];

function validateAsgariUcret(startDate: string, endDate: string, monthlyBrut: number): string | null {
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (Number.isNaN(+s) || Number.isNaN(+e)) return null;
  const ilgili = ASGARI_BRUT_DONEMLERI.filter((d) => {
    const ds = new Date(d.start).getTime();
    const de = new Date(d.end).getTime();
    return !(e.getTime() < ds || s.getTime() > de);
  });
  if (ilgili.length > 0) {
    const minAsgariBrut = Math.min(...ilgili.map((d) => d.brut));
    if (monthlyBrut < minAsgariBrut) {
      return "Girilen brüt ücret, belirtilen dönemdeki asgari ücretin altında olamaz.";
    }
  }
  return null;
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function minDateOf(dates: Date[]): Date {
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

function differenceInCalendarDays(d1: Date, d2: Date): number {
  const date1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const date2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function eachMonthOfInterval(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    months.push(new Date(current));
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

/** Backend calculateBakiyeUcret */
export function computeBakiyeUcret(input: BakiyeInput): BakiyeResult {
  const { startDate, endDate, resignDate, monthly } = input;
  if (!startDate || !endDate || !monthly || monthly <= 0) {
    return { rows: [], monthRows: [], totalAmount: 0, error: "Lütfen tüm alanları doldurun" };
  }

  const s = new Date(startDate);
  const e = new Date(endDate);
  if (Number.isNaN(+s) || Number.isNaN(+e) || s > e) {
    return { rows: [], monthRows: [], totalAmount: 0, error: "Geçersiz tarih aralığı" };
  }

  const asgariErr = validateAsgariUcret(startDate, endDate, monthly);
  if (asgariErr) return { rows: [], monthRows: [], totalAmount: 0, error: asgariErr };

  const dailyBrut = monthly / DAYS_PER_MONTH;

  if (resignDate) {
    const r = new Date(resignDate);
    if (!Number.isNaN(+r) && r < e) {
      const dayAfterResign = new Date(r);
      dayAfterResign.setDate(dayAfterResign.getDate() + 1);
      const mrows: MonthRow[] = [];
      let currentStart = new Date(dayAfterResign);

      while (currentStart <= e) {
        const currentMonth = currentStart.getMonth();
        const currentYear = currentStart.getFullYear();
        const monthEnd = endOfMonth(new Date(currentYear, currentMonth, 1));
        const ps = currentStart;
        const pe = minDateOf([e, monthEnd]);
        const daysM = Math.max(0, differenceInCalendarDays(pe, ps) + 1);
        if (daysM > 0) {
          const isFullMonth = ps.getDate() === 1 && pe.getDate() === monthEnd.getDate() && pe.getMonth() === monthEnd.getMonth();
          const billableDays = isFullMonth ? DAYS_PER_MONTH : daysM;
          const gross = round2(dailyBrut * billableDays);
          const net = computeNetFromPeriodBrut(monthly, billableDays, formatDateISO(ps));
          mrows.push({
            start: formatDateISO(ps),
            end: formatDateISO(pe),
            days: isFullMonth ? DAYS_PER_MONTH : daysM,
            gross,
            net: round2(net),
          });
        }
        currentStart = new Date(currentYear, currentMonth + 1, 1);
      }

      const amountTotal = round2(mrows.reduce((a, b) => a + b.gross, 0));
      return {
        rows: [{ start: formatDateISO(dayAfterResign), end: formatDateISO(e), days: mrows.reduce((a, b) => a + b.days, 0), amount: amountTotal }],
        monthRows: mrows,
        totalAmount: amountTotal,
      };
    }
  }

  const months = eachMonthOfInterval(s, e);
  const rows: SummaryRow[] = months
    .map((m) => {
      const mStart = new Date(m.getFullYear(), m.getMonth(), 1);
      const mEnd = endOfMonth(m);
      const ps = new Date(Math.max(s.getTime(), mStart.getTime()));
      const pe = minDateOf([e, mEnd]);
      const days = Math.max(0, differenceInCalendarDays(pe, ps) + 1);
      const isFullMonth = ps.getDate() === 1 && pe.getDate() === endOfMonth(pe).getDate();
      const billableDays = isFullMonth ? DAYS_PER_MONTH : days;
      return {
        start: formatDateISO(ps),
        end: formatDateISO(pe),
        days: isFullMonth ? DAYS_PER_MONTH : days,
        amount: round2(dailyBrut * billableDays),
      };
    })
    .filter((r) => r.days > 0);

  const monthRows: MonthRow[] = rows.map((r) => {
    const rStart = new Date(r.start);
    const rEnd = new Date(r.end);
    const isFullMonth = rStart.getDate() === 1 && rEnd.getDate() === endOfMonth(rEnd).getDate();
    const billableDays = isFullMonth ? DAYS_PER_MONTH : r.days;
    const gross = round2(dailyBrut * billableDays);
    const net = computeNetFromPeriodBrut(monthly, billableDays, r.start);
    return { start: r.start, end: r.end, days: r.days, gross, net: round2(net) };
  });

  return {
    rows,
    monthRows,
    totalAmount: round2(rows.reduce((sum, r) => sum + r.amount, 0)),
  };
}

export function validateAsgariByResignDate(resignDate: string, monthlyBrut: number): string | null {
  if (!resignDate || !monthlyBrut) return null;
  const minUcret = getAsgariUcretByDate(resignDate);
  if (minUcret && monthlyBrut < minUcret) {
    const year = new Date(resignDate).getFullYear();
    return `Girilen ücret, ${year} yılı asgari brüt ücretinden düşük olamaz (${formatMoney(minUcret)}₺).`;
  }
  return null;
}

/** V3: Math.round(diffDays) + 1 when resign < end (inclusive remaining). */
export function calculateRemainingDays(resignDate: string, endDate: string): number {
  if (!resignDate || !endDate) return 0;
  const r = new Date(resignDate);
  const e = new Date(endDate);
  if (Number.isNaN(+r) || Number.isNaN(+e) || r >= e) return 0;
  return Math.max(0, differenceInCalendarDays(e, r) + 1);
}

/** Eklenti: 12 aylık toplam / 360 × 30 (inline — başka modülden import yok). */
export function computeEklentiResult(months: string[]): number {
  const sum = months.reduce((acc, v) => acc + parseNum(v), 0);
  return (sum / 360) * 30;
}

export type WorkPeriod = {
  years: number;
  months: number;
  days: number;
  label: string;
};

const EMPTY_PERIOD: WorkPeriod = { years: 0, months: 0, days: 0, label: "0 Yıl 0 Ay 0 Gün" };

/** Exclusive calendar diff — label source for Bilirkişi period. */
function calcWorkPeriodIhbar(startISO: string, endISO: string): WorkPeriod {
  if (!startISO || !endISO) return EMPTY_PERIOD;
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return EMPTY_PERIOD;
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  if (days < 0) {
    months--;
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months, days, label: `${years} Yıl ${months} Ay ${days} Gün` };
}

/**
 * V3 `calcWorkPeriodBilirKisi` (inline copy from yillik-izin/lib/dates.ts).
 * years/months/days are inclusive (+1 day); label uses exclusive ihbar form.
 */
export function calcWorkPeriodBilirKisi(startISO: string, endISO: string): WorkPeriod {
  if (!startISO || !endISO) return EMPTY_PERIOD;
  try {
    const start = new Date(startISO);
    const end = new Date(endISO);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return EMPTY_PERIOD;
    if (end < start) return EMPTY_PERIOD;
    end.setDate(end.getDate() + 1);
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();
    if (days < 0) {
      months--;
      const lastDayOfPrevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
      days += lastDayOfPrevMonth.getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    const label = calcWorkPeriodIhbar(startISO, endISO).label;
    return { years, months, days, label };
  } catch {
    return EMPTY_PERIOD;
  }
}

export function calculateRemainingLabel(resignDate: string, endDate: string): string {
  if (!resignDate || !endDate) return "";
  try {
    return calcWorkPeriodBilirKisi(resignDate, endDate).label || "";
  } catch {
    return "";
  }
}
