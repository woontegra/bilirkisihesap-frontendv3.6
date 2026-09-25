/**
 * TanÄ±klÄ± Standart Fazla Mesai â€” MahsuplaÅŸma Ekle modalÄ± (V3 paritesi).
 * Cetveldeki yÄ±llar iÃ§in ay bazÄ±nda tutar girilir; toplam, mahsup tutarÄ±na yazÄ±lÄ±r.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatMoney, parseMoneyInput, sanitizeMoneyTyping } from "./engine";
import styles from "./DonemselHaftalikFmPage.module.css";

const MONTH_NAMES = [
  "Ocak",
  "Åubat",
  "Mart",
  "Nisan",
  "MayÄ±s",
  "Haziran",
  "Temmuz",
  "AÄŸustos",
  "EylÃ¼l",
  "Ekim",
  "KasÄ±m",
  "AralÄ±k",
] as const;

export function MahsuplasamaModal({
  open,
  years,
  onSave,
  onClose,
}: {
  open: boolean;
  /** Cetvel dÃ¶nemlerinden Ã§Ä±karÄ±lan yÄ±llar (artan sÄ±rada). */
  years: number[];
  onSave: (total: number) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) setValues({});
  }, [open]);

  const total = useMemo(
    () => Object.values(values).reduce((sum, raw) => sum + parseMoneyInput(raw), 0),
    [values],
  );

  if (!open) return null;

  const setCell = (year: number, month: number, raw: string) => {
    setValues((prev) => ({ ...prev, [`${year}-${month}`]: sanitizeMoneyTyping(raw) }));
  };

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.modalCardWide}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.modalTitle}>MahsuplaÅŸma Ekle</h2>
        <p className={styles.modalDesc}>Ay ve yÄ±l bazÄ±nda mahsuplaÅŸma miktarlarÄ±nÄ± girin.</p>

        {years.length === 0 ? (
          <p className={styles.emptyText}>Hesaplama tablosunda veri bulunamadÄ±. Ã–nce hesaplama yapÄ±n.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.resultTable}>
              <thead>
                <tr>
                  <th>Ay</th>
                  {years.map((y) => (
                    <th key={y} style={{ textAlign: "center" }}>
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MONTH_NAMES.map((name, idx) => (
                  <tr key={name}>
                    <td>{name}</td>
                    {years.map((year) => (
                      <td key={year}>
                        <input
                          className={styles.cellInput}
                          inputMode="decimal"
                          value={values[`${year}-${idx + 1}`] ?? ""}
                          onChange={(e) => setCell(year, idx + 1, e.target.value)}
                          placeholder="0"
                          aria-label={`${name} ${year} mahsup tutarÄ±`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.zamanasimiSummary}>
          <div className={`${styles.line} ${styles.netLine}`}>
            <span>Toplam: {formatMoney(total)} â‚º</span>
          </div>
        </div>

        <div className={styles.modalActions}>
          <Button variant="soft" onClick={onClose}>
            Ä°ptal
          </Button>
          <Button
            variant="primary"
            disabled={years.length === 0}
            onClick={() => {
              onSave(total);
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
