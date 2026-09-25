/**
 * Tanıklı Standart Fazla Mesai — Kat Sayı Hesapla modalı (V3 paritesi).
 * Bilinen ücret / asgari ücret oranından katsayı üretir (4 hane).
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { parseMoneyInput, sanitizeMoneyTyping } from "./engine";
import styles from "./TanikliStandartFmPage.module.css";

export function KatsayiModal({
  open,
  currentKatsayi,
  onApply,
  onReset,
  onClose,
}: {
  open: boolean;
  currentKatsayi: number;
  onApply: (katsayi: number) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [bilinenUcret, setBilinenUcret] = useState("");
  const [asgariUcret, setAsgariUcret] = useState("");

  useEffect(() => {
    if (!open) {
      setBilinenUcret("");
      setAsgariUcret("");
    }
  }, [open]);

  const katsayi = useMemo(() => {
    const known = parseMoneyInput(bilinenUcret);
    const min = parseMoneyInput(asgariUcret);
    if (!known || !min) return 0;
    return Number((known / min).toFixed(4));
  }, [bilinenUcret, asgariUcret]);

  if (!open) return null;

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Kat Sayı Hesapla</h2>

        <div className={styles.basicGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Bilinen Ücret</span>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                inputMode="decimal"
                value={bilinenUcret}
                onChange={(e) => setBilinenUcret(sanitizeMoneyTyping(e.target.value))}
                placeholder="0,00"
              />
              <span className={styles.currency} aria-hidden>
                ₺
              </span>
            </div>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Asgari Ücret</span>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                inputMode="decimal"
                value={asgariUcret}
                onChange={(e) => setAsgariUcret(sanitizeMoneyTyping(e.target.value))}
                placeholder="0,00"
              />
              <span className={styles.currency} aria-hidden>
                ₺
              </span>
            </div>
          </label>
        </div>

        <div className={styles.zamanasimiSummary}>
          <div className={`${styles.line} ${styles.netLine}`}>
            <span>Katsayı</span>
            <span>{katsayi ? katsayi.toFixed(4).replace(".", ",") : "—"}</span>
          </div>
        </div>

        <div className={styles.modalActions}>
          {currentKatsayi !== 1 && currentKatsayi > 0 ? (
            <Button
              variant="danger"
              onClick={() => {
                onReset();
                onClose();
              }}
            >
              Sıfırla (1)
            </Button>
          ) : null}
          <Button variant="soft" onClick={onClose}>
            İptal
          </Button>
          <Button
            variant="primary"
            disabled={!katsayi}
            onClick={() => {
              onApply(katsayi);
              onClose();
            }}
          >
            Uygula
          </Button>
        </div>
      </div>
    </div>
  );
}
