import {
  AlertCircle,
  Calendar,
  Clock,
  CreditCard,
  Pencil,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, ApiError } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { FormField } from "@/components/admin/FormField";
import { MobileCards, MobileRecordCard } from "@/components/admin/MobileCards";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge, statusToneFromRaw } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import {
  formatDateTr,
  formatNumberTr,
  getStatusLabel,
  getSubscriptionTypeLabel,
} from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./SubscriptionsPage.module.css";

type SubscriptionUser = {
  id: number;
  tenantId?: number;
  name: string;
  email: string;
  subscriptionType: string | null;
  subscriptionStartsAt: string | null;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  status: string;
  licenseKey?: string | null;
};

type ExpiringLicense = {
  id: string;
  licenseKey: string;
  userId: number | null;
  expiresAt: string;
  user: { id: number; name: string; email: string } | null;
};

type ListPayload = {
  data?: SubscriptionUser[];
  total?: number;
  totalPages?: number;
};

type ExpiringPayload = {
  licenses?: ExpiringLicense[];
};

function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime())) return null;
  return Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function parseListPayload(json: unknown): {
  rows: SubscriptionUser[];
  total: number;
  totalPages: number;
} {
  if (Array.isArray(json)) {
    return { rows: json, total: json.length, totalPages: 1 };
  }
  const payload = json as ListPayload;
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return {
    rows,
    total: typeof payload?.total === "number" ? payload.total : rows.length,
    totalPages: typeof payload?.totalPages === "number" ? payload.totalPages : 1,
  };
}

