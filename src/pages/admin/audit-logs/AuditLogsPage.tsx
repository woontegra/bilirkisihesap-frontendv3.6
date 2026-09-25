import { useEffect, useState } from "react";
import { Filter, History } from "lucide-react";
import { apiClient } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { FormField } from "@/components/admin/FormField";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatDateTr } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./AuditLogsPage.module.css";

type AuditLogItem = {
  id: number;
  adminId: number;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  admin: { name: string; email: string } | null;
};

const ACTION_LABELS: Record<string, string> = {
  user_create: "Kullanıcı oluşturma",
  license_extend: "Lisans uzatma",
  subscription_change: "Abonelik değişikliği",
  manual_intervention: "Manuel müdahale",
  tenant_create: "Şirket oluşturma",
};

export default function AuditLogsPage() {
  const { error: toastError } = useToast();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(10);

  const loadLogs = async (offsetOverride?: number) => {
    setLoading(true);
    const o = offsetOverride ?? offset;
    try {
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (targetType) params.set("targetType", targetType);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", String(limit));
      params.set("offset", String(o));

      const data = await apiClient<{ items?: AuditLogItem[]; total?: number }>(
        `/api/admin/audit-logs?${params}`,
        { adminRole: true },
      );
      setItems(data.items || []);
      setTotal(data.total ?? 0);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Denetim kayıtları yüklenemedi");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [offset, limit]);

  const handleFilter = () => {
    setOffset(0);
    loadLogs(0);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className={shared.page}>
      <PageHeader
        title="Admin Denetim Kayıtları"
        description="Kullanıcı oluşturma, lisans uzatma, abonelik değişikliği ve manuel müdahaleler"
      />

      <FilterBar
        actions={
          <Button variant="primary" size="sm" onClick={handleFilter}>
            <Filter size={15} />
            Uygula
          </Button>
        }
      >
        <FormField label="İşlem">
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Tüm işlemler</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Hedef">
          <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
            <option value="">Tüm hedefler</option>
            <option value="user">Kullanıcı</option>
            <option value="tenant">Şirket</option>
            <option value="license">Lisans</option>
          </select>
        </FormField>
        <FormField label="Başlangıç">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label="Bitiş">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </FilterBar>

      <section className={shared.panel}>
        {loading ? (
          <AdminSkeleton rows={6} cards={0} />
        ) : items.length === 0 ? (
          <StatePanel
            icon={History}
            title="Kayıt bulunamadı"
            description="Filtreleri değiştirerek tekrar deneyin."
          />
        ) : (
          <AdminTable
            rows={items}
            rowKey={(log) => log.id}
            columns={[
              {
                key: "date",
                header: "Tarih",
                render: (log) => formatDateTr(log.createdAt, true),
              },
              {
                key: "action",
                header: "İşlem",
                render: (log) => ACTION_LABELS[log.action] || log.action,
              },
              {
                key: "target",
                header: "Hedef",
                hideOnMobile: true,
                render: (log) =>
                  log.targetType && log.targetId ? `${log.targetType}#${log.targetId}` : "—",
              },
              {
                key: "admin",
                header: "Yönetici",
                render: (log) =>
                  log.admin ? `${log.admin.name} (${log.admin.email})` : `ID: ${log.adminId}`,
              },
              {
                key: "details",
                header: "Detay",
                hideBelowMd: true,
                render: (log) => (
                  <span className={styles.detailCell} title={log.details ? JSON.stringify(log.details) : undefined}>
                    {log.details ? JSON.stringify(log.details) : "—"}
                  </span>
                ),
              },
              {
                key: "ip",
                header: "IP",
                hideOnMobile: true,
                render: (log) => log.ipAddress || "—",
              },
            ]}
          />
        )}

        {total > 0 ? (
          <div className={shared.pagination}>
            <span className={shared.muted}>
              Sayfa başına{" "}
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setOffset(0);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>{" "}
              · Toplam {total} kayıt · Sayfa {currentPage}/{totalPages}
            </span>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <Button variant="soft" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}>
                Önceki
              </Button>
              <Button
                variant="soft"
                size="sm"
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
              >
                Sonraki
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
