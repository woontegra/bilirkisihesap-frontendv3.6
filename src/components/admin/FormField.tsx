import type { ReactNode } from "react";
import styles from "./FormField.module.css";

type Props = {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
};

export function FormField({ label, children, hint, className }: Props) {
  return (
    <label className={`${styles.field} ${className ?? ""}`}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}
