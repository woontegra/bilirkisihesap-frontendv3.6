import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./DashboardSkeleton.module.css";

export function DashboardSkeleton() {
  return (
    <div className={styles.wrap} aria-busy="true" aria-label="Yönetim paneli yükleniyor">
      <div className={styles.statGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.statCard}>
            <Skeleton height={38} width={38} radius={12} />
            <div className={styles.statBody}>
              <Skeleton height={12} width="46%" />
              <Skeleton height={22} width="62%" />
            </div>
          </div>
        ))}
      </div>

      <div className={styles.block}>
        <Skeleton height={18} width="28%" />
        <div className={styles.metricGrid}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} height={72} radius={12} />
          ))}
        </div>
      </div>

      <Skeleton height={220} radius={16} />

      <div className={styles.chartGrid}>
        <Skeleton height={280} radius={16} />
        <Skeleton height={280} radius={16} />
      </div>

      <Skeleton height={240} radius={16} />
    </div>
  );
}
