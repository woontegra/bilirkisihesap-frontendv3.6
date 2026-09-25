import type { FazlaMesaiRowBase } from "../fazlaMesaiShared";

/** Yıllık izin / UBGT / dışlama nedeniyle ayrı üretilen cetvel satırı (yapısal işaretler). */
export function isFmLeaveDeductionRow(row: FazlaMesaiRowBase): boolean {
  if ((row as { isExclusionBlock?: boolean }).isExclusionBlock === true) return true;
  const id = String(row.id || "");
  if (id.includes("-b-")) return true;
  if (id.startsWith("auto-yl2-") && !id.startsWith("auto-yl2-base-")) return true;
  return false;
}
