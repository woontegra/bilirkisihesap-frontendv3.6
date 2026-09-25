/**
 * Puantaj modülü — saf yardımcı fonksiyonlar (metin, saat, tarih).
 * Hiçbir tarayıcı/DOM veya ağ API'sine bağımlı değildir; test edilebilir.
 */

/** Türkçe karakterleri sadeleştirir, küçük harfe indirger, boşlukları teker. */
export function normalizeText(input: string): string {
  return (input ?? "")
    .toString()
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function round2(x: number): number {
  return Number((x ?? 0).toFixed(2));
}

/* ── Saat ── */

/** "HH:mm" | "HH:mm:ss" | "H.mm" | "HHmm" | "8" gibi değerleri dakikaya çevirir; geçersizse null. */
export function parseTimeToMinutes(raw: string): number | null {
  if (raw == null) return null;
  const s = raw.toString().trim();
  if (!s) return null;
  // 08:00 / 8:0 / 08.00 / 08,00 / 19:44:56 (saniye yok sayılır)
  const m = s.match(/^(\d{1,2})[:.,hH](\d{1,2})(?:[:.,](\d{1,2}))?$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh > 23 || mm > 59) return null;
    return hh * 60 + mm;
  }
  // 0800 / 800
  const digits = s.match(/^(\d{3,4})$/);
  if (digits) {
    const v = digits[1].padStart(4, "0");
    const hh = Number(v.slice(0, 2));
    const mm = Number(v.slice(2));
    if (hh > 23 || mm > 59) return null;
    return hh * 60 + mm;
  }
  // sadece saat "8" / "18"
  const hourOnly = s.match(/^(\d{1,2})$/);
  if (hourOnly) {
    const hh = Number(hourOnly[1]);
    if (hh > 23) return null;
    return hh * 60;
  }
  return null;
}

export function isValidTime(raw: string): boolean {
  return parseTimeToMinutes(raw) !== null;
}

/** Dakikayı "HH:mm" biçimine çevirir. */
export function minutesToTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Giriş "HH:mm" formatına normalize eder (varsa), yoksa ham metni döndürür. */
export function normalizeTimeString(raw: string): string {
  const min = parseTimeToMinutes(raw);
  return min === null ? (raw ?? "").toString().trim() : minutesToTime(min);
}

/**
 * Giriş-çıkış saatlerinden brüt çalışma saatini döndürür.
 * Çıkış girişten küçük/eşitse ertesi gün kabul edilir (gece vardiyası).
 */
export function grossHoursBetween(giris: string, cikis: string): { hours: number; ertesiGun: boolean } | null {
  const g = parseTimeToMinutes(giris);
  const c = parseTimeToMinutes(cikis);
  if (g === null || c === null) return null;
  let diff = c - g;
  let ertesiGun = false;
  if (diff <= 0) {
    diff += 1440;
    ertesiGun = true;
  }
  return { hours: round2(diff / 60), ertesiGun };
}

/* ── Aralık metni ("08:00-17:00", "08:00 – 17:00", "*20:30-08:30") ── */

const RANGE_RE = /(\d{1,2}[:.,]\d{1,2}(?:[:.,]\d{1,2})?)\s*[-–—−⁓~／/]\s*(\d{1,2}[:.,]\d{1,2}(?:[:.,]\d{1,2})?)/;

export function parseTimeRange(raw: string): { start: string; end: string; ertesiGun: boolean } | null {
  if (!raw) return null;
  const cleaned = raw
    .toString()
    .replace(/^[\s*•·▪◦]+/u, "")
    .replace(/[\s*•·▪◦]+$/u, "")
    .trim();
  const m = cleaned.match(RANGE_RE);
  if (!m) return null;
  const start = parseTimeToMinutes(m[1]);
  const end = parseTimeToMinutes(m[2]);
  if (start === null || end === null) return null;
  return {
    start: minutesToTime(start),
    end: minutesToTime(end),
    ertesiGun: end <= start,
  };
}

/* ── Tarih ── */

const MONTHS_TR: Record<string, number> = {
  ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6,
  temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
};

/** Çeşitli tarih biçimlerini ISO (YYYY-MM-DD) yapar; başarısızsa null. */
export function parseDateToISO(raw: string): string | null {
  if (raw == null) return null;
  const s = raw.toString().trim();
  if (!s) return null;

  // ISO zaten
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return buildISO(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dmy) {
    let y = Number(dmy[3]);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    return buildISO(y, Number(dmy[2]), Number(dmy[1]));
  }

  // "5 Ocak 2024" / "5 ocak 2024"
  const words = normalizeText(s).match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (words) {
    const month = MONTHS_TR[words[2]];
    if (month) return buildISO(Number(words[3]), month, Number(words[1]));
  }

  // Excel seri numarası (gün sayısı, 1900 tabanlı)
  const serial = s.match(/^\d{4,5}$/);
  if (serial) {
    const iso2 = excelSerialToISO(Number(serial[0]));
    if (iso2) return iso2;
  }

  return null;
}

function buildISO(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20 || serial > 80000) return null;
  // Excel epoch: 1899-12-30 (1900 bug telafisi)
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function isValidISODate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso ?? "");
}

/** ISO tarihten haftanın günü (1=Pazartesi..7=Pazar). */
export function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Pazar
  return wd === 0 ? 7 : wd;
}

/** ISO tarihe gün ekler. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** İki ISO tarih arasındaki gün farkı (a - b). */
export function diffDaysISO(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((da - db) / 86400000);
}

/** Verilen ISO tarihin içinde bulunduğu haftanın Pazartesi'si. */
export function weekStartMonday(iso: string): string {
  const wd = isoWeekday(iso); // 1..7
  return addDaysISO(iso, -(wd - 1));
}

export function id(prefix = "row"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
