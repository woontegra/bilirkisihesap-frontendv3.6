/**
 * UBGT Hesaplama Tablosu — çerçeveli cetvel + V3 +/- satır işlemleri.
 * Kullanıcıya görünen metinler V3 ile birebir.
 */
import type { CetvelDisplayRow } from "./ubgtCetvelRows";
import { DraftDateInput, DraftTextInput } from "@/components/form";
import { formatMoney } from "./engine";
import styles from "./UbgtCalcPage.module.css";

type Props = {
  rows: CetvelDisplayRow[];
  mode: "standart" | "bilirkisi";
  totalBrut: number;
  onAddBelow: (rowId: string) => void;
  onRemove: (rowId: string) => void;
  onAutoOverride: (
    engineIndex: number,
    patch: { wage?: string; coefficient?: string; ubgtDays?: string },
  ) => void;
  onManualPatch: (
    id: string,
    patch: Partial<{
      startISO: string;
      endISO: string;
      wage: string;
      coefficient: string;
      ubgtDays: string;
    }>,
  ) => void;
  helperText?: string;
};

export default function UbgtPeriodCetvelTable({
  rows,
  mode,
  totalBrut,
  onAddBelow,
  onRemove,
  onAutoOverride,
  onManualPatch,
  helperText,
}: Props) {
  const canDelete = rows.length > 1;
  const title = mode === "bilirkisi" ? "UBGT hesaplama tablosu" : "UBGT Hesaplama Tablosu";
  const emptyText =
    mode === "bilirkisi"
      ? "Davacı ve tanık tarihlerini girin; cetvel otomatik oluşur."
      : "Hesaplama yapmak için lütfen tarih aralıkları girin ve tatilleri seçin.";
  const footerLabel = mode === "bilirkisi" ? "Toplam UBGT ücreti" : "Toplam UBGT Ücreti:";
  const periodCol = mode === "bilirkisi" ? "Dönem" : "Tarih (Ücret Dönemi)";
  const dailyCol = mode === "bilirkisi" ? "Günlük brüt" : "Günlük Brüt Ücret";
  const daysCol = mode === "bilirkisi" ? "UBGT gün" : "UBGT Günleri";
  const payCol = mode === "bilirkisi" ? "UBGT ücreti" : "UBGT Ücreti";

  return (
    <article className={styles.panel} data-testid="ubgt-period-cetvel">
      <header className={styles.panelHead}>
        <h3>{title}</h3>
      </header>
      {helperText ? <p className={styles.panelHint} style={{ margin: "0.55rem 0.85rem 0" }}>{helperText}</p> : null}
      {rows.length === 0 ? (
        <div className={styles.panelBody}>
          <p className={styles.helper} style={{ margin: 0 }}>
            {emptyText}
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.resultTable} ${styles.framedTable} ${styles.periodCetvelTable}`}>
            <thead>
              <tr>
                <th className={styles.periodCetvelPeriodCol}>{periodCol}</th>
                <th className={styles.moneyRight}>Ücret (BRÜT)</th>
                <th className={styles.moneyRight}>Katsayı</th>
                <th className={styles.moneyRight}>{dailyCol}</th>
                <th className={styles.moneyRight}>{daysCol}</th>
                <th className={styles.moneyRight}>{payCol}</th>
                <th className={styles.periodCetvelActionsHead} aria-label="" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                return (
                  <tr
                    key={r.id}
                    className={r.source === "manual" ? styles.manualRow : undefined}
                    style={{ animationDelay: `${Math.min(idx, 24) * 18}ms` }}
                  >
                    <td className={styles.periodCetvelPeriodCol}>
                      {r.source === "manual" ? (
                        <div className={styles.dateCell}>
                          <DraftDateInput
                            className={styles.cellInput}
                            value={r.startISO}
                            onCommit={(v) => onManualPatch(r.id, { startISO: v })}
                            aria-label="Başlangıç"
                          />
                          <span className={styles.dateSep}>–</span>
                          <DraftDateInput
                            className={styles.cellInput}
                            value={r.endISO}
                            onCommit={(v) => onManualPatch(r.id, { endISO: v })}
                            aria-label="Bitiş"
                          />
                        </div>
                      ) : (
                        <span>{r.period}</span>
                      )}
                    </td>
                    <td className={styles.moneyRight}>
                      <DraftTextInput
                        className={`${styles.cellInput} ${styles.moneyRight}`}
                        value={r.wageDisplay}
                        onCommit={(v) => {
                          if (r.source === "manual") onManualPatch(r.id, { wage: v });
                          else if (r.engineIndex != null) onAutoOverride(r.engineIndex, { wage: v });
                        }}
                        aria-label="Ücret (BRÜT)"
                      />
                    </td>
                    <td className={styles.moneyRight}>
                      <DraftTextInput
                        className={`${styles.cellInput} ${styles.cellInputNarrow} ${styles.moneyRight}`}
                        value={r.coefficientDisplay}
                        onCommit={(v) => {
                          if (r.source === "manual") onManualPatch(r.id, { coefficient: v });
                          else if (r.engineIndex != null) onAutoOverride(r.engineIndex, { coefficient: v });
                        }}
                        aria-label="Katsayı"
                      />
                    </td>
                    <td className={`${styles.moneyCell} ${styles.moneyRight}`}>
                      {formatMoney(r.dailyWage)}
                    </td>
                    <td className={styles.moneyRight}>
                      <input
                        className={`${styles.cellInput} ${styles.cellInputNarrow} ${styles.moneyRight}`}
                        value={r.ubgtDaysDisplay}
                        onChange={(e) => {
                          if (r.source === "manual")
                            onManualPatch(r.id, { ubgtDays: e.target.value });
                          else if (r.engineIndex != null)
                            onAutoOverride(r.engineIndex, { ubgtDays: e.target.value });
                        }}
                        aria-label={daysCol}
                      />
                    </td>
                    <td className={`${styles.moneyCell} ${styles.moneyRight}`}>
                      {formatMoney(r.ubgtTotal)} ₺
                    </td>
                    <td className={styles.periodCetvelActionsCell}>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.rowAddBtn}
                          onClick={() => onAddBelow(r.id)}
                          aria-label="Altına yeni boş satır ekle"
                          title="Altına yeni boş satır ekle"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className={styles.rowRemoveBtn}
                          onClick={() => onRemove(r.id)}
                          disabled={!canDelete}
                          aria-label="Bu satırı sil"
                          title={canDelete ? "Bu satırı sil" : "En az 1 satır kalmalı"}
                        >
                          −
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={styles.totalsRow}>
                <td colSpan={5} className={styles.footerLabelCell}>
                  {footerLabel}
                </td>
                <td className={`${styles.moneyCell} ${styles.moneyRight}`}>
                  {formatMoney(totalBrut)}₺
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </article>
  );
}
