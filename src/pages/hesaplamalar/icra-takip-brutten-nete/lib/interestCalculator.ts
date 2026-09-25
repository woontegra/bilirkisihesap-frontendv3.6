/** V3 `interestCalculator.ts` — yasal faiz ve mevduat faizi (API'den gelen dönemlerle). */
import { legalInterestRates } from "./legalInterestRates";

export type InterestType = "LEGAL_INTEREST" | "HIGHEST_DEPOSIT_INTEREST";

export type DepositInterestRateInput = {
  startDate: string;
  endDate: string | null;
  rate: number;
  source: "TCMB_EVDS";
  currency: "TRY";
  maturity: "ONE_YEAR_OR_LESS";
};

export type InterestPeriodResult = {
  startDate: string;
  endDate: string;
  days: number;
  rate: number;
  interest: number;
};

export type CalculateInterestSuccess = {
  ok: true;
  totalDays: number;
  totalInterest: number;
  periods: InterestPeriodResult[];
};

export type CalculateInterestError = { ok: false; message: string };

export type CalculateInterestResult = CalculateInterestSuccess | CalculateInterestError;

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(value: number): number {
  return Math.round((value || 0) * 100) / 100;
}

function toUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function diffDaysUtc(startDate: string, endDate: string): number {
  return Math.floor((toUtcDate(endDate).getTime() - toUtcDate(startDate).getTime()) / DAY_MS);
}

function addDaysUtc(dateStr: string, days: number): string {
  const dt = toUtcDate(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function calculatePeriodInterest(principal: number, days: number, rate: number): number {
  return (principal * days * rate) / 36500;
}

function calculateFromPeriods({
  principal,
  startDate,
  endDate,
  periods,
}: {
  principal: number;
  startDate: string;
  endDate: string;
  periods: Array<{ startDate: string; endDate: string | null; rate: number }>;
}) {
  const allPeriods: InterestPeriodResult[] = [];
  const endExclusive = addDaysUtc(endDate, 1);

  for (const period of periods) {
    const periodEnd = period.endDate ?? endDate;
    const periodEndExclusive = addDaysUtc(periodEnd, 1);
    const overlapStart = maxDate(startDate, period.startDate);
    const overlapEndExclusive = minDate(endExclusive, periodEndExclusive);
    if (overlapStart >= overlapEndExclusive) continue;
    const days = diffDaysUtc(overlapStart, overlapEndExclusive);
    if (days <= 0) continue;
    allPeriods.push({
      startDate: overlapStart,
      endDate: addDaysUtc(overlapEndExclusive, -1),
      days,
      rate: period.rate,
      interest: round2(calculatePeriodInterest(principal, days, period.rate)),
    });
  }

  return {
    totalDays: allPeriods.reduce((sum, item) => sum + item.days, 0),
    totalInterest: round2(allPeriods.reduce((sum, item) => sum + item.interest, 0)),
    periods: allPeriods,
  };
}

/** Mevduat faiz oranları API'den gelmediğinde gösterilen varsayılan mesaj. */
export const DEPOSIT_INTEREST_BLOKE_MESSAGE =
  "Bankalarca mevduatlara uygulanan en yüksek faiz oranı verisi henüz sisteme tanımlanmamış. Lütfen faiz oranı verisi eklendikten sonra hesaplama yapınız.";

export function calculateInterest({
  principal,
  startDate,
  endDate,
  interestType,
  depositInterestRates,
}: {
  principal: number;
  startDate: string;
  endDate: string;
  interestType: InterestType;
  depositInterestRates?: DepositInterestRateInput[];
}): CalculateInterestResult {
  if (!principal || principal <= 0) {
    return { ok: false, message: "Brüt alacak tutarı boş veya net tutar 0 olduğu için faiz hesaplanamaz." };
  }
  if (!startDate || !endDate) {
    return { ok: false, message: "Faiz hesaplaması için tarih alanları zorunludur." };
  }
  if (startDate > endDate) {
    return { ok: false, message: "Faiz başlangıç tarihi, icra takip tarihinden sonra olamaz." };
  }

  if (interestType === "HIGHEST_DEPOSIT_INTEREST") {
    const active = depositInterestRates ?? [];
    if (active.length === 0) {
      return { ok: false, message: DEPOSIT_INTEREST_BLOKE_MESSAGE };
    }
    return { ok: true, ...calculateFromPeriods({ principal, startDate, endDate, periods: active }) };
  }

  const totalDays = diffDaysUtc(startDate, endDate);
  if (totalDays === 0) return { ok: true, totalDays: 0, totalInterest: 0, periods: [] };

  return { ok: true, ...calculateFromPeriods({ principal, startDate, endDate, periods: legalInterestRates }) };
}
