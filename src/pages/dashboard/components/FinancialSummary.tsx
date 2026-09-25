import {
  AlertTriangle,
  BadgePercent,
  CalendarClock,
  CreditCard,
  Timer,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { FinancialSummary } from "@/api/types";
import { StatePanel } from "@/components/ui/StatePanel";
import { useCountUp } from "@/hooks/useCountUp";
import { formatNumber } from "@/utils/format";
import styles from "./FinancialSummary.module.css";

type Props = {
  financial: FinancialSummary | null;
  error: string | null;
};

function Metric({
  label,
  value,
  suffix,
  warn,
  icon: Icon,
}: {
  label: string;
  value: number;
  suffix?: string;
  warn?: boolean;
  icon: typeof Users;
}) {
  const animated = useCountUp(value, { decimals: suffix === "%" ? 1 : 0 });
  const display =
    suffix === "%"
      ? `%${animated.toFixed(1)}`
      : suffix
        ? `${formatNumber(Math.round(animated))} ${suffix}`
        : formatNumber(Math.round(animated));

  return (
    <div className={warn ? `${styles.metric} ${styles.warn}` : styles.metric}>
      <div className={styles.metricIcon}>
        <Icon size={15} strokeWidth={1.75} />
      </div>
      <div>
        <p className={styles.metricLabel}>{label}</p>
        <p className={styles.metricValue}>{display}</p>
      </div>
    </div>
  );
}

export function FinancialSummaryCard({ financial, error }: Props) {
  return (
    <section className={`anim-fade-up ${styles.card}`}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Finansal Özet</h2>
          <p className={styles.desc}>Abonelik ve lisans metrikleri</p>
        </div>
      </header>

      {!financial ? (
        <StatePanel
          icon={AlertTriangle}
          tone="warning"
          title="Finansal özet yok"
          description={error ?? "Finansal özet verisi bulunamadı."}
        />
      ) : (
        <div className={styles.grid}>
          <Metric label="Aktif Abonelik" value={financial.activeSubscriptionCount} icon={CreditCard} />
          <Metric label="Yıllık Plan" value={financial.annualPlanCount} icon={Wallet} />
          <Metric label="Aylık Plan" value={financial.monthlyPlanCount} icon={CalendarClock} />
          <Metric
            label="Ortalama Lisans Süresi"
            value={financial.averageLicenseDurationDays}
            suffix="gün"
            icon={Timer}
          />
          <Metric label="Demo Kullanıcı" value={financial.demoUserCount} icon={Users} />
          <Metric
            label="Demo Satış Oranı"
            value={financial.demoToSaleConversionRate}
            suffix="%"
            icon={BadgePercent}
          />
          <Metric
            label="Son 30 Gün Yeni"
            value={financial.newSubscriptionsLast30Days}
            icon={UserPlus}
          />
          <Metric
            label="Yakında Dolacak"
            value={financial.licensesExpiringIn7Days}
            icon={AlertTriangle}
            warn
          />
          {financial.hasPriceConfig && financial.estimatedMRR != null ? (
            <Metric label="Tahmini MRR" value={financial.estimatedMRR} suffix="₺" icon={Wallet} />
          ) : null}
        </div>
      )}
    </section>
  );
}
