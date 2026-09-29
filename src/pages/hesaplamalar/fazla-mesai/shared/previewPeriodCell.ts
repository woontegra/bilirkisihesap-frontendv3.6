/**
 * Yalnız fazla mesai önizleme kopyası. Ana cetvel notunu yazmaz.
 * Eşleşmeyen parantezli metinler durur.
 */
const DAY_UNIT = String.raw`\d+(?:,\d+)?`;
const UBGT_OR_LEAVE = String.raw`(?:${DAY_UNIT} gün UBGT|${DAY_UNIT} gün yıllık izin)`;
const AUTO_NOTE_BODY = String.raw`\((?:${UBGT_OR_LEAVE}(?: \+ ${UBGT_OR_LEAVE})* düşülmüştür|${DAY_UNIT} gün dışlama düşülmüştür(?:: yıllık izin / UBGT / diğer)?)\)`;
const AUTO_DEDUCTION_NOTE = new RegExp(`^${AUTO_NOTE_BODY}$`);
const TRAILING_AUTO_NOTE = new RegExp(String.raw`\s+${AUTO_NOTE_BODY}$`);

function normalizeNote(note: string): string {
  return note.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

export function isAutoDeductionNote(note: string): boolean {
  return AUTO_DEDUCTION_NOTE.test(normalizeNote(note));
}

export function formatPreviewPeriodCell(dateRange: string, note?: string | null): string {
  const range = dateRange.replace(TRAILING_AUTO_NOTE, "");
  const trimmed = normalizeNote(note ?? "");
  if (!trimmed || isAutoDeductionNote(trimmed)) return range;
  return `${range} ${note}`;
}
