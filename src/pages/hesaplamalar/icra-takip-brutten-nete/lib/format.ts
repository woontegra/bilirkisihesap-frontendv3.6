/** ISO (yyyy-mm-dd) → TR (gg.aa.yyyy) */
export function fmtDateTR(isoDate: string): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}
