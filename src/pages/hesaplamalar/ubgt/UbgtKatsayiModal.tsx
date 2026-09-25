/**
 * V3 UbgtKatsayiModal — Bilinen Ücret / Asgari Ücret → katsayı = (bilinen/asgari).toFixed(4)
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import styles from "./UbgtCalcPage.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (katsayi: number) => void;
};

function parseTRFloat(val: string): number {
  if (!val) return 0;
  return Number(val.replace(/\./g, "").replace(",", "."));
}

export default function UbgtKatsayiModal({ open, onClose, onApply }: Props) {
  const [bilinenUcret, setBilinenUcret] = useState("");
  const [asgariUcret, setAsgariUcret] = useState("");

  const result = useMemo(() => {
    const known = parseTRFloat(bilinenUcret);
    const minimum = parseTRFloat(asgariUcret);
    if (!minimum || Number.isNaN(minimum) || Number.isNaN(known)) return 0;
    return Number((known / minimum).toFixed(4));
  }, [bilinenUcret, asgariUcret]);

  useEffect(() => {
    if (!open) {
      setBilinenUcret("");
      setAsgariUcret("");
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>Kat Sayı Hesapla</h3>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Bilinen Ücret</span>
          <input
            className={styles.input}
            type="text"
            value={bilinenUcret}
            onChange={(e) => setBilinenUcret(e.target.value)}
            autoFocus
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Asgari Ücret</span>
          <input
            className={styles.input}
            type="text"
            value={asgariUcret}
            onChange={(e) => setAsgariUcret(e.target.value)}
          />
        </label>
        <p className={styles.helper} style={{ marginTop: "0.35rem" }}>
          Katsayı: <strong>{result.toFixed(4)}</strong>
        </p>
        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" onClick={onClose}>
            İptal
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              onApply(result);
              onClose();
            }}
          >
            Uygula
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
