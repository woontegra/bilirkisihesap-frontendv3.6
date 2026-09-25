import type { LucideIcon } from "lucide-react";
import { Button } from "./Button";
import styles from "./StatePanel.module.css";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "danger" | "warning";
};

export function StatePanel({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  tone = "neutral",
}: Props) {
  return (
    <div className={`${styles.panel} ${styles[tone]}`} role="status">
      <div className={styles.iconWrap}>
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <div className={styles.copy}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.desc}>{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button variant="soft" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
