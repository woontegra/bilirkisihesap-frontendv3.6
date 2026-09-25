import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Download,
  Filter,
  Inbox,
  RefreshCw,
  Search,
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
import styles from "../device-login-analytics/DeviceLoginAnalyticsPage.module.css";

type FunnelStep = {
  key: string;
  label: string;
  count: number | null;
  conversionFromPreviousPercent: number | null;
  conversionFromFirstPercent: number | null;
  dropFromPrevious: number | null;
  available: boolean;
};

type Summary = {
  dataAvailability: {
    historicalNote: string;
    detailedNote: string;
    eventsReady: boolean;
    savedDoesNotMeanOnlyCalc: string;
  };
  totals: {
    totalUsers: number;
    loggedInUsers: number;
    neverLoggedInUsers: number;
    onlyOneLoginUsers: number;
    multiLoginUsers: number;
    returnedOtherDayUsers: number;
    sameDayMultiLoginUsers: number;
    savedUsers: number;
    noSavedUsers: number;
    averageLoginCount: number;
    medianLoginCount: number;
    averageDistinctDays: number;
    avgHoursLoginToFirstSave: number | null;
  };
  funnel: FunnelStep[];
  guide: {
    started: number;
    completed: number;
    abandoned: number;
    startedCompletionRate: number;
    noGuideCompletionRate: number;
    startedPreviewRate: number;
    noGuidePreviewRate: number;
    lowSample: boolean;
  };
  historicalSavedModules: Array<{ type: string; count: number }>;
  retention: {
    note: string;
    neverReturnedAfterFirst: number;
    sameDayMultiLogin: number;
    returnedOtherDay: number;
    returnedWithin1Day: number;
    returnedWithin3Days: number;
    returnedWithin7Days: number;
    averageDistinctDays: number;
    averageFirstLastSpanHours: number | null;
  };
  modules?: Array<{
    moduleKey: string;
    viewedUsers: number;
    startedUsers: number;
    completedUsers: number;
    previewUsers: number;
    savedUsers: number;
    startToCompletePercent: number | null;
    completeToPreviewPercent: number | null;
    guideStartedUsers: number;
    guideCompletedUsers: number;
  }>;
};

type UserRow = {
  userId: number;
  name: string;
  email: string;
  tenantName: string | null;
  statusLabel: string;
  demoStartsAt: string | null;
  demoExpiresAt: string | null;
  firstLoginAt: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  distinctDays: number;
  firstDeviceLabel: string;
  firstModule: string | null;
  modulesStartedCount: number | null;
  modulesCompletedCount: number | null;
  previewCount: number | null;
  savedCount: number;
  guideStarted: boolean | null;
  guideCompleted: boolean | null;
  lastStage: string;
  eventsAvailable: boolean;
};

type Filters = {
  from: string;
  to: string;
  userType: string;
  device: string;
  os: string;
  browser: string;
  moduleKey: string;
  search: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT: Filters = {
  from: "2026-02-01",
  to: today(),
  userType: "demo",
  device: "all",
  os: "all",
  browser: "all",
  moduleKey: "all",
  search: "",
};

function qs(f: Filters, extra?: Record<string, string | number>) {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (v && v !== "all") p.set(k, v);
    else if (k === "from" || k === "to" || k === "userType") p.set(k, v);
  });
  if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, String(v)));
  return p.toString();
}

function pct(n: number | null | undefined) {
  if (n == null) return "—";
  return `%${String(n).replace(".", ",")}`;
}

