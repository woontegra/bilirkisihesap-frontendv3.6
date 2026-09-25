import { useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, FileText, Sparkles, UploadCloud } from "lucide-react";
import type { ParsedDocument, TableView } from "../model";
import { ACCEPTED_FILE_TYPES } from "../parsing";
import styles from "../PuantajFmPage.module.css";

type Props = {
  doc: ParsedDocument | null;
  /** Başlık seçimine göre hizalanmış önizleme (PDF geometrisinden). */
  table: TableView | null;
  loading: boolean;
  error: string | null;
  sheetIndex: number;
  headerRowIndex: number;
  suggestedTemplateName: string | null;
  onFile: (file: File) => void;
  onSheetChange: (index: number) => void;
  onHeaderRowChange: (index: number) => void;
};

export default function UploadStep(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { doc, table } = props;
  const sheet = doc?.sheets[props.sheetIndex];
  const hasGeometry = !!(sheet?.geometry && sheet.geometry.length > 0);

  const headerOptions: string[] = (() => {
    if (hasGeometry && sheet?.geometry) {
      return sheet.geometry.map((line) =>
        line.cells
          .map((c) => c.text.trim())
          .filter(Boolean)
          .join(" | "),
      );
    }
    return (sheet?.grid ?? []).map((row) => row.filter(Boolean).join(" | "));
  })();

  const previewHeaders = table?.headers ?? [];
  const previewRows = table
    ? [table.headers, ...table.rows.slice(0, 5)]
    : (sheet?.grid ?? []).slice(0, 6);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) props.onFile(file);
  };

  return (
    <section className={`${styles.card} ${styles.stepPanel}`}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          <UploadCloud size={18} /> Dosya Yükle
        </h2>
      </div>
      <p className={styles.cardHint}>
        Dijital PDF, Excel (.xlsx/.xls) veya CSV yükleyin. Dosya yalnızca bu cihazda işlenir; hiçbir sunucuya
        gönderilmez. PDF’de sütunlar seçilen başlık satırına göre hizalanır.
      </p>

      <div
        className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      >
        <UploadCloud size={34} className={styles.dropIcon} />
        <span className={styles.dropTitle}>Dosyayı buraya bırakın veya seçin</span>
        <span className={styles.dropSub}>
          PDF · Excel · CSV — {props.loading ? "okunuyor…" : "maks. tek dosya"}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) props.onFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {props.error && (
        <div className={styles.warnBox}>
          <AlertTriangle size={16} /> {props.error}
        </div>
      )}

      {doc && (
        <>
          <div className={styles.fileCard}>
            <span className={styles.fileIcon}>
              {doc.kind === "pdf" ? <FileText size={20} /> : <FileSpreadsheet size={20} />}
            </span>
            <span className={styles.fileMeta}>
              <span className={styles.fileName}>{doc.fileName}</span>
              <span className={styles.fileSub}>
                {doc.kind.toUpperCase()} · {doc.sheets.length} sayfa/sekme
                {table ? ` · ${table.headers.length} sütun` : ""}
              </span>
            </span>
          </div>

          {props.suggestedTemplateName && (
            <div className={styles.warnBox} style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              <Sparkles size={16} /> Bu formata uygun kayıtlı şablon bulundu: <b>{props.suggestedTemplateName}</b>.
              Eşleştirme adımında uygulayabilirsiniz. Otomatik hesaplama yapılmaz.
            </div>
          )}

          {doc.warnings.map((w) => (
            <div key={w} className={styles.warnBox}>
              <AlertTriangle size={16} /> {w}
            </div>
          ))}

          <div className={styles.pickerRow}>
            {doc.sheets.length > 1 && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Sayfa / Sekme</span>
                <select
                  className={styles.select}
                  value={props.sheetIndex}
                  onChange={(e) => props.onSheetChange(Number(e.target.value))}
                >
                  {doc.sheets.map((s, i) => (
                    <option key={s.name + i} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Başlık Satırı</span>
              <select
                className={styles.select}
                value={props.headerRowIndex}
                onChange={(e) => props.onHeaderRowChange(Number(e.target.value))}
              >
                {headerOptions.slice(0, 20).map((label, i) => (
                  <option key={i} value={i}>
                    Satır {i + 1}: {label.slice(0, 64) || "(boş)"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {previewRows.length > 0 && (
            <div className={styles.tableWrap} style={{ marginTop: "0.9rem" }}>
              <table className={styles.table}>
                <tbody>
                  {previewRows.map((row, ri) => (
                    <tr key={ri} style={{ animationDelay: `${ri * 40}ms` }}>
                      {(Array.isArray(row) ? row : []).map((cell, ci) => (
                        <td
                          key={ci}
                          style={ri === 0 && previewHeaders.length > 0 ? { fontWeight: 700 } : undefined}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
