/** V3 `dateUtils.calculateWeeksBetweenDates` — gemi birleştirme için. */

function clampToLastDayOfMonth(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  if (d <= lastDay) return iso.slice(0, 10);
  const mm = String(m).padStart(2, "0");
  const dd = String(lastDay).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function normalizeToISO(dateStr: string): string {
  const t = (dateStr || "").trim();
  if (!t) return t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return t;
}

export function calculateWeeksBetweenDates(startISO?: string, endISO?: string): number {
  if (!startISO || !endISO) return 0;
  const startNorm = clampToLastDayOfMonth(normalizeToISO(startISO));
  const endNorm = clampToLastDayOfMonth(normalizeToISO(endISO));
  const s = new Date(startNorm);
  const e = new Date(endNorm);
  if (Number.isNaN(+s) || Number.isNaN(+e) || e < s) return 0;
  const diffMs = e.getTime() - s.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  const weeks = Math.round(diffDays / 7);
  return Math.max(0, weeks);
}
