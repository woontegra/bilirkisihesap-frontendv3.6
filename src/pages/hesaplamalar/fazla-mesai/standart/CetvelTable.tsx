/**
 * Standart Fazla Mesai — "Fazla Mesai Hesaplama Cetveli" (tam genişlik).
 * V3 paritesi: satır sonunda + (altıya manuel satır ekle) ve − (manuel satırı sil /
 * otomatik satırı gizle). Hafta / ücret / FM saati / tarih elle düzeltilebilir.
 */

import { formatMoney } from "./engine";
import type { PeriodRow, RowOverride } from "./model";
import { isCetvelRowVisible } from "../cetvelDisplay";
import { CetvelBrutInput } from "../shared/CetvelBrutInput";
import styles from "./StandartFmPage.module.css";

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
              <th>Kat Sayı</th>
              <th>FM Saati</th>
              <th>225</th>
              <th>1,5</th>
              <th>Fazla Mesai</th>
              <th aria-label="" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.emptyCell}>
                  —
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
                          value={r.startISO}
                          onChange={(e) =>
                            onOverrideChange(r.id, { ...ov, startISO: e.target.value || undefined })
                          }
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
                          aria-label="Bitiş tarihi"
                        />
                      </div>
                      {r.note ? <div className={styles.rowNote}>{r.note}</div> : null}
                      {r.isManual ? <div className={styles.rowNote}></div> : null}
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
                          aria-label="Bu satırın altına yeni satır ekle"
                          title="Bu satırın altına yeni satır ekle"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className={styles.rowRemoveBtn}
                          onClick={() => onRemoveRow(r.id)}
                          disabled={visibleRows.length <= 1}
                          aria-label={r.isManual ? "Bu satırı sil" : "Bu satırı sil"}
                          title={
                            visibleRows.length <= 1
                              ? "En az 1 satır kalmalı"
                              : r.isManual
                                ? "Bu satırı sil"
                                : "Bu satırı sil"
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
      <p className={styles.tableFootnote}></p>
    </article>
  );
}
