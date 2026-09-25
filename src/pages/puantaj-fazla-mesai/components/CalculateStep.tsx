import { Calculator } from "lucide-react";
import type { CalcSettings } from "../model";
import styles from "../PuantajFmPage.module.css";

type Props = {
  settings: CalcSettings;
  katsayi: number;
  personelCount: number;
  onSettingsChange: (next: Partial<CalcSettings>) => void;
  onKatsayiChange: (v: number) => void;
};

export default function CalculateStep(props: Props) {
  const { settings } = props;
  return (
    <section className={`${styles.card} ${styles.stepPanel}`}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}><Calculator size={18} /> Hesaplama Ayarları</h2>
        <span className={styles.statusText}>{props.personelCount} personel hesaplanacak</span>
      </div>
      <p className={styles.cardHint}>
        Hesaplama yalnızca kontrol edilip onaylanan kayıtlar üzerinden, bu modülün kendi lokal motoruyla yapılır.
        OFF (fazla mesai karşılığı izin) mahsubu seçilen tarih aralığındaki günler üzerinden uygulanır.
      </p>

      <div className={styles.settingsGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Hesaplama başlangıç tarihi</span>
          <input
            className={styles.input}
            type="date"
            value={settings.calcDateStart ?? ""}
            onChange={(e) => props.onSettingsChange({ calcDateStart: e.target.value || undefined })}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Hesaplama bitiş tarihi</span>
          <input
            className={styles.input}
            type="date"
            value={settings.calcDateEnd ?? ""}
            onChange={(e) => props.onSettingsChange({ calcDateEnd: e.target.value || undefined })}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Haftalık yasal sınır (saat)</span>
          <input
            className={styles.input}
            type="number"
            min={1}
            step={0.5}
            value={settings.weeklyLimit}
            onChange={(e) => props.onSettingsChange({ weeklyLimit: Number(e.target.value) || 45 })}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Ara dinlenme kuralı</span>
          <select
            className={styles.select}
            value={settings.breakRule.kind}
            onChange={(e) =>
              props.onSettingsChange({
                breakRule: e.target.value === "auto" ? { kind: "auto" } : { kind: "fixed", hours: 1 },
              })
            }
          >
            <option value="auto">Otomatik (yasal tablo)</option>
            <option value="fixed">Sabit saat</option>
          </select>
        </label>

        {settings.breakRule.kind === "fixed" && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Ara dinlenme (saat)</span>
            <input
              className={styles.input}
              type="number"
              min={0}
              step={0.25}
              value={settings.breakRule.hours}
              onChange={(e) => props.onSettingsChange({ breakRule: { kind: "fixed", hours: Number(e.target.value) || 0 } })}
            />
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Katsayı</span>
          <input
            className={styles.input}
            type="number"
            min={1}
            step={0.25}
            value={props.katsayi}
            onChange={(e) => props.onKatsayiChange(Number(e.target.value) || 1)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Mahsup tutarı (TL)</span>
          <input
            className={styles.input}
            type="number"
            min={0}
            step={0.01}
            value={settings.mahsup}
            onChange={(e) => props.onSettingsChange({ mahsup: Number(e.target.value) || 0 })}
          />
        </label>
      </div>

      <label className={styles.checkboxRow} style={{ marginTop: "0.9rem" }}>
        <input
          type="checkbox"
          checked={settings.applyEquityDiscount}
          onChange={(e) => props.onSettingsChange({ applyEquityDiscount: e.target.checked })}
        />
        Hakkaniyet (takdiri) indirimi uygula — toplam brüt fazla mesainin 1/{settings.equityDivisor}'i
      </label>
    </section>
  );
}
