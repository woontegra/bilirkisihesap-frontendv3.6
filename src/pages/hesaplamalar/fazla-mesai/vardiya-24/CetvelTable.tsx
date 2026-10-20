/**
 * 24 Saat Vardiya — Fazla mesai cetveli (V3 sütunları).
 * Satır sonunda yalnız + ve −.
 */

import { formatMoney } from "./engine";
import type { PeriodRow, RowOverride } from "./model";
import { CetvelBrutInput } from "../shared/CetvelBrutInput";
import styles from "./Vardiya24FmPage.module.css";

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
  const visibleRows = rows.filter(
    (r) => r.isManual || (r.weeks !== 0 && r.fmHours !== 0 && r.fm !== 0),
  );

  return (
    <article className={styles.panel} style={{ animationDelay: "160ms" }}>
      <header className={styles.panelHead}>
        <h3>Fazla mesai cetveli</h3>
      </header>
      <p className={styles.panelHint} style={{ color: "var(--danger, #c0392b)", marginBottom: "0.75rem" }}>
        Son haftaya isabet eden izin/UBGT düşümlerinde, tabloda görülen tarih aralığı 7 günden kısa olsa dahi
        hesaplama bu süre üzerinden yapılmaz. İlgili düşüm, üst satırdaki toplam haftadan 1 hafta eksiltilerek
        ayrı bir satırda 1 hafta olarak dikkate alınmıştır.
      </p>
      <p className={styles.panelHint}>
        Not: UBGT/izin düşümlerinde blok başlangıcı, işaretlenen ilk gün kabul edilerek 7 günlük blok mantığıyla
        değerlendirilir.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.resultTable}>
          <thead>
            <tr>
              <th>Dönem</th>
              <th>Hafta tipi</th>
              <th>Toplam hafta</th>
              <th>Haftalık FM saat</th>
              <th>Brüt Ücret</th>
              <th>225</th>
              <th>1,5</th>
              <th>Ücret</th>
              <th aria-label="Satır işlemleri" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.emptyCell}>
                  Tarih aralığını girin.
                </td>
              </tr>
            ) : (
              visibleRows.map((r, idx) => {
                const ov = rowOverrides[r.id];
                const note = r.yillikIzinAciklama || r.note;
                return (
                  <tr
                    key={r.id}
                    className={`${r.isDeductionRow || note ? styles.deductionRow : ""} ${r.isManual ? styles.manualRow : ""}`.trim()}
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
                      {note ? <div className={styles.rowNote}>{note}</div> : null}
                    </td>
                    <td>{r.weekTypeLabel || "-"}</td>
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
                      <input
                        type="number"
                        className={styles.cellInput}
                        min={0}
                        step={0.01}
                        value={r.fmHours}
                        onChange={(e) =>
                          onOverrideChange(r.id, { ...ov, fmHours: Number(e.target.value) || 0 })
                        }
                        aria-label="Haftalık FM saat"
                      />
                    </td>
                    <td>
                      <CetvelBrutInput
                        className={styles.cellInput}
                        value={r.brut}
                        ariaLabel="Brüt Ücret"
                        onCommitBrut={(brut) => onOverrideChange(r.id, { ...ov, brut })}
                      />
                    </td>
                    <td>225</td>
                    <td>1,5</td>
                    <td className={styles.moneyCell}>{formatMoney(r.fm)}</td>
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
                <td colSpan={7} style={{ textAlign: "right" }}>
                  Toplam
                </td>
                <td className={styles.moneyCell}>{formatMoney(toplamFm)}</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </article>
  );
}
