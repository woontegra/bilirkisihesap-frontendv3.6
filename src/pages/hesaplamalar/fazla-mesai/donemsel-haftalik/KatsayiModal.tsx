/**
 * TanÄ±klÄ± Standart Fazla Mesai â€” Kat SayÄ± Hesapla modalÄ± (V3 paritesi).
 * Bilinen Ã¼cret / asgari Ã¼cret oranÄ±ndan katsayÄ± Ã¼retir (4 hane).
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { parseMoneyInput, sanitizeMoneyTyping } from "./engine";
import styles from "./DonemselHaftalikFmPage.module.css";

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
        <h2 className={styles.modalTitle}>Kat SayÄ± Hesapla</h2>

        <div className={styles.basicGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Bilinen Ãœcret</span>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                inputMode="decimal"
                value={bilinenUcret}
                onChange={(e) => setBilinenUcret(sanitizeMoneyTyping(e.target.value))}
                placeholder="0"
              />
              <span className={styles.currency} aria-hidden>
                â‚º
              </span>
            </div>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Asgari Ãœcret</span>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                inputMode="decimal"
                value={asgariUcret}
                onChange={(e) => setAsgariUcret(sanitizeMoneyTyping(e.target.value))}
                placeholder="0"
              />
              <span className={styles.currency} aria-hidden>
                â‚º
              </span>
            </div>
          </label>
        </div>

        <div className={styles.zamanasimiSummary}>
          <div className={`${styles.line} ${styles.netLine}`}>
            <span>
              KatsayÄ±: <strong>{katsayi ? katsayi.toFixed(4) : "0.0000"}</strong>
            </span>
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
              SÄ±fÄ±rla (1)
            </Button>
          ) : null}
          <Button variant="soft" onClick={onClose}>
            Ä°ptal
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
