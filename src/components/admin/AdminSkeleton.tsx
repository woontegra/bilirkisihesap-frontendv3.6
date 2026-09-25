import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./AdminSkeleton.module.css";

type Props = {
  rows?: number;
  cards?: number;
};

export function AdminSkeleton({ rows = 6, cards = 4 }: Props) {
  return (
    <div className={styles.wrap} aria-busy="true" aria-label="Yükleniyor">
      <Skeleton height={72} radius={14} />
      <div className={styles.stats}>
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} height={84} radius={14} />
        ))}
      </div>
      <Skeleton height={64} radius={14} />
      <div className={styles.rows}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} height={56} radius={12} />
        ))}
      </div>
    </div>
  );
}