export default function DemoUsageFunnelPage() {
  const { error: toastError, success: toastSuccess } = useToast();
  const [filters, setFilters] = useState<Filters>(DEFAULT);
  const [applied, setApplied] = useState<Filters>(DEFAULT);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timelineUser, setTimelineUser] = useState<UserRow | null>(null);
  const [timeline, setTimeline] = useState<
    Array<{ at: string | null; kind: string; label: string; moduleKey: string | null }>
  >([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [modules, setModules] = useState<
    Array<{
      moduleKey: string;
      viewedUsers: number;
      startedUsers: number;
      completedUsers: number;
      previewUsers: number;
      savedUsers: number;
      startToCompletePercent: number | null;
      completeToPreviewPercent: number | null;
      guideStartedUsers: number;
      guideCompletedUsers: number;
    }>
  >([]);

  const load = useCallback(
    async (f: Filters, p: number, pageSize: number) => {
      setLoading(true);
      setError(null);
      try {
        const [sum, list, mod] = await Promise.all([
          apiClient<Summary>(`/api/admin/demo-usage-funnel/summary?${qs(f)}`, {
            adminRole: true,
          }),
          apiClient<{
            data: UserRow[];
            pagination: { page: number; total: number; totalPages: number };
          }>(`/api/admin/demo-usage-funnel/users?${qs(f, { page: p, limit: pageSize })}`, {
            adminRole: true,
          }),
          apiClient<{
            detailed: Array<{
              moduleKey: string;
              viewedUsers: number;
              startedUsers: number;
              completedUsers: number;
              previewUsers: number;
              savedUsers: number;
              startToCompletePercent: number | null;
              completeToPreviewPercent: number | null;
              guideStartedUsers: number;
              guideCompletedUsers: number;
            }>;
          }>(`/api/admin/demo-usage-funnel/modules?${qs(f)}`, { adminRole: true }).catch(() => ({
            detailed: [],
          })),
        ]);
        setSummary(sum);
        setUsers(list.data || []);
        setModules(mod.detailed || []);
        setPage(list.pagination.page);
        setTotal(list.pagination.total);
        setTotalPages(list.pagination.totalPages);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Yüklenemedi";
        setError(msg);
        toastError(msg);
      } finally {
        setLoading(false);
      }
    },
    [toastError],
  );

  useEffect(() => {
    void load(applied, page, limit);
  }, [applied, page, limit, load]);

  const openTimeline = async (u: UserRow) => {
    setTimelineUser(u);
    setTimelineLoading(true);
    try {
      const res = await apiClient<{
        data: Array<{ at: string | null; kind: string; label: string; moduleKey: string | null }>;
      }>(
        `/api/admin/demo-usage-funnel/users/${u.userId}/timeline?${qs(applied, { page: 1, limit: 50 })}`,
        { adminRole: true },
      );
      setTimeline(res.data || []);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Zaman çizelgesi yüklenemedi");
    } finally {
      setTimelineLoading(false);
    }
  };

  const exportCsv = async () => {
    try {
      const token = getAccessToken();
      const tenantId = getSessionTenantId();
      const headers: Record<string, string> = {
        Authorization: token ? `Bearer ${token}` : "",
        "x-user-role": "admin",
      };
      if (tenantId != null) headers["X-Tenant-Id"] = String(tenantId);
      const res = await fetch(`${API_BASE_URL}/api/admin/demo-usage-funnel/export?${qs(applied)}`, {
        headers,
      });
      if (!res.ok) throw new Error("CSV indirilemedi");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `demo-kullanim-hunisi-${today()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess("CSV indirildi");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "CSV indirilemedi");
    }
  };

  const t = summary?.totals;

  return (
    <div className={shared.page}>
      <PageHeader
        title="Demo Kullanım Hunisi"
        description="Demo kullanıcılarının girişten hesaplama ve önizlemeye kadar hangi aşamada kaldığını inceleyin."
        actions={
          <>
            <Button variant="soft" size="sm" onClick={() => void load(applied, page, limit)}>
              <RefreshCw size={14} /> Yenile
            </Button>
            <Button variant="soft" size="sm" onClick={() => void exportCsv()}>
              <Download size={14} /> CSV indir
            </Button>
          </>
        }
      />

      {summary ? (
        <div className={styles.disclaimer}>
          <p>{summary.dataAvailability.historicalNote}</p>
          <p>{summary.dataAvailability.detailedNote}</p>
          <p>{summary.dataAvailability.savedDoesNotMeanOnlyCalc}</p>
          <p>{summary.retention.note}</p>
        </div>
      ) : null}

      <FilterBar>
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
        <FormField label="Statü">
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
            <option value="macOS">macOS</option>
            <option value="Android">Android</option>
            <option value="iOS">iOS</option>
            <option value="Linux">Linux</option>
            <option value="UNKNOWN">Bilinmeyen</option>
          </select>
        </FormField>
        <FormField label="Tarayıcı">
          <select
            value={filters.browser}
            onChange={(e) => setFilters((f) => ({ ...f, browser: e.target.value }))}
          >
            <option value="all">Tümü</option>
            <option value="Chrome">Chrome</option>
            <option value="Safari">Safari</option>
            <option value="Firefox">Firefox</option>
            <option value="Edge">Edge</option>
            <option value="UNKNOWN">Bilinmeyen</option>
          </select>
        </FormField>
        <FormField label="Modül">
          <select
            value={filters.moduleKey}
            onChange={(e) => setFilters((f) => ({ ...f, moduleKey: e.target.value }))}
          >
            <option value="all">Tümü</option>
            <option value="kidem_30isci">Kıdem — İş Kanunu</option>
          </select>
        </FormField>
        <FormField label="Ara">
          <div className={styles.searchWrap}>
            <Search size={14} />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Ad, e-posta, büro"
            />
          </div>
        </FormField>
        <div className={styles.filterActions}>
          <Button
            size="sm"
            onClick={() => {
              setPage(1);
              setApplied({ ...filters });
            }}
          >
            <Filter size={14} /> Uygula
          </Button>
          <Button
            variant="soft"
            size="sm"
            onClick={() => {
              const next = { ...DEFAULT, to: today() };
              setFilters(next);
              setPage(1);
              setApplied(next);
            }}
          >
            Filtreleri temizle
          </Button>
        </div>
      </FilterBar>

      {loading ? <AdminSkeleton rows={5} cards={8} /> : null}
      {!loading && error ? (
        <StatePanel
          icon={AlertTriangle}
          tone="danger"
          title="Yüklenemedi"
          description={error}
          actionLabel="Tekrar dene"
          onAction={() => void load(applied, page, limit)}
        />
      ) : null}

      {!loading && !error && summary && t ? (
        <>
          <div className={`${shared.stats} ${styles.statsWide}`}>
            <StatCard label="Toplam kullanıcı" value={formatNumberTr(t.totalUsers)} index={0} />
            <StatCard label="Giriş yapan" value={formatNumberTr(t.loggedInUsers)} index={1} />
            <StatCard label="Hiç giriş yapmayan" value={formatNumberTr(t.neverLoggedInUsers)} index={2} />
            <StatCard label="Tek giriş" value={formatNumberTr(t.onlyOneLoginUsers)} index={3} />
            <StatCard label="Birden fazla giriş" value={formatNumberTr(t.multiLoginUsers)} index={4} />
            <StatCard
              label="Farklı gün geri dönen"
              value={formatNumberTr(t.returnedOtherDayUsers)}
              index={5}
            />
            <StatCard label="Hesaplama kaydeden" value={formatNumberTr(t.savedUsers)} index={6} />
            <StatCard
              label="Kayıt bulunmayan"
              value={formatNumberTr(t.noSavedUsers)}
              hint="Hesaplama yapmadı anlamına gelmez"
              index={7}
            />
            <StatCard label="Ort. giriş" value={String(t.averageLoginCount)} index={8} />
            <StatCard label="Medyan giriş" value={String(t.medianLoginCount)} index={9} />
            <StatCard label="Ort. farklı gün" value={String(t.averageDistinctDays)} index={10} />
            <StatCard
              label="Ort. giriş→kayıt (saat)"
              value={t.avgHoursLoginToFirstSave == null ? "—" : String(t.avgHoursLoginToFirstSave)}
              index={11}
            />
          </div>

          <section className={styles.chartPanel}>
            <h3 className={styles.panelTitle}>Tekrar kullanım (retention)</h3>
            <p className={styles.panelNote}>{summary.retention.note}</p>
            <div className={`${shared.stats} ${styles.statsWide}`}>
              <StatCard
                label="İlk giriş sonrası dönmeyen"
                value={formatNumberTr(summary.retention.neverReturnedAfterFirst)}
                index={0}
              />
              <StatCard
                label="Aynı gün çok giriş"
                value={formatNumberTr(summary.retention.sameDayMultiLogin)}
                index={1}
              />
              <StatCard
                label="Farklı gün geri dönen"
                value={formatNumberTr(summary.retention.returnedOtherDay)}
                index={2}
              />
              <StatCard
                label="1 gün içinde"
                value={formatNumberTr(summary.retention.returnedWithin1Day)}
                index={3}
              />
              <StatCard
                label="3 gün içinde"
                value={formatNumberTr(summary.retention.returnedWithin3Days)}
                index={4}
              />
              <StatCard
                label="7 gün içinde"
                value={formatNumberTr(summary.retention.returnedWithin7Days)}
                index={5}
              />
              <StatCard
                label="Ort. farklı gün"
                value={String(summary.retention.averageDistinctDays)}
                index={6}
              />
              <StatCard
                label="Ort. ilk→son giriş (saat)"
                value={
                  summary.retention.averageFirstLastSpanHours == null
                    ? "—"
                    : String(summary.retention.averageFirstLastSpanHours)
                }
                index={7}
              />
            </div>
          </section>

          <section className={styles.chartPanel}>
            <h3 className={styles.panelTitle}>Kullanım hunisi</h3>
            <p className={styles.panelNote}>
              Her aşamada benzersiz kullanıcı sayılır. Ayrıntılı aşamalar yalnızca event tablosu
              hazırsa dolar.
            </p>
            <ul className={styles.barList}>
              {summary.funnel.map((step) => (
                <li key={step.key}>
                  <div className={styles.barMeta}>
                    <span>{step.label}</span>
                    <span>
                      {step.available ? formatNumberTr(step.count || 0) : "Takip öncesi"}
                      {step.conversionFromFirstPercent != null
                        ? ` · ilk aşamaya ${pct(step.conversionFromFirstPercent)}`
                        : ""}
                      {step.dropFromPrevious != null
                        ? ` · kayıp ${formatNumberTr(step.dropFromPrevious)}`
                        : ""}
                    </span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${Math.min(100, step.conversionFromFirstPercent ?? 0)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.chartPanel}>
            <h3 className={styles.panelTitle}>Kıdem kılavuzu etkisi</h3>
            {summary.guide.lowSample ? (
              <p className={styles.panelNote}>
                Düşük kullanıcı sayılarında oranlar yalnızca ön göstergedir.
              </p>
            ) : null}
            <p className={styles.panelNote}>
              Başlatan {formatNumberTr(summary.guide.started)} · Tamamlayan{" "}
              {formatNumberTr(summary.guide.completed)} · Yarıda bırakan{" "}
              {formatNumberTr(summary.guide.abandoned)}
            </p>
            <p className={styles.panelNote}>
              Kılavuzlu sonuç oranı {pct(summary.guide.startedCompletionRate)} · Kılavuzsuz{" "}
              {pct(summary.guide.noGuideCompletionRate)} · Önizleme {pct(summary.guide.startedPreviewRate)}{" "}
              / {pct(summary.guide.noGuidePreviewRate)}
            </p>
          </section>

          <section className={styles.chartPanel}>
            <h3 className={styles.panelTitle}>Modül analizi (event dönemi)</h3>
            {!summary.dataAvailability.eventsReady ? (
              <p className={styles.muted}>Bu dönem için ayrıntılı kullanım verisi bulunmuyor.</p>
            ) : modules.length === 0 ? (
              <p className={styles.muted}>Henüz modül olayı yok.</p>
            ) : (
              <ul className={styles.barList}>
                {modules.map((m) => (
                  <li key={m.moduleKey}>
                    <div className={styles.barMeta}>
                      <span>{m.moduleKey}</span>
                      <span>
                        açan {formatNumberTr(m.viewedUsers)} · başlayan{" "}
                        {formatNumberTr(m.startedUsers)} · sonuç {formatNumberTr(m.completedUsers)} ·
                        önizleme {formatNumberTr(m.previewUsers)} · kayıt{" "}
                        {formatNumberTr(m.savedUsers)}
                      </span>
                    </div>
                    <div className={styles.muted}>
                      başlama→sonuç {pct(m.startToCompletePercent)} · sonuç→önizleme{" "}
                      {pct(m.completeToPreviewPercent)} · kılavuz {formatNumberTr(m.guideStartedUsers)}
                      /{formatNumberTr(m.guideCompletedUsers)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.chartPanel}>
            <h3 className={styles.panelTitle}>Geçmiş kaydedilmiş hesaplamalar</h3>
            <ul className={styles.barList}>
              {summary.historicalSavedModules.length === 0 ? (
                <li className={styles.muted}>Kayıt yok</li>
              ) : (
                summary.historicalSavedModules.map((m) => (
                  <li key={m.type}>
                    <div className={styles.barMeta}>
                      <span>{m.type || "UNKNOWN"}</span>
                      <span>{formatNumberTr(m.count)}</span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className={styles.tablePanel}>
            <div className={styles.tableHead}>
              <h3 className={styles.panelTitle}>Kullanıcılar</h3>
              <label className={styles.limitSelect}>
                Sayfa
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
                title="Kayıt yok"
                description="Filtrelerle eşleşen kullanıcı bulunamadı."
              />
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Kullanıcı</th>
                        <th>Statü</th>
                        <th>Giriş</th>
                        <th>Gün</th>
                        <th>Cihaz</th>
                        <th>Kayıt</th>
                        <th>Aşama</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.userId}>
                          <td>
                            <div className={styles.userCell}>
                              <strong>{u.name}</strong>
                              <span>{u.email}</span>
                            </div>
                          </td>
                          <td>{u.statusLabel}</td>
                          <td>
                            {u.loginCount}
                            <div className={styles.muted}>{formatDateTr(u.lastLoginAt, true)}</div>
                          </td>
                          <td>{u.distinctDays}</td>
                          <td>{u.firstDeviceLabel}</td>
                          <td>{u.savedCount}</td>
                          <td>{u.lastStage}</td>
                          <td>
                            <Button size="sm" variant="soft" onClick={() => void openTimeline(u)}>
                              Detayı gör
                            </Button>
                            <Link className={styles.detailLink} to={`/admin/users/${u.userId}/detail`}>
                              Kullanıcı
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={shared.pagination}>
                  <span className={shared.muted}>
                    {formatNumberTr(total)} · {page}/{totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
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

      {timelineUser ? (
        <div className={styles.drawerOverlay} onClick={() => setTimelineUser(null)}>
          <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHead}>
              <div>
                <h3>{timelineUser.name}</h3>
                <p className={styles.muted}>{timelineUser.email}</p>
              </div>
              <button type="button" className={styles.iconBtn} onClick={() => setTimelineUser(null)}>
                <X size={18} />
              </button>
            </div>
            {timelineLoading ? <AdminSkeleton rows={3} cards={0} /> : null}
            {!timelineLoading && timeline.length === 0 ? (
              <p className={styles.muted}>Bu dönem için ayrıntılı kullanım verisi bulunmuyor.</p>
            ) : null}
            <ul className={styles.loginList}>
              {timeline.map((item, i) => (
                <li key={`${item.at}-${i}`}>
                  <div className={styles.loginMain}>
                    <strong>{formatDateTr(item.at, true)}</strong>
                    <span>{item.label}</span>
                    {item.moduleKey ? <span className={styles.muted}>{item.moduleKey}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
