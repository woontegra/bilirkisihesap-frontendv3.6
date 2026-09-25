/**
 * İhbar Tazminatı — tarih yardımcıları.
 * Yalnızca ihbar-tazminati modülü içinde paylaşılır. Başka hesaplama sayfasından import edilmez.
 */

export type WorkPeriod = {
  years: number;
  months: number;
  days: number;
  label: string;
};

const EMPTY_PERIOD: WorkPeriod = { years: 0, months: 0, days: 0, label: "0 Yıl 0 Ay 0 Gün" };

/** Yıl alanını en fazla 4 haneye kısıtla (V3 clampYearInDateInput). */
export function clampYear(value: string): string {
  if (!value || !value.includes("-")) return value;
  const parts = value.split("-");
  if (parts[0] && parts[0].length > 4) parts[0] = parts[0].substring(0, 4);
  return parts.join("-");
}

export function formatDateTR(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function isDateOrderInvalid(startDate: string, endDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false;
  return new Date(endDate) < new Date(startDate);
}

/**
 * V3 `calcWorkPeriodIhbar`: kapsayıcı OLMAYAN (exclusive) takvim farkı.
 * Kısmi süreli / belirli süreli varyantlarının çalışma süresi hesabında kullanılır.
 */
export function calcWorkPeriodIhbar(startISO: string, endISO: string): WorkPeriod {
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
 * V3 `calcWorkPeriodBilirKisi`: kapsayıcı (+1 gün) yıl/ay/gün — hafta dilimi hesabında (backend
 * `calculateWeeks`) kullanılır. Etiket (label) ise V3 ile birebir uyum için sade (exclusive) fark
 * biçiminde gösterilir; yalnızca years/months/days alanları +1 günlük kapsayıcı hesaptır.
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
