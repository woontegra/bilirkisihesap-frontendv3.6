import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Edit3,
  Eye,
  Plus,
  Search,
  UserCheck,
  UserMinus,
  Users,
  Zap,
} from "lucide-react";
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
import { formatDateTr, getStatusLabel, getSubscriptionTypeLabel } from "@/utils/adminLabels";
import { formatUserRoleLabel } from "@/utils/userRole";
import styles from "./UsersPage.module.css";

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  subscriptionType: string | null;
  subscriptionEndsAt: string | null;
  status: string;
  createdAt: string;
};

function roleLabel(role: string): string {
  return formatUserRoleLabel(role) || "Kullanıcı";
}

export default function UsersPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const qs = params.toString();
      const data = await apiClient<AdminUser[]>(
        `/api/admin/users${qs ? `?${qs}` : ""}`,
        { adminRole: true },
      );
      setUsers(Array.isArray(data) ? data : []);
      setCurrentPage(1);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Kullanıcılar yüklenemedi";
      setError(message);
      setUsers([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, toast]);

  useEffect(() => {
    void loadUsers();
  }, [statusFilter]);

  const stats = useMemo(() => {
    const active = users.filter((u) => u.status?.toLowerCase() === "active").length;
    const suspended = users.filter((u) => u.status?.toLowerCase() === "suspended").length;
    const trial = users.filter((u) => {
      const s = u.status?.toLowerCase() ?? "";
      const sub = u.subscriptionType?.toLowerCase() ?? "";
      return s === "trial" || sub.includes("demo") || sub.includes("trial");
    }).length;
    return { total: users.length, active, suspended, trial };
  }, [users]);

  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const pagedUsers = users.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading && users.length === 0 && !error) {
    return (
      <div className={styles.page}>
        <PageHeader title="Kullanıcı Yönetimi" description="Tüm kullanıcıları görüntüleyin ve yönetin" />
        <AdminSkeleton rows={8} cards={4} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Kullanıcı Yönetimi"
        description="Tüm kullanıcıları görüntüleyin ve yönetin"
        actions={
          <Link to="/admin/users/new">
            <Button variant="primary" size="sm">
              <Plus size={15} />
              Yeni Üyelik Aç
            </Button>
          </Link>
        }
      />

      {!loading && !error ? (
        <div className={styles.stats}>
          <StatCard label="Toplam" value={stats.total} icon={Users} index={0} />
          <StatCard label="Aktif" value={stats.active} icon={UserCheck} tone="green" index={1} />
          <StatCard label="Askıda" value={stats.suspended} icon={UserMinus} tone="amber" index={2} />
          <StatCard label="Deneme" value={stats.trial} icon={Zap} tone="blue" index={3} />
        </div>
      ) : null}

      <FilterBar
        actions={
          <Button variant="primary" size="sm" onClick={() => void loadUsers()} disabled={loading}>
            <Search size={14} />
            Filtrele
          </Button>
        }
      >
        <FormField label="Arama">
          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              className={`${styles.input} ${styles.inputWithIcon}`}
              placeholder="İsim veya e-posta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void loadUsers()}
            />
          </div>
        </FormField>
        <FormField label="Durum">
          <select
            className={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="suspended">Askıya Alındı</option>
            <option value="trial">Deneme Süresi</option>
          </select>
        </FormField>
      </FilterBar>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Kullanıcı Listesi</h2>
            <p className={styles.panelDesc}>
              {loading ? "Yükleniyor…" : `Toplam ${users.length} kullanıcı`}
            </p>
          </div>
        </div>

        <div className={styles.panelBody}>
          {error ? (
            <StatePanel
              tone="danger"
              icon={Users}
              title="Liste yüklenemedi"
              description={error}
              actionLabel="Tekrar dene"
              onAction={() => void loadUsers()}
            />
          ) : loading ? (
            <AdminSkeleton rows={6} cards={0} />
          ) : users.length === 0 ? (
            <StatePanel
              icon={Users}
              title="Kullanıcı bulunamadı"
              description="Filtreleri değiştirin veya yeni bir kullanıcı oluşturun."
              actionLabel="Yeni Üyelik Aç"
              onAction={() => navigate("/admin/users/new")}
            />
          ) : (
            <>
              <AdminTable
                rows={pagedUsers}
                rowKey={(row) => row.id}
                empty={null}
                columns={[
                  {
                    key: "name",
                    header: "Kullanıcı",
                    render: (row) => (
                      <div>
                        <strong>{row.name}</strong>
                        <div className={styles.cardEmail}>{row.email}</div>
                      </div>
                    ),
                  },
                  {
                    key: "role",
                    header: "Rol",
                    hideBelowMd: true,
                    render: (row) => (
                      <StatusBadge tone={row.role === "admin" ? "accent" : "info"}>
                        {roleLabel(row.role)}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "subscription",
                    header: "Abonelik",
                    hideBelowMd: true,
                    render: (row) => getSubscriptionTypeLabel(row.subscriptionType),
                  },
                  {
                    key: "ends",
                    header: "Bitiş",
                    hideOnMobile: true,
                    render: (row) => formatDateTr(row.subscriptionEndsAt),
                  },
                  {
                    key: "status",
                    header: "Durum",
                    render: (row) => (
                      <StatusBadge tone={statusToneFromRaw(row.status)}>
                        {getStatusLabel(row.status)}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "actions",
                    header: "İşlem",
                    render: (row) => (
                      <div className={styles.rowActions}>
                        <Link className={styles.rowLink} to={`/admin/users/${row.id}/detail`}>
                          <Eye size={13} />
                          Detay
                        </Link>
                        <Link className={styles.rowLink} to={`/admin/users/${row.id}/edit`}>
                          <Edit3 size={13} />
                          Düzenle
                        </Link>
                      </div>
                    ),
                  },
                ]}
              />

              <MobileCards>
                {pagedUsers.map((row, index) => (
                  <MobileRecordCard key={row.id} index={index}>
                    <div className={styles.cardRow}>
                      <div>
                        <p className={styles.cardName}>{row.name}</p>
                        <p className={styles.cardEmail}>{row.email}</p>
                      </div>
                      <StatusBadge tone={statusToneFromRaw(row.status)}>
                        {getStatusLabel(row.status)}
                      </StatusBadge>
                    </div>
                    <div className={styles.cardMeta}>
                      <StatusBadge tone={row.role === "admin" ? "accent" : "info"}>
                        {roleLabel(row.role)}
                      </StatusBadge>
                      <StatusBadge tone="neutral">
                        {getSubscriptionTypeLabel(row.subscriptionType)}
                      </StatusBadge>
                    </div>
                    <p className={styles.cardEmail}>Bitiş: {formatDateTr(row.subscriptionEndsAt)}</p>
                    <div className={styles.rowActions}>
                      <Link className={styles.rowLink} to={`/admin/users/${row.id}/detail`}>
                        <Eye size={13} />
                        Detay
                      </Link>
                      <Link className={styles.rowLink} to={`/admin/users/${row.id}/edit`}>
                        <Edit3 size={13} />
                        Düzenle
                      </Link>
                    </div>
                  </MobileRecordCard>
                ))}
              </MobileCards>

              <div className={styles.pagination}>
                <div className={styles.paginationControls}>
                  <span>Sayfa başına</span>
                  <select
                    className={`${styles.select} ${styles.pageSizeSelect}`}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span>
                    Toplam {users.length} kayıt · Sayfa {currentPage}/{totalPages}
                  </span>
                </div>
                <div className={styles.paginationControls}>
                  <Button
                    variant="soft"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Önceki
                  </Button>
                  <Button
                    variant="soft"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Sonraki
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
