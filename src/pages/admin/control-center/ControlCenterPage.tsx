import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BarChart2,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Heart,
  KeyRound,
  LayoutGrid,
  Loader2,
  LogIn,
  RefreshCw,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { apiClient, ApiError } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { MobileCards, MobileRecordCard } from "@/components/admin/MobileCards";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { formatDateTr, formatNumberTr } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./ControlCenterPage.module.css";

const TAB_KEYS = ["genel", "demo", "kullanim", "saglik", "bakim"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TABS: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "genel", label: "Genel", icon: LayoutGrid },
  { key: "demo", label: "Demo Yönetimi", icon: FlaskConical },
  { key: "kullanim", label: "Kullanım Analizi", icon: BarChart2 },
  { key: "saglik", label: "Sistem Sağlığı", icon: Heart },
  { key: "bakim", label: "Sistem Bakım Modu", icon: Wrench },
];

type GenelData = {
  totalUsers?: number;
  activeLicenses?: number;
  activeDemos?: number;
  expiringIn7Days?: number;
  usersWithoutCalculations?: number;
  loggedInToday?: number;
};

type DemoLicenseItem = {
  licenseId: string | null;
  userId: number | null;
  tenantId: string | null;
  email: string | null;
  expiresAt: string | null;
  remainingDays: number;
  calculationCount: number;
  lastLoginAt: string | null;
  lastCalculationAt?: string | null;
};

type KullanimData = {
  top5Modules?: Array<{ name: string; count: number }>;
  totalCalculationsLast7Days?: number;
  totalCalculationsLast30Days?: number;
  top5Users?: Array<{ userId: number | null; email: string; count: number }>;
};

type SaglikData = {
  ok?: boolean;
  status?: string;
  uptime?: number;
  dbConnected?: boolean;
  errorsLast24h?: number;
  avgResponseMs?: number | null;
  timestamp?: string;
};

type BakimData = {
  isActive?: boolean;
  message?: string;
  endsAt?: string | null;
};

type ConfirmAction =
  | { type: "convert"; userId: number; email: string | null }
  | { type: "deactivate"; licenseId: string; email: string | null };

type DemoLicenseStatus = "converted" | "active_demo" | "expired";

type DemoLoginAnalyticsRow = {
  userId: number | null;
  name: string;
  email: string | null;
  demoStartsAt: string | null;
  demoExpiresAt: string | null;
  loginCount: number;
  lastLoginAt: string | null;
  savedCalculationCount: number;
  licenseStatus: DemoLicenseStatus;
};

type DemoLoginAnalytics = {
  summary: {
    totalDemoUsers: number;
    neverLoggedIn: number;
    oneLogin: number;
    twoToThreeLogins: number;
    fourPlusLogins: number;
    convertedToProfessional: number;
  };
  rows: DemoLoginAnalyticsRow[];
};

type DemoLoginFilter =
  | "all"
  | "never"
  | "one"
  | "two_three"
  | "four_plus"
  | "expired"
  | "active_demo"
  | "converted";

const DEMO_LOGIN_FILTERS: { key: DemoLoginFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "never", label: "Hiç giriş yapmadı" },
  { key: "one", label: "1 giriş" },
  { key: "two_three", label: "2–3 giriş" },
  { key: "four_plus", label: "4+ giriş" },
  { key: "expired", label: "Demo süresi doldu" },
  { key: "active_demo", label: "Aktif demo" },
  { key: "converted", label: "Profesyonele geçti" },
];

function loginBucket(count: number): "never" | "one" | "two_three" | "four_plus" {
  if (count <= 0) return "never";
  if (count === 1) return "one";
  if (count <= 3) return "two_three";
  return "four_plus";
}

function licenseStatusMeta(status: DemoLicenseStatus): {
  label: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral" | "accent";
} {
  if (status === "converted") return { label: "Profesyonele geçti", tone: "success" };
  if (status === "active_demo") return { label: "Aktif demo", tone: "accent" };
  return { label: "Demo süresi doldu", tone: "danger" };
}

