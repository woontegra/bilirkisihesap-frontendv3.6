/**
 * Çoklu çalışma dönemi editörü — belirli / kısmi / mevsim / gemi.
 */

import { Plus, Trash2 } from "lucide-react";
import { DraftDateInput, DraftTextInput } from "@/components/form";
import { calculateDaysBetween } from "./gemiCore";
import type { GemiWorkPeriod } from "./types";
import { periodDaysDisplay, type SimpleWorkPeriod } from "./workPeriods";
import styles from "./YillikPageView.module.css";

type Period = SimpleWorkPeriod | GemiWorkPeriod;

export type WorkPeriodsEditorProps = {
  title?: string;
  periods: Period[];
  onChange: (next: Period[]) => void;
  clampYear: (v: string) => string;
  /** gemi: gunSayisi sayısal override alanı */
  showDayOverride?: boolean;
  onDateBlur?: () => void;
};

export function WorkPeriodsEditor({
  title = "Çalışma dönemleri",
  periods,
  onChange,
  clampYear,
  showDayOverride = false,
  onDateBlur,
}: WorkPeriodsEditorProps) {
  const update = (id: string, patch: Partial<GemiWorkPeriod>, clearGun = false) => {
    onChange(
      periods.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch } as GemiWorkPeriod;
        if (clearGun) delete next.gunSayisi;
        return next;
      }),
    );
  };

  const remove = (id: string) => {
    if (periods.length <= 1) return;
    onChange(periods.filter((p) => p.id !== id));
  };

  const add = () => {
    onChange([
      ...periods,
      {
        id: `period-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        iseGiris: "",
        istenCikis: "",
      },
    ]);
  };

  return (
    <div className={styles.periodList}>
      <div className={styles.label} style={{ marginBottom: "0.35rem" }}>
        {title}
      </div>
      {periods.map((period, index) => {
        const calc =
          period.iseGiris && period.istenCikis
            ? calculateDaysBetween(period.iseGiris, period.istenCikis)
            : 0;
        const daysShown = showDayOverride
          ? periodDaysDisplay(period as GemiWorkPeriod, calc)
          : calc;
        return (
          <div key={period.id} className={styles.periodBlock} data-tour-period-row>
            <div className={styles.periodHead}>
              <span className={styles.periodTitle}>Dönem {index + 1}</span>
              {periods.length > 1 ? (
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => remove(period.id)}
                  aria-label="Dönemi sil"
                  title="Dönemi sil"
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
            <div className={showDayOverride ? styles.fields3Row : styles.fields2}>
              <div className={styles.field}>
                <label className={styles.label}>İşe giriş</label>
                <DraftDateInput
                  max="9999-12-31"
                  className={styles.input}
                  value={period.iseGiris}
                  onCommit={(v) => update(period.id, { iseGiris: clampYear(v) }, showDayOverride)}
                  onBlur={onDateBlur}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>İşten çıkış</label>
                <DraftDateInput
                  max="9999-12-31"
                  className={styles.input}
                  value={period.istenCikis}
                  onCommit={(v) => update(period.id, { istenCikis: clampYear(v) }, showDayOverride)}
                  onBlur={onDateBlur}
                />
              </div>
              {showDayOverride ? (
                <div className={`${styles.field} ${styles.dayCountField}`}>
                  <label className={styles.label}>Gün sayısı</label>
                  <DraftTextInput
                    inputMode="numeric"
                    className={`${styles.input} ${styles.dayCountInput}`}
                    value={String(daysShown)}
                    onCommit={(v) => {
                      const value = v === "" ? 0 : Number(v) || 0;
                      update(period.id, { gunSayisi: value });
                    }}
                    aria-label="Gün sayısı"
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <button type="button" className={styles.addRowBtn} onClick={add}>
        <Plus size={14} /> Yeni dönem ekle
      </button>
    </div>
  );
}
