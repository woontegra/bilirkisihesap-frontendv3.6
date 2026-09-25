import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Download,
  Eye,
  FileText,
  Info,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FilterBar } from "@/components/admin/FilterBar";
import { FormField } from "@/components/admin/FormField";
import { MobileCards, MobileRecordCard } from "@/components/admin/MobileCards";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge, statusToneFromRaw } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { downloadCsv, formatDateTr } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./LogsPage.module.css";

type Log = {
  id: number;
  tenantId: number;
  userId: number | null;
  userEmail: string | null;
  level: string;
  type: string;
  action: string;
  message: string | null;
  details: unknown;
  stack: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type LogStats = {
  totalLogs: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  last24hLogs: number;
};

type Pagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function LevelIcon({ level }: { level: string }) {
  const v = (level || "").toLowerCase();
  if (v === "error") return <AlertCircle size={14} />;
  if (v === "warning") return <AlertTriangle size={14} />;
  return <Info size={14} />;
}

export default function LogsPage() {
  const { success, error: toastError } = useToast();
  const [logs, setLogs] = useState<Log[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0,
  });
  const [levelFilter, setLevelFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadStats = async () => {
    try {
      const data = await apiClient<LogStats>("/api/logs/stats", { adminRole: true });
      setStats(data);
    } catch {
      /* optional */
    }
  };

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (levelFilter) params.set("level", levelFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (tenantFilter) params.set("tenantFilter", tenantFilter);
      if (searchQuery) params.set("search", searchQuery);

      const data = await apiClient<{ logs?: Log[]; pagination?: Pagination }>(
        `/api/logs/all?${params}`,
        { adminRole: true },
      );
      setLogs(data.logs || []);
      setPagination(
        data.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 },
      );
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [pagination.page, pagination.limit, levelFilter, typeFilter, tenantFilter, searchQuery]);

  const clearOldLogs = async () => {
    setClearing(true);
    try {
      await apiClient("/api/logs/clear-old", {
        method: "DELETE",
        body: { days: 90 },
        adminRole: true,
      });
      success("Eski loglar başarıyla silindi");
      setConfirmClear(false);
      loadStats();
      loadLogs();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Log silme işlemi başarısız oldu");
    } finally {
      setClearing(false);
    }
  };

  const exportLogs = () => {
    const rows: string[][] = [
      ["Tarih", "Seviye", "Tip", "Aksiyon", "Mesaj", "Tenant ID", "Email"],
      ...logs.map((log) => [
        formatDateTr(log.createdAt, true),
        log.level,
        log.type,
        log.action,
        log.message || "",
        String(log.tenantId),
        log.userEmail || "",
      ]),
    ];
    downloadCsv(`logs-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  if (loading && logs.length === 0 && !stats) {
    return <AdminSkeleton cards={5} rows={8} />;
  }

  return (
    <div className={shared.page}>
      <PageHeader
        title="Sistem Logları"
        description="Tüm tenant'ların sistem loglarını görüntüleyin"
        actions={
          <>
            <Button variant="soft" size="sm" onClick={loadLogs}>
              <RefreshCw size={15} />
              Yenile
            </Button>
            <Button variant="soft" size="sm" onClick={exportLogs}>
              <Download size={15} />
              CSV İndir
            </Button>
            <Button variant="danger" size="sm" onClick={() => setConfirmClear(true)}>
              <Trash2 size={15} />
              Eski Logları Sil
            </Button>
          </>
        }
      />

      {stats ? (
        <div className={shared.stats}>
          <StatCard label="Toplam Log" value={stats.totalLogs} icon={FileText} index={0} />
          <StatCard label="Hatalar" value={stats.errorCount} tone="danger" icon={AlertCircle} index={1} />
          <StatCard label="Uyarılar" value={stats.warningCount} tone="amber" icon={AlertTriangle} index={2} />
          <StatCard label="Bilgiler" value={stats.infoCount} tone="blue" icon={Info} index={3} />
          <StatCard label="Son 24 Saat" value={stats.last24hLogs} tone="green" icon={RefreshCw} index={4} />
        </div>
      ) : null}

      <FilterBar
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setPagination((p) => ({ ...p, page: 1 }))}
          >
            Uygula
          </Button>
        }
      >
        <FormField label="Seviye">
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="">Tümü</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </FormField>
        <FormField label="Tip">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Tümü</option>
            <option value="api">API</option>
            <option value="auth">Auth</option>
            <option value="frontend">Frontend</option>
            <option value="calculation">Calculation</option>
            <option value="payment">Payment</option>
            <option value="system">System</option>
          </select>
        </FormField>
        <FormField label="Tenant">
          <input
            placeholder="Tenant ID"
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
          />
        </FormField>
        <FormField label="Ara">
          <input
            placeholder="Mesaj, email, aksiyon…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </FormField>
      </FilterBar>

      <section className={shared.panel}>
        {loading ? (
          <AdminSkeleton rows={6} cards={0} />
        ) : (
          <>
            <AdminTable
              rows={logs}
              rowKey={(log) => log.id}
              empty={
                <StatePanel
                  icon={FileText}
                  title="Log bulunamadı"
                  description="Filtreleri değiştirerek tekrar deneyin."
                />
              }
              columns={[
                {
                  key: "date",
                  header: "Tarih",
                  render: (log) => formatDateTr(log.createdAt, true),
                },
                {
                  key: "level",
                  header: "Seviye",
                  render: (log) => (
                    <span className={styles.levelCell}>
                      <LevelIcon level={log.level} />
                      <StatusBadge tone={statusToneFromRaw(log.level)}>
                        {(log.level || "unknown").toUpperCase()}
                      </StatusBadge>
                    </span>
                  ),
                },
                {
                  key: "type",
                  header: "Tip",
                  hideOnMobile: true,
                  render: (log) => <StatusBadge tone="neutral">{log.type}</StatusBadge>,
                },
                {
                  key: "action",
                  header: "Aksiyon",
                  hideBelowMd: true,
                  render: (log) => <code>{log.action}</code>,
                },
                {
                  key: "message",
                  header: "Mesaj",
                  render: (log) => log.message || "—",
                },
                {
                  key: "tenant",
                  header: "Tenant",
                  hideOnMobile: true,
                  render: (log) => `T${log.tenantId}`,
                },
                {
                  key: "email",
                  header: "Email",
                  hideBelowMd: true,
                  render: (log) => log.userEmail || "—",
                },
                {
                  key: "actionBtn",
                  header: "İşlem",
                  render: (log) => (
                    <Button variant="ghost" size="icon" aria-label="Detay" onClick={() => setSelectedLog(log)}>
                      <Eye size={15} />
                    </Button>
                  ),
                },
              ]}
            />

            <MobileCards>
              {logs.map((log, index) => (
                <MobileRecordCard key={log.id} index={index} onClick={() => setSelectedLog(log)}>
                  <strong>{formatDateTr(log.createdAt, true)}</strong>
                  <p className={shared.muted}>{log.message || log.action}</p>
                  <StatusBadge tone={statusToneFromRaw(log.level)}>
                    {(log.level || "unknown").toUpperCase()}
                  </StatusBadge>
                </MobileRecordCard>
              ))}
            </MobileCards>
          </>
        )}

        {pagination.total > 0 ? (
          <div className={shared.pagination}>
            <span className={shared.muted}>
              Sayfa başına{" "}
              <select
                value={pagination.limit}
                onChange={(e) =>
                  setPagination((p) => ({ ...p, page: 1, limit: Number(e.target.value) }))
                }
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>{" "}
              · Toplam {pagination.total} kayıt (Sayfa {pagination.page} / {pagination.totalPages})
            </span>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <Button
                variant="soft"
                size="sm"
                disabled={pagination.page === 1}
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
              >
                Önceki
              </Button>
              <Button
                variant="soft"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
              >
                Sonraki
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedLog ? (
        <div
          className={styles.detailOverlay}
          role="presentation"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className={styles.detailModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.detailHead}>
              <h2 id="log-detail-title" className={shared.panelTitle}>
                Log Detayı
              </h2>
              <Button variant="ghost" size="icon" aria-label="Kapat" onClick={() => setSelectedLog(null)}>
                ×
              </Button>
            </div>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}>
                <label>Tarih</label>
                <p>{formatDateTr(selectedLog.createdAt, true)}</p>
              </div>
              <div className={styles.detailItem}>
                <label>Seviye</label>
                <p>
                  <StatusBadge tone={statusToneFromRaw(selectedLog.level)}>
                    {(selectedLog.level || "unknown").toUpperCase()}
                  </StatusBadge>
                </p>
              </div>
              <div className={styles.detailItem}>
                <label>Tip</label>
                <p>{selectedLog.type}</p>
              </div>
              <div className={styles.detailItem}>
                <label>Tenant ID</label>
                <p>{selectedLog.tenantId}</p>
              </div>
              <div className={styles.detailItem}>
                <label>User ID</label>
                <p>{selectedLog.userId ?? "—"}</p>
              </div>
              <div className={styles.detailItem}>
                <label>Email</label>
                <p>{selectedLog.userEmail ?? "—"}</p>
              </div>
            </div>
            <div className={styles.detailItem}>
              <label>Aksiyon</label>
              <p>
                <code>{selectedLog.action}</code>
              </p>
            </div>
            {selectedLog.message ? (
              <div className={styles.detailItem}>
                <label>Mesaj</label>
                <p>{selectedLog.message}</p>
              </div>
            ) : null}
            {selectedLog.details ? (
              <div className={styles.detailItem}>
                <label>Detaylar</label>
                <pre className={styles.pre}>{JSON.stringify(selectedLog.details, null, 2)}</pre>
              </div>
            ) : null}
            {selectedLog.stack ? (
              <div className={styles.detailItem}>
                <label>Stack Trace</label>
                <pre className={styles.pre}>{selectedLog.stack}</pre>
              </div>
            ) : null}
            {selectedLog.ipAddress ? (
              <div className={styles.detailItem}>
                <label>IP Adresi</label>
                <p>{selectedLog.ipAddress}</p>
              </div>
            ) : null}
            {selectedLog.userAgent ? (
              <div className={styles.detailItem}>
                <label>User Agent</label>
                <p>{selectedLog.userAgent}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmClear}
        title="Eski logları sil"
        description="90 günden eski logları silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmLabel="Sil"
        danger
        loading={clearing}
        onConfirm={clearOldLogs}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
