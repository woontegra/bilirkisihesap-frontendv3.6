/**
 * Birleşik saat hücresi ayrıştırması.
 * Ham değeri korur; izin/tatil kodlarını saatten ayırır; tek saati tahmin etmez.
 */

import { isNonWorkingCode, matchIzinKod } from "./codes";
import type { CodeMap, IzinKodKey } from "./model";
import { minutesToTime, parseTimeToMinutes } from "./utils";

export type CombinedTimeParse =
  | { kind: "range"; start: string; end: string; ertesiGun: boolean; raw: string; normalized: string }
  | { kind: "izin"; kod: IzinKodKey; raw: string; normalized: string }
  | { kind: "unparsed"; raw: string; normalized: string; reason: "single" | "invalid" | "empty" };

/** Başındaki yıldız / boşluk / noktalama temizliği. */
export function normalizeRangeCell(raw: string): string {
  return (raw ?? "")
    .toString()
    .replace(/^[\s*•·▪◦]+/u, "")
    .replace(/[\s*•·▪◦]+$/u, "")
    .trim();
}

/** Farklı tire karakterlerini destekleyen aralık kalıbı. */
const RANGE_RE =
  /(\d{1,2}[:.,]\d{1,2}(?:[:.,]\d{1,2})?)\s*[-–—−⁓~／/]\s*(\d{1,2}[:.,]\d{1,2}(?:[:.,]\d{1,2})?)/;

/**
 * Birleşik hücreyi çözümler.
 * 1) Boş → unparsed/empty
 * 2) İzin/tatil kodu (HAFTA TATİLİ, İZİN, RAPOR, UBGT…) → saat ayrıştırılmaz
 * 3) Saat aralığı → giriş/çıkış (+ gece vardiyası)
 * 4) Tek saat veya geçersiz → unparsed (kullanıcı kontrolü; tahmin yok)
 */
export function parseCombinedTimeCell(raw: string, codeMap?: CodeMap): CombinedTimeParse {
  const original = (raw ?? "").toString();
  const normalized = normalizeRangeCell(original);
  if (!normalized) {
    return { kind: "unparsed", raw: original, normalized: "", reason: "empty" };
  }

  const rangeMatch = normalized.match(RANGE_RE);
  if (!rangeMatch) {
    const kod = matchIzinKod(normalized, codeMap);
    if (isNonWorkingCode(kod)) {
      return { kind: "izin", kod, raw: original, normalized };
    }
    if (parseTimeToMinutes(normalized) !== null) {
      return { kind: "unparsed", raw: original, normalized, reason: "single" };
    }
    // Harf ağırlıklı tanınmayan açıklama → izin olarak sınıflandır (kullanıcı doğrular).
    const onlyLetters = /^[\p{L}\s./()-]+$/u.test(normalized);
    if (onlyLetters && kod === "BILINMIYOR") {
      return { kind: "izin", kod, raw: original, normalized };
    }
    return { kind: "unparsed", raw: original, normalized, reason: "invalid" };
  }

  const startMin = parseTimeToMinutes(rangeMatch[1]);
  const endMin = parseTimeToMinutes(rangeMatch[2]);
  if (startMin === null || endMin === null) {
    return { kind: "unparsed", raw: original, normalized, reason: "invalid" };
  }

  const start = minutesToTime(startMin);
  const end = minutesToTime(endMin);
  const ertesiGun = endMin <= startMin;
  return { kind: "range", start, end, ertesiGun, raw: original, normalized };
}

/** Ham hücre izin/tatil kodu mu? (saat ayrıştırmadan önce hızlı kontrol). */
export function cellLooksLikeLeaveCode(raw: string, codeMap?: CodeMap): boolean {
  const normalized = normalizeRangeCell(raw);
  if (!normalized || RANGE_RE.test(normalized)) return false;
  return isNonWorkingCode(matchIzinKod(normalized, codeMap));
}

/** Test / debug için aralık deseni var mı. */
export function hasTimeRangePattern(raw: string): boolean {
  return RANGE_RE.test(normalizeRangeCell(raw));
}
