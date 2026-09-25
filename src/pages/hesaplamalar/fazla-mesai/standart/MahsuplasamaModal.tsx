/**
 * Standart Fazla Mesai — Mahsuplaşma Ekle modalı (V3 paritesi).
 * Cetveldeki yıllar için ay bazında tutar girilir; toplam, mahsup tutarına yazılır.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatMoney, parseMoneyInput, sanitizeMoneyTyping } from "./engine";
import styles from "./StandartFmPage.module.css";

const MONTH_NAMES = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

export function MahsuplasamaModal({
  open,
  years,
  onSave,
  onClose,
}: {
  open: boolean;
  /** Cetvel dönemlerinden çıkarılan yıllar (artan sırada). */
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
        <h2 className={styles.modalTitle}>Mahsuplaşma Ekle</h2>
        <p className={styles.modalDesc}>
          Ay ve yıl bazında mahsuplaşma miktarlarını girin.
        </p>

        {years.length === 0 ? (
          <p className={styles.emptyText}>Hesaplama tablosunda veri bulunamadı. Önce hesaplama yapın.</p>
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
            <span>Toplam:</span>
            <span>{formatMoney(total)} ₺</span>
          </div>
        </div>

        <div className={styles.modalActions}>
          <Button variant="soft" onClick={onClose}>
            İptal
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
