import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  FlaskConical,
  KeyRound,
  RefreshCw,
  Settings2,
  Users,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { FormDrawer } from "@/components/admin/FormDrawer";
import { FormField } from "@/components/admin/FormField";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge, statusToneFromRaw } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import {
  formatDateTr,
  getStatusLabel,
  getSubscriptionTypeLabel,
} from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./LicensesPage.module.css";

export type LicenseRow = {
  userId: number;
  email: string;
  name: string;
  tenantId: number;
  packageType: string | null;
  packageLabel: string;
  licenseStart: string | null;
  licenseEnd: string | null;
  remainingDays: number;
  calculationCount: number;
  lastLoginAt: string | null;
  status: string;
};

const PACKAGE_FILTER_OPTIONS = [
  { value: "all", label: "Tüm paketler" },
  { value: "demo", label: "Demo" },
  { value: "starter", label: "Başlangıç" },
  { value: "professional_monthly", label: "Aylık" },
  { value: "professional_yearly", label: "Yıllık" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Tümü" },
  { value: "aktif", label: "Aktif" },
  { value: "pasif", label: "Pasif" },
  { value: "süresi_dolmuş", label: "Süresi dolmuş" },
];

const PACKAGE_OPTIONS = [
  { value: "demo", label: "Demo" },
  { value: "starter", label: "Başlangıç" },
  { value: "professional_monthly", label: "Aylık" },
  { value: "professional_yearly", label: "Yıllık" },
];

function toDateOnly(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function remainingClass(days: number, status: string): string {
  const d = days ?? 0;
  const expired = status === "süresi_dolmuş" || d < 0;
  if (expired) return styles.remainingDanger;
  if (d <= 30) return styles.remainingWarn;
  return styles.remainingOk;
}

export default function LicensesPage() {
  const { success, error: toastError } = useToast();
  const [list, setList] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [packageFilter, setPackageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<LicenseRow | null>(null);
  const [editPackage, setEditPackage] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (packageFilter !== "all") params.set("packageType", packageFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const data = await apiClient<{ list?: LicenseRow[] }>(
        `/api/admin/license-management/list?${params}`,
        { adminRole: true },
      );
      setList(data.list || []);
    } catch {
      toastError("Lisans listesi yüklenemedi");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [packageFilter, search, statusFilter, toastError]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, packageFilter, statusFilter]);

  const metrics = useMemo(() => {
    const active = list.filter((r) => r.status === "aktif").length;
    const demo = list.filter((r) => r.packageType === "demo").length;
    const expired = list.filter((r) => r.status === "süresi_dolmuş").length;
    return { active, demo, expired };
  }, [list]);

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const pagedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [currentPage, list, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const doChangePackage = async (userId: number, newPackage: string) => {
    setActioningId(userId);
    try {
      const data = await apiClient<{ success?: boolean; error?: string }>(
        "/api/admin/license-management/change-package",
        {
          method: "POST",
          body: { userId, newPackage },
          adminRole: true,
        },
      );
      if (data.success) {
        success("Paket güncellendi");
        loadList();
      } else {
        toastError(data.error || "Güncellenemedi");
      }
    } catch {
      toastError("İşlem başarısız");
    } finally {
      setActioningId(null);
    }
  };

  const doAddDays = async (userId: number, days: number) => {
    setActioningId(userId);
    try {
      const data = await apiClient<{ success?: boolean; error?: string }>(
        "/api/admin/license-management/add-days",
        {
          method: "POST",
          body: { userId, days },
          adminRole: true,
        },
      );
      if (data.success) {
        success(`+${days} gün eklendi`);
        loadList();
      } else {
        toastError(data.error || "Eklenemedi");
      }
    } catch {
      toastError("İşlem başarısız");
    } finally {
      setActioningId(null);
    }
  };

  const openEdit = (row: LicenseRow) => {
    setEditRow(row);
    setEditPackage(row.packageType || "professional_monthly");
    setEditStart(toDateOnly(row.licenseStart));
    setEditEnd(toDateOnly(row.licenseEnd));
    setEditError("");
    setEditOpen(true);
  };

  const saveLicense = async () => {
    if (!editRow) return;
    const end = editEnd ? new Date(editEnd) : null;
    if (!end || Number.isNaN(end.getTime())) {
      setEditError("Bitiş tarihi geçerli olmalı");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      const data = await apiClient<{ success?: boolean; error?: string }>(
        "/api/admin/license-management/update",
        {
          method: "POST",
          body: {
            userId: editRow.userId,
            newPackage: editPackage || undefined,
            startDate: editStart || undefined,
            endDate: editEnd || undefined,
          },
          adminRole: true,
        },
      );
      if (data.success) {
        success("Lisans güncellendi");
        setEditOpen(false);
        loadList();
      } else {
        setEditError(data.error || "Kaydetme başarısız");
      }
    } catch {
      setEditError("Kaydetme başarısız");
    } finally {
      setEditSaving(false);
    }
  };

  if (loading && list.length === 0) {
    return <AdminSkeleton cards={3} rows={8} />;
  }

  return (
    <div className={shared.page}>
      <PageHeader
        title="Lisans Yönetimi"
        description="Kullanıcı lisanslarını yönetin. Paket değiştirme, süre ekleme ve detaylı düzenleme."
        actions={
          <Button variant="soft" size="sm" onClick={loadList} disabled={loading}>
            <RefreshCw size={15} />
            Yenile
          </Button>
        }
      />

      <div className={shared.stats}>
        <StatCard label="Aktif kullanıcı" value={metrics.active} icon={Users} tone="green" index={0} />
        <StatCard label="Demo kullanıcı" value={metrics.demo} icon={FlaskConical} tone="blue" index={1} />
        <StatCard
          label="Süresi dolan"
          value={metrics.expired}
          icon={AlertCircle}
          tone="danger"
          index={2}
        />
      </div>

      <FilterBar
        actions={
          <Button variant="primary" size="sm" onClick={loadList}>
            Filtrele
          </Button>
        }
      >
        <FormField label="Ara">
          <input
            placeholder="E-posta veya ad ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadList()}
          />
        </FormField>
        <FormField label="Paket">
          <select value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)}>
            {PACKAGE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Durum">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
      </FilterBar>

      <section className={shared.panel}>
        {loading ? (
          <AdminSkeleton rows={5} cards={0} />
        ) : list.length === 0 ? (
          <StatePanel
            icon={KeyRound}
            title="Kayıt bulunamadı"
            description="Arama veya filtre kriterlerini değiştirin."
          />
        ) : (
          <AdminTable
            rows={pagedList}
            rowKey={(row) => row.userId}
            columns={[
              {
                key: "email",
                header: "E-posta",
                render: (row) => (
                  <div className={styles.emailCell}>
                    <span className={styles.emailMain}>{row.email}</span>
                    <span className={styles.emailMeta}>
                      Tenant ID: {row.tenantId} · Son giriş: {formatDateTr(row.lastLoginAt, true)} ·
                      Hesaplama: {row.calculationCount ?? 0}
                    </span>
                  </div>
                ),
              },
              {
                key: "package",
                header: "Paket",
                render: (row) => (
                  <StatusBadge tone={statusToneFromRaw(row.packageType)}>
                    {getSubscriptionTypeLabel(row.packageType)}
                  </StatusBadge>
                ),
              },
              {
                key: "days",
                header: "Kalan Gün",
                hideOnMobile: true,
                render: (row) => {
                  const d = row.remainingDays ?? 0;
                  const display =
                    row.status === "süresi_dolmuş" && d < 0 ? d : row.status === "süresi_dolmuş" ? 0 : d;
                  return <span className={remainingClass(d, row.status)}>{display} gün</span>;
                },
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
                  <div className={styles.actions}>
                    <select
                      className={styles.actionSelect}
                      defaultValue=""
                      disabled={actioningId === row.userId}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) doChangePackage(row.userId, v);
                        e.target.value = "";
                      }}
                      aria-label="Paket değiştir"
                    >
                      <option value="">Paket…</option>
                      {PACKAGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className={styles.actionSelect}
                      defaultValue=""
                      disabled={actioningId === row.userId}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v) doAddDays(row.userId, v);
                        e.target.value = "";
                      }}
                      aria-label="Süre ekle"
                    >
                      <option value="">Süre…</option>
                      <option value={7}>+7 Gün</option>
                      <option value={30}>+30 Gün</option>
                      <option value={365}>+1 Yıl</option>
                    </select>
                    <Button variant="soft" size="sm" onClick={() => openEdit(row)}>
                      <Settings2 size={14} />
                      Düzenle
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}

        {!loading && list.length > 0 ? (
          <div className={shared.pagination}>
            <span className={shared.muted}>
              Sayfa başına{" "}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>{" "}
              · Toplam {list.length} kayıt · Sayfa {currentPage}/{totalPages}
            </span>
            <div style={{ display: "flex", gap: "0.35rem" }}>
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
        ) : null}
      </section>

      <FormDrawer
        open={editOpen}
        title="Lisans Yönet"
        description="Kullanıcı lisansını güncelleyin."
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Button variant="soft" onClick={() => setEditOpen(false)} disabled={editSaving}>
              İptal
            </Button>
            <Button variant="primary" onClick={saveLicense} disabled={editSaving}>
              {editSaving ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </>
        }
      >
        {editError ? <p className={styles.drawerError}>{editError}</p> : null}
        <FormField label="Kullanıcı E-posta">
          <input value={editRow?.email ?? ""} readOnly />
        </FormField>
        <FormField label="Paket">
          <select value={editPackage} onChange={(e) => setEditPackage(e.target.value)}>
            {PACKAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Başlangıç Tarihi">
          <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
        </FormField>
        <FormField label="Bitiş Tarihi">
          <input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
        </FormField>
      </FormDrawer>
    </div>
  );
}
