import { MessageSquare, Plus, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  addTicketReply,
  createTicket,
  listTickets,
  updateTicketStatus,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
} from "@/api/profile";
import { FormField } from "@/components/admin/FormField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import styles from "./profileTabShared.module.css";

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

function statusBadgeClass(status: TicketStatus): string {
  if (status === "open") return styles.badgeOpen;
  if (status === "in_progress") return styles.badgeProgress;
  if (status === "resolved") return styles.badgeResolved;
  return styles.badgeClosed;
}

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function TicketsTab() {
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTicket, setNewTicket] = useState({
    subject: "",
    description: "",
    priority: "medium" as TicketPriority,
  });
  const [replyMessage, setReplyMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const data = await listTickets();
      setTickets(data);
    } catch {
      toast.error("Destek talepleri yüklenemedi");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, []);

  const handleCreate = async () => {
    if (!newTicket.subject.trim() || !newTicket.description.trim()) {
      toast.error("Konu ve açıklama zorunludur");
      return;
    }
    try {
      setSubmitting(true);
      await createTicket(newTicket);
      toast.success("Destek talebi başarıyla oluşturuldu");
      setNewTicket({ subject: "", description: "", priority: "medium" });
      setShowNewForm(false);
      await loadTickets();
    } catch {
      toast.error("Destek talebi oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddReply = async (ticketId: number) => {
    if (!replyMessage.trim()) {
      toast.error("Mesaj zorunludur");
      return;
    }
    try {
      setSubmitting(true);
      const updated = await addTicketReply(ticketId, replyMessage);
      toast.success("Yanıt gönderildi");
      setReplyMessage("");
      if (updated && typeof updated === "object" && "id" in updated) {
        setSelected(updated);
      }
      await loadTickets();
    } catch {
      toast.error("Yanıt gönderilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (ticketId: number, status: TicketStatus) => {
    try {
      setSubmitting(true);
      const updated = await updateTicketStatus(ticketId, status);
      toast.success("Durum güncellendi");
      await loadTickets();
      if (selected?.id === ticketId) {
        if (updated && typeof updated === "object" && "id" in updated) {
          setSelected(updated);
        } else {
          setSelected((prev) => (prev ? { ...prev, status } : null));
        }
      }
    } catch {
      toast.error("Durum güncellenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.stack}>
      <div className={styles.rowBetween}>
        <div>
          <h3 className={styles.panelTitle}>Destek Talepleri</h3>
          <p className={styles.panelDesc} style={{ marginBottom: 0 }}>
            Destek taleplerinizi buradan yönetebilirsiniz
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowNewForm((v) => !v)}>
          <Plus size={14} aria-hidden /> Yeni Talep
        </Button>
      </div>

      {showNewForm ? (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Yeni Destek Talebi</h3>
          <p className={styles.panelDesc}>Yardıma ihtiyacınız mı var? Bize ulaşın.</p>
          <div className={styles.formGrid}>
            <FormField label="Konu *">
              <input
                value={newTicket.subject}
                onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                placeholder="Örn: Hesaplama hatası"
              />
            </FormField>
            <FormField label="Öncelik">
              <select
                value={newTicket.priority}
                onChange={(e) =>
                  setNewTicket({ ...newTicket, priority: e.target.value as TicketPriority })
                }
              >
                <option value="low">Düşük</option>
                <option value="medium">Orta</option>
                <option value="high">Yüksek</option>
                <option value="urgent">Acil</option>
              </select>
            </FormField>
            <FormField label="Açıklama *">
              <textarea
                value={newTicket.description}
                onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                placeholder="Sorununuzu detaylı açıklayın..."
                rows={5}
              />
            </FormField>
          </div>
          <div className={styles.actions}>
            <Button variant="soft" onClick={() => setShowNewForm(false)}>
              İptal
            </Button>
            <Button variant="primary" disabled={submitting} onClick={() => void handleCreate()}>
              {submitting ? "Gönderiliyor..." : "Gönder"}
            </Button>
          </div>
        </section>
      ) : null}

      <section className={styles.panel}>
        {loading ? (
          <p className={styles.muted}>Yükleniyor...</p>
        ) : tickets.length === 0 ? (
          <div className={styles.empty}>
            <MessageSquare size={28} aria-hidden />
            <strong>Henüz destek talebiniz yok</strong>
            <span>Yeni talep oluşturmak için &quot;Yeni Talep&quot; butonuna tıklayın</span>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Konu</th>
                  <th>Tarih</th>
                  <th>Öncelik</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>{ticket.subject}</td>
                    <td>{fmtDate(ticket.createdAt)}</td>
                    <td>{PRIORITY_LABELS[ticket.priority] ?? ticket.priority}</td>
                    <td>
                      <span className={`${styles.badge} ${statusBadgeClass(ticket.status)}`}>
                        {STATUS_LABELS[ticket.status] ?? ticket.status}
                      </span>
                    </td>
                    <td>
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() =>
                          setSelected((prev) => (prev?.id === ticket.id ? null : ticket))
                        }
                      >
                        {selected?.id === ticket.id ? "Kapat" : "Detay"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected ? (
          <div className={styles.detail}>
            <div className={styles.rowBetween}>
              <h4 className={styles.panelTitle} style={{ margin: 0 }}>
                {selected.subject}
              </h4>
              <Button variant="ghost" size="icon" aria-label="Kapat" onClick={() => setSelected(null)}>
                <X size={16} />
              </Button>
            </div>
            <p className={styles.muted}>{selected.description}</p>
            <div className={styles.rowBetween}>
              <FormField label="Durum">
                <select
                  value={selected.status}
                  disabled={submitting}
                  onChange={(e) =>
                    void handleUpdateStatus(selected.id, e.target.value as TicketStatus)
                  }
                >
                  <option value="open">Açık</option>
                  <option value="in_progress">İşlemde</option>
                  <option value="resolved">Çözüldü</option>
                  <option value="closed">Kapalı</option>
                </select>
              </FormField>
            </div>
            <div className={styles.replies}>
              {(selected.replies || []).length === 0 ? (
                <p className={styles.muted}>Henüz yanıt yok</p>
              ) : (
                (selected.replies || []).map((reply) => (
                  <div
                    key={reply.id}
                    className={`${styles.reply} ${reply.isAdmin ? styles.replyAdmin : ""}`}
                  >
                    <div className={styles.replyMeta}>
                      <span>{reply.isAdmin ? "Destek" : "Siz"}</span>
                      <span>{fmtDate(reply.createdAt)}</span>
                    </div>
                    <div>{reply.message}</div>
                  </div>
                ))
              )}
            </div>
            <FormField label="Yanıt yazın">
              <textarea
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                rows={3}
                placeholder="Mesajınız..."
              />
            </FormField>
            <div className={styles.actions}>
              <Button
                variant="primary"
                disabled={submitting}
                onClick={() => void handleAddReply(selected.id)}
              >
                <Send size={14} aria-hidden /> Gönder
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
