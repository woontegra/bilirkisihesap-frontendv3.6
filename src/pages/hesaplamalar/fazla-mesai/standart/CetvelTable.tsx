/**
 * Standart Fazla Mesai — "Fazla Mesai Hesaplama Cetveli" (tam genişlik).
 * V3 paritesi: satır sonunda + (altıya manuel satır ekle) ve − (manuel satırı sil /
 * otomatik satırı gizle). Hafta / ücret / FM saati / tarih elle düzeltilebilir.
 */

import { formatMoney } from "./engine";
import type { PeriodRow, RowOverride } from "./model";
import { isCetvelRowVisible } from "../cetvelDisplay";
import { CetvelBrutInput } from "../shared/CetvelBrutInput";
import {
  eraForIso,
  formatHistoricalTrl,
  formatTrlWageHint,
  parseTurkishAmount,
  scaleTableBrut,
  STANDART_FM_MIN_ISO,
} from "./trlScale";
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
                const trl = r.currencyEra === "TRL" && r.historicalBrut != null && !r.scaleMismatch;
                const commitDate = (field: "startISO" | "endISO", value: string) => {
                  const next: RowOverride = { ...ov, [field]: value || undefined };
                  const startISO = field === "startISO" ? value : r.startISO;
                  const era = startISO ? eraForIso(startISO) : null;
                  if (ov?.brutManual && ov.currencyEra && era && ov.currencyEra !== era) {
                    next.scaleMismatch = true;
                    delete next.brut;
                  } else if (
                    ov?.brutManual &&
                    ov.currencyEra &&
                    era &&
                    ov.currencyEra === era &&
                    ov.historicalBrut != null
                  ) {
                    next.scaleMismatch = false;
                    next.brut = scaleTableBrut(startISO, ov.historicalBrut).normalizedGross;
                  }
                  onOverrideChange(r.id, next);
                };
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
                          min={STANDART_FM_MIN_ISO}
                          value={r.startISO}
                          onChange={(e) => commitDate("startISO", e.target.value)}
                          aria-label="Başlangıç tarihi"
                        />
                        <span className={styles.dateSep}>–</span>
                        <input
                          type="date"
                          className={styles.cellInput}
                          min={STANDART_FM_MIN_ISO}
                          value={r.endISO}
                          onChange={(e) => commitDate("endISO", e.target.value)}
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
                        className={trl ? `${styles.cellInput} ${styles.cellInputEra}` : styles.cellInput}
                        value={trl ? (r.historicalBrut as number) : r.brut}
                        ariaLabel={trl ? "Brüt Ücret (Eski TL)" : "Ücret"}
                        formatValue={trl ? formatHistoricalTrl : undefined}
                        parseValue={trl ? parseTurkishAmount : undefined}
                        onCommitBrut={(typed) => {
                          const scaled = scaleTableBrut(r.startISO, typed);
                          onOverrideChange(r.id, {
                            ...ov,
                            brut: scaled.normalizedGross,
                            historicalBrut: scaled.historicalGross,
                            currencyEra: scaled.currencyEra,
                            conversionDivisor: scaled.conversionDivisor,
                            brutManual: true,
                            scaleMismatch: false,
                          });
                        }}
                      />
                      {trl ? (
                        <div className={styles.rowNote}>
                          {formatHistoricalTrl(r.historicalBrut as number)} Eski TL
                          <br />
                          {formatTrlWageHint(r.brut)}
                        </div>
                      ) : null}
                      {r.scaleMismatch ? (
                        <div className={styles.rowNote}>
                          Ücret ölçeği belirsiz. Otomatik dönüşüm yapılmadı. Tutarı yeniden girin.
                        </div>
                      ) : null}
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