export default function SubscriptionsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<SubscriptionUser[]>([]);
  const [expiring, setExpiring] = useState<ExpiringLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);

      let json: unknown;
      try {
        json = await apiClient<unknown>(`/api/admin/subscriptions?${params}`, {
          adminRole: true,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          const fallback = new URLSearchParams();
          if (statusFilter !== "all") fallback.set("status", statusFilter);
          if (search.trim()) fallback.set("search", search.trim());
          const qs = fallback.toString();
          json = await apiClient<unknown>(
            `/api/admin/users${qs ? `?${qs}` : ""}`,
            { adminRole: true },
          );
        } else {
          throw err;
        }
      }

      const parsed = parseListPayload(json);
      setRows(parsed.rows);
      setTotal(parsed.total);
      setTotalPages(Math.max(1, parsed.totalPages));
    } catch (err) {
      setRows([]);
      toast.error(err instanceof Error ? err.message : "Abonelikler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, toast]);

  const loadExpiring = useCallback(async () => {
    try {
      const data = await apiClient<ExpiringPayload>(
        "/api/admin/licenses/expiring?days=7",
        { adminRole: true },
      );
      setExpiring(Array.isArray(data?.licenses) ? data.licenses : []);
    } catch {
      setExpiring([]);
    }
  }, []);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  useEffect(() => {
    void loadExpiring();
  }, [loadExpiring]);

  const activeCount = useMemo(
    () => rows.filter((u) => u.status?.toLowerCase() === "active").length,
    [rows],
  );

  const expiredCount = useMemo(
    () =>
      rows.filter((u) => {
        if (!u.subscriptionEndsAt || u.status?.toLowerCase() !== "active") return false;
        const days = daysUntil(u.subscriptionEndsAt);
        return days !== null && days < 0;
      }).length,
    [rows],
  );

  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <PageHeader
        title="Abonelik Yönetimi"
        description="Planlar, süreler ve abonelik işlemlerini görüntüleyin."
        actions={
          <Button variant="soft" size="sm" onClick={() => void loadSubscriptions()}>
            Yenile
          </Button>
        }
      />

      {loading ? (
        <AdminSkeleton cards={3} rows={8} />
      ) : (
        <>
          <div className={shared.stats}>
            <StatCard
              label="Aktif Abonelik"
              value={formatNumberTr(activeCount)}
              icon={Calendar}
              tone="blue"
              index={0}
            />
            <StatCard
              label="Yakında Bitecek"
              value={formatNumberTr(expiring.length)}
              hint="7 gün içinde"
              icon={Clock}
              tone="amber"
              index={1}
            />
            <StatCard
              label="Süresi Dolmuş"
              value={formatNumberTr(expiredCount)}
              icon={AlertCircle}
              tone="danger"
              index={2}
            />
          </div>

          {expiring.length > 0 ? (
            <section className={`${shared.panel} ${styles.expiringPanel}`}>
              <div className={shared.rowBetween}>
                <h2 className={shared.panelTitle}>Yakında Bitecekler (7 gün)</h2>
                <span className={shared.muted}>{expiring.length} lisans</span>
              </div>
              <ul className={styles.expiringList}>
                {expiring.map((lic, index) => {
                  const days = daysUntil(lic.expiresAt);
                  return (
                    <li
                      key={lic.id}
                      className={styles.expiringItem}
                      style={{ animationDelay: `${90 + index * 35}ms` }}
                    >
                      <div className={styles.expiringCopy}>
                        <p className={styles.expiringName}>{lic.user?.name ?? "Atanmamış"}</p>
                        <p className={styles.expiringEmail}>
                          {lic.user?.email ?? lic.licenseKey}
                        </p>
                      </div>
                      <div className={styles.expiringMeta}>
                        <StatusBadge tone="warning">
                          {days === 0 ? "Bugün" : `${days} gün`}
                        </StatusBadge>
                        <span className={shared.muted}>{formatDateTr(lic.expiresAt)}</span>
                      </div>
                      {lic.userId ? (
                        <Link to={`/admin/users/${lic.userId}/edit`} className={styles.editLink}>
                          <Button variant="soft" size="sm">
                            <Pencil size={14} />
                            Düzenle
                          </Button>
                        </Link>
                      ) : (
                        <Link to="/admin/licenses" className={styles.editLink}>
                          <Button variant="soft" size="sm">
                            Lisanslar
                          </Button>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <FilterBar
            actions={
              <Button variant="primary" size="sm" onClick={applySearch}>
                Ara
              </Button>
            }
          >
            <FormField label="Arama">
              <input
                type="search"
                placeholder="Ad, e-posta, ID…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
              />
            </FormField>
            <FormField label="Durum">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Tüm Durumlar</option>
                <option value="active">Aktif</option>
                <option value="suspended">Askıda</option>
              </select>
            </FormField>
          </FilterBar>

          <section className={`${shared.panel} ${styles.tablePanel}`}>
            <div className={shared.rowBetween}>
              <h2 className={shared.panelTitle}>Tüm Abonelikler</h2>
              <span className={shared.muted}>Toplam {formatNumberTr(total)} kayıt</span>
            </div>

            <div className={styles.desktopOnly}>
              <AdminTable
                rows={rows}
                rowKey={(row) => row.id}
                empty={
                  <StatePanel
                    icon={CreditCard}
                    title="Abonelik bulunamadı"
                    description="Filtreleri değiştirerek tekrar deneyin."
                  />
                }
                columns={[
                  {
                    key: "user",
                    header: "Kullanıcı",
                    render: (user) => (
                      <div>
                        <div className={styles.userName}>{user.name}</div>
                        <div className={styles.userEmail}>{user.email}</div>
                      </div>
                    ),
                  },
                  {
                    key: "type",
                    header: "Plan",
                    hideOnMobile: true,
                    render: (user) => (
                      <StatusBadge tone="accent">
                        {getSubscriptionTypeLabel(user.subscriptionType)}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "start",
                    header: "Başlangıç",
                    hideBelowMd: true,
                    render: (user) => formatDateTr(user.subscriptionStartsAt),
                  },
                  {
                    key: "end",
                    header: "Bitiş",
                    render: (user) => {
                      const days = daysUntil(user.subscriptionEndsAt);
                      const soon = days !== null && days >= 0 && days <= 7;
                      const expired = days !== null && days < 0;
                      return (
                        <div>
                          <span>{formatDateTr(user.subscriptionEndsAt)}</span>
                          {soon ? (
                            <span className={styles.soonHint}>{days} gün kaldı</span>
                          ) : null}
                          {expired ? (
                            <span className={styles.expiredHint}>Süresi doldu</span>
                          ) : null}
                        </div>
                      );
                    },
                  },
                  {
                    key: "status",
                    header: "Durum",
                    render: (user) => (
                      <StatusBadge tone={statusToneFromRaw(user.status)}>
                        {getStatusLabel(user.status)}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "action",
                    header: "İşlem",
                    render: (user) => (
                      <Link to={`/admin/users/${user.id}/edit`}>
                        <Button variant="ghost" size="sm">
                          Düzenle
                        </Button>
                      </Link>
                    ),
                  },
                ]}
              />
            </div>

            <MobileCards>
              {rows.map((user, index) => {
                const days = daysUntil(user.subscriptionEndsAt);
                return (
                  <MobileRecordCard key={user.id} index={index}>
                    <div className={styles.cardHead}>
                      <div>
                        <p className={styles.userName}>{user.name}</p>
                        <p className={styles.userEmail}>{user.email}</p>
                      </div>
                      <StatusBadge tone={statusToneFromRaw(user.status)}>
                        {getStatusLabel(user.status)}
                      </StatusBadge>
                    </div>
                    <p className={styles.cardMeta}>
                      {getSubscriptionTypeLabel(user.subscriptionType)} · Bitiş:{" "}
                      {formatDateTr(user.subscriptionEndsAt)}
                      {days !== null && days >= 0 && days <= 7 ? ` (${days} gün)` : ""}
                    </p>
                    <Link to={`/admin/users/${user.id}/edit`}>
                      <Button variant="soft" size="sm">
                        Düzenle
                      </Button>
                    </Link>
                  </MobileRecordCard>
                );
              })}
            </MobileCards>

            {rows.length > 0 ? (
              <div className={shared.pagination}>
                <span className={shared.muted}>
                  Sayfa {page}/{totalPages}
                </span>
                <select
                  value={pageSize}
                  className={styles.pageSelect}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Önceki
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sonraki
                </Button>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
