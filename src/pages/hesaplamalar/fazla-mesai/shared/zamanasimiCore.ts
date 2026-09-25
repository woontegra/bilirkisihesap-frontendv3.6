/**
 * V3 ortak zamanaşımı hesabı: dava − 5 yıl − arabuluculuk − pandemi günü.
 */

export const PANDEMI_BASLANGIC = "2020-03-13";
export const PANDEMI_BITIS = "2020-06-15";
export const PANDEMI_SABIT_GUN = 94;

export type ZamanasimiInfo = {
  davaTarihi: string;
  arabuluculukBaslangic: string;
  arabuluculukBitis: string;
  /** Hesaplanan nihai zamanaşımı başlangıç tarihi (ISO). */
  nihaiBaslangic: string;
} | null;

export function isValidIsoDate(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? "").trim());
}

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoToUtcDays(iso: string): number {
  return isoToUtcMs(iso) / 86400000;
}

export function daysBetweenIsoInclusive(start: string, end: string): number {
  return Math.max(0, isoToUtcDays(end) - isoToUtcDays(start) + 1);
}

/** İşe giriş tarihine göre pandemi hak düşürücü süre uzaması (gün). */
export function computePandemiGunFromIseGiris(iseGiris: string): number {
  if (!isValidIsoDate(iseGiris)) return 0;
  const iseMs = isoToUtcMs(iseGiris);
  const pandemiBasMs = isoToUtcMs(PANDEMI_BASLANGIC);
  const pandemiBitMs = isoToUtcMs(PANDEMI_BITIS);
  if (iseMs < pandemiBasMs) return PANDEMI_SABIT_GUN;
  if (iseMs >= pandemiBasMs && iseMs <= pandemiBitMs) {
    return Math.max(0, Math.round((pandemiBitMs - iseMs) / 86400000) + 1);
  }
  return 0;
}

/** Dava tarihinden 5 yıl önceki zamanaşımı sınır tarihi (ISO). */
export function computeZamanasimiLimitDate(davaTarihi: string): string | null {
  if (!isValidIsoDate(davaTarihi)) return null;
  const davaMs = isoToUtcMs(davaTarihi);
  const limitMs = Date.UTC(
    new Date(davaMs).getUTCFullYear() - 5,
    new Date(davaMs).getUTCMonth(),
    new Date(davaMs).getUTCDate(),
  );
  const d = new Date(limitMs);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Dava − 5 yıl − arabuluculuk günü − pandemi günü → nihai başlangıç (ISO). */
export function computeZamanasimiNihaiBaslangic(
  davaTarihi: string,
  arabuluculukBaslangic: string,
  arabuluculukBitis: string,
  iseGiris: string,
): string | null {
  if (!isValidIsoDate(davaTarihi)) return null;
  const limitIso = computeZamanasimiLimitDate(davaTarihi);
  if (!limitIso) return null;
  const limitMs = isoToUtcMs(limitIso);

  let arabuluculukGun = 0;
  if (isValidIsoDate(arabuluculukBaslangic) && isValidIsoDate(arabuluculukBitis) && arabuluculukBitis >= arabuluculukBaslangic) {
    arabuluculukGun = daysBetweenIsoInclusive(arabuluculukBaslangic, arabuluculukBitis);
  }

  const pandemiGun = computePandemiGunFromIseGiris(iseGiris);
  const nihaiMs = limitMs - arabuluculukGun * 86400000 - pandemiGun * 86400000;
  const d = new Date(nihaiMs);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatTrIsoDate(iso: string): string {
  if (!isValidIsoDate(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
