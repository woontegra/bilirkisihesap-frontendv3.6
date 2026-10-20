/**
 * 48 Saat Vardiya — Fazla Mesai Cetveli (V3 sütunları birebir).
 * Satır sonunda yalnız + ve −.
 */

import { formatMoney } from "./engine";
import type { PeriodRow, RowOverride } from "./model";
import { CetvelBrutInput } from "../shared/CetvelBrutInput";
import styles from "./Vardiya48FmPage.module.css";

export function CetvelTable({
  rows,
  rowOverrides,
  onOverrideChange,
  onAddRow,
  onRemoveRow,
  toplamFm,
}: {
  rows: PeriodRow[];
  rowOverrides: Record<string, RowOverride>;
  onOverrideChange: (id: string, patch: RowOverride | null) => void;
  onAddRow: (afterId: string) => void;
  onRemoveRow: (id: string) => void;
  toplamFm: number;
}) {
  const visibleRows = rows.filter((r) => {
    if (r.isManual) return true;
    const fmH = Number(r.fmHours) || 0;
    const w = Number(r.weeks) || 0;
    const fmAmt = Number(r.fm) || 0;
    return fmH !== 0 && w !== 0 && fmAmt !== 0;
  });

  return (
    <article className={styles.panel} style={{ animationDelay: "160ms" }}>
      <header className={styles.panelHead}>
        <h3>Fazla mesai cetveli</h3>
      </header>
      <div className={styles.tableWrap}>
        <table className={styles.resultTable}>
          <thead>
            <tr>
              <th>Dönem</th>
              <th>Hafta tipi</th>
              <th>Toplam hafta</th>
              <th>Brüt ücret</th>
              <th>Kat</th>
              <th>FM saat</th>
              <th>225</th>
              <th>1,5</th>
              <th>Ücret</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", color: "var(--muted)" }}>
                  Tarih aralığını girin.
                </td>
              </tr>
            ) : (
              visibleRows.map((r, idx) => {
                const ov = rowOverrides[r.id];
                return (
                  <tr
                    key={r.id}
                    className={`${r.isDeductionRow ? styles.deductionRow : ""} ${r.isManual ? styles.manualRow : ""}`.trim()}
                    style={{ animationDelay: `${Math.min(idx, 24) * 18}ms` }}
                  >
                    <td>
                      <div className={styles.dateCell}>
                        <input
                          type="date"
                          className={styles.cellInput}
                          value={r.startISO?.slice(0, 10) || ""}
                          onChange={(e) =>
                            onOverrideChange(r.id, { ...ov, startISO: e.target.value || undefined })
                          }
                          aria-label="Başlangıç tarihi"
                        />
                        <span className={styles.dateSep}>–</span>
                        <input
                          type="date"
                          className={styles.cellInput}
                          value={r.endISO?.slice(0, 10) || ""}
                          onChange={(e) =>
                            onOverrideChange(r.id, { ...ov, endISO: e.target.value || undefined })
                          }
                          aria-label="Bitiş tarihi"
                        />
                      </div>
                      {r.yillikIzinAciklama || r.note ? (
                        <div className={styles.rowNote}>{r.yillikIzinAciklama || r.note}</div>
                      ) : null}
                    </td>
                    <td>{r.weekTypeLabel || "–"}</td>
                    <td>
                      <input
                        type="number"
                        className={styles.cellInput}
                        min={0}
                        step={1}
                        value={r.weeks}
                        onChange={(e) =>
                          onOverrideChange(r.id, { ...ov, weeks: Number(e.target.value) || 0 })
                        }
                        aria-label="Toplam hafta"
                      />
                    </td>
                    <td>
                      <CetvelBrutInput
                        className={styles.cellInput}
                        value={r.brut}
                        ariaLabel="Brüt ücret"
                        onCommitBrut={(brut) => onOverrideChange(r.id, { ...ov, brut })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className={styles.cellInput}
                        min={0}
                        step={0.0001}
                        value={r.katsayi}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value.replace(",", "."));
                          onOverrideChange(r.id, {
                            ...ov,
                            katsayi: Number.isNaN(v) || v <= 0 ? 1 : v,
                          });
                        }}
                        aria-label="Kat"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className={styles.cellInput}
                        min={0}
                        step={0.01}
                        value={r.fmHours}
                        onChange={(e) =>
                          onOverrideChange(r.id, { ...ov, fmHours: Number(e.target.value) || 0 })
                        }
                        aria-label="FM saat"
                      />
                    </td>
                    <td>{(r.calc225 ?? 225).toLocaleString("tr-TR")}</td>
                    <td>{(r.factor ?? 1.5).toLocaleString("tr-TR")}</td>
                    <td className={styles.moneyCell}>{formatMoney(r.fm)} ₺</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.rowAddBtn}
                          onClick={() => onAddRow(r.id)}
                          aria-label="Altına satır ekle"
                          title="Altına satır ekle"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className={styles.rowRemoveBtn}
                          onClick={() => onRemoveRow(r.id)}
                          disabled={visibleRows.length <= 1}
                          aria-label="Satırı sil"
                          title="Satırı sil"
                        >
                          −
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {visibleRows.length > 0 ? (
            <tfoot>
              <tr className={styles.totalsRow}>
                <td colSpan={8}>Toplam</td>
                <td className={styles.moneyCell}>{formatMoney(toplamFm)} ₺</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </article>
  );
}
