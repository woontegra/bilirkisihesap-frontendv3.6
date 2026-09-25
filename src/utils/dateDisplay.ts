/**
 * Kullanıcıya gösterilen tarihler için timezone-güvenli formatlayıcılar.
 * new Date("YYYY-MM-DD") kullanılmaz (UTC kayması riski).
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T\s]/;
const TR_DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

function pad2(n: string | number): string {
  return String(n).padStart(2, "0");
}

function isPlausibleYmd(y: number, m: number, d: number): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  return true;
}

/**
 * Tek tarih → DD.MM.YYYY.
 * Destek: YYYY-MM-DD, ISO datetime (yalnızca tarih kısmı), zaten DD.MM.YYYY, boş/null.
 * Geçersiz değerleri uydurma tarihe çevirmez; boşsa "—", tanınmayan string olduğu gibi bırakılır.
 */
export function formatIsoDateTR(
  value?: string | null,
  emptyLabel = "—",
): string {
  if (value == null) return emptyLabel;
  const raw = String(value).trim();
  if (!raw) return emptyLabel;

  const tr = TR_DATE_RE.exec(raw);
  if (tr) {
    const d = Number(tr[1]);
    const m = Number(tr[2]);
    const y = Number(tr[3]);
    if (!isPlausibleYmd(y, m, d)) return raw;
    return `${pad2(d)}.${pad2(m)}.${y}`;
  }

  const iso = ISO_DATE_RE.exec(raw) || ISO_DATETIME_RE.exec(raw);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (!isPlausibleYmd(y, m, d)) return raw;
    return `${pad2(d)}.${pad2(m)}.${y}`;
  }

  return raw;
}

/**
 * Tarih aralığı → "DD.MM.YYYY – DD.MM.YYYY".
 * Tek taraf boşsa dolu tarafı gösterir; ikisi de boşsa emptyLabel.
 */
export function formatIsoDateRangeTR(
  start?: string | null,
  end?: string | null,
  separator = " – ",
  emptyLabel = "—",
): string {
  const a = formatIsoDateTR(start, "");
  const b = formatIsoDateTR(end, "");
  if (!a && !b) return emptyLabel;
  if (!a) return b;
  if (!b) return a;
  return `${a}${separator}${b}`;
}
