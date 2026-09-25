/**
 * V3 ortak zamanaşımı modalı — tüm FM sayfalarında aynı özet ve pandemi kutusu.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  computePandemiGunFromIseGiris,
  computeZamanasimiLimitDate,
  computeZamanasimiNihaiBaslangic,
  daysBetweenIsoInclusive,
  formatTrIsoDate,
  isValidIsoDate,
  type ZamanasimiInfo,
} from "./zamanasimiCore";
import styles from "./ZamanasimiPickerModal.module.css";

export type { ZamanasimiInfo };

export function ZamanasimiPickerModal({
  open,
  initial,
  iseGiris,
  onApply,
  onClear,
  onClose,
}: {
  open: boolean;
  initial: ZamanasimiInfo;
  iseGiris: string;
  onApply: (info: ZamanasimiInfo) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [dava, setDava] = useState(initial?.davaTarihi ?? "");
  const [bas, setBas] = useState(initial?.arabuluculukBaslangic ?? "");
  const [bit, setBit] = useState(initial?.arabuluculukBitis ?? "");

  useEffect(() => {
    if (open) {
      setDava(initial?.davaTarihi ?? "");
      setBas(initial?.arabuluculukBaslangic ?? "");
      setBit(initial?.arabuluculukBitis ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const arabuluculukGun =
    isValidIsoDate(bas) && isValidIsoDate(bit) && bit >= bas ? daysBetweenIsoInclusive(bas, bit) : 0;
  const nihai = isValidIsoDate(dava) ? computeZamanasimiNihaiBaslangic(dava, bas, bit, iseGiris) : null;
  const pandemiGun = computePandemiGunFromIseGiris(iseGiris);
  const limitIso = isValidIsoDate(dava) ? computeZamanasimiLimitDate(dava) : null;

  const apply = () => {
    if (!nihai) return;
    onApply({ davaTarihi: dava, arabuluculukBaslangic: bas, arabuluculukBitis: bit, nihaiBaslangic: nihai });
    onClose();
  };

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Zamanaşımı Hesaplama</h2>

        <div className={styles.basicGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Dava Tarihi</span>
            <input type="date" className={styles.dateInput} value={dava} onChange={(e) => setDava(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Arabuluculuk Başlangıç</span>
            <input type="date" className={styles.dateInput} value={bas} onChange={(e) => setBas(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Arabuluculuk Bitiş</span>
            <input type="date" className={styles.dateInput} value={bit} min={bas || undefined} onChange={(e) => setBit(e.target.value)} />
          </label>
        </div>

        {isValidIsoDate(dava) ? (
          <div className={styles.zamanasimiSummary}>
            <div className={styles.line}>
              <span>
                Dava tarihi: <strong>{formatTrIsoDate(dava)}</strong>
              </span>
            </div>
            <div className={styles.line}>
              <span>
                Zamanaşımı süresi (5 yıl): <strong>{limitIso ? formatTrIsoDate(limitIso) : "—"}</strong>
              </span>
            </div>
            <div className={styles.line}>
              <span>
                Arabuluculuk süresi: <strong>{arabuluculukGun} gün</strong>
              </span>
            </div>
            {pandemiGun > 0 ? (
              <p className={styles.pandemiNotice}>
                <strong>Pandemi Dönemi:</strong> 13 Mart 2020 - 15 Haziran 2020 arası pandemi hak kaybı süresi nedeniyle
                +{pandemiGun} gün eklendi.
              </p>
            ) : null}
            <div className={`${styles.line} ${styles.netLine}`}>
              <span>
                Nihai zamanaşımı başlangıç tarihi: <strong>{nihai ? formatTrIsoDate(nihai) : "—"}</strong>
              </span>
            </div>
          </div>
        ) : null}

        <div className={styles.modalActions}>
          {initial ? (
            <Button
              variant="danger"
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              Kaldır
            </Button>
          ) : null}
          <Button variant="soft" onClick={onClose}>
            İptal
          </Button>
          <Button variant="primary" disabled={!nihai} onClick={apply}>
            Uygula
          </Button>
        </div>
      </div>
    </div>
  );
}
