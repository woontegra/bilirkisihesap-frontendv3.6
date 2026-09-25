import {
  MessageSquare,
  Send,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient, apiClientAsUser } from "@/api/client";
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
import { formatDateTr } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./TicketsPage.module.css";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "urgent";

type TicketReply = {
  id: number;
  ticketId: number;
  userId: number;
  message: string;
  isAdmin: boolean;
  createdAt: string;
};

type Ticket = {
  id: number;
  tenantId: number;
  userId: number;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  user: { id: number; name: string; email: string };
  replies: TicketReply[];
};

type Tenant = {
  id: number;
  name: string;
  email: string;
};

type AdminUserLookup = {
  id: number;
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Açık",
  in_progress: "İşlemde",
  resolved: "Çözüldü",
  closed: "Kapalı",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  urgent: "Acil",
};

function priorityTone(priority: TicketPriority): "neutral" | "info" | "warning" | "danger" {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "info";
  return "neutral";
}

function readStoredEmail(): string | null {
  try {
    const raw = localStorage.getItem("current_user");
    if (raw) {
      const parsed = JSON.parse(raw) as { email?: string };
      if (parsed.email) return parsed.email;
    }
  } catch {
    /* ignore */
  }
  return localStorage.getItem("email");
}

export default function TicketsPage() {
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedUserId, setResolvedUserId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [closeTarget, setCloseTarget] = useState<Ticket | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    let cancelled = false;

    const resolveUser = async () => {
      const email = readStoredEmail();
      if (!email) {
        toast.error("Kullanıcı kimliği bulunamadı. Lütfen tekrar giriş yapın.");
        return;
      }

      try {
        const user = await apiClient<AdminUserLookup>(
          `/api/admin/users/email/${encodeURIComponent(email)}`,
          { adminRole: true },
        );
        if (!cancelled && user?.id) setResolvedUserId(user.id);
      } catch (err) {
        if (!cancelled) {
          const fallbackId = Number(localStorage.getItem("user_id") || "0");
          if (fallbackId > 0) {
            setResolvedUserId(fallbackId);
          } else {
            toast.error(err instanceof Error ? err.message : "Admin kullanıcısı çözümlenemedi");
          }
        }
      }
    };

    void resolveUser();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const loadTenants = useCallback(async () => {
    try {
      const data = await apiClient<Tenant[]>("/api/admin/tenants", { adminRole: true });
      setTenants(Array.isArray(data) ? data : []);
    } catch {
      setTenants([]);
    }
  }, []);

  const loadTickets = useCallback(async () => {
    if (!resolvedUserId) return;
    setLoading(true);
    try {
      const data = await apiClientAsUser<Ticket[]>("/api/tickets");
      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      setTickets([]);
      toast.error(err instanceof Error ? err.message : "Destek talepleri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [resolvedUserId, toast]);

  useEffect(() => {
    if (!resolvedUserId) return;
    void loadTickets();
    void loadTenants();
  }, [resolvedUserId, loadTickets, loadTenants]);

  const tenantName = useCallback(
    (tenantId: number) => tenants.find((t) => t.id === tenantId)?.name ?? `Tenant ${tenantId}`,
    [tenants],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesSearch =
        !q ||
        ticket.subject.toLowerCase().includes(q) ||
        ticket.description.toLowerCase().includes(q) ||
        ticket.user.name.toLowerCase().includes(q) ||
        ticket.user.email.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tickets, search, statusFilter, priorityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, priorityFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const openCount = useMemo(
    () => tickets.filter((t) => t.status === "open" || t.status === "in_progress").length,
    [tickets],
  );

  const handleReply = async () => {
    if (!selected || !replyMessage.trim() || !resolvedUserId) return;
    setSubmitting(true);
    try {
      const updated = await apiClientAsUser<Ticket>(`/api/tickets/${selected.id}/replies`, {
        method: "POST",
        body: { message: replyMessage.trim() },
      });
      toast.success("Yanıt gönderildi");
      setReplyMessage("");
      setSelected(updated);
      await loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Yanıt eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (!closeTarget || !resolvedUserId) return;
    setSubmitting(true);
    try {
      const updated = await apiClientAsUser<Ticket>(`/api/tickets/${closeTarget.id}`, {
        method: "PUT",
        body: { status: "closed" },
      });
      toast.success("Talep kapatıldı");
      if (selected?.id === closeTarget.id) setSelected(updated);
      setCloseTarget(null);
      await loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Talep kapatılamadı");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <PageHeader
        title="Destek Talepleri"
        description="Kullanıcı destek taleplerini inceleyin, yanıtlayın ve kapatın."
        actions={
          <StatusBadge tone={openCount > 0 ? "warning" : "success"}>
            {`${openCount} açık talep`}
          </StatusBadge>
        }
      />

      {loading && !resolvedUserId ? (
        <AdminSkeleton cards={1} rows={8} />
      ) : !resolvedUserId ? (
        <StatePanel
          icon={MessageSquare}
          title="Oturum gerekli"
          description="Destek taleplerini görüntülemek için admin oturumu açın."
        />
      ) : loading ? (
        <AdminSkeleton cards={1} rows={8} />
      ) : (
        <>
          <div className={shared.stats}>
            <StatCard
              label="Toplam Talep"
              value={tickets.length}
              icon={MessageSquare}
              tone="blue"
              index={0}
            />
            <StatCard
              label="Açık / İşlemde"
              value={openCount}
              tone="amber"
              index={1}
            />
            <StatCard
              label="Filtrelenen"
              value={filtered.length}
              tone="teal"
              index={2}
            />
          </div>

          <FilterBar>
            <FormField label="Arama">
              <input
                type="search"
                placeholder="Konu, açıklama, kullanıcı…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </FormField>
            <FormField label="Durum">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Tüm Durumlar</option>
                <option value="open">Açık</option>
                <option value="in_progress">İşlemde</option>
                <option value="resolved">Çözüldü</option>
                <option value="closed">Kapalı</option>
              </select>
            </FormField>
            <FormField label="Öncelik">
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="all">Tüm Öncelikler</option>
                <option value="low">Düşük</option>
                <option value="medium">Orta</option>
                <option value="high">Yüksek</option>
                <option value="urgent">Acil</option>
              </select>
            </FormField>
          </FilterBar>

          <section className={`${shared.panel} ${styles.tablePanel}`}>
            <div className={styles.desktopOnly}>
              <AdminTable
                rows={paged}
                rowKey={(row) => row.id}
                empty={
                  <StatePanel
                    icon={MessageSquare}
                    title="Destek talebi yok"
                    description="Filtrelere uyan talep bulunamadı."
                  />
                }
                columns={[
                  {
                    key: "tenant",
                    header: "Tenant",
                    hideOnMobile: true,
                    render: (ticket) => tenantName(ticket.tenantId),
                  },
                  {
                    key: "subject",
                    header: "Konu",
                    render: (ticket) => (
                      <div>
                        <div className={styles.subject}>{ticket.subject}</div>
                        <div className={styles.subline}>
                          {ticket.user.name} · {ticket.user.email}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "date",
                    header: "Tarih",
                    hideBelowMd: true,
                    render: (ticket) => formatDateTr(ticket.createdAt, true),
                  },
                  {
                    key: "priority",
                    header: "Öncelik",
                    render: (ticket) => (
                      <StatusBadge tone={priorityTone(ticket.priority)}>
                        {PRIORITY_LABELS[ticket.priority]}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "status",
                    header: "Durum",
                    render: (ticket) => (
                      <StatusBadge tone={statusToneFromRaw(ticket.status)}>
                        {STATUS_LABELS[ticket.status]}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "actions",
                    header: "İşlem",
                    render: (ticket) => (
                      <div className={styles.rowActions}>
                        {ticket.status !== "closed" ? (
                          <Button
                            variant="soft"
                            size="sm"
                            onClick={() => setCloseTarget(ticket)}
                          >
                            Kapat
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => setSelected(ticket)}>
                          Detay
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>

            <MobileCards>
              {paged.map((ticket, index) => (
                <MobileRecordCard
                  key={ticket.id}
                  index={index}
                  onClick={() => setSelected(ticket)}
                >
                  <div className={styles.cardHead}>
                    <p className={styles.subject}>{ticket.subject}</p>
                    <StatusBadge tone={statusToneFromRaw(ticket.status)}>
                      {STATUS_LABELS[ticket.status]}
                    </StatusBadge>
                  </div>
                  <p className={styles.subline}>
                    {ticket.user.name} · {tenantName(ticket.tenantId)}
                  </p>
                  <div className={styles.cardBadges}>
                    <StatusBadge tone={priorityTone(ticket.priority)}>
                      {PRIORITY_LABELS[ticket.priority]}
                    </StatusBadge>
                    <span className={shared.muted}>{formatDateTr(ticket.createdAt, true)}</span>
                  </div>
                </MobileRecordCard>
              ))}
            </MobileCards>

            {filtered.length > 0 ? (
              <div className={shared.pagination}>
                <span className={shared.muted}>
                  Sayfa {currentPage}/{totalPages}
                </span>
                <select
                  value={pageSize}
                  className={styles.pageSelect}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
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
            ) : null}
          </section>
        </>
      )}

      {selected ? (
        <div className={styles.detailOverlay} role="presentation" onClick={() => setSelected(null)}>
          <aside
            className={styles.detailPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.detailHead}>
              <div>
                <h2 id="ticket-detail-title" className={styles.detailTitle}>
                  {selected.subject}
                </h2>
                <p className={styles.detailMeta}>
                  {selected.user.name} · {selected.user.email} · {tenantName(selected.tenantId)}
                </p>
                <div className={styles.detailBadges}>
                  <StatusBadge tone={statusToneFromRaw(selected.status)}>
                    {STATUS_LABELS[selected.status]}
                  </StatusBadge>
                  <StatusBadge tone={priorityTone(selected.priority)}>
                    {PRIORITY_LABELS[selected.priority]}
                  </StatusBadge>
                  <span className={shared.muted}>{formatDateTr(selected.createdAt, true)}</span>
                </div>
              </div>
              <Button variant="ghost" size="icon" aria-label="Kapat" onClick={() => setSelected(null)}>
                <X size={18} />
              </Button>
            </header>

            <div className={styles.detailBody}>
              <section>
                <h3 className={styles.sectionTitle}>Açıklama</h3>
                <p className={styles.description}>{selected.description}</p>
              </section>

              <section>
                <h3 className={styles.sectionTitle}>
                  Yanıtlar ({selected.replies?.length ?? 0})
                </h3>
                <div className={styles.replies}>
                  {(selected.replies ?? []).map((reply) => (
                    <article
                      key={reply.id}
                      className={reply.isAdmin ? styles.replyAdmin : styles.replyUser}
                    >
                      <div className={styles.replyHead}>
                        <span>{reply.isAdmin ? "Destek Ekibi" : selected.user.name}</span>
                        <span className={shared.muted}>{formatDateTr(reply.createdAt, true)}</span>
                      </div>
                      <p>{reply.message}</p>
                    </article>
                  ))}
                </div>
              </section>

              {selected.status !== "closed" ? (
                <section className={styles.replyForm}>
                  <FormField label="Yanıt">
                    <textarea
                      value={replyMessage}
                      rows={4}
                      placeholder="Yanıtınızı yazın…"
                      onChange={(e) => setReplyMessage(e.target.value)}
                    />
                  </FormField>
                  <div className={styles.replyActions}>
                    <Button
                      variant="primary"
                      disabled={submitting || !replyMessage.trim()}
                      onClick={() => void handleReply()}
                    >
                      <Send size={15} />
                      {submitting ? "Gönderiliyor…" : "Yanıt Gönder"}
                    </Button>
                    <Button variant="danger" onClick={() => setCloseTarget(selected)}>
                      Talebi Kapat
                    </Button>
                  </div>
                </section>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!closeTarget}
        title="Talebi kapat"
        description={`"${closeTarget?.subject ?? ""}" talebini kapatmak istediğinize emin misiniz?`}
        confirmLabel="Kapat"
        danger
        loading={submitting}
        onCancel={() => setCloseTarget(null)}
        onConfirm={() => void handleClose()}
      />
    </div>
  );
}
