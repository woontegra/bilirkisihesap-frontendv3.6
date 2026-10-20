import { HAKKANIYET_ORANLARI, normalizeHakkaniyetOrani, type HakkaniyetOrani } from "./hakkaniyetOrani";
import styles from "./HakkaniyetOraniSecimi.module.css";

/** Sonuç satırındaki "<oran> Hakkaniyet İndirimi" etiketi; oran kompakt seçim kutusundan değiştirilir. */
export function HakkaniyetOraniSecimi({
  value,
  onChange,
  metin = "Hakkaniyet İndirimi",
}: {
  value: HakkaniyetOrani;
  onChange: (value: HakkaniyetOrani) => void;
  metin?: string;
}) {
  return (
    <span className={styles.label}>
      <select
        className={styles.select}
        aria-label="Hakkaniyet indirimi oranı"
        data-hakkaniyet-orani
        value={value}
        onChange={(e) => onChange(normalizeHakkaniyetOrani(e.target.value))}
      >
        {HAKKANIYET_ORANLARI.map((oran) => (
          <option key={oran} value={oran}>
            {oran}
          </option>
        ))}
      </select>
      <span>{metin}</span>
    </span>
  );
}
