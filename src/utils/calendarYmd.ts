const HTML_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Takvimde var olan gün mü (ör. 2026-02-30 → false). */
export function isValidCalendarYmd(ymd: string): boolean {
  if (!HTML_DATE_RE.test(ymd)) return false;
  const y = Number(ymd.slice(0, 4));
  const mo = Number(ymd.slice(5, 7));
  const da = Number(ymd.slice(8, 10));
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(y, mo - 1, da);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === da;
}
