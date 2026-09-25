import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import styles from "./StatCard.module.css";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "teal" | "blue" | "green" | "amber" | "danger";
  index?: number;
};

export function StatCard({ label, value, hint, icon: Icon, tone = "teal", index = 0 }: Props) {
  return (
    <article
      className={clsx(styles.card, styles[tone])}
      style={{ animationDelay: `${60 + index * 50}ms` }}
    >
      {Icon ? (
        <div className={styles.icon}>
          <Icon size={16} strokeWidth={1.75} />
        </div>
      ) : null}
      <div className={styles.body}>
        <p className={styles.label}>{label}</p>
        <p className={styles.value}>{value}</p>
        {hint ? <p className={styles.hint}>{hint}</p> : null}
      </div>
    </article>
  );
}
