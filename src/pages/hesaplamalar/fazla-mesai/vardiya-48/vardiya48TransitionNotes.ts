/** 48 saat vardiya — saf UBGT cetvel geçiş satırı (motor + UI + reallocate). */
export const V48_UBGT_CETVEL_NOTE =
  "(UBGT düşümü uygulanmıştır) (2 vardiya günü satırından 1 gün düşümü)";

export const V48_CAPTION_UBGT_1 = "UBGT düşümü 1 gün uygulanmıştır";
export const V48_CAPTION_IZIN_1 = "Yıllık izin düşümü 1 gün uygulanmıştır";
export const V48_CAPTION_UBGT_IZIN_1 = "UBGT ve yıllık izin düşümü 1 gün uygulanmıştır";

const LEGACY_UBGT_TWO_ROW = "2 vardiya günü satırından 1 gün düşümü";

function parseWeekTypeFromLabel(label?: string): number {
  return parseInt(String(label || "").trim().split(/\s+/)[0] || "0", 10) || 0;
}

/** ISO haftası cetvel notunda yalnızca UBGT (yıllık izin / rapor / diğer yok). */
export function isUbgtOnlyExclusionNoteForIsoWeek(note: string): boolean {
  const n = String(note || "");
  return n.includes("UBGT") && !n.includes("Yıllık izin") && !/Rapor|Diğer|Puantaj/i.test(n);
}

/** `exclusionNoteForClippedWindow` çıktısı — saf UBGT penceresi. */
export function isUbgtOnlyClippedExclusionNote(note: string): boolean {
  return isUbgtOnlyExclusionNoteForIsoWeek(note);
}

/** Geçiş satırı (normalize / birleşik sayfa / reallocate). */
export function isV48TransitionMotorNote(note: string): boolean {
  const n = String(note || "");
  if (/\(\d+\s*->\s*\d+\s*gün\)/i.test(n)) return true;
  const t = n.trim();
  if (t === V48_UBGT_CETVEL_NOTE) return true;
  if (t === V48_CAPTION_UBGT_1 || t === V48_CAPTION_IZIN_1 || t === V48_CAPTION_UBGT_IZIN_1) return true;
  return n.includes("UBGT") && !n.includes("Yıllık izin") && n.includes(LEGACY_UBGT_TWO_ROW);
}

/** `exclusionNoteForIsoWeek` çıktısı + fiilî gün sayılarından tek satır cetvel notu (UBGT dışı). */
export function format48RowExclusionCaption(
  isoWeekExclusionNote: string,
  beforeWd: number,
  afterWd: number
): string {
  const n = String(isoWeekExclusionNote || "").trim();
  const drop = beforeWd - afterWd;
  if (drop === 1) {
    const hasU = n.includes("UBGT");
    const hasI = n.includes("Yıllık izin");
    const hasOther = /Rapor|Diğer|Puantaj/i.test(n);
    if (hasU && hasI) return V48_CAPTION_UBGT_IZIN_1;
    if (hasU && !hasOther) return V48_CAPTION_UBGT_1;
    if (hasI && !hasU) return V48_CAPTION_IZIN_1;
  }
  const base = n || "(Dışlama uygulanmıştır)";
  return `${base} (${beforeWd}->${afterWd} gün)`;
}

/**
 * Donör satırı (2 gün sütunu) için (before,after) çifti.
 * Standart UBGT cetvel satırı daima 2→1 kabul edilir.
 */
export function parseV48TransitionPairFromRow(
  note: string,
  weekTypeLabel: string | undefined,
  trRe: RegExp
): { before: number; after: number } | null {
  const n = String(note || "");
  const m = trRe.exec(n);
  if (m) {
    const before = Number(m[1]);
    const after = Number(m[2]);
    return Number.isFinite(before) && Number.isFinite(after) ? { before, after } : null;
  }
  const t = n.trim();
  if (t === V48_UBGT_CETVEL_NOTE) return { before: 2, after: 1 };
  if (t === V48_CAPTION_UBGT_1 || t === V48_CAPTION_UBGT_IZIN_1) {
    const wt = parseWeekTypeFromLabel(weekTypeLabel);
    if (wt === 2) return { before: 3, after: 2 };
    if (wt === 1) return { before: 2, after: 1 };
    return { before: 2, after: 1 };
  }
  if (t === V48_CAPTION_IZIN_1) {
    const wt = parseWeekTypeFromLabel(weekTypeLabel);
    if (wt === 2) return { before: 3, after: 2 };
    if (wt === 1) return { before: 2, after: 1 };
    return null;
  }
  if (n.includes("UBGT") && !n.includes("Yıllık izin") && n.includes(LEGACY_UBGT_TWO_ROW)) {
    return { before: 2, after: 1 };
  }
  return null;
}
