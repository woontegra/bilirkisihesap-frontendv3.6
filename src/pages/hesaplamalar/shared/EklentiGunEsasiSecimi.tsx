import { useId } from "react";
import type { EklentiGunEsasi } from "./eklentiGunEsasi";
import styles from "./EklentiGunEsasiSecimi.module.css";

const SECENEKLER: Array<{ value: EklentiGunEsasi; label: string }> = [
  { value: 360, label: "360 gün esasına göre" },
  { value: 365, label: "365 gün esasına göre" },
];

export function EklentiGunEsasiSecimi({
  value,
  onChange,
  className,
}: {
  value: EklentiGunEsasi;
  onChange: (value: EklentiGunEsasi) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <div
      className={className ? `${styles.group} ${className}` : styles.group}
      role="radiogroup"
      aria-label="Eklenti gün esası"
    >
      {SECENEKLER.map((opt) => (
        <label key={opt.value} className={styles.option} data-checked={value === opt.value || undefined}>
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}
