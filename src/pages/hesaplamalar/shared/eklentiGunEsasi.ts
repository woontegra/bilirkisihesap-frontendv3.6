/**
 * 12 aylık bordro eklenti hesabı için gün esası: (12 aylık toplam / gün esası) × 30.
 * Bu alanı taşımayan eski kayıtlar 360 kabul edilir.
 */

export type EklentiGunEsasi = 360 | 365;

export const VARSAYILAN_EKLENTI_GUN_ESASI: EklentiGunEsasi = 360;

export function normalizeEklentiGunEsasi(value: unknown): EklentiGunEsasi {
  return Number(value) === 365 ? 365 : VARSAYILAN_EKLENTI_GUN_ESASI;
}
