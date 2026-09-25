import type { LucideIcon } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";
import { formatNumber } from "@/utils/format";
import styles from "./StatCards.module.css";

export type StatItem = {
  id: string;
  label: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  tone: "teal" | "blue" | "green" | "amber";
  numeric?: boolean;
};

type Props = {
  items: StatItem[];
};

function StatValue({ value, numeric }: { value: number | string; numeric?: boolean }) {
  const count = useCountUp(typeof value === "number" ? value : 0, {
    enabled: Boolean(numeric && typeof value === "number"),
  });

  if (numeric && typeof value === "number") {
    return <>{formatNumber(Math.round(count))}</>;
  }
  return <>{value}</>;
}

export function StatCards({ items }: Props) {
  return (
    <section className={`anim-stagger ${styles.grid}`} aria-label="Özet istatistikler">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <article key={item.id} className={`${styles.card} ${styles[item.tone]}`}>
            <div className={styles.icon}>
              <Icon size={18} strokeWidth={1.75} />
            </div>
            <div className={styles.body}>
              <p className={styles.label}>{item.label}</p>
              <p className={styles.value}>
                <StatValue value={item.value} numeric={item.numeric} />
              </p>
              {item.hint ? <p className={styles.hint}>{item.hint}</p> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}
