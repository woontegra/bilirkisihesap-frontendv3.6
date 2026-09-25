import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  Inbox,
  RefreshCw,
  Search,
  History,
  User,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { API_BASE_URL, apiClient } from "@/api/client";
import { getAccessToken, getSessionTenantId } from "@/auth/session";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { FilterBar } from "@/components/admin/FilterBar";
import { FormField } from "@/components/admin/FormField";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatDateTr, formatNumberTr } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./DeviceLoginAnalyticsPage.module.css";

type DistItem = { key: string; label: string; count: number; percent: number };

type SummaryResponse = {
  totals: {
    totalUsers: number;
    loggedInUsers: number;
    neverLoggedInUsers: number;
    periodLoginCount: number;
    mobileFirstLogin: number;
    desktopFirstLogin: number;
    tabletFirstLogin: number;
    unknownFirstLogin: number;
  };
  rates: {
    neverLoggedInPercent: number;
    neverLoggedInDenominator: number;
    mobileFirstPercent: number;
    desktopFirstPercent: number;
    tabletFirstPercent: number;
    unknownFirstPercent: number;
    firstLoginDenominator: number;
    mobileEventPercent: number;
    desktopEventPercent: number;
    tabletEventPercent: number;
    unknownEventPercent: number;
    eventDenominator: number;
  };
  userBased: {
    note: string;
    device: DistItem[];
    operatingSystem: DistItem[];
    browser: DistItem[];
    denominator: number;
  };
  eventBased: {
    note: string;
    device: DistItem[];
    operatingSystem: DistItem[];
    browser: DistItem[];
    denominator: number;
  };
  disclaimer: string;
};

type UserRow = {
  userId: number;
  name: string;
  email: string;
  tenantName: string | null;
  status: string;
  statusLabel: string;
  demoStartsAt: string | null;
  demoExpiresAt: string | null;
  firstLoginAt: string | null;
  firstDeviceLabel: string;
  lastLoginAt: string | null;
  lastDeviceLabel: string;
  loginCount: number;
  usedDevices: Array<{ label: string; deviceCategory: string }>;
  lastCalculationAt: string | null;
  hasLoggedIn: boolean;
};

type LoginRow = {
  id: number;
  createdAt: string | null;
  deviceCategory: string;
  deviceLabel: string;
  operatingSystem: string;
  browser: string;
  browserVersion: string | null;
  ip: string | null;
  userAgent: string | null;
};

type Filters = {
  from: string;
  to: string;
  userType: string;
  device: string;
  os: string;
  browser: string;
  loginStatus: string;
  search: string;
  sort: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: Filters = {
  from: "2026-02-01",
  to: todayIsoDate(),
  userType: "demo",
  device: "all",
  os: "all",
  browser: "all",
  loginStatus: "all",
  search: "",
  sort: "last_login_desc",
};

function buildQuery(filters: Filters, extra?: Record<string, string | number>) {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  params.set("userType", filters.userType);
  params.set("device", filters.device);
  params.set("os", filters.os);
  params.set("browser", filters.browser);
  params.set("loginStatus", filters.loginStatus);
  params.set("sort", filters.sort);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  }
  return params.toString();
}

