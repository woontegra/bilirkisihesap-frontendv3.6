/**
 * Haftalık Karma — Fazla Mesai Hesaplama Cetveli (V3 sütunları).
 * + manuel satır; − manuel sil / otomatik gizle; toplam satırı tabloda.
 */

import { formatMoney } from "./engine";
import type { PeriodRow, RowOverride } from "./model";
import { isCetvelRowVisible } from "../cetvelDisplay";
import { CetvelBrutInput } from "../shared/CetvelBrutInput";
import styles from "./DonemselFmPage.module.css";

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
  const visibleRows = rows.filter(isCetvelRowVisible);

  return (
    <article className={styles.panel} style={{ animationDelay: "160ms" }}>
      <header className={styles.panelHead}>
        <h3>Fazla Mesai Hesaplama Cetveli</h3>
      </header>
      <div className={styles.tableWrap}>
        <table className={styles.resultTable}>
          <thead>
            <tr>
              <th>Tarih Aralığı</th>
              <th>Hafta</th>
              <th>Ücret</th>
              <th title="Katsayı varsayılan 1">Kat Sayı</th>
              <th title="Haftalık fazla mesai saati">FM Saati</th>
              <th>225</th>
              <th>1,5</th>
              <th>Fazla Mesai</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td>—</td>
                <td>0</td>
                <td>{formatMoney(0)}</td>
                <td>1</td>
                <td>0,00</td>
                <td>225</td>
                <td>1,5</td>
                <td className={styles.moneyCell}>{formatMoney(0)}</td>
                <td />
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
                          value={r.startISO}
                          onChange={(e) =>
                            onOverrideChange(r.id, { ...ov, startISO: e.target.value || undefined })
                          }
                          title="Başlangıç tarihi"
                          aria-label="Başlangıç tarihi"
                        />
                        <span className={styles.dateSep}>–</span>
                        <input
                          type="date"
                          className={styles.cellInput}
                          value={r.endISO}
                          onChange={(e) =>
                            onOverrideChange(r.id, { ...ov, endISO: e.target.value || undefined })
                          }
                          title="Bitiş tarihi"
                          aria-label="Bitiş tarihi"
                        />
                      </div>
                      {r.yillikIzinAciklama || r.note ? (
                        <div className={styles.rowNote}>{r.yillikIzinAciklama || r.note}</div>
                      ) : null}
                    </td>
                    <td>
                      <input
                        type="number"
                        className={styles.cellInput}
                        min={0}
                        value={r.weeks}
                        onChange={(e) =>
                          onOverrideChange(r.id, { ...ov, weeks: Number(e.target.value) || 0 })
                        }
                        aria-label="Hafta"
                      />
                    </td>
                    <td>
                      <CetvelBrutInput
                        className={styles.cellInput}
                        value={r.brut}
                        onCommitBrut={(brut) => onOverrideChange(r.id, { ...ov, brut })}
                      />
                    </td>
                    <td>{r.katsayi}</td>
                    <td>
                      <input
                        type="number"
                        className={styles.cellInput}
                        min={0}
                        step={0.1}
                        value={r.fmHours}
                        onChange={(e) =>
                          onOverrideChange(r.id, { ...ov, fmHours: Number(e.target.value) || 0 })
                        }
                        aria-label="FM saati"
                      />
                    </td>
                    <td>225</td>
                    <td>1,5</td>
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
                          aria-label={
                            visibleRows.length <= 1 ? "En az 1 satır kalmalı" : "Satırı sil"
                          }
                          title={
                            visibleRows.length <= 1 ? "En az 1 satır kalmalı" : "Satırı sil"
                          }
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
                <td colSpan={7}>Toplam Fazla Mesai:</td>
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
