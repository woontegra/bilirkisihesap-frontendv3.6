import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Calculator,
  Calendar,
  Download,
  Radio,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiClient } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { FormField } from "@/components/admin/FormField";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatCalculationType } from "@/utils/calculationLabels";
import { downloadCsv, formatDateTr, formatNumberTr } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./AnalyticsPage.module.css";

type TenantStat = {
  tenantId: number;
  tenantName: string;
  tenantEmail: string | null;
  totalCalculations: number;
  userCount: number;
  mostUsedType: string;
  lastCalculation: string | null;
  typeDistribution: Record<string, number>;
};

type AnalyticsData = {
  summary: {
    totalTenants: number;
    activeTenants: number;
    totalCalculations: number;
    overallTypeDistribution: Record<string, number>;
  };
  tenants: TenantStat[];
};

type TenantTableStatusFilter = "all" | "active" | "passive";
type TenantTableSortFilter = "users" | "calculations" | "activity";

const COLORS = [
  "#0d9488",
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#f97316",
  "#a855f7",
];

const DISTRIBUTION_PREVIEW_LIMIT = 5;

function tenantDistributionSummary(t: TenantStat): string {
  return Object.entries(t.typeDistribution)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => `${formatCalculationType(type)}: ${count}`)
    .join(" · ");
}

function sortedTenantDistributionEntries(t: TenantStat): [string, number][] {
  return Object.entries(t.typeDistribution).sort(([, a], [, b]) => b - a);
}

