import { useEffect, useMemo, useState } from "react";
import { Clock, Percent, TrendingUp, Users } from "lucide-react";
import { apiClient } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { FormField } from "@/components/admin/FormField";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatCalculationType } from "@/utils/calculationLabels";
import { formatDateTr } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./DemoConversionPage.module.css";

type CalculationItem = { type: string; count: number };

type Conversion = {
  user_id: number;
  user_email: string;
  demo_activated_at: string;
  paid_activated_at: string;
  days_to_convert: number;
  calculations?: CalculationItem[];
};

type DemoUserCalculation = {
  user_id: number;
  tenant_id: number | null;
  user_email: string;
  demo_activated_at: string | null;
  calculations: CalculationItem[];
};

type ConversionMetrics = {
  success?: boolean;
  total_demos: number;
  total_converted: number;
  conversion_rate: number;
  avg_conversion_time_days: number;
  conversions: Conversion[];
  demo_user_calculations?: DemoUserCalculation[];
};

type DateFilter = "all" | "7" | "30" | "90";

function formatCalculations(calculations: CalculationItem[] | undefined): string {
  if (!calculations?.length) return "—";
  return calculations.map((c) => `${formatCalculationType(c.type)} (${c.count})`).join(", ");
}

export default function DemoConversionPage() {
  const { error: toastError } = useToast();
  const [metrics, setMetrics] = useState<ConversionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient<ConversionMetrics>("/api/admin/demo-conversion", {
        adminRole: true,
      });
      if (data.success === false) {
        throw new Error("Metrikler yüklenemedi");
      }
      setMetrics(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Metrikler yüklenemedi";
      setError(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const filteredConversions = useMemo(() => {
    if (!metrics?.conversions) return [];
    if (dateFilter === "all") return metrics.conversions;
    const days = Number(dateFilter);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return metrics.conversions.filter((conv) => new Date(conv.paid_activated_at) >= cutoff);
  }, [dateFilter, metrics?.conversions]);

  if (loading) return <AdminSkeleton cards={4} rows={6} />;

  if (error || !metrics) {
    return (
      <StatePanel
        icon={TrendingUp}
        title="Metrikler yüklenemedi"
        description={error || "Veri alınamadı."}
        actionLabel="Tekrar dene"
        onAction={loadMetrics}
        tone="danger"
      />
    );
  }

  return (
    <div className={shared.page}>
      <PageHeader
        title="Demo → Satış Dönüşüm Metrikleri"
        description="Demo kullanıcılarının satın alma dönüşüm oranlarını ve sürelerini görüntüleyin"
      />

      <div className={shared.stats}>
        <StatCard
          label="Toplam Demo Kullanıcı"
          value={metrics.total_demos}
          hint="Demo lisansı olan kullanıcı sayısı"
          icon={Users}
          tone="blue"
          index={0}
        />
        <StatCard
          label="Dönüşen Kullanıcı"
          value={metrics.total_converted}
          hint="Satın alan demo kullanıcı sayısı"
          icon={TrendingUp}
          tone="green"
          index={1}
        />
        <StatCard
          label="Dönüşüm Oranı"
          value={`${metrics.conversion_rate.toFixed(2)}%`}
          hint="Demo'dan satışa dönüşüm yüzdesi"
          icon={Percent}
          tone="teal"
          index={2}
        />
        <StatCard
          label="Ort. Dönüşüm Süresi"
          value={`${metrics.avg_conversion_time_days.toFixed(1)} gün`}
          hint="Gün cinsinden ortalama süre"
          icon={Clock}
          tone="amber"
          index={3}
        />
      </div>

      <section className={shared.panel}>
        <div className={shared.rowBetween}>
          <div>
            <h2 className={shared.panelTitle}>Dönüşüm Detayları</h2>
            <p className={shared.muted}>{filteredConversions.length} dönüşüm gösteriliyor</p>
          </div>
          <FilterBar collapsibleOnMobile={false} title="Tarih">
            <FormField label="Tarih aralığı">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              >
                <option value="all">Tüm Zamanlar</option>
                <option value="7">Son 7 Gün</option>
                <option value="30">Son 30 Gün</option>
                <option value="90">Son 90 Gün</option>
              </select>
            </FormField>
          </FilterBar>
        </div>

        <AdminTable
          rows={filteredConversions}
          rowKey={(c) => `${c.user_id}-${c.paid_activated_at}`}
          empty={
            <StatePanel
              icon={TrendingUp}
              title="Dönüşüm bulunamadı"
              description={
                dateFilter === "all"
                  ? "Henüz dönüşüm kaydı bulunmuyor."
                  : "Seçilen tarih aralığında dönüşüm bulunamadı."
              }
            />
          }
          columns={[
            {
              key: "email",
              header: "E-posta",
              render: (c) => c.user_email,
            },
            {
              key: "demo",
              header: "Demo Başlangıç",
              hideOnMobile: true,
              render: (c) => formatDateTr(c.demo_activated_at, true),
            },
            {
              key: "paid",
              header: "Satın Alma",
              render: (c) => formatDateTr(c.paid_activated_at, true),
            },
            {
              key: "days",
              header: "Dönüşüm",
              render: (c) => {
                const fast = c.days_to_convert <= 3;
                return (
                  <span className={styles.badgeWrap}>
                    <StatusBadge tone={fast ? "success" : "info"}>
                      {`${c.days_to_convert} gün${fast ? " ⚡" : ""}`}
                    </StatusBadge>
                  </span>
                );
              },
            },
            {
              key: "calcs",
              header: "Hesaplamalar",
              hideBelowMd: true,
              render: (c) => formatCalculations(c.calculations),
            },
          ]}
        />
      </section>

      {metrics.total_demos > 0 ? (
        <section className={shared.panel}>
          <h2 className={shared.panelTitle}>Demo kullanıcıları ve hesaplamalar</h2>
          <p className={shared.muted}>
            Demo talep eden tüm kullanıcılar ve kaydettikleri hesaplama türleri
          </p>

          {metrics.demo_user_calculations?.length ? (
            <AdminTable
              rows={metrics.demo_user_calculations}
              rowKey={(r) => String(r.user_id)}
              columns={[
                {
                  key: "tenant",
                  header: "Tenant No",
                  hideOnMobile: true,
                  render: (r) => r.tenant_id ?? "—",
                },
                {
                  key: "email",
                  header: "E-posta",
                  render: (r) => r.user_email,
                },
                {
                  key: "start",
                  header: "Demo başlangıç",
                  hideOnMobile: true,
                  render: (r) => formatDateTr(r.demo_activated_at, true),
                },
                {
                  key: "calcs",
                  header: "Hesaplamalar",
                  render: (r) => formatCalculations(r.calculations),
                },
              ]}
            />
          ) : (
            <StatePanel
              icon={Users}
              title="Hesaplama listesi alınamadı"
              description="Backend'in güncel sürümü çalışıyor mu kontrol edin."
              tone="warning"
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
