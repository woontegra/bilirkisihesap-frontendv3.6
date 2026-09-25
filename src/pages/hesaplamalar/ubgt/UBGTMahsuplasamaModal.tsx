/**
 * V3 UBGTMahsuplasamaModal — yıl × resmi tatil matrisi → toplam settleAmount.
 * V3.5 tasarım (KotuNiyet modal stilleri).
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  sumMahsuplasamaMatrix,
  yearsFromMahsupTableData,
  type UbgtMahsuplasamaMatrix,
  type UbgtMahsuplasamaTableRow,
} from "./mahsuplasama";
import styles from "../kotu-niyet-tazminati/KotuNiyetTazminatiPage.module.css";

export type { UbgtMahsuplasamaMatrix, UbgtMahsuplasamaTableRow };
export { sumMahsuplasamaMatrix, yearsFromMahsupTableData };

const OFFICIAL_HOLIDAYS = [
  "1 Ocak",
  "23 Nisan",
  "1 Mayıs",
  "19 Mayıs",
  "15 Temmuz",
  "30 Ağustos",
  "29 Ekim",
  "Ramazan Bayramı",
  "Kurban Bayramı",
];

type Props = {
  open: boolean;
  onClose: () => void;
  tableData: UbgtMahsuplasamaTableRow[];
  onSave: (total: number, data: UbgtMahsuplasamaMatrix) => void;
  initialData?: UbgtMahsuplasamaMatrix;
};

export default function UBGTMahsuplasamaModal({ open, onClose, tableData, onSave, initialData }: Props) {
  const years = useMemo(() => yearsFromMahsupTableData(tableData), [tableData]);
  const [values, setValues] = useState<UbgtMahsuplasamaMatrix>({});

  useEffect(() => {
    if (open && initialData && Object.keys(initialData).length > 0) {
      setValues(initialData);
    }
  }, [open, initialData]);

  const handleValueChange = (year: number, holidayName: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setValues((prev) => ({
      ...prev,
      [year]: {
        ...(prev[year] || {}),
        [holidayName]: numValue,
      },
    }));
  };

  const getValue = (year: number, holidayName: string): string => {
    return values[year]?.[holidayName] ? String(values[year][holidayName]) : "";
  };

  const total = useMemo(() => sumMahsuplasamaMatrix(values), [values]);

  if (!open) return null;

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard} style={{ maxWidth: "48rem", width: "min(96vw, 48rem)" }}>
        <h3 className={styles.modalTitle}>UBGT Mahsuplaşma Ekle</h3>
        <p className={styles.helper}>
          Resmi tatil ve yıl bazında mahsuplaşma miktarlarını girin. Tüm değerler toplanarak ana ekrana
          yazılacaktır.
        </p>

        {years.length === 0 ? (
          <p className={styles.helper}>Hesaplama tablosunda veri bulunamadı. Lütfen önce hesaplama yapın.</p>
        ) : (
          <>
            <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
              <table style={{ width: "100%", fontSize: "0.75rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={{ padding: "0.35rem", borderBottom: "1px solid #e5e7eb" }}>
                      Resmi Tatil
                    </th>
                    {years.map((year) => (
                      <th
                        key={year}
                        align="center"
                        style={{ padding: "0.35rem", borderBottom: "1px solid #e5e7eb" }}
                      >
                        {year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {OFFICIAL_HOLIDAYS.map((holidayName) => (
                    <tr key={holidayName}>
                      <td style={{ padding: "0.25rem 0.35rem", whiteSpace: "nowrap" }}>{holidayName}</td>
                      {years.map((year) => (
                        <td key={`${year}-${holidayName}`} style={{ padding: "0.15rem" }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className={styles.input}
                            style={{ width: "4.5rem", textAlign: "center", padding: "0.2rem" }}
                            value={getValue(year, holidayName)}
                            onChange={(e) => handleValueChange(year, holidayName, e.target.value)}
                            placeholder="0"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              className={styles.resultCard}
              style={{ marginTop: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span className={styles.resultLabel}>Toplam</span>
              <span className={styles.resultValue}>
                {total.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
              </span>
            </div>
          </>
        )}

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
              onSave(total, values);
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
