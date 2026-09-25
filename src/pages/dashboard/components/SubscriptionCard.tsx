import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { SubscriptionProgress } from "@/utils/subscription";
import {
  subscriptionStatusLabel,
  type SubscriptionUiStatus,
} from "@/utils/subscriptionStatus";
import { formatDate } from "@/utils/format";
import styles from "./SubscriptionCard.module.css";

type Props = {
  planLabel: string;
  sub: SubscriptionProgress;
  uiStatus: SubscriptionUiStatus;
};

export function SubscriptionCard({ planLabel, sub, uiStatus }: Props) {
  const active = uiStatus === "active";
  const statusText =
    uiStatus === "active" && sub.hasSubscription
      ? `${sub.daysRemaining} gün kaldı`
      : subscriptionStatusLabel(uiStatus);
  const progressClass =
    sub.daysRemaining <= 7
      ? styles.barDanger
      : sub.daysRemaining <= 30
        ? styles.barWarn
        : styles.barOk;

  return (
    <section className={`anim-fade-up ${styles.card}`}>
      <div className={styles.glow} aria-hidden />

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Lisans</p>
          <h2 className={styles.title}>Abonelik Bilgileri</h2>
        </div>
        <div className={styles.badges}>
          <span className={styles.plan}>{planLabel}</span>
          <span className={active ? styles.statusOk : styles.statusBad}>
            {active ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            {statusText}
          </span>
        </div>
      </header>

      <div className={styles.dates}>
        <div>
          <p className={styles.metaLabel}>Başlangıç</p>
          <p className={styles.metaValue}>{formatDate(sub.startDate)}</p>
        </div>
        <div className={styles.dateDivider} aria-hidden />
        <div>
          <p className={styles.metaLabel}>Bitiş</p>
          <p className={styles.metaValue}>{formatDate(sub.endDate)}</p>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <p className={styles.metaLabel}>Toplam Süre</p>
          <p className={styles.statValue}>{sub.totalDays}</p>
          <p className={styles.metaLabel}>gün</p>
        </div>
        <div className={styles.stat}>
          <p className={styles.metaLabel}>Kullanılan</p>
          <p className={styles.statValue}>{sub.daysUsed}</p>
          <p className={styles.metaLabel}>gün</p>
        </div>
        <div className={styles.stat}>
          <p className={styles.metaLabel}>Kalan</p>
          <p className={`${styles.statValue} ${active ? styles.remainOk : styles.remainBad}`}>
            {sub.daysRemaining}
          </p>
          <p className={styles.metaLabel}>gün</p>
        </div>
        <div className={styles.stat}>
          <p className={styles.metaLabel}>Kullanım Oranı</p>
          <p className={`${styles.statValue} ${styles.usage}`}>%{sub.usedPct.toFixed(1)}</p>
          <p className={styles.metaLabel}>tamamlandı</p>
        </div>
      </div>

      <div className={styles.progressBlock}>
        <div className={styles.progressLabels}>
          <span>Abonelik ilerlemesi</span>
          <span className={styles.remainPct}>%{sub.remainingPct.toFixed(1)} kaldı</span>
        </div>
        <div className={styles.track} role="progressbar" aria-valuenow={sub.remainingPct} aria-valuemin={0} aria-valuemax={100}>
          <div className={progressClass} style={{ width: `${sub.remainingPct}%` }} />
        </div>
        <p className={styles.progressHint}>
          {uiStatus === "unknown"
            ? "Abonelik bilgisi alınamadı"
            : active
              ? `${sub.daysUsed} gün tamamlandı · ${sub.daysRemaining} gün kaldı`
              : uiStatus === "expired"
                ? "Aboneliğinizin süresi doldu"
                : "Abonelik bilgisi alınamadı"}
        </p>
      </div>
    </section>
  );
}
