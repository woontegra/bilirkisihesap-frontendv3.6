import { useEffect, useRef, useState } from "react";
import { Copy, FileDown, Printer, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { trackUsageEvent } from "@/telemetry/trackUsageEvent";
import { downloadPreviewPdf } from "./pdfExport";
import {
  buildPrintHtmlFromSections,
  copyAllTablesForWord,
  copySectionTableForWord,
  openPrintWindow,
} from "./reportLocal";
import type { PreviewSection } from "./types";
import styles from "./CalculationPreviewModal.module.css";

type Props = {
  open: boolean;
  title: string;
  sections: PreviewSection[];
  /** Word kopyalama için benzersiz DOM id (sayfa başına bir) */
  contentId: string;
  onClose: () => void;
  /** Stable module key — when set, fires PREVIEW_OPENED once per open */
  moduleKey?: string | null;
};

/**
 * Tüm hesaplama sayfalarında ortak önizleme kabuğu.
 * İçerik (sections) sayfaya özel; araç çubuğu / tablo görünümü sabittir.
 */
export function CalculationPreviewModal({
  open,
  title,
  sections,
  contentId,
  onClose,
  moduleKey,
}: Props) {
  const toast = useToast();
  const previewRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const trackedOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      trackedOpenRef.current = false;
      return;
    }
    if (trackedOpenRef.current || !moduleKey) return;
    trackedOpenRef.current = true;
    trackUsageEvent({
      eventType: "PREVIEW_OPENED",
      moduleKey,
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }, [open, moduleKey]);

  if (!open) return null;

  const handlePrint = () => {
    const ok = openPrintWindow(title, buildPrintHtmlFromSections(sections));
    if (!ok) toast.error("Yazdırma penceresi açılamadı");
  };

  const handleCopyAllWord = async () => {
    const ok = await copyAllTablesForWord(contentId);
    if (ok) toast.success("Word için kopyalandı");
    else toast.error("Kopyalama başarısız");
  };

  const handleCopySection = async (sectionId: string) => {
    const ok = await copySectionTableForWord(sectionId);
    if (ok) toast.success("Kopyalandı");
    else toast.error("Kopyalama başarısız");
  };

  const handlePdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadPreviewPdf(title, sections);
      toast.success("PDF indirildi");
    } catch {
      toast.error("PDF oluşturulamadı");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.toolbar}>
            <button type="button" className={styles.btnWord} onClick={() => void handleCopyAllWord()}>
              <Copy size={13} />
              Word&apos;e Kopyala
            </button>
            <button type="button" className={styles.btnPrint} onClick={handlePrint}>
              <Printer size={13} />
              Yazdır
            </button>
            <button type="button" className={styles.btnPdf} onClick={() => void handlePdf()} disabled={pdfBusy}>
              <FileDown size={13} />
              {pdfBusy ? "Oluşturuluyor…" : "PDF İndir"}
            </button>
            <button type="button" className={styles.btnClose} onClick={onClose}>
              <X size={13} />
              Kapat
            </button>
          </div>
        </div>
        <div className={styles.scroll}>
          <div id={contentId} ref={previewRef} className={styles.body}>
            {sections.map((section) => (
              <div key={section.id} className={styles.section} data-section={section.id}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>{section.title}</span>
                  <button
                    type="button"
                    className={styles.copyIconBtn}
                    title="Word'e kopyala"
                    onClick={() => void handleCopySection(section.id)}
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <div className="section-content">
                  <table className={styles.table}>
                    {section.headers.length > 0 ? (
                      <thead>
                        <tr>
                          {section.headers.map((h) => (
                            <th key={h} scope="col">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                    ) : null}
                    <tbody>
                      {section.rows.map((row, i) => {
                        const isLast = i === section.rows.length - 1;
                        const tone =
                          isLast && section.lastRowTone
                            ? section.lastRowTone === "blue"
                              ? styles.rowBlue
                              : styles.rowGreen
                            : undefined;
                        return (
                          <tr key={`${section.id}-${i}`} className={tone}>
                            {row.map((cell, ci) => {
                              const trimmed = cell.trimStart();
                              const cellTone =
                                trimmed.startsWith("-")
                                  ? styles.cellNeg
                                  : trimmed.startsWith("+") ||
                                      (isLast && section.lastRowTone === "green" && ci === row.length - 1)
                                    ? styles.cellPos
                                    : undefined;
                              return (
                                <td key={`${section.id}-${i}-${ci}`} className={cellTone}>
                                  {cell}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
