/**
 * Hafta Tatili — Mahsuplaşma Ekle modalı (V3 paritesi).
 * Cetveldeki yıllar için ay bazında tutar girilir; toplam settle alanına yazılır.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatMoney, parseNum } from "./money";
import { sanitizeMoneyTyping } from "@/utils/moneyInput";

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
  styles,
}: {
  open: boolean;
  years: number[];
  onSave: (total: number) => void;
  onClose: () => void;
  styles: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) setValues({});
  }, [open]);

  const total = useMemo(
    () => Object.values(values).reduce((sum, raw) => sum + parseNum(raw), 0),
    [values],
  );

  if (!open) return null;

  const setCell = (year: number, month: number, raw: string) => {
    setValues((prev) => ({ ...prev, [`${year}-${month}`]: sanitizeMoneyTyping(raw) }));
  };

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.modalCardWide ?? ""}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={styles.modalTitle}>Mahsuplaşma Ekle</h3>
        <p className={styles.helper}>
          Ay ve yıl bazında mahsuplaşma miktarlarını girin. Tüm değerler toplanarak ana ekrana yazılacaktır.
        </p>

        {years.length === 0 ? (
          <p className={styles.helper}>Hesaplama tablosunda veri bulunamadı. Önce hesaplama yapın.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
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

        <div className={styles.netRowStrong} style={{ marginTop: "0.75rem" }}>
          <span>Toplam:</span>
          <span>{formatMoney(total)} ₺</span>
        </div>

        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            İptal
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={years.length === 0}
            onClick={() => {
              onSave(total);
              onClose();
            }}
          >
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}
