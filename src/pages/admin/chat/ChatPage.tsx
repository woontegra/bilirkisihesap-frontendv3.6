import {
  ArrowLeft,
  Circle,
  CircleDot,
  MessageCircle,
  RefreshCw,
  Send,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, API_BASE_URL } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatDateTr } from "@/utils/adminLabels";
import { emitAdminChatReplySent } from "@/utils/adminChatNotificationBridge";
import shared from "../adminShared.module.css";
import styles from "./ChatPage.module.css";

const POLL_MS = 5000;
const MESSAGE_POLL_MS = 3000;
const PRESENCE_HEARTBEAT_MS = 60_000;

type ChatMessage = {
  id: string;
  conversationId: string;
  senderType: string;
  senderId: number;
  message: string;
  imageUrl?: string | null;
  isRead: boolean;
  createdAt: string;
};

type Conversation = {
  id: string;
  userId: number;
  tenantId: number;
  assignedTo: number | null;
  status: string;
  lastMessageAt: string | null;
  user: { id: number; name: string; email: string };
  assignedAdmin: { id: number; name: string; email: string } | null;
  unreadCount: number;
};

type Filter = "all" | "unassigned" | "assigned";

export default function ChatPage() {
  const toast = useToast();
  const [isOnline, setIsOnline] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileThread, setMobileThread] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedId = selected?.id ?? null;

  const loadPresence = useCallback(async () => {
    try {
      const data = await apiClient<{ isOnline?: boolean }>("/api/admin/presence/me", {
        adminRole: true,
      });
      setIsOnline(!!data?.isOnline);
    } catch {
      setIsOnline(false);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const q = filter !== "all" ? `?filter=${filter}` : "";
      const data = await apiClient<{ conversations?: Conversation[] }>(
        `/api/admin/chat/conversations${q}`,
        { adminRole: true },
      );
      const list = data?.conversations ?? [];
      setConversations(list);
      setSelected((prev) => {
        if (!prev) return null;
        return list.find((c) => c.id === prev.id) ?? prev;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Konuşmalar yüklenemedi");
    }
  }, [filter, toast]);

  const loadMessages = useCallback(
    async (conversationId?: string) => {
      const id = conversationId ?? selectedId;
      if (!id) return;
      setMessagesLoading(true);
      try {
        const data = await apiClient<{ messages?: ChatMessage[] }>(
          `/api/admin/chat/messages/${id}`,
          { adminRole: true },
        );
        setMessages(data?.messages ?? []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Mesajlar yüklenemedi");
      } finally {
        setMessagesLoading(false);
      }
    },
    [selectedId, toast],
  );

  const togglePresence = async () => {
    try {
      const data = await apiClient<{ isOnline?: boolean }>("/api/admin/presence/toggle", {
        method: "POST",
        adminRole: true,
        body: { isOnline: !isOnline },
      });
      setIsOnline(!!data?.isOnline);
      toast.success(data?.isOnline ? "Çevrimiçi oldunuz" : "Çevrimdışı oldunuz");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Durum güncellenemedi");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadConversations(), selectedId ? loadMessages(selectedId) : Promise.resolve()]);
    } finally {
      setRefreshing(false);
    }
  };

  const selectConversation = (conversation: Conversation) => {
    setSelected(conversation);
    setMobileThread(true);
  };

  const handleAssign = async () => {
    if (!selectedId) return;
    try {
      await apiClient(`/api/admin/chat/assign/${selectedId}`, {
        method: "POST",
        adminRole: true,
      });
      toast.success("Konuşma size atandı");
      await loadConversations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Atama başarısız");
    }
  };

  const handleClose = async () => {
    if (!selectedId) return;
    try {
      await apiClient(`/api/admin/chat/close/${selectedId}`, {
        method: "POST",
        adminRole: true,
      });
      toast.success("Konuşma kapatıldı");
      setSelected(null);
      setMessages([]);
      setMobileThread(false);
      await loadConversations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Konuşma kapatılamadı");
    }
  };

  const handleSend = async () => {
    const text = input.trim().slice(0, 1000);
    if (!text || !selectedId || sending) return;
    setSending(true);
    try {
      const data = await apiClient<{ message?: ChatMessage }>("/api/admin/chat/message", {
        method: "POST",
        adminRole: true,
        body: { conversationId: selectedId, message: text },
      });
      if (data?.message) {
        const sent = data.message as ChatMessage;
        setMessages((prev) => [...prev, sent]);
        emitAdminChatReplySent({
          conversationId: selectedId,
          lastMessageAt: sent.createdAt ?? new Date().toISOString(),
        });
      }
      setInput("");
      await Promise.all([loadConversations(), loadMessages(selectedId)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mesaj gönderilemedi");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    void loadPresence();
  }, [loadPresence]);

  useEffect(() => {
    if (!isOnline) return;
    const heartbeat = () => {
      void apiClient("/api/admin/presence/toggle", {
        method: "POST",
        adminRole: true,
        body: { isOnline: true },
      }).catch(() => undefined);
    };
    const timer = window.setInterval(heartbeat, PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [isOnline]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setListLoading(true);
      await loadConversations();
      if (!cancelled) setListLoading(false);
    };
    void run();
    const timer = window.setInterval(() => void loadConversations(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId), MESSAGE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const filterButtons: { key: Filter; label: string }[] = [
    { key: "all", label: "Tümü" },
    { key: "unassigned", label: "Atanmamış" },
    { key: "assigned", label: "Bana atanan" },
  ];

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <header className={styles.topBar}>
        <div className={styles.topCopy}>
          <Link to="/admin" className={styles.backLink}>
            <ArrowLeft size={16} />
            Admin
          </Link>
          <h1 className={styles.title}>
            <MessageCircle size={20} />
            Canlı Sohbet
          </h1>
          <p className={styles.subtitle}>Anlık destek konuşmalarını yönetin</p>
        </div>
        <div className={styles.topActions}>
          <button
            type="button"
            className={isOnline ? styles.presenceOn : styles.presenceOff}
            onClick={() => void togglePresence()}
          >
            {isOnline ? (
              <Circle size={10} className={styles.pulseDot} fill="currentColor" />
            ) : (
              <CircleDot size={10} />
            )}
            {isOnline ? "Çevrimiçi" : "Çevrimdışı"}
          </button>
          <Button variant="soft" size="sm" disabled={refreshing} onClick={() => void handleRefresh()}>
            <RefreshCw size={15} className={refreshing ? styles.spin : undefined} />
            Yenile
          </Button>
        </div>
      </header>

      {listLoading && conversations.length === 0 ? (
        <AdminSkeleton cards={0} rows={6} />
      ) : (
        <div
          className={`${styles.layout} ${mobileThread ? styles.mobileThreadOpen : ""}`}
        >
          <aside
            className={`${styles.listPane} ${mobileThread ? styles.listHiddenMobile : ""}`}
            aria-label="Konuşma listesi"
          >
            <div className={`${shared.tabs} ${styles.filterTabs}`}>
              {filterButtons.map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  className={filter === btn.key ? shared.tabActive : shared.tab}
                  onClick={() => setFilter(btn.key)}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <div className={styles.conversationList}>
              {conversations.length === 0 ? (
                <StatePanel
                  icon={MessageCircle}
                  title="Açık konuşma yok"
                  description="Yeni mesaj geldiğinde burada görünecek."
                />
              ) : (
                conversations.map((conversation, index) => (
                  <button
                    key={conversation.id}
                    type="button"
                    className={
                      selectedId === conversation.id
                        ? styles.conversationActive
                        : styles.conversation
                    }
                    style={{ animationDelay: `${70 + index * 30}ms` }}
                    onClick={() => selectConversation(conversation)}
                  >
                    <div className={styles.conversationHead}>
                      <span className={styles.conversationName}>
                        {conversation.user?.name || "Kullanıcı"}
                      </span>
                      {conversation.unreadCount > 0 ? (
                        <span className={styles.unread}>{conversation.unreadCount}</span>
                      ) : null}
                    </div>
                    <p className={styles.conversationEmail}>{conversation.user?.email}</p>
                    <p className={styles.conversationTime}>
                      {conversation.lastMessageAt
                        ? formatDateTr(conversation.lastMessageAt, true)
                        : "Henüz mesaj yok"}
                    </p>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section
            className={`${styles.threadPane} ${!mobileThread ? styles.threadHiddenMobile : ""}`}
            aria-label="Mesaj thread"
          >
            {!selected ? (
              <div className={styles.threadEmpty}>
                <StatePanel
                  icon={MessageCircle}
                  title="Konuşma seçin"
                  description="Soldaki listeden bir konuşma seçerek yanıt verin."
                />
              </div>
            ) : (
              <>
                <header className={styles.threadHead}>
                  <div className={styles.threadHeadCopy}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={styles.mobileBack}
                      onClick={() => setMobileThread(false)}
                    >
                      <ArrowLeft size={16} />
                      Liste
                    </Button>
                    <h2 className={styles.threadTitle}>{selected.user?.name || "Kullanıcı"}</h2>
                    <p className={styles.threadEmail}>{selected.user?.email}</p>
                  </div>
                  <div className={styles.threadActions}>
                    {!selected.assignedTo ? (
                      <Button variant="soft" size="sm" onClick={() => void handleAssign()}>
                        <UserCheck size={15} />
                        Sahiplen
                      </Button>
                    ) : null}
                    <Button variant="danger" size="sm" onClick={() => void handleClose()}>
                      <XCircle size={15} />
                      Kapat
                    </Button>
                  </div>
                </header>

                <div ref={scrollRef} className={styles.messages}>
                  {messagesLoading && messages.length === 0 ? (
                    <p className={shared.muted}>Mesajlar yükleniyor…</p>
                  ) : null}
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.senderType === "admin"
                          ? styles.messageOut
                          : styles.messageIn
                      }
                    >
                      <div
                        className={
                          message.senderType === "admin"
                            ? styles.bubbleOut
                            : styles.bubbleIn
                        }
                      >
                        {message.imageUrl ? (
                          <a
                            href={
                              message.imageUrl.startsWith("http")
                                ? message.imageUrl
                                : `${API_BASE_URL}${message.imageUrl}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={
                                message.imageUrl.startsWith("http")
                                  ? message.imageUrl
                                  : `${API_BASE_URL}${message.imageUrl}`
                              }
                              alt="Gönderilen görsel"
                              className={styles.messageImage}
                            />
                          </a>
                        ) : null}
                        {message.message && message.message !== "[Görsel]" ? <p>{message.message}</p> : null}
                        <time dateTime={message.createdAt}>
                          {formatDateTr(message.createdAt, true)}
                        </time>
                      </div>
                    </div>
                  ))}
                </div>

                <footer className={styles.composer}>
                  <input
                    type="text"
                    value={input}
                    maxLength={1000}
                    placeholder="Yanıt yazın…"
                    onChange={(e) => setInput(e.target.value.slice(0, 1000))}
                    onKeyDown={(e) => e.key === "Enter" && void handleSend()}
                  />
                  <Button
                    variant="primary"
                    size="icon"
                    disabled={!input.trim() || sending}
                    aria-label="Gönder"
                    onClick={() => void handleSend()}
                  >
                    <Send size={16} />
                  </Button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
