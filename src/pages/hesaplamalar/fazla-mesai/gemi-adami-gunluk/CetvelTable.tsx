import { eraForIso, formatHistoricalTrl, formatTrlWageHint, formatTryWageInput, parseTurkishAmount, scaleTableBrut } from "../../shared/historical/currencyEra";
import { getAsgariUcretRowByDate } from "../../shared/historical/asgariUcret";
/**
 * Gemi Adamı Günlük — Fazla Mesai Hesaplama Cetveli (V3 sütunları: 240 / 1,25).
 */

import { formatMoney } from "./engine";
import type { PeriodRow, RowOverride } from "./model";
import { CetvelBrutInput } from "../shared/CetvelBrutInput";
import styles from "./GemiGunlukFmPage.module.css";

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
        <h3>Fazla Mesai Hesaplama Cetveli</h3>
      </header>
      <div className={styles.tableWrap}>
        <table className={styles.resultTable}>
          <thead>
            <tr>
              <th>Tarih Aralığı</th>
              <th>Hafta</th>
              <th>Ücret</th>
              <th>Kat</th>
              <th>FM Saati</th>
              <th>240</th>
              <th>1,25</th>
              <th>Fazla Mesai</th>
              <th aria-label="Satır işlemleri" />
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
                        value={eraForIso(r.startISO) === "TRL" ? (ov.historicalBrut ?? getAsgariUcretRowByDate(r.startISO)?.brut ?? r.brut) : r.brut}
                        onCommitBrut={(typed) => {
                          const scaled = scaleTableBrut(r.startISO, typed);
                          onOverrideChange(r.id, {
                            ...ov,
                            brut: scaled.normalizedGross,
                            historicalBrut: scaled.historicalGross,
                            currencyEra: scaled.currencyEra,
                            conversionDivisor: scaled.conversionDivisor,
                            brutManual: true,
                          });
                        }}
                        formatValue={eraForIso(r.startISO) === "TRL" ? formatHistoricalTrl : formatTryWageInput}
                        parseValue={parseTurkishAmount}
                        liveGroup={eraForIso(r.startISO) === "TRL" ? "TRL" : "TRY"}
                      />
                      {eraForIso(r.startISO) === "TRL" ? (
                        <div className={styles.rowNote}>
                          {formatHistoricalTrl(ov.historicalBrut ?? getAsgariUcretRowByDate(r.startISO)?.brut ?? r.brut)} Eski TL
                          <br />
                          {formatTrlWageHint(r.brut)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <input
                        type="number"
                        className={styles.cellInput}
                        min={0}
                        step={0.0001}
                        value={r.katsayi}
                        onChange={(e) =>
                          onOverrideChange(r.id, { ...ov, katsayi: Number(e.target.value) || 1 })
                        }
                        aria-label="Kat"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className={styles.cellInput}
                        min={0}
                        step={0.5}
                        value={r.fmHours}
                        onChange={(e) =>
                          onOverrideChange(r.id, { ...ov, fmHours: Number(e.target.value) || 0 })
                        }
                        aria-label="FM saati"
                      />
                    </td>
                    <td>240</td>
                    <td>1,25</td>
                    <td className={styles.moneyCell}>{formatMoney(r.fm)} ₺</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.rowAddBtn}
                          onClick={() => onAddRow(r.id)}
                          aria-label="Satır ekle"
                          title="Satır ekle"
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
