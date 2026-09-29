/**
 * Standart fazla mesai önizleme satırı.
 * Not temizliği ortak modüldedir; ana cetvel alanlarına yazılmaz.
 */
import { formatPreviewPeriodCell } from "../shared/previewPeriodCell";

export { formatPreviewPeriodCell as formatStandartPreviewPeriodCell, isAutoDeductionNote as isAutoUbgtAnnualLeaveDeductionNote } from "../shared/previewPeriodCell";

export type StandartPreviewCetvelSource = {
  dateRange: string;
  note?: string | null;
  weeks: string;
  wage: string;
  katsayi: string;
  fmHours: string;
  fm: string;
};

/** Kaynak satırdan bağımsız önizleme satırı. Saat ve tutar kopyalanır, yeniden hesaplanmaz. */
export function standartPreviewCetvelCells(source: StandartPreviewCetvelSource): string[] {
  return [
    formatPreviewPeriodCell(source.dateRange, source.note),
    source.weeks,
    source.wage,
    source.katsayi,
    source.fmHours,
    "225",
    "1,5",
    source.fm,
  ];
}
