import { X } from "lucide-react";
import type { SmartImportQualityReport } from "../smart-import-v2/qualityReport";
import { LAYOUT_SECTION_COUNT_LABEL } from "../smart-import-v2/userLabels";
import PuantajPortalModal from "./PuantajPortalModal";
import styles from "../PuantajFmPage.module.css";

type Props = {
  open: boolean;
  report: SmartImportQualityReport | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function SmartQualityReportModal(props: Props) {
  if (!props.open || !props.report) return null;
  const r = props.report;

  return (
    <PuantajPortalModal open={props.open} onClose={props.onCancel} ariaLabel="Veri kalite özeti">
      <div className={styles.qualityReportGrid}>
        <Stat label="Kaynak satır" value={r.totalSourceRows} />
        <Stat label="Normalize satır" value={r.normalizedRows} />
        <Stat label={LAYOUT_SECTION_COUNT_LABEL} value={r.segmentCount} />
        <Stat label="Geçerli tarih" value={r.validDateCount} />
        <Stat label="Giriş+çıkış" value={r.rowsWithEntryAndExit} />
        <Stat label="Yalnız giriş" value={r.rowsWithEntryOnly} />
        <Stat label="Yalnız çıkış" value={r.rowsWithExitOnly} />
        <Stat label="OFF" value={r.offCount} />
        <Stat label="Hafta tatili" value={r.weeklyRestCount} />
        <Stat label="İzin" value={r.leaveCount} />
        <Stat label="Geçersiz tarih" value={r.invalidDateCount} />
        <Stat label="Mükerrer sütun" value={r.duplicateColumnCount} />
        <Stat label="Mükerrer satır" value={r.duplicateRowCount} />
        <Stat label="Gece vardiyası?" value={r.possibleNightShiftCount} />
        <Stat label="Düşük güven" value={r.lowConfidenceCount} />
      </div>

      {r.issueRows.length > 0 && (
        <div className={styles.qualityIssues}>
          <h4>Sorunlu satırlar (Excel satır no)</h4>
          <ul>
            {r.issueRows.slice(0, 12).map((row) => (
              <li key={`${row.sourceRow}-${row.reason}`}>
                Satır {row.sourceRow}: {row.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.smartImportActions} style={{ marginTop: "0.75rem" }}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={props.onConfirm}>
          Onayla ve Verileri Kontrol Et adımına geç
        </button>
        <button type="button" className={styles.btn} onClick={props.onCancel}>
          <X size={14} /> Geri
        </button>
      </div>
    </PuantajPortalModal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.smartStat}>
      <span className={styles.smartStatLabel}>{label}</span>
      <span className={styles.smartStatValue}>{value}</span>
    </div>
  );
}