function getLastActivity(d: DemoLicenseItem): string | null {
  const a = d.lastLoginAt ? new Date(d.lastLoginAt).getTime() : 0;
  const b = d.lastCalculationAt ? new Date(d.lastCalculationAt).getTime() : 0;
  const ts = Math.max(a, b);
  return ts > 0 ? new Date(ts).toISOString() : null;
}

function getDemoStatus(d: DemoLicenseItem): { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" | "accent" } {
  if ((d.remainingDays ?? 0) < 0) return { label: "Süresi Bitti", tone: "danger" };
  if (!d.lastLoginAt) return { label: "Giriş Yapmadı", tone: "neutral" };
  const last = getLastActivity(d);
  const daysSince = last
    ? Math.floor((Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  if (daysSince <= 2) return { label: "Aktif Demo", tone: "success" };
  if (daysSince > 7) return { label: "Pasif Demo", tone: "warning" };
  if ((d.remainingDays ?? 0) <= 2) return { label: "Demo bitiyor", tone: "warning" };
  return { label: "Aktif Demo", tone: "accent" };
}

export default function ControlCenterPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("genel");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [genelData, setGenelData] = useState<GenelData | null>(null);
  const [demosList, setDemosList] = useState<DemoLicenseItem[]>([]);
  const [demoAnalytics, setDemoAnalytics] = useState<DemoLoginAnalytics | null>(null);
  const [demoLoginFilter, setDemoLoginFilter] = useState<DemoLoginFilter>("all");
  const [kullanimData, setKullanimData] = useState<KullanimData | null>(null);
  const [saglikData, setSaglikData] = useState<SaglikData | null>(null);
  const [bakimData, setBakimData] = useState<BakimData | null>(null);

  const [extendingUserId, setExtendingUserId] = useState<number | null>(null);
  const [convertingUserId, setConvertingUserId] = useState<number | null>(null);
  const [deactivatingLicenseId, setDeactivatingLicenseId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const [bakimSaving, setBakimSaving] = useState(false);
  const [bakimLocalMessage, setBakimLocalMessage] = useState("");
  const [bakimLocalEndsAt, setBakimLocalEndsAt] = useState("");
  const [bakimLocalActive, setBakimLocalActive] = useState(false);

  const loadGenel = useCallback(async () => {
    const data = await apiClient<GenelData>("/api/admin/control-center/general", {
      adminRole: true,
    });
    setGenelData(data);
  }, []);

  const loadSaglik = useCallback(async () => {
    try {
      const data = await apiClient<SaglikData>("/api/admin/control-center/health", {
        adminRole: true,
      });
      setSaglikData(data);
    } catch {
      setSaglikData({
        ok: false,
        status: "error",
        dbConnected: false,
        errorsLast24h: 0,
        avgResponseMs: null,
      });
    }
  }, []);

  const loadDemo = useCallback(async () => {
    const errors: string[] = [];
    try {
      const data = await apiClient<DemoLicenseItem[]>("/api/admin/control-center/demos", {
        adminRole: true,
      });
      setDemosList(Array.isArray(data) ? data : []);
    } catch (err) {
      setDemosList([]);
      errors.push(err instanceof ApiError ? err.message : "Aktif demo listesi yüklenemedi");
    }
    try {
      const analytics = await apiClient<DemoLoginAnalytics>(
        "/api/admin/control-center/demo-login-analytics",
        { adminRole: true },
      );
      setDemoAnalytics(analytics);
    } catch (err) {
      setDemoAnalytics(null);
      errors.push(err instanceof ApiError ? err.message : "Demo giriş analizi yüklenemedi");
    }
    if (errors.length) {
      throw new ApiError(errors.join(" · "), 500);
    }
  }, []);

  const loadKullanim = useCallback(async () => {
    const data = await apiClient<KullanimData>("/api/admin/control-center/usage", {
      adminRole: true,
    });
    setKullanimData(data);
  }, []);

  const loadBakim = useCallback(async () => {
    const data = await apiClient<BakimData>("/api/admin/maintenance", { adminRole: true });
    setBakimData(data);
    setBakimLocalMessage(data.message ?? "");
    setBakimLocalEndsAt(data.endsAt ? data.endsAt.slice(0, 16) : "");
    setBakimLocalActive(data.isActive ?? false);
  }, []);

  const loadTabData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "genel") {
        await Promise.all([loadGenel(), loadSaglik()]);
      } else if (activeTab === "demo") {
        await loadDemo();
      } else if (activeTab === "kullanim") {
        await loadKullanim();
      } else if (activeTab === "saglik") {
        await loadSaglik();
      } else {
        await loadBakim();
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Veri yüklenemedi";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, loadGenel, loadDemo, loadKullanim, loadSaglik, loadBakim]);

  useEffect(() => {
    void loadTabData();
  }, [loadTabData]);

  const handleExtendDemo = useCallback(
    async (userId: number) => {
      setExtendingUserId(userId);
      try {
        await apiClient(`/api/admin/control-center/demos/${userId}/extend`, {
          method: "POST",
          adminRole: true,
        });
        toast.success("Demo süresi 3 gün uzatıldı");
        await loadDemo();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Uzatma başarısız");
      } finally {
        setExtendingUserId(null);
      }
    },
    [loadDemo, toast],
  );

  const handleConvertDemo = useCallback(
    async (userId: number) => {
      setConvertingUserId(userId);
      try {
        await apiClient(`/api/admin/control-center/demos/${userId}/convert`, {
          method: "POST",
          adminRole: true,
        });
        toast.success("Kullanıcı yıllık lisansa geçirildi");
        setConfirmAction(null);
        await loadDemo();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Dönüştürme başarısız");
      } finally {
        setConvertingUserId(null);
      }
    },
    [loadDemo, toast],
  );

  const handleDeactivateLicense = useCallback(
    async (licenseId: string) => {
      setDeactivatingLicenseId(licenseId);
      try {
        await apiClient(`/api/admin/control-center/licenses/${licenseId}/deactivate`, {
          method: "POST",
          adminRole: true,
        });
        toast.success("Lisans pasife alındı");
        setConfirmAction(null);
        await loadDemo();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Pasife alma başarısız");
      } finally {
        setDeactivatingLicenseId(null);
      }
    },
    [loadDemo, toast],
  );

  const saveBakim = useCallback(async () => {
    setBakimSaving(true);
    try {
      const data = await apiClient<BakimData>("/api/admin/maintenance", {
        method: "PUT",
        adminRole: true,
        body: {
          isActive: bakimLocalActive,
          message: bakimLocalMessage || undefined,
          endsAt: bakimLocalEndsAt || null,
        },
      });
      setBakimData(data);
      toast.success("Bakım ayarları kaydedildi");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Kayıt başarısız");
    } finally {
      setBakimSaving(false);
    }
  }, [bakimLocalActive, bakimLocalMessage, bakimLocalEndsAt, toast]);

  const confirmLoading =
    confirmAction?.type === "convert"
      ? convertingUserId === confirmAction.userId
      : confirmAction?.type === "deactivate"
        ? deactivatingLicenseId === confirmAction.licenseId
        : false;

  const filteredDemoAnalyticsRows = useMemo(() => {
    const rows = demoAnalytics?.rows ?? [];
    if (demoLoginFilter === "all") return rows;
    if (demoLoginFilter === "expired" || demoLoginFilter === "active_demo" || demoLoginFilter === "converted") {
      return rows.filter((row) => row.licenseStatus === demoLoginFilter);
    }
    return rows.filter((row) => loginBucket(row.loginCount) === demoLoginFilter);
  }, [demoAnalytics?.rows, demoLoginFilter]);

  const renderDemoActions = (d: DemoLicenseItem) => (
    <div className={styles.demoActions}>
      <Button
        size="sm"
        variant="soft"
        disabled={d.userId == null || extendingUserId === d.userId}
        onClick={() => d.userId != null && void handleExtendDemo(d.userId)}
      >
        {extendingUserId === d.userId ? (
          <Loader2 size={14} className={styles.spin} aria-hidden />
        ) : (
          "+3 Gün"
        )}
      </Button>
      <Button
        size="sm"
        variant="soft"
        disabled={d.userId == null || convertingUserId === d.userId}
        onClick={() =>
          d.userId != null &&
          setConfirmAction({ type: "convert", userId: d.userId, email: d.email })
        }
      >
        Yıllığa Çevir
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled={d.licenseId == null || deactivatingLicenseId === d.licenseId}
        onClick={() =>
          d.licenseId != null &&
          setConfirmAction({ type: "deactivate", licenseId: d.licenseId, email: d.email })
        }
      >
        Pasife Al
      </Button>
    </div>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Kontrol Merkezi"
        description="Yönetim öncelikleri, demo akışı, kullanım ve sistem sağlığı tek ekranda."
        actions={
          <Button variant="soft" size="sm" onClick={() => void loadTabData()} disabled={loading}>
            <RefreshCw size={15} strokeWidth={1.75} aria-hidden />
            Yenile
          </Button>
        }
      />

      <nav className={shared.tabs} aria-label="Kontrol merkezi sekmeleri">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={isActive ? shared.tabActive : shared.tab}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={15} strokeWidth={1.75} aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      {loading ? (
        <AdminSkeleton rows={activeTab === "demo" ? 8 : 6} cards={activeTab === "genel" ? 6 : 4} />
      ) : (
        <>
          {activeTab === "genel" ? (
            <>
              <section className={styles.statsGrid} aria-label="Genel istatistikler">
                <StatCard
                  label="Toplam Kullanıcı"
                  value={formatNumberTr(genelData?.totalUsers ?? 0)}
                  hint="Kayıtlı hesap sayısı"
                  icon={Users}
                  tone="teal"
                  index={0}
                />
                <StatCard
                  label="Aktif Lisans"
                  value={formatNumberTr(genelData?.activeLicenses ?? 0)}
                  hint="Profesyonel lisanslar"
                  icon={KeyRound}
                  tone="blue"
                  index={1}
                />
                <StatCard
                  label="Aktif Demo"
                  value={formatNumberTr(genelData?.activeDemos ?? 0)}
                  hint="Süresi dolmamış demo"
                  icon={FlaskConical}
                  tone="amber"
                  index={2}
                />
                <StatCard
                  label="7 Gün İçinde Bitecek"
                  value={formatNumberTr(genelData?.expiringIn7Days ?? 0)}
                  hint="Yaklaşan yenilemeler"
                  icon={CalendarClock}
                  tone="danger"
                  index={3}
                />
                <StatCard
                  label="Kayıtlı hesaplaması olmayan"
                  value={formatNumberTr(genelData?.usersWithoutCalculations ?? 0)}
                  hint="Kaydedilmiş hesaplama kaydı yok"
                  icon={Calculator}
                  tone="amber"
                  index={4}
                />
                <StatCard
                  label="Bugün Giriş Yapan"
                  value={formatNumberTr(genelData?.loggedInToday ?? 0)}
                  hint="Günlük oturum"
                  icon={LogIn}
                  tone="green"
                  index={5}
                />
              </section>

              <section className={shared.panel} aria-labelledby="attention-title">
                <h2 id="attention-title" className={shared.panelTitle}>
                  Bugün dikkat edilmesi gerekenler
                </h2>
                <ul className={styles.attentionList}>
                  <li className={styles.attentionItem}>
                    {formatNumberTr(genelData?.usersWithoutCalculations ?? 0)} kullanıcının
                    kaydedilmiş hesaplaması yok
                  </li>
                  <li className={styles.attentionItem}>
                    {formatNumberTr(genelData?.activeDemos ?? 0)} aktif demo var
                  </li>
                  <li className={styles.attentionItem}>
                    {formatNumberTr(genelData?.expiringIn7Days ?? 0)} lisans 7 gün içinde bitecek
                  </li>
                  <li className={styles.attentionItem}>
                    Sistem sağlığı:{" "}
                    {saglikData?.ok === false ? "Dikkat gerekiyor" : "Normal"}
                  </li>
                </ul>
              </section>
            </>
          ) : null}

          {activeTab === "demo" ? (
            <>
              <section className={shared.panel} aria-labelledby="demo-login-title">
                <h2 id="demo-login-title" className={shared.panelTitle}>
                  Demo giriş analizi
                </h2>
                <p className={styles.helperText}>
                  Geçmiş ve güncel demo kullanıcılarının giriş sayıları mevcut veritabanı
                  kayıtlarından alınır. Kayıtlı hesaplama yalnızca kaydedilmiş kayıtları gösterir.
                </p>
                <section className={styles.statsGrid} aria-label="Demo giriş özeti">
                  <StatCard
                    label="Toplam Demo Kullanıcısı"
                    value={formatNumberTr(demoAnalytics?.summary.totalDemoUsers ?? 0)}
                    icon={Users}
                    tone="teal"
                    index={0}
                  />
                  <StatCard
                    label="Hiç Giriş Yapmayan"
                    value={formatNumberTr(demoAnalytics?.summary.neverLoggedIn ?? 0)}
                    icon={LogIn}
                    tone="amber"
                    index={1}
                  />
                  <StatCard
                    label="1 Kez Giriş Yapan"
                    value={formatNumberTr(demoAnalytics?.summary.oneLogin ?? 0)}
                    icon={LogIn}
                    tone="blue"
                    index={2}
                  />
                  <StatCard
                    label="2–3 Kez Giriş Yapan"
                    value={formatNumberTr(demoAnalytics?.summary.twoToThreeLogins ?? 0)}
                    icon={LogIn}
                    tone="blue"
                    index={3}
                  />
                  <StatCard
                    label="4+ Kez Giriş Yapan"
                    value={formatNumberTr(demoAnalytics?.summary.fourPlusLogins ?? 0)}
                    icon={TrendingUp}
                    tone="green"
                    index={4}
                  />
                  <StatCard
                    label="Profesyonel Lisansa Geçen"
                    value={formatNumberTr(demoAnalytics?.summary.convertedToProfessional ?? 0)}
                    icon={KeyRound}
                    tone="green"
                    index={5}
                  />
                </section>
                <div className={styles.filterChips} role="group" aria-label="Demo giriş filtreleri">
                  {DEMO_LOGIN_FILTERS.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      className={
                        demoLoginFilter === filter.key ? styles.filterChipActive : styles.filterChip
                      }
                      aria-pressed={demoLoginFilter === filter.key}
                      onClick={() => setDemoLoginFilter(filter.key)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <AdminTable
                  rows={filteredDemoAnalyticsRows}
                  rowKey={(row) => row.userId ?? `demo-a-${row.email ?? "unknown"}`}
                  empty={<p className={styles.emptyText}>Bu filtreye uyan demo kullanıcısı yok</p>}
                  columns={[
                    {
                      key: "name",
                      header: "Ad Soyad",
                      render: (row) =>
                        row.userId != null ? (
                          <Link className={styles.rowLink} to={`/admin/users/${row.userId}/detail`}>
                            {row.name || "—"}
                          </Link>
                        ) : (
                          row.name || "—"
                        ),
                    },
                    {
                      key: "email",
                      header: "E-posta",
                      render: (row) => row.email ?? "—",
                    },
                    {
                      key: "start",
                      header: "Demo Başlangıç",
                      hideOnMobile: true,
                      render: (row) => formatDateTr(row.demoStartsAt),
                    },
                    {
                      key: "end",
                      header: "Demo Bitiş",
                      hideBelowMd: true,
                      render: (row) => formatDateTr(row.demoExpiresAt),
                    },
                    {
                      key: "logins",
                      header: "Toplam Giriş",
                      render: (row) => (
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.loginCount}</span>
                      ),
                    },
                    {
                      key: "lastLogin",
                      header: "Son Giriş",
                      hideOnMobile: true,
                      render: (row) => formatDateTr(row.lastLoginAt, true),
                    },
                    {
                      key: "saved",
                      header: "Kayıtlı Hesaplama",
                      hideOnMobile: true,
                      render: (row) => (
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {row.savedCalculationCount}
                        </span>
                      ),
                    },
                    {
                      key: "status",
                      header: "Lisans / Demo Durumu",
                      hideBelowMd: true,
                      render: (row) => {
                        const st = licenseStatusMeta(row.licenseStatus);
                        return <StatusBadge tone={st.tone}>{st.label}</StatusBadge>;
                      },
                    },
                  ]}
                />
                <MobileCards>
                  {filteredDemoAnalyticsRows.map((row, index) => {
                    const st = licenseStatusMeta(row.licenseStatus);
                    return (
                      <MobileRecordCard key={row.userId ?? `demo-a-m-${index}`} index={index}>
                        <p className={styles.mobileEmail}>
                          {row.userId != null ? (
                            <Link className={styles.rowLink} to={`/admin/users/${row.userId}/detail`}>
                              {row.name || "—"}
                            </Link>
                          ) : (
                            row.name || "—"
                          )}
                        </p>
                        <p className={styles.mobileTenant}>{row.email ?? "—"}</p>
                        <div className={styles.mobileRow}>
                          <span className={styles.mobileLabel}>Toplam giriş</span>
                          <span className={styles.mobileValue}>{row.loginCount}</span>
                        </div>
                        <div className={styles.mobileRow}>
                          <span className={styles.mobileLabel}>Son giriş</span>
                          <span className={styles.mobileValue}>
                            {formatDateTr(row.lastLoginAt, true)}
                          </span>
                        </div>
                        <div className={styles.mobileRow}>
                          <span className={styles.mobileLabel}>Kayıtlı hesaplama</span>
                          <span className={styles.mobileValue}>{row.savedCalculationCount}</span>
                        </div>
                        <div className={styles.mobileRow}>
                          <span className={styles.mobileLabel}>Durum</span>
                          <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                        </div>
                      </MobileRecordCard>
                    );
                  })}
                </MobileCards>
              </section>

              <h2 className={shared.panelTitle}>Aktif demo lisansları</h2>
              <AdminTable
                rows={demosList}
                rowKey={(d) => d.licenseId ?? `demo-${d.userId ?? d.email ?? "unknown"}`}
                empty={<p className={styles.emptyText}>Aktif demo lisansı bulunamadı</p>}
                columns={[
                  {
                    key: "user",
                    header: "Kullanıcı",
                    render: (d) => (
                      <>
                        <div>{d.email ?? "—"}</div>
                        <div className={shared.muted}>Tenant: {d.tenantId ?? "—"}</div>
                      </>
                    ),
                  },
                  {
                    key: "status",
                    header: "Demo Durumu",
                    hideBelowMd: true,
                    render: (d) => {
                      const st = getDemoStatus(d);
                      return <StatusBadge tone={st.tone}>{st.label}</StatusBadge>;
                    },
                  },
                  {
                    key: "days",
                    header: "Kalan Gün",
                    render: (d) => (
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{d.remainingDays}</span>
                    ),
                  },
                  {
                    key: "login",
                    header: "Son Giriş",
                    hideOnMobile: true,
                    render: (d) => formatDateTr(d.lastLoginAt, true),
                  },
                  {
                    key: "calc",
                    header: "Kayıtlı hesaplama",
                    hideOnMobile: true,
                    render: (d) => (
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{d.calculationCount}</span>
                    ),
                  },
                  {
                    key: "activity",
                    header: "Son Aktivite",
                    hideBelowMd: true,
                    render: (d) => formatDateTr(getLastActivity(d), true),
                  },
                  {
                    key: "actions",
                    header: "Aksiyonlar",
                    render: (d) => renderDemoActions(d),
                  },
                ]}
              />

              <MobileCards>
                {demosList.map((d, index) => {
                  const st = getDemoStatus(d);
                  return (
                    <MobileRecordCard key={d.licenseId ?? `demo-m-${index}`} index={index}>
                      <p className={styles.mobileEmail}>{d.email ?? "—"}</p>
                      <p className={styles.mobileTenant}>Tenant: {d.tenantId ?? "—"}</p>
                      <div className={styles.mobileRow}>
                        <span className={styles.mobileLabel}>Durum</span>
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </div>
                      <div className={styles.mobileRow}>
                        <span className={styles.mobileLabel}>Kalan gün</span>
                        <span className={styles.mobileValue}>{d.remainingDays}</span>
                      </div>
                      <div className={styles.mobileRow}>
                        <span className={styles.mobileLabel}>Son giriş</span>
                        <span className={styles.mobileValue}>
                          {formatDateTr(d.lastLoginAt, true)}
                        </span>
                      </div>
                      <div className={styles.mobileRow}>
                        <span className={styles.mobileLabel}>Kayıtlı hesaplama</span>
                        <span className={styles.mobileValue}>{d.calculationCount}</span>
                      </div>
                      {renderDemoActions(d)}
                    </MobileRecordCard>
                  );
                })}
              </MobileCards>
            </>
          ) : null}

          {activeTab === "kullanim" ? (
            <>
              <section className={styles.usageSummary} aria-label="Hesaplama özeti">
                <StatCard
                  label="Son 7 gün hesaplama"
                  value={formatNumberTr(kullanimData?.totalCalculationsLast7Days ?? 0)}
                  icon={BarChart2}
                  tone="teal"
                  index={0}
                />
                <StatCard
                  label="Son 30 gün hesaplama"
                  value={formatNumberTr(kullanimData?.totalCalculationsLast30Days ?? 0)}
                  icon={TrendingUp}
                  tone="blue"
                  index={1}
                />
              </section>

              <div className={styles.usageColumns}>
                <section className={shared.panel}>
                  <h2 className={shared.panelTitle}>En çok kullanılan 5 modül</h2>
                  {(kullanimData?.top5Modules?.length ?? 0) > 0 ? (
                    <ol className={styles.rankList}>
                      {(kullanimData?.top5Modules ?? []).map((m, i) => (
                        <li key={`${m.name}-${i}`} className={styles.rankItem}>
                          <span className={styles.rankName}>
                            {i + 1}. {m.name}
                          </span>
                          <span className={styles.rankCount}>{formatNumberTr(m.count ?? 0)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className={styles.emptyText}>Veri yok</p>
                  )}
                </section>

                <section className={shared.panel}>
                  <h2 className={shared.panelTitle}>En aktif 5 kullanıcı</h2>
                  {(kullanimData?.top5Users?.length ?? 0) > 0 ? (
                    <ol className={styles.rankList}>
                      {(kullanimData?.top5Users ?? []).map((u, i) => (
                        <li key={`${u.userId ?? "x"}-${i}`} className={styles.rankItem}>
                          <span className={styles.rankName}>
                            {i + 1}. {u.email}
                          </span>
                          <span className={styles.rankCount}>{formatNumberTr(u.count ?? 0)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className={styles.emptyText}>Veri yok</p>
                  )}
                </section>
              </div>
            </>
          ) : null}

          {activeTab === "saglik" ? (
            <section className={shared.panel} aria-label="Sistem sağlığı">
              <div
                className={`${styles.healthBanner} ${
                  saglikData?.ok === false ? styles.healthBannerWarn : styles.healthBannerOk
                }`}
              >
                {saglikData?.ok === false ? (
                  <AlertTriangle size={28} strokeWidth={1.75} className={styles.healthBannerIcon} />
                ) : (
                  <CheckCircle2 size={28} strokeWidth={1.75} className={styles.healthBannerIcon} />
                )}
                <div>
                  <p className={styles.healthBannerTitle}>
                    {saglikData?.ok === false ? "Bağlantı sorunu" : "Sistem sağlığı normal"}
                  </p>
                  <p className={styles.healthBannerDesc}>
                    {saglikData?.ok === false
                      ? "API sağlık kontrolü başarısız"
                      : (saglikData?.status ?? "healthy")}
                  </p>
                </div>
              </div>

              <div className={styles.healthGrid}>
                <article className={styles.healthCard} style={{ animationDelay: "120ms" }}>
                  <p className={styles.healthCardLabel}>API durumu</p>
                  <p
                    className={`${styles.healthCardValue} ${
                      saglikData?.ok === false
                        ? styles.healthCardValueWarn
                        : styles.healthCardValueOk
                    }`}
                  >
                    {saglikData?.ok === false ? "Sorunlu" : "Normal"}
                  </p>
                </article>
                <article className={styles.healthCard} style={{ animationDelay: "160ms" }}>
                  <p className={styles.healthCardLabel}>DB bağlantı</p>
                  <p
                    className={`${styles.healthCardValue} ${
                      saglikData?.dbConnected
                        ? styles.healthCardValueOk
                        : styles.healthCardValueWarn
                    }`}
                  >
                    {saglikData?.dbConnected ? "Bağlı" : "Bağlı değil"}
                  </p>
                </article>
                <article className={styles.healthCard} style={{ animationDelay: "200ms" }}>
                  <p className={styles.healthCardLabel}>Son 24 saat hata</p>
                  <p className={styles.healthCardValue}>
                    {formatNumberTr(saglikData?.errorsLast24h ?? 0)}
                  </p>
                </article>
                <article className={styles.healthCard} style={{ animationDelay: "240ms" }}>
                  <p className={styles.healthCardLabel}>Ort. yanıt süresi</p>
                  <p className={styles.healthCardValue}>
                    {saglikData?.avgResponseMs != null
                      ? `${saglikData.avgResponseMs} ms`
                      : "Ölçülmüyor"}
                  </p>
                </article>
                <article className={styles.healthCard} style={{ animationDelay: "280ms" }}>
                  <p className={styles.healthCardLabel}>Son kontrol</p>
                  <p className={styles.healthCardValue}>
                    <Clock3 size={14} strokeWidth={1.75} aria-hidden style={{ marginRight: 4 }} />
                    {formatDateTr(saglikData?.timestamp, true)}
                  </p>
                </article>
              </div>
            </section>
          ) : null}

          {activeTab === "bakim" ? (
            <section className={shared.panel} aria-label="Sistem bakım modu">
              <h2 className={shared.panelTitle}>Sistem bakım modu</h2>
              <p className={shared.muted}>
                Bakım modu aktifken normal kullanıcılar bakım ekranı görür. Adminler etkilenmez.
              </p>

              <div className={styles.maintenanceForm}>
                <div className={styles.maintenanceToggle}>
                  <div className={styles.maintenanceToggleCopy}>
                    <p className={styles.maintenanceToggleTitle}>Bakım modu</p>
                    <p className={styles.maintenanceToggleHint}>
                      {bakimLocalActive ? "Açık" : "Kapalı"}
                      {bakimData?.endsAt
                        ? ` · Bitiş: ${formatDateTr(bakimData.endsAt, true)}`
                        : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={bakimLocalActive}
                    aria-label="Bakım modunu aç veya kapat"
                    className={`${styles.switch} ${bakimLocalActive ? styles.switchOn : ""}`}
                    onClick={() => setBakimLocalActive((v) => !v)}
                  >
                    <span className={styles.switchKnob} />
                  </button>
                </div>

                <FormField label="Kullanıcıya gösterilecek mesaj">
                  <textarea
                    value={bakimLocalMessage}
                    onChange={(e) => setBakimLocalMessage(e.target.value)}
                    rows={4}
                    placeholder="Bakım çalışması devam ediyor…"
                  />
                </FormField>

                <FormField label="Tahmini bitiş tarihi" hint="Opsiyonel">
                  <input
                    type="datetime-local"
                    value={bakimLocalEndsAt}
                    onChange={(e) => setBakimLocalEndsAt(e.target.value)}
                  />
                </FormField>

                <div>
                  <Button variant="primary" onClick={() => void saveBakim()} disabled={bakimSaving}>
                    {bakimSaving ? (
                      <>
                        <Loader2 size={15} strokeWidth={1.75} className={styles.spin} aria-hidden />
                        Kaydediliyor…
                      </>
                    ) : (
                      "Kaydet"
                    )}
                  </Button>
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={confirmAction?.type === "convert"}
        title="Yıllığa çevir"
        description={
          confirmAction?.type === "convert"
            ? `${confirmAction.email ?? "Bu kullanıcı"} için demo lisans yıllığa çevrilsin mi?`
            : ""
        }
        confirmLabel="Devam"
        loading={confirmLoading}
        onConfirm={() =>
          confirmAction?.type === "convert" && void handleConvertDemo(confirmAction.userId)
        }
        onCancel={() => !confirmLoading && setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction?.type === "deactivate"}
        title="Pasife al"
        description={
          confirmAction?.type === "deactivate"
            ? `${confirmAction.email ?? "Bu lisans"} pasife alınacak. Emin misiniz?`
            : ""
        }
        confirmLabel="Pasife Al"
        danger
        loading={confirmLoading}
        onConfirm={() =>
          confirmAction?.type === "deactivate" &&
          void handleDeactivateLicense(confirmAction.licenseId)
        }
        onCancel={() => !confirmLoading && setConfirmAction(null)}
      />
    </div>
  );
}