function RatioBars({
  title,
  note,
  items,
  denominatorLabel,
}: {
  title: string;
  note: string;
  items: DistItem[];
  denominatorLabel: string;
}) {
  return (
    <section className={styles.chartPanel}>
      <h3 className={styles.panelTitle}>{title}</h3>
      <p className={styles.panelNote}>{note}</p>
      <p className={styles.panelDenom}>{denominatorLabel}</p>
      <ul className={styles.barList}>
        {items.map((item) => (
          <li key={item.key}>
            <div className={styles.barMeta}>
              <span>{item.label}</span>
              <span>
                {formatNumberTr(item.count)} · %{String(item.percent).replace(".", ",")}
              </span>
            </div>
            <div className={styles.barTrack} aria-hidden>
              <div className={styles.barFill} style={{ width: `${Math.min(100, item.percent)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function DeviceLoginAnalyticsPage() {
  const { error: toastError, success: toastSuccess } = useToast();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailUser, setDetailUser] = useState<UserRow | null>(null);
  const [logins, setLogins] = useState<LoginRow[]>([]);
  const [loginPage, setLoginPage] = useState(1);
  const [loginTotalPages, setLoginTotalPages] = useState(1);
  const [loginTotal, setLoginTotal] = useState(0);
  const [loginLoading, setLoginLoading] = useState(false);
  const [showRawUa, setShowRawUa] = useState<Record<number, boolean>>({});
  const [exporting, setExporting] = useState(false);

  const loadAll = useCallback(async (f: Filters, p: number, pageSize: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery(f, { page: p, limit: pageSize });
      const [sum, list] = await Promise.all([
        apiClient<SummaryResponse>(`/api/admin/device-login-analytics/summary?${buildQuery(f)}`, {
          adminRole: true,
        }),
        apiClient<{
          data: UserRow[];
          pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(`/api/admin/device-login-analytics/users?${qs}`, { adminRole: true }),
      ]);
      setSummary(sum);
      setUsers(list.data || []);
      setPage(list.pagination.page);
      setTotal(list.pagination.total);
      setTotalPages(list.pagination.totalPages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Veriler yüklenemedi";
      setError(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    void loadAll(applied, page, limit);
  }, [applied, page, limit, loadAll]);

  const openLogins = async (user: UserRow, p = 1) => {
    setDetailUser(user);
    setLoginPage(p);
    setLoginLoading(true);
    setShowRawUa({});
    try {
      const qs = new URLSearchParams({
        page: String(p),
        limit: "25",
        from: applied.from,
        to: applied.to,
      });
      const res = await apiClient<{
        data: LoginRow[];
        pagination: { page: number; total: number; totalPages: number };
      }>(`/api/admin/device-login-analytics/users/${user.userId}/logins?${qs}`, {
        adminRole: true,
      });
      setLogins(res.data || []);
      setLoginPage(res.pagination.page);
      setLoginTotal(res.pagination.total);
      setLoginTotalPages(res.pagination.totalPages);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Giriş geçmişi yüklenemedi");
    } finally {
      setLoginLoading(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const token = getAccessToken();
      const tenantId = getSessionTenantId();
      const qs = buildQuery(applied);
      const headers: Record<string, string> = {
        Authorization: token ? `Bearer ${token}` : "",
        "x-user-role": "admin",
      };
      if (tenantId != null) headers["X-Tenant-Id"] = String(tenantId);
      const res = await fetch(`${API_BASE_URL}/api/admin/device-login-analytics/export?${qs}`, {
        headers,
      });
      if (!res.ok) throw new Error("CSV indirilemedi");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cihaz-giris-analizi-${todayIsoDate()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess("CSV indirildi");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "CSV indirilemedi");
    } finally {
      setExporting(false);
    }
  };

  const applyFilters = () => {
    setPage(1);
    setApplied({ ...filters });
  };

  const clearFilters = () => {
    const next = { ...DEFAULT_FILTERS, to: todayIsoDate() };
    setFilters(next);
    setPage(1);
    setApplied(next);
  };

  const t = summary?.totals;
  const r = summary?.rates;

  const firstDenomHint = useMemo(() => {
    if (!r) return "";
    return `İlk giriş yapan ${formatNumberTr(r.firstLoginDenominator)} kullanıcı içinde`;
  }, [r]);

  const eventDenomHint = useMemo(() => {
    if (!r) return "";
    return `Seçili dönemdeki ${formatNumberTr(r.eventDenominator)} giriş hareketi içinde`;
  }, [r]);

  return (
    <div className={shared.page}>
      <PageHeader
        title="Cihaz ve Giriş Analizi"
        description="Demo ve lisanslı kullanıcıların programa hangi cihazlardan, ne zaman ve kaç kez giriş yaptığını inceleyin."
        actions={
          <>
            <Button variant="soft" size="sm" onClick={() => void loadAll(applied, page, limit)}>
              <RefreshCw size={14} /> Yenile
            </Button>
            <Button variant="soft" size="sm" disabled={exporting} onClick={() => void exportCsv()}>
              <Download size={14} /> CSV indir
            </Button>
          </>
        }
      />

      <p className={styles.disclaimer}>
        User-Agent sınıflandırması sezgiseldir; iPadOS bazı durumlarda masaüstü UA gönderebilir.
        Sonuçlar yüzde yüz kesin değildir. Website demo talep cihazı ayrı veritabanındadır ve bu
        ekranda gösterilmez.
      </p>

      <FilterBar>
        <form
          className={styles.filtersToolbar}
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters();
          }}
        >
          <div className={styles.filterRowPrimary}>
            <FormField label="Başlangıç">
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              />
            </FormField>
            <FormField label="Bitiş">
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              />
            </FormField>
            <FormField label="Kullanıcı türü">
              <select
                value={filters.userType}
                onChange={(e) => setFilters((f) => ({ ...f, userType: e.target.value }))}
              >
                <option value="all">Tümü</option>
                <option value="demo">Demo</option>
                <option value="licensed">Lisanslı</option>
                <option value="expired">Süresi dolmuş</option>
              </select>
            </FormField>
            <FormField label="Giriş durumu">
              <select
                value={filters.loginStatus}
                onChange={(e) => setFilters((f) => ({ ...f, loginStatus: e.target.value }))}
              >
                <option value="all">Tümü</option>
                <option value="logged_in">Giriş yapanlar</option>
                <option value="never">Hiç giriş yapmayanlar</option>
              </select>
            </FormField>
            <FormField label="Cihaz">
              <select
                value={filters.device}
                onChange={(e) => setFilters((f) => ({ ...f, device: e.target.value }))}
              >
                <option value="all">Tümü</option>
                <option value="MOBILE">Mobil</option>
                <option value="DESKTOP">Masaüstü</option>
                <option value="TABLET">Tablet</option>
                <option value="UNKNOWN">Bilinmeyen</option>
              </select>
            </FormField>
            <FormField label="İşletim sistemi">
              <select
                value={filters.os}
                onChange={(e) => setFilters((f) => ({ ...f, os: e.target.value }))}
              >
                <option value="all">Tümü</option>
                <option value="Windows">Windows</option>
                <option value="Android">Android</option>
                <option value="iOS">iOS</option>
                <option value="macOS">macOS</option>
                <option value="Linux">Linux</option>
                <option value="Other">Diğer/Bilinmeyen</option>
              </select>
            </FormField>
            <FormField label="Tarayıcı">
              <select
                value={filters.browser}
                onChange={(e) => setFilters((f) => ({ ...f, browser: e.target.value }))}
              >
                <option value="all">Tümü</option>
                <option value="Chrome">Chrome</option>
                <option value="Edge">Edge</option>
                <option value="Safari">Safari</option>
                <option value="Firefox">Firefox</option>
                <option value="Samsung Internet">Samsung Internet</option>
                <option value="Opera">Opera</option>
                <option value="Other">Diğer/Bilinmeyen</option>
              </select>
            </FormField>
            <FormField label="Sıralama">
              <select
                value={filters.sort}
                onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
              >
                <option value="last_login_desc">En son giriş yapan</option>
                <option value="last_login_asc">En eski giriş yapan</option>
                <option value="login_count_desc">En çok giriş yapan</option>
                <option value="login_count_asc">En az giriş yapan</option>
                <option value="never_first">Hiç giriş yapmayan</option>
                <option value="demo_newest">En yeni demo</option>
                <option value="demo_oldest">En eski demo</option>
              </select>
            </FormField>
          </div>

          <div className={styles.filterRowSecondary}>
            <FormField label="Ara" className={styles.searchField}>
              <div className={styles.searchWrap}>
                <Search size={16} className={styles.searchIcon} aria-hidden />
                <input
                  value={filters.search}
                  placeholder="Ad, e-posta veya büro ara"
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                />
              </div>
            </FormField>
            <div className={styles.filterActions}>
              <Button type="button" variant="soft" size="md" onClick={clearFilters}>
                Filtreleri temizle
              </Button>
              <Button type="submit" variant="primary" size="md">
                Uygula
              </Button>
            </div>
          </div>
        </form>
      </FilterBar>

      {loading ? <AdminSkeleton rows={6} cards={8} /> : null}

      {!loading && error ? (
        <StatePanel
          icon={AlertTriangle}
          tone="danger"
          title="Veriler yüklenemedi"
          description={error}
          actionLabel="Tekrar dene"
          onAction={() => void loadAll(applied, page, limit)}
        />
      ) : null}

      {!loading && !error && summary && t && r ? (
        <>
          <div className={`${shared.stats} ${styles.statsWide}`}>
            <StatCard label="Toplam kullanıcı" value={formatNumberTr(t.totalUsers)} index={0} />
            <StatCard
              label="En az bir kez giriş yapan"
              value={formatNumberTr(t.loggedInUsers)}
              index={1}
            />
            <StatCard
              label="Hiç giriş yapmayan"
              value={formatNumberTr(t.neverLoggedInUsers)}
              hint={`Toplam ${formatNumberTr(r.neverLoggedInDenominator)} kullanıcı içinde %${String(r.neverLoggedInPercent).replace(".", ",")}`}
              index={2}
            />
            <StatCard
              label="Mobil ilk giriş"
              value={formatNumberTr(t.mobileFirstLogin)}
              hint={`${firstDenomHint} mobil oranı: %${String(r.mobileFirstPercent).replace(".", ",")}`}
              index={3}
            />
            <StatCard
              label="Masaüstü ilk giriş"
              value={formatNumberTr(t.desktopFirstLogin)}
              hint={`${firstDenomHint} masaüstü oranı: %${String(r.desktopFirstPercent).replace(".", ",")}`}
              index={4}
            />
            <StatCard
              label="Tablet ilk giriş"
              value={formatNumberTr(t.tabletFirstLogin)}
              hint={`${firstDenomHint} tablet oranı: %${String(r.tabletFirstPercent).replace(".", ",")}`}
              index={5}
            />
            <StatCard
              label="Bilinmeyen cihaz"
              value={formatNumberTr(t.unknownFirstLogin)}
              hint={`${firstDenomHint} bilinmeyen: %${String(r.unknownFirstPercent).replace(".", ",")}`}
              index={6}
            />
            <StatCard
              label="Dönem giriş hareketi"
              value={formatNumberTr(t.periodLoginCount)}
              hint={`${eventDenomHint} mobil: %${String(r.mobileEventPercent).replace(".", ",")}`}
              index={7}
            />
          </div>

          <div className={styles.chartsGrid}>
            <RatioBars
              title="A) Kullanıcı bazlı cihaz dağılımı"
              note={summary.userBased.note}
              items={summary.userBased.device}
              denominatorLabel={`Payda: ilk giriş yapan ${formatNumberTr(summary.userBased.denominator)} kullanıcı`}
            />
            <RatioBars
              title="B) Giriş hareketi bazlı cihaz dağılımı"
              note={summary.eventBased.note}
              items={summary.eventBased.device}
              denominatorLabel={`Payda: seçili dönemde ${formatNumberTr(summary.eventBased.denominator)} giriş`}
            />
            <RatioBars
              title="İşletim sistemi (kullanıcı — ilk giriş)"
              note="İlk giriş OS’ine göre."
              items={summary.userBased.operatingSystem}
              denominatorLabel={`Payda: ${formatNumberTr(summary.userBased.denominator)}`}
            />
            <RatioBars
              title="Tarayıcı (kullanıcı — ilk giriş)"
              note="İlk giriş tarayıcısına göre."
              items={summary.userBased.browser}
              denominatorLabel={`Payda: ${formatNumberTr(summary.userBased.denominator)}`}
            />
          </div>

          <section className={styles.tablePanel}>
            <div className={styles.tableHead}>
              <h3 className={styles.panelTitle}>Kullanıcı özeti</h3>
              <label className={styles.limitSelect}>
                Sayfa boyutu
                <select
                  value={limit}
                  onChange={(e) => {
                    setPage(1);
                    setLimit(Number(e.target.value));
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>

            {users.length === 0 ? (
              <StatePanel
                icon={Inbox}
                tone="neutral"
                title="Kayıt bulunamadı"
                description="Seçili filtrelerle eşleşen kullanıcı yok."
              />
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Kullanıcı</th>
                        <th>Büro</th>
                        <th>Statü</th>
                        <th>Demo süre</th>
                        <th>İlk giriş</th>
                        <th>Son giriş</th>
                        <th>Toplam</th>
                        <th>Cihazlar</th>
                        <th>Son hesaplama</th>
                        <th className={styles.actionsCol}>İşlemler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.userId}>
                          <td>
                            <div className={styles.userCell}>
                              <strong title={u.name}>{u.name}</strong>
                              <span title={u.email}>{u.email}</span>
                            </div>
                          </td>
                          <td title={u.tenantName || undefined}>{u.tenantName || "—"}</td>
                          <td>{u.statusLabel}</td>
                          <td>
                            {u.demoStartsAt || u.demoExpiresAt
                              ? `${formatDateTr(u.demoStartsAt)} → ${formatDateTr(u.demoExpiresAt)}`
                              : "—"}
                          </td>
                          <td>
                            {u.hasLoggedIn ? (
                              <>
                                <div>{formatDateTr(u.firstLoginAt, true)}</div>
                                <div className={styles.muted}>{u.firstDeviceLabel}</div>
                              </>
                            ) : (
                              <>
                                <div>Giriş yapmadı</div>
                                <div className={styles.muted}>Bilinmiyor</div>
                              </>
                            )}
                          </td>
                          <td>
                            {u.hasLoggedIn ? (
                              <>
                                <div>{formatDateTr(u.lastLoginAt, true)}</div>
                                <div className={styles.muted}>{u.lastDeviceLabel}</div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{u.loginCount}</td>
                          <td className={styles.devicesCol}>
                            <div className={styles.tags}>
                              {(u.usedDevices || []).length === 0 ? (
                                <span className={styles.tag}>Bilinmiyor</span>
                              ) : (
                                u.usedDevices.map((d) => (
                                  <span key={d.label} className={styles.tag} title={d.label}>
                                    {d.label}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className={styles.lastCalcCol}>
                            {formatDateTr(u.lastCalculationAt, true)}
                          </td>
                          <td className={styles.actionsCol}>
                            <div className={styles.rowActions}>
                              <Button
                                size="sm"
                                variant="soft"
                                className={styles.actionBtn}
                                onClick={() => void openLogins(u)}
                                disabled={!u.hasLoggedIn}
                              >
                                <History size={14} aria-hidden />
                                <span>Giriş geçmişi</span>
                              </Button>
                              <Link
                                className={styles.actionLink}
                                to={`/admin/users/${u.userId}/detail`}
                              >
                                <User size={14} aria-hidden />
                                <span>Kullanıcı detayı</span>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={styles.mobileList}>
                  {users.map((u) => (
                    <article key={u.userId} className={styles.mobileCard}>
                      <strong title={u.name}>{u.name}</strong>
                      <p title={u.email}>{u.email}</p>
                      <p>
                        {u.statusLabel} · Giriş: {u.loginCount}
                      </p>
                      <p className={styles.muted}>
                        {u.hasLoggedIn
                          ? `İlk: ${u.firstDeviceLabel} · Son: ${u.lastDeviceLabel}`
                          : "Giriş yapmadı · Bilinmiyor"}
                      </p>
                      <div className={styles.mobileActions}>
                        <Button
                          size="sm"
                          variant="soft"
                          className={styles.actionBtn}
                          onClick={() => void openLogins(u)}
                          disabled={!u.hasLoggedIn}
                        >
                          <History size={14} aria-hidden />
                          <span>Giriş geçmişi</span>
                        </Button>
                        <Link
                          className={styles.actionLink}
                          to={`/admin/users/${u.userId}/detail`}
                        >
                          <User size={14} aria-hidden />
                          <span>Kullanıcı detayı</span>
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>

                <div className={shared.pagination}>
                  <span className={shared.muted}>
                    {formatNumberTr(total)} kullanıcı · Sayfa {page}/{totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Önceki
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Sonraki
                  </Button>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}

      {detailUser ? (
        <div className={styles.drawerOverlay} role="presentation" onClick={() => setDetailUser(null)}>
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Giriş geçmişi"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.drawerHead}>
              <div>
                <h3>{detailUser.name}</h3>
                <p className={styles.muted}>{detailUser.email}</p>
              </div>
              <button type="button" className={styles.iconBtn} onClick={() => setDetailUser(null)}>
                <X size={18} />
              </button>
            </div>
            {loginLoading ? <AdminSkeleton rows={4} cards={0} /> : null}
            {!loginLoading && logins.length === 0 ? (
              <p className={styles.muted}>Seçili dönemde giriş kaydı yok.</p>
            ) : null}
            {!loginLoading && logins.length > 0 ? (
              <ul className={styles.loginList}>
                {logins.map((row) => (
                  <li key={row.id}>
                    <div className={styles.loginMain}>
                      <strong>{formatDateTr(row.createdAt, true)}</strong>
                      <span>
                        {row.deviceLabel} · {row.operatingSystem} · {row.browser}
                        {row.browserVersion ? ` ${row.browserVersion}` : ""}
                      </span>
                      {row.ip ? <span className={styles.muted}>IP: {row.ip}</span> : null}
                    </div>
                    <button
                      type="button"
                      className={styles.uaToggle}
                      onClick={() =>
                        setShowRawUa((m) => ({ ...m, [row.id]: !m[row.id] }))
                      }
                    >
                      {showRawUa[row.id] ? "Teknik ayrıntıyı gizle" : "Teknik ayrıntıyı göster"}
                    </button>
                    {showRawUa[row.id] ? (
                      <pre className={styles.uaRaw}>{row.userAgent || "—"}</pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={shared.pagination}>
              <span className={shared.muted}>
                {formatNumberTr(loginTotal)} kayıt · {loginPage}/{loginTotalPages}
              </span>
              <Button
                size="sm"
                variant="soft"
                disabled={loginPage <= 1 || loginLoading}
                onClick={() => detailUser && void openLogins(detailUser, loginPage - 1)}
              >
                Önceki
              </Button>
              <Button
                size="sm"
                variant="soft"
                disabled={loginPage >= loginTotalPages || loginLoading}
                onClick={() => detailUser && void openLogins(detailUser, loginPage + 1)}
              >
                Sonraki
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