export default function AnalyticsPage() {
  const { error: toastError } = useToast();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeUsersCount, setActiveUsersCount] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [topN, setTopN] = useState(10);
  const [tenantTableSearch, setTenantTableSearch] = useState("");
  const [tenantStatusFilter, setTenantStatusFilter] =
    useState<TenantTableStatusFilter>("active");
  const [tenantSortFilter, setTenantSortFilter] = useState<TenantTableSortFilter>("users");
  const tenantTableUserAdjustedRef = useRef(false);
  const [distributionModalTenant, setDistributionModalTenant] = useState<TenantStat | null>(null);

  const loadActiveUsersCount = useCallback(async () => {
    try {
      const result = await apiClient<{ data?: { activeUsersCount?: number } }>(
        "/api/admin/analytics/active-users-count",
        { adminRole: true },
      );
      setActiveUsersCount(result.data?.activeUsersCount ?? 0);
    } catch {
      /* polling endpoint — sessiz */
    }
  }, []);

  useEffect(() => {
    loadActiveUsersCount();
    const interval = window.setInterval(loadActiveUsersCount, 15000);
    return () => window.clearInterval(interval);
  }, [loadActiveUsersCount]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (dateRange.start) params.set("startDate", dateRange.start);
      if (dateRange.end) params.set("endDate", dateRange.end);
      const qs = params.toString();
      const result = await apiClient<{ data: AnalyticsData }>(
        `/api/admin/analytics/tenant-usage${qs ? `?${qs}` : ""}`,
        { adminRole: true },
      );
      setData(result.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "İstatistikler yüklenemedi";
      setError(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  }, [dateRange.end, dateRange.start, toastError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const markTenantTableAdjusted = () => {
    tenantTableUserAdjustedRef.current = true;
  };

  const displayedTenants = useMemo(() => {
    if (!data?.tenants) return [];
    let list = [...data.tenants];

    if (tenantStatusFilter === "active") list = list.filter((t) => t.totalCalculations > 0);
    else if (tenantStatusFilter === "passive") list = list.filter((t) => t.totalCalculations === 0);

    const q = tenantTableSearch.trim().toLocaleLowerCase("tr-TR");
    if (q) {
      list = list.filter((t) => {
        const name = (t.tenantName || "").toLocaleLowerCase("tr-TR");
        const email = (t.tenantEmail || "").toLocaleLowerCase("tr-TR");
        const at = email.indexOf("@");
        const domain = at >= 0 ? email.slice(at + 1) : "";
        return name.includes(q) || email.includes(q) || domain.includes(q);
      });
    }

    if (tenantSortFilter === "users") list.sort((a, b) => b.userCount - a.userCount);
    else if (tenantSortFilter === "calculations") {
      list.sort((a, b) => b.totalCalculations - a.totalCalculations);
    } else {
      list.sort((a, b) => {
        const ta = a.lastCalculation ? new Date(a.lastCalculation).getTime() : 0;
        const tb = b.lastCalculation ? new Date(b.lastCalculation).getTime() : 0;
        return tb - ta;
      });
    }

    const defaultFilters =
      tenantStatusFilter === "active" &&
      tenantSortFilter === "users" &&
      !tenantTableSearch.trim();
    if (!tenantTableUserAdjustedRef.current && defaultFilters) {
      list = list.filter((t) => t.totalCalculations > 0).slice(0, 20);
    }

    return list;
  }, [data, tenantSortFilter, tenantStatusFilter, tenantTableSearch]);

  const handleExport = () => {
    if (!data) return;
    const rows: string[][] = [
      [
        "Tenant Adı",
        "Email",
        "Kullanıcı Sayısı",
        "Toplam Hesaplama",
        "Hesaplama Dağılımı",
        "Son Hesaplama",
        "Durum",
      ],
    ];
    data.tenants.forEach((t) => {
      const distributionText = Object.entries(t.typeDistribution)
        .sort(([, a], [, b]) => b - a)
        .map(([type, count]) => `${formatCalculationType(type)}: ${count}`)
        .join("; ");
      rows.push([
        t.tenantName,
        t.tenantEmail || "-",
        String(t.userCount),
        String(t.totalCalculations),
        distributionText || "-",
        t.lastCalculation || "-",
        t.totalCalculations > 0 ? "Aktif" : "Pasif",
      ]);
    });
    downloadCsv(`tenant-istatistikleri-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const pieData = data
    ? Object.entries(data.summary.overallTypeDistribution)
        .map(([type, count]) => ({ name: formatCalculationType(type), value: count }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    : [];

  const barData = data
    ? data.tenants
        .filter((t) => t.totalCalculations > 0)
        .slice(0, topN)
        .map((t) => ({
          name: t.tenantName.length > 20 ? `${t.tenantName.slice(0, 20)}…` : t.tenantName,
          fullName: t.tenantName,
          hesaplamalar: t.totalCalculations,
        }))
    : [];

  if (loading && !data) {
    return <AdminSkeleton cards={5} rows={8} />;
  }

  if (error && !data) {
    return (
      <StatePanel
        icon={Activity}
        title="İstatistikler yüklenemedi"
        description={error}
        actionLabel="Tekrar dene"
        onAction={loadData}
        tone="danger"
      />
    );
  }

  if (!data) return null;

  const avgPerTenant =
    data.summary.activeTenants > 0
      ? Math.round(data.summary.totalCalculations / data.summary.activeTenants)
      : 0;

  return (
    <div className={shared.page}>
      <PageHeader
        title="Tenant Kullanım İstatistikleri"
        description="Tüm tenant'ların hesaplama kullanımlarını izleyin"
        actions={
          <Button variant="soft" size="sm" onClick={handleExport}>
            <Download size={15} />
            CSV İndir
          </Button>
        }
      />

      <FilterBar
        actions={
          <Button variant="primary" size="sm" onClick={loadData}>
            <Calendar size={15} />
            Filtrele
          </Button>
        }
      >
        <FormField label="Başlangıç Tarihi">
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value }))}
          />
        </FormField>
        <FormField label="Bitiş Tarihi">
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value }))}
          />
        </FormField>
      </FilterBar>

      <div className={shared.stats}>
        <StatCard
          label="Toplam Tenant"
          value={formatNumberTr(data.summary.totalTenants)}
          icon={Users}
          tone="blue"
          index={0}
        />
        <StatCard
          label="Aktif Tenant"
          value={formatNumberTr(data.summary.activeTenants)}
          icon={Activity}
          tone="green"
          index={1}
        />
        <StatCard
          label="Toplam Hesaplama"
          value={formatNumberTr(data.summary.totalCalculations)}
          icon={Calculator}
          tone="teal"
          index={2}
        />
        <StatCard
          label="Ortalama / Tenant"
          value={formatNumberTr(avgPerTenant)}
          icon={TrendingUp}
          tone="amber"
          index={3}
        />
        <StatCard
          label="Canlı Kullanıcı"
          value={activeUsersCount !== null ? formatNumberTr(activeUsersCount) : "—"}
          hint="Şu an program açık"
          icon={Radio}
          tone="green"
          index={4}
        />
      </div>

      <div className={styles.charts}>
        <section className={shared.panel}>
          <div className={shared.rowBetween}>
            <h2 className={shared.panelTitle}>Tenant Bazlı Kullanım</h2>
            <select
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              aria-label="Gösterilecek tenant sayısı"
            >
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
            </select>
          </div>
          <div className={styles.chartBox}>
            {barData.length === 0 ? (
              <p className={shared.muted}>Grafik için yeterli veri yok.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 64 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="name" angle={-40} textAnchor="end" height={72} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.[0] ? (
                        <div className={shared.panel}>
                          <strong>{payload[0].payload.fullName}</strong>
                          <p className={shared.muted}>Hesaplama: {payload[0].value}</p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="hesaplamalar" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className={shared.panel}>
          <h2 className={shared.panelTitle}>Hesaplama Tipi Dağılımı</h2>
          <div className={styles.chartBox}>
            {pieData.length === 0 ? (
              <p className={shared.muted}>Dağılım verisi yok.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(e) => `${e.name}: ${e.value}`}
                    outerRadius={96}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      <section className={shared.panel}>
        <h2 className={shared.panelTitle}>Tenant Detayları</h2>

        <FilterBar collapsibleOnMobile={false}>
          <FormField label="Arama">
            <div style={{ position: "relative" }}>
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: "0.55rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  opacity: 0.45,
                }}
              />
              <input
                type="search"
                value={tenantTableSearch}
                onChange={(e) => {
                  markTenantTableAdjusted();
                  setTenantTableSearch(e.target.value);
                }}
                placeholder="Tenant adı, e-posta veya alan adı…"
                style={{ paddingLeft: "2rem" }}
              />
            </div>
          </FormField>
          <FormField label="Durum">
            <select
              value={tenantStatusFilter}
              onChange={(e) => {
                markTenantTableAdjusted();
                setTenantStatusFilter(e.target.value as TenantTableStatusFilter);
              }}
            >
              <option value="all">Tümü</option>
              <option value="active">Aktif</option>
              <option value="passive">Pasif</option>
            </select>
          </FormField>
          <FormField label="Sıralama">
            <select
              value={tenantSortFilter}
              onChange={(e) => {
                markTenantTableAdjusted();
                setTenantSortFilter(e.target.value as TenantTableSortFilter);
              }}
            >
              <option value="users">En çok kullanıcı</option>
              <option value="calculations">En çok hesaplama</option>
              <option value="activity">Son aktivite</option>
            </select>
          </FormField>
        </FilterBar>

        {!tenantTableUserAdjustedRef.current &&
          tenantStatusFilter === "active" &&
          tenantSortFilter === "users" &&
          !tenantTableSearch.trim() && (
            <p className={shared.muted}>
              Varsayılan: aktif tenantlar, kullanıcı sayısına göre ilk 20.
            </p>
          )}

        <AdminTable
          rows={displayedTenants}
          rowKey={(t) => t.tenantId}
          empty={
            <StatePanel
              icon={Search}
              title="Tenant bulunamadı"
              description="Filtreleri değiştirerek tekrar deneyin."
            />
          }
          columns={[
            {
              key: "tenant",
              header: "Tenant",
              render: (t) => (
                <div>
                  <strong>{t.tenantName}</strong>
                  {t.tenantEmail ? <p className={shared.muted}>{t.tenantEmail}</p> : null}
                </div>
              ),
            },
            {
              key: "users",
              header: "Kullanıcı",
              hideOnMobile: true,
              render: (t) => formatNumberTr(t.userCount),
            },
            {
              key: "calcs",
              header: "Hesaplama",
              render: (t) => formatNumberTr(t.totalCalculations),
            },
            {
              key: "dist",
              header: "Dağılım",
              hideBelowMd: true,
              render: (t) => {
                const entries = sortedTenantDistributionEntries(t);
                if (entries.length === 0) return "—";
                const preview = entries.slice(0, DISTRIBUTION_PREVIEW_LIMIT);
                return (
                  <div>
                    <div className={styles.badgeList}>
                      {preview.map(([type, count]) => (
                        <StatusBadge key={type} tone="info">
                          {`${formatCalculationType(type)}: ${formatNumberTr(count)}`}
                        </StatusBadge>
                      ))}
                    </div>
                    {entries.length > DISTRIBUTION_PREVIEW_LIMIT ? (
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => setDistributionModalTenant(t)}
                      >
                        Tümünü Gör
                      </button>
                    ) : null}
                  </div>
                );
              },
            },
            {
              key: "last",
              header: "Son Hesaplama",
              hideOnMobile: true,
              render: (t) => (
                <span title={tenantDistributionSummary(t)}>
                  {formatCalculationType(t.mostUsedType)} ·{" "}
                  {formatDateTr(t.lastCalculation, true)}
                </span>
              ),
            },
            {
              key: "status",
              header: "Durum",
              render: (t) => (
                <StatusBadge tone={t.totalCalculations > 0 ? "success" : "neutral"}>
                  {t.totalCalculations > 0 ? "Aktif" : "Pasif"}
                </StatusBadge>
              ),
            },
          ]}
        />
      </section>

      {distributionModalTenant ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={() => setDistributionModalTenant(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dist-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.modalHead}>
              <h2 id="dist-title" className={shared.panelTitle}>
                {distributionModalTenant.tenantName}
              </h2>
              <p className={shared.muted}>Hesaplama tipi dağılımı</p>
            </header>
            <div className={styles.modalBody}>
              {sortedTenantDistributionEntries(distributionModalTenant).map(([type, count]) => (
                <div key={type} className={styles.distRow}>
                  <span>{formatCalculationType(type)}</span>
                  <strong>{formatNumberTr(count)}</strong>
                </div>
              ))}
            </div>
            <footer className={styles.modalFoot}>
              <Button variant="soft" size="sm" onClick={() => setDistributionModalTenant(null)}>
                Kapat
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
