import { ClipboardList, X } from "lucide-react";
import { formatDateTR } from "../format";
import { IZIN_KOD_LABELS } from "../model";
import type { OffAuditReport } from "../model";
import { OFF_LAYER_LABELS } from "../offAudit";
import PuantajPortalModal from "./PuantajPortalModal";
import styles from "../PuantajFmPage.module.css";

type Props = {
  report: OffAuditReport | null;
  open: boolean;
  onClose: () => void;
};

export default function OffAuditModal({ report, open, onClose }: Props) {
  if (!report) return null;

  return (
    <PuantajPortalModal
      open={open}
      onClose={onClose}
      labelledBy="off-audit-title"
      cardClassName={styles.offAuditModal}
    >
      <div className={styles.modalHead}>
        <h3 id="off-audit-title" className={styles.modalTitle}>
          <ClipboardList size={18} /> OFF Denetimi
        </h3>
        <button type="button" className={styles.iconBtn} aria-label="Kapat" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <p className={styles.modalBody}>
        Toplam OFF gün sayısı yalnızca doğrulanmış listenin uzunluğundan türetilir; bağımsız sayaç kullanılmaz.
      </p>

      <div className={styles.auditLayerGrid}>
        {(Object.keys(OFF_LAYER_LABELS) as (keyof typeof OFF_LAYER_LABELS)[]).map((key) => (
          <div key={key} className={styles.auditLayerTile}>
            <div className={styles.auditLayerLabel}>{OFF_LAYER_LABELS[key]}</div>
            <div className={styles.auditLayerValue}>{report.layerCounts[key]}</div>
          </div>
        ))}
      </div>

      {report.firstDivergenceLayer && (
        <p className={styles.auditDivergence}>
          İlk fark: <strong>{OFF_LAYER_LABELS[report.firstDivergenceLayer]}</strong>
          {report.firstDivergenceDetail ? ` (${report.firstDivergenceDetail})` : ""}
        </p>
      )}

      {report.personeller.map((p) => (
        <section key={p.personelAdSoyad} className={styles.auditPersonSection}>
          <h4 className={styles.auditPersonTitle}>{p.personelAdSoyad}</h4>

          <div className={styles.auditSummaryGrid}>
            <SummaryChip label="Ham OFF adayı" value={p.summary.hamAdayToplam} />
            <SummaryChip label="Geçerli OFF günü" value={p.summary.gecerliOffGunToplam} accent />
            <SummaryChip label="Tarih dışı" value={p.summary.tarihDisi} />
            <SummaryChip label="Mükerrer" value={p.summary.mukerrer} />
            <SummaryChip label="Çelişkili" value={p.summary.celiskili} />
            <SummaryChip label="Tarih çözülemedi" value={p.summary.tarihCozulemedi} />
            <SummaryChip label="Saatleri esas alındı" value={p.summary.saatleriEsasAlindi} />
          </div>

          <h5 className={styles.auditSubTitle}>Mahsupa dahil OFF günleri ({p.validOffDays.length})</h5>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Sayfa</th>
                  <th>Satır</th>
                  <th>Ham metin</th>
                </tr>
              </thead>
              <tbody>
                {p.validOffDays.map((d) => (
                  <tr key={`${d.standardRowId}-${d.tarihISO}`}>
                    <td>{formatDateTR(d.tarihISO)}</td>
                    <td>{d.kaynakSayfa}</td>
                    <td>{(d.kaynakSatirSira ?? 0) + 1}</td>
                    <td>{d.hamMetin || "—"}</td>
                  </tr>
                ))}
                {p.validOffDays.length === 0 && (
                  <tr>
                    <td colSpan={4} className={styles.empty}>Mahsupa dahil OFF günü yok.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {p.records.length > 0 && (
            <>
              <h5 className={styles.auditSubTitle}>Tüm OFF adayları ve durumları</h5>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Sayfa</th>
                      <th>Satır</th>
                      <th>Ham izin</th>
                      <th>Ham mesai</th>
                      <th>Etiketler</th>
                      <th>OFF?</th>
                      <th>Mahsup</th>
                      <th>Neden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.records.map((r) => (
                      <tr key={r.id} className={r.mahsupaDahil ? styles.auditRowIncluded : undefined}>
                        <td>{r.tarihISO ? formatDateTR(r.tarihISO) : r.tarihHam || "—"}</td>
                        <td>{r.kaynakSayfa}</td>
                        <td>{r.kaynakSatirSira + 1}</td>
                        <td>{r.hamIzinAciklama || "—"}</td>
                        <td>{r.hamMesaiAciklama || "—"}</td>
                        <td>{r.durumKodlari.length ? r.durumKodlari.map((k) => IZIN_KOD_LABELS[k]).join(" · ") : IZIN_KOD_LABELS[r.sonSiniflandirma]}</td>
                        <td>{r.durumKodlari.includes("OFF") || r.offAdayi ? "Evet" : "Hayır"}</td>
                        <td>{r.mahsupaDahil ? "Evet" : "Hayır"}</td>
                        <td style={{ fontSize: "var(--fs-xs)", whiteSpace: "normal", maxWidth: "12rem" }}>
                          {r.dahilEdilmediNedeni ?? (r.mahsupaDahil ? "Dahil" : "—")}
                          {r.mukerrerEslesme ? ` → ${r.mukerrerEslesme.tarih}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ))}
    </PuantajPortalModal>
  );
}

function SummaryChip({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`${styles.auditSummaryChip} ${accent ? styles.auditSummaryAccent : ""}`}>
      <div className={styles.auditSummaryChipLabel}>{label}</div>
      <div className={styles.auditSummaryChipValue}>{value}</div>
    </div>
  );
}
