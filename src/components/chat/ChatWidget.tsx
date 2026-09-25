import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { CheckCircle2, Headphones, Send, X } from "lucide-react";
import { SupportBotIcon } from "./SupportBotIcon";
import { API_BASE_URL, apiClient, ApiError } from "@/api/client";
import { getAccessToken } from "@/auth/session";
import { Button } from "@/components/ui/Button";
import styles from "./ChatWidget.module.css";

const POLL_INTERVAL = 5000;
const CHAT_POLL_INTERVAL = 3000;
const MINIMIZED_STORAGE_KEY = "chatWidgetMinimized";

function readMinimizedFromStorage(): boolean {
  try {
    return localStorage.getItem(MINIMIZED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

const OFFLINE_TOPICS = [
  "Demo hesabım hakkında bilgi almak istiyorum",
  "Hesaplama ekranları hakkında sorum var",
  "Üyelik / abonelik hakkında bilgi almak istiyorum",
  "Teknik destek almak istiyorum",
  "Diğer",
] as const;

interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: string;
  senderId: number;
  message: string;
  imageUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

type SubmitState = "idle" | "success" | "error";
type PresenceMode = "loading" | "online" | "offline";

function readStoredUser(): { name: string; email: string } {
  try {
    const raw = localStorage.getItem("current_user");
    if (!raw) {
      return { name: "", email: localStorage.getItem("email") || "" };
    }
    const parsed = JSON.parse(raw) as { name?: string; email?: string };
    return {
      name: (parsed.name || "").trim(),
      email: (parsed.email || localStorage.getItem("email") || "").trim(),
    };
  } catch {
    return { name: "", email: localStorage.getItem("email") || "" };
  }
}

function LauncherOrb({
  online,
  size,
  iconClassName,
}: {
  online: boolean;
  size: number;
  iconClassName: string;
}) {
  const ringTone = online ? styles.orbRingOnline : styles.orbRingOffline;

  return (
    <span className={styles.iconOrb}>
      <span className={`${styles.orbRing} ${ringTone}`} aria-hidden />
      <span className={`${styles.orbRing} ${styles.orbRingDelay} ${ringTone}`} aria-hidden />
      <SupportBotIcon className={iconClassName} size={size} />
      <span
        className={`${styles.onlineBadge} ${online ? styles.onlineBadgeOn : styles.onlineBadgeOff}`}
        aria-hidden
      />
    </span>
  );
}

function shouldShowWidget(pathname: string): boolean {
  if (!getAccessToken()) return false;
  // Admin panelde ayrı sohbet ekranı var; widget kullanıcı alanında gösterilir.
  if (pathname.startsWith("/admin")) return false;
  return true;
}

export default function ChatWidget() {
  const location = useLocation();
  const [authTick, setAuthTick] = useState(0);
  const showWidget = useMemo(
    () => shouldShowWidget(location.pathname),
    [authTick, location.pathname],
  );
  const token = getAccessToken();

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(readMinimizedFromStorage);
  const [presenceMode, setPresenceMode] = useState<PresenceMode>("loading");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [offlineName, setOfflineName] = useState("");
  const [offlineEmail, setOfflineEmail] = useState("");
  const [offlineTopic, setOfflineTopic] = useState<string>(OFFLINE_TOPICS[0]);
  const [offlineMessage, setOfflineMessage] = useState("");
  const [offlineSubmitting, setOfflineSubmitting] = useState(false);
  const [offlineSubmitState, setOfflineSubmitState] = useState<SubmitState>("idle");
  const [offlineSubmitError, setOfflineSubmitError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string | null>(null);

  const resetOfflineForm = useCallback((options?: { keepSuccess?: boolean }) => {
    const stored = readStoredUser();
    setOfflineName(stored.name);
    setOfflineEmail(stored.email);
    setOfflineTopic(OFFLINE_TOPICS[0]);
    setOfflineMessage("");
    setOfflineSubmitError(null);
    if (!options?.keepSuccess) {
      setOfflineSubmitState("idle");
    }
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    resetOfflineForm();
  }, [resetOfflineForm]);

  const openPanel = useCallback(() => {
    persistMinimized(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isOnline = presenceMode === "online";
  const isOfflineMode = !isOnline;

  useEffect(() => {
    const onAuthChanged = () => setAuthTick((n) => n + 1);
    window.addEventListener("auth-changed", onAuthChanged);
    return () => window.removeEventListener("auth-changed", onAuthChanged);
  }, []);

  const launcherCopy = useMemo(() => {
    if (isOnline) {
      return { title: "Canlı Destek", tag: "Çevrimiçi", variant: "online" as const };
    }
    return { title: "Destek Bırakın", tag: "Çevrimdışı", variant: "offline" as const };
  }, [isOnline]);

  const headerCopy = useMemo(() => {
    if (isOnline) {
      return {
        title: "Canlı Destek",
        subtitle: "Şu an çevrimiçiyiz, hemen yanıtlıyoruz.",
        badge: "Çevrimiçi",
      };
    }
    return {
      title: "Destek Talebi Bırakın",
      subtitle: "Şu an çevrimdışı olabiliriz. Mesajınızı bırakın, en kısa sürede dönüş yapalım.",
      badge: presenceMode === "loading" ? "Bağlanıyor…" : "Çevrimdışı",
    };
  }, [isOnline, presenceMode]);

  const loadPresence = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiClient<{ hasOnlineAdmin?: boolean }>("/api/admin/presence/status");
      setPresenceMode(data?.hasOnlineAdmin ? "online" : "offline");
    } catch {
      setPresenceMode("offline");
    }
  }, [token]);

  const loadConversation = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const data = await apiClient<{
        conversation?: { id?: string };
        messages?: ChatMessage[];
      }>("/api/chat/conversation");
      const cid = data?.conversation?.id || null;
      setConversationId(cid);
      conversationIdRef.current = cid;

      if (data?.messages?.length) {
        setMessages(data.messages);
        return;
      }

      if (cid) {
        const msgData = await apiClient<{ messages?: ChatMessage[] }>(
          `/api/chat/messages?conversationId=${encodeURIComponent(cid)}`,
        );
        setMessages(msgData?.messages || []);
      } else {
        setMessages([]);
      }
    } catch {
      setLoadError("Sohbet geçmişi yüklenemedi. Lütfen tekrar deneyin.");
    }
  }, [token]);

  const loadMessages = useCallback(async () => {
    if (!token || !open || !isOnline) return;
    try {
      const url = conversationId
        ? `/api/chat/messages?conversationId=${encodeURIComponent(conversationId)}`
        : "/api/chat/conversation";
      const data = await apiClient<{
        conversation?: { id?: string };
        messages?: ChatMessage[];
      }>(url);
      setMessages(data?.messages || []);
      if (!conversationId && data?.conversation?.id) {
        setConversationId(data.conversation.id);
        conversationIdRef.current = data.conversation.id;
      }
    } catch {
      /* sessiz yenileme */
    }
  }, [token, open, conversationId, isOnline]);

  useEffect(() => {
    if (!showWidget) return;
    const stored = readStoredUser();
    setOfflineName(stored.name);
    setOfflineEmail(stored.email);
    void loadPresence();
    const t = setInterval(() => void loadPresence(), POLL_INTERVAL);
    return () => clearInterval(t);
  }, [showWidget, loadPresence]);

  useEffect(() => {
    if (!open || !isOnline) return;
    setLoading(true);
    void loadConversation().finally(() => setLoading(false));
  }, [open, isOnline, loadConversation]);

  useEffect(() => {
    if (!open || !isOnline) return;
    const msgTimer = setInterval(() => void loadMessages(), CHAT_POLL_INTERVAL);
    return () => clearInterval(msgTimer);
  }, [open, isOnline, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, offlineSubmitState]);

  const sendMessage = async () => {
    const text = input.trim().slice(0, 1000);
    if (!text || sending || !isOnline) return;

    let cid = conversationId;
    if (!cid) {
      try {
        const d = await apiClient<{ conversation?: { id?: string } }>("/api/chat/conversation");
        cid = d?.conversation?.id || null;
        if (cid) {
          setConversationId(cid);
          conversationIdRef.current = cid;
        }
      } catch {
        return;
      }
    }
    if (!cid) return;

    setSending(true);
    try {
      const data = await apiClient<{ message: ChatMessage }>("/api/chat/message", {
        method: "POST",
        body: { conversationId: cid, message: text },
      });
      setMessages((prev) => [...prev, data.message]);
      setInput("");
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  const submitOfflineTicket = async () => {
    const name = offlineName.trim();
    const email = offlineEmail.trim();
    const topic = offlineTopic.trim() || OFFLINE_TOPICS[0];
    const message = offlineMessage.trim();

    if (!name || !email || !message) {
      setOfflineSubmitError("Ad, e-posta ve mesaj alanlarını doldurun.");
      setOfflineSubmitState("error");
      return;
    }

    setOfflineSubmitting(true);
    setOfflineSubmitState("idle");
    setOfflineSubmitError(null);
    try {
      const description = [`Gönderen: ${name}`, `E-posta: ${email}`, "", message].join("\n");
      await apiClient("/api/tickets", {
        method: "POST",
        body: {
          subject: `[Çevrimdışı Destek] ${topic}`,
          description,
          priority: "medium",
        },
      });
      setOfflineSubmitState("success");
      setOfflineName("");
      setOfflineEmail("");
      setOfflineTopic(OFFLINE_TOPICS[0]);
      setOfflineMessage("");
    } catch (err) {
      setOfflineSubmitState("error");
      setOfflineSubmitError(
        err instanceof ApiError ? err.message : "Mesajınız gönderilemedi. Lütfen tekrar deneyin.",
      );
    } finally {
      setOfflineSubmitting(false);
    }
  };

  const selectTopic = (topic: string) => {
    setOfflineTopic(topic);
    if (!offlineMessage.trim() || OFFLINE_TOPICS.some((t) => offlineMessage.startsWith(t))) {
      setOfflineMessage(topic === "Diğer" ? "" : `${topic}\n\n`);
    }
  };

  const imgUrl = (url: string) => (url.startsWith("http") ? url : `${API_BASE_URL}${url}`);

  const persistMinimized = (value: boolean) => {
    setMinimized(value);
    try {
      localStorage.setItem(MINIMIZED_STORAGE_KEY, String(value));
    } catch {
      /* ignore */
    }
  };

  const handleMinimize = () => {
    setOpen(false);
    persistMinimized(true);
  };

  if (!showWidget || !token) {
    return null;
  }

  return (
    <>
      <div className={styles.root}>
        {!open && minimized ? (
          <button
            type="button"
            className={`${styles.miniFab} ${launcherCopy.variant === "online" ? styles.miniFabOnline : styles.miniFabOffline}`}
            aria-label="Destek widgetını aç"
            onClick={openPanel}
          >
            <LauncherOrb online={launcherCopy.variant === "online"} size={64} iconClassName={styles.miniFabIcon} />
          </button>
        ) : null}

        {!open && !minimized ? (
          <div
            className={`${styles.launcherCard} ${launcherCopy.variant === "online" ? styles.launcherOnline : styles.launcherOffline}`}
          >
            <button type="button" className={styles.hideChip} aria-label="Gizle" onClick={handleMinimize}>
              Gizle
            </button>
            <button
              type="button"
              onClick={openPanel}
              className={styles.launcher}
              aria-label={launcherCopy.title}
            >
              <span className={styles.launcherIconWrap} aria-hidden>
                <LauncherOrb
                  online={launcherCopy.variant === "online"}
                  size={48}
                  iconClassName={styles.launcherIcon}
                />
              </span>
              <span className={styles.launcherText}>
                <span className={styles.launcherTitle}>{launcherCopy.title}</span>
                <span className={styles.launcherTag}>{launcherCopy.tag}</span>
              </span>
            </button>
          </div>
        ) : null}
      </div>

      {open
        ? createPortal(
            <div className={styles.overlay}>
              <div className={styles.backdrop} onClick={closePanel} aria-hidden />
              <div
                className={`${styles.panel} ${isOnline ? styles.panelOnline : styles.panelOffline}`}
                role="dialog"
                aria-label={headerCopy.title}
              >
                <header className={`${styles.header} ${isOnline ? styles.headerOnline : styles.headerOffline}`}>
                  <div className={styles.headerMain}>
                    <div className={styles.brandMark} aria-hidden>
                      <SupportBotIcon className={styles.brandMarkImg} size={40} alt="" />
                    </div>
                    <div className={styles.headerCopy}>
                      <h3 className={styles.headerTitle}>{headerCopy.title}</h3>
                      <p className={styles.headerSubtitle}>{headerCopy.subtitle}</p>
                      <span className={styles.statusBadge}>
                        <span
                          className={`${styles.statusDot} ${isOnline ? styles.statusDotOnline : styles.statusDotOffline}`}
                          aria-hidden
                        />
                        {headerCopy.badge}
                      </span>
                    </div>
                  </div>
                  <div className={styles.headerActions}>
                    <button type="button" className={styles.minimizeBtn} onClick={handleMinimize} aria-label="Gizle">
                      Gizle
                    </button>
                    <button type="button" className={styles.closeBtn} onClick={closePanel} aria-label="Kapat">
                      <X className={styles.closeIcon} aria-hidden />
                    </button>
                  </div>
                </header>

                <div className={styles.contentColumn}>
                  <div ref={scrollRef} className={styles.messageScroll}>
                    {offlineSubmitState === "success" && isOfflineMode ? (
                      <div className={styles.successScreen}>
                        <CheckCircle2 className={styles.successIcon} aria-hidden />
                        <h4 className={styles.successTitle}>Mesajınız alındı</h4>
                        <p className={styles.successText}>En kısa sürede size dönüş yapacağız.</p>
                        <Button type="button" variant="ghost" onClick={closePanel}>
                          Kapat
                        </Button>
                      </div>
                    ) : isOnline ? (
                      <>
                        {loading ? (
                          <p className={styles.loadingText}>Yükleniyor…</p>
                        ) : loadError ? (
                          <p className={styles.alertError}>{loadError}</p>
                        ) : messages.length === 0 ? (
                          <div className={styles.emptyState}>
                            <Headphones className={styles.emptyIcon} aria-hidden />
                            <p className={styles.emptyTitle}>Merhaba!</p>
                            <p className={styles.emptyText}>
                              Size nasıl yardımcı olabiliriz? Mesajınızı yazın, hemen yanıtlayalım.
                            </p>
                          </div>
                        ) : (
                          <div className={styles.messages}>
                            {messages.map((m) => (
                              <div
                                key={m.id}
                                className={m.senderType === "user" ? styles.messageRowUser : styles.messageRowAdmin}
                              >
                                <div className={m.senderType === "user" ? styles.bubbleUser : styles.bubbleAdmin}>
                                  {m.senderType === "admin" ? (
                                    <p className={styles.bubbleSender}>Bilirkişi Hesap</p>
                                  ) : null}
                                  {m.imageUrl ? (
                                    <a href={imgUrl(m.imageUrl)} target="_blank" rel="noopener noreferrer">
                                      <img
                                        src={imgUrl(m.imageUrl)}
                                        alt="Gönderilen görsel"
                                        className={styles.bubbleImage}
                                      />
                                    </a>
                                  ) : null}
                                  {m.message && m.message !== "[Görsel]" ? <p>{m.message}</p> : null}
                                  <p className={styles.bubbleMeta}>
                                    {new Date(m.createdAt).toLocaleTimeString("tr-TR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <form
                        id="support-offline-form"
                        className={styles.offlineForm}
                        onSubmit={(e) => {
                          e.preventDefault();
                          void submitOfflineTicket();
                        }}
                      >
                        {offlineSubmitState === "error" && offlineSubmitError ? (
                          <p className={styles.alertError}>{offlineSubmitError}</p>
                        ) : null}

                        <p className={styles.formIntro}>
                          Ekibimiz şu an çevrimdışı. Formu doldurun; talebiniz destek paneline kaydedilir.
                        </p>

                        <div>
                          <p className={styles.fieldLabel}>Konu seçin</p>
                          <div className={styles.topicGrid}>
                            {OFFLINE_TOPICS.map((topic) => (
                              <button
                                key={topic}
                                type="button"
                                className={`${styles.topicChip} ${offlineTopic === topic ? styles.topicChipActive : ""}`}
                                onClick={() => selectTopic(topic)}
                              >
                                {topic}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className={styles.fieldLabel} htmlFor="support-offline-name">
                            Ad Soyad
                          </label>
                          <input
                            id="support-offline-name"
                            className={styles.fieldInput}
                            value={offlineName}
                            onChange={(e) => setOfflineName(e.target.value)}
                            maxLength={120}
                            required
                          />
                        </div>

                        <div>
                          <label className={styles.fieldLabel} htmlFor="support-offline-email">
                            E-posta
                          </label>
                          <input
                            id="support-offline-email"
                            type="email"
                            className={styles.fieldInput}
                            value={offlineEmail}
                            onChange={(e) => setOfflineEmail(e.target.value)}
                            maxLength={200}
                            required
                          />
                        </div>

                        <div>
                          <label className={styles.fieldLabel} htmlFor="support-offline-message">
                            Mesaj
                          </label>
                          <textarea
                            id="support-offline-message"
                            className={styles.fieldTextarea}
                            value={offlineMessage}
                            onChange={(e) => setOfflineMessage(e.target.value.slice(0, 2000))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void submitOfflineTicket();
                              }
                            }}
                            placeholder="Mesajınızı yazın…"
                            required
                          />
                        </div>

                        <div className={styles.offlineFormActions}>
                          <Button type="submit" disabled={offlineSubmitting}>
                            {offlineSubmitting ? "Gönderiliyor…" : "Mesajı Gönder"}
                          </Button>
                          <p className={styles.helpText}>
                            Enter ile gönderebilirsiniz. Shift+Enter yeni satır ekler.
                          </p>
                        </div>
                      </form>
                    )}
                  </div>
                </div>

                {!(offlineSubmitState === "success" && isOfflineMode) && isOnline ? (
                  <footer className={styles.footer}>
                    <div className={styles.footerRow}>
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value.slice(0, 1000))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendMessage();
                          }
                        }}
                        placeholder="Mesajınızı yazın…"
                        maxLength={1000}
                        enterKeyHint="send"
                        autoComplete="off"
                        className={`${styles.fieldInput} ${styles.footerInput}`}
                      />
                      <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={!input.trim() || sending}
                        className={styles.sendBtn}
                        aria-label="Gönder"
                      >
                        <Send className={styles.sendIcon} aria-hidden />
                      </button>
                    </div>
                    <p className={styles.helpText}>
                      <span className={styles.helpTextFull}>Enter ile gönderebilirsiniz.</span>
                      <span className={styles.helpTextShort}>Enter = gönder</span>
                    </p>
                  </footer>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
