/**
 * V3 paritesi: otomatik cetvel satırları yalnızca hafta, FM saati ve tutar sıfır değilse gösterilir.
 */
export type CetvelRowLike = {
  isManual?: boolean;
  weeks?: number;
  fmHours?: number;
  fm?: number;
};

export function isCetvelRowVisible(r: CetvelRowLike): boolean {
  if (r.isManual) return true;
  const fmH = Number(r.fmHours ?? 0);
  const w = Number(r.weeks ?? 0);
  const fmAmt = Number(r.fm ?? 0);
  return fmH !== 0 && w !== 0 && fmAmt !== 0;
}
