import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiClient } from "@/api/client";
import { readIsAdmin } from "@/api/dashboard";
import {
  ADMIN_CHAT_REPLY_SENT_EVENT,
  type AdminChatReplySentDetail,
} from "@/utils/adminChatNotificationBridge";
import {
  isAdminChatSoundEnabled,
  isUserChatMessage,
  playAdminChatNotificationSound,
  preloadAdminChatNotificationSound,
} from "@/utils/adminChatNotificationSound";

const POLL_INTERVAL_MS = 5000;
const ALARM_INTERVAL_MS = 10_000;
const TITLE_FLASH_MS = 3000;
const TITLE_FLASH_TEXT = "Yeni mesaj - Bilirkişi Hesap";

type ConversationRow = {
  id: string;
  status?: string;
  lastMessageAt: string | null;
  unreadCount?: number;
};

type ChatMessageRow = {
  id: string | number;
  senderType: string;
  createdAt?: string;
};

type ConversationTrack = {
  lastMessageAt: string;
  lastMessageId: string;
  lastSenderType: string;
};

function readIsAdminUser(): boolean {
  return readIsAdmin();
}

function hasAccessToken(): boolean {
  return !!localStorage.getItem("access_token");
}

function isOpenConversation(conv: ConversationRow): boolean {
  return (conv.status ?? "open") === "open";
}

export function useAdminChatMessageNotifications() {
  const location = useLocation();
  const [liveChatUnreadCount, setLiveChatUnreadCount] = useState(0);
  const [pendingReplyCount, setPendingReplyCount] = useState(0);
  const [badgeSuppressed, setBadgeSuppressed] = useState(false);

  const initializedRef = useRef(false);
  const convSnapshotRef = useRef<Map<string, string>>(new Map());
  const convTrackRef = useRef<Map<string, ConversationTrack>>(new Map());
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const alarmIntervalRef = useRef<number | null>(null);
  const titleFlashTimerRef = useRef<number | null>(null);
  const baseTitleRef = useRef(typeof document !== "undefined" ? document.title : "Bilirkişi Hesap");

  const syncPendingCount = useCallback(() => {
    setPendingReplyCount(pendingIdsRef.current.size);
  }, []);

  const stopAlarmLoop = useCallback(() => {
    if (alarmIntervalRef.current) {
      window.clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  }, []);

  const flashTabTitle = useCallback(() => {
    if (typeof document === "undefined") return;
    if (titleFlashTimerRef.current) {
      clearTimeout(titleFlashTimerRef.current);
    }
    document.title = TITLE_FLASH_TEXT;
    titleFlashTimerRef.current = window.setTimeout(() => {
      document.title = baseTitleRef.current;
      titleFlashTimerRef.current = null;
    }, TITLE_FLASH_MS);
  }, []);

  const startAlarmLoop = useCallback(() => {
    if (alarmIntervalRef.current) return;
    if (!isAdminChatSoundEnabled() || pendingIdsRef.current.size === 0) return;

    alarmIntervalRef.current = window.setInterval(() => {
      if (!isAdminChatSoundEnabled() || pendingIdsRef.current.size === 0) {
        stopAlarmLoop();
        return;
      }
      void playAdminChatNotificationSound();
    }, ALARM_INTERVAL_MS);
  }, [stopAlarmLoop]);

  const applyPendingState = useCallback(
    (conversationId: string, needsReply: boolean, options?: { flashTitle?: boolean }) => {
      const hadPending = pendingIdsRef.current.size > 0;
      const wasPending = pendingIdsRef.current.has(conversationId);

      if (needsReply) {
        pendingIdsRef.current.add(conversationId);
      } else {
        pendingIdsRef.current.delete(conversationId);
      }

      syncPendingCount();

      const hasPending = pendingIdsRef.current.size > 0;
      if (!hasPending) {
        stopAlarmLoop();
        return;
      }

      if (!isAdminChatSoundEnabled()) {
        stopAlarmLoop();
        return;
      }

      if (!hadPending) {
        void playAdminChatNotificationSound();
        startAlarmLoop();
        if (options?.flashTitle) {
          flashTabTitle();
        }
        return;
      }

      if (needsReply && !wasPending && options?.flashTitle) {
        flashTabTitle();
      }

      if (!alarmIntervalRef.current) {
        startAlarmLoop();
      }
    },
    [flashTabTitle, startAlarmLoop, stopAlarmLoop, syncPendingCount],
  );

  const fetchLatestMessage = useCallback(async (conversationId: string): Promise<ChatMessageRow | null> => {
    try {
      const data = await apiClient<{ messages?: ChatMessageRow[] }>(
        `/api/admin/chat/messages/${conversationId}`,
      );
      const messages = data?.messages ?? [];
      return messages.length > 0 ? messages[messages.length - 1] : null;
    } catch {
      return null;
    }
  }, []);

  const recordConversationTrack = useCallback((conversationId: string, latest: ChatMessageRow, at: string) => {
    convTrackRef.current.set(conversationId, {
      lastMessageAt: at,
      lastMessageId: String(latest.id),
      lastSenderType: latest.senderType,
    });
  }, []);

  const bootstrapConversation = useCallback(
    async (conv: ConversationRow) => {
      const latest = await fetchLatestMessage(conv.id);
      const at = conv.lastMessageAt ?? "";
      convSnapshotRef.current.set(conv.id, at);
      if (latest) {
        recordConversationTrack(conv.id, latest, at);
      }
    },
    [fetchLatestMessage, recordConversationTrack],
  );

  const evaluateConversationPending = useCallback(
    async (conv: ConversationRow, options?: { flashTitle?: boolean }) => {
      if (!isOpenConversation(conv)) {
        applyPendingState(conv.id, false);
        return;
      }

      const latest = await fetchLatestMessage(conv.id);
      const at = conv.lastMessageAt ?? "";
      convSnapshotRef.current.set(conv.id, at);

      if (!latest) {
        applyPendingState(conv.id, false);
        return;
      }

      recordConversationTrack(conv.id, latest, at);

      const needsReply = isUserChatMessage(latest.senderType);
      applyPendingState(conv.id, needsReply, {
        flashTitle: options?.flashTitle && needsReply,
      });
    },
    [applyPendingState, fetchLatestMessage, recordConversationTrack],
  );

  const pollConversations = useCallback(async () => {
    if (!readIsAdminUser() || !hasAccessToken()) return;

    try {
      const data = await apiClient<{ conversations?: ConversationRow[] }>(
        "/api/admin/chat/conversations",
      );
      const conversations = (data?.conversations ?? []).filter(isOpenConversation);
      const openIds = new Set(conversations.map((c) => c.id));

      for (const pendingId of [...pendingIdsRef.current]) {
        if (!openIds.has(pendingId)) {
          applyPendingState(pendingId, false);
        }
      }

      const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
      setLiveChatUnreadCount(totalUnread);

      if (!initializedRef.current) {
        for (const conv of conversations) {
          await bootstrapConversation(conv);
        }
        initializedRef.current = true;
        return;
      }

      for (const conv of conversations) {
        const prevAt = convSnapshotRef.current.get(conv.id) ?? "";
        const currentAt = conv.lastMessageAt ?? "";
        const inPending = pendingIdsRef.current.has(conv.id);
        const atChanged = !!currentAt && currentAt !== prevAt;

        if (atChanged || inPending) {
          await evaluateConversationPending(conv, { flashTitle: atChanged });
        } else {
          convSnapshotRef.current.set(conv.id, currentAt);
        }
      }

      for (const pendingId of [...pendingIdsRef.current]) {
        const conv = conversations.find((c) => c.id === pendingId);
        if (conv) {
          await evaluateConversationPending(conv);
        }
      }
    } catch {
      /* sessiz */
    }
  }, [
    applyPendingState,
    bootstrapConversation,
    evaluateConversationPending,
    stopAlarmLoop,
    syncPendingCount,
  ]);

  useEffect(() => {
    if (!readIsAdminUser() || !hasAccessToken()) return;

    if (isAdminChatSoundEnabled()) {
      preloadAdminChatNotificationSound();
    }

    void pollConversations();
    const pollTimer = window.setInterval(() => {
      void pollConversations();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollTimer);
      stopAlarmLoop();
    };
  }, [pollConversations, stopAlarmLoop]);

  useEffect(() => {
    const onAdminReplySent = (event: Event) => {
      const detail = (event as CustomEvent<AdminChatReplySentDetail>).detail;
      const conversationId = detail?.conversationId;
      if (!conversationId) return;

      pendingIdsRef.current.delete(conversationId);
      syncPendingCount();

      const at = detail.lastMessageAt ?? new Date().toISOString();
      convSnapshotRef.current.set(conversationId, at);
      convTrackRef.current.set(conversationId, {
        lastMessageAt: at,
        lastMessageId: "admin-reply",
        lastSenderType: "admin",
      });

      if (pendingIdsRef.current.size === 0) {
        stopAlarmLoop();
      }
    };

    window.addEventListener(ADMIN_CHAT_REPLY_SENT_EVENT, onAdminReplySent);
    return () => window.removeEventListener(ADMIN_CHAT_REPLY_SENT_EVENT, onAdminReplySent);
  }, [stopAlarmLoop, syncPendingCount]);

  useEffect(() => {
    const onSoundPreferenceChanged = () => {
      if (!isAdminChatSoundEnabled()) {
        stopAlarmLoop();
        return;
      }
      if (pendingIdsRef.current.size > 0) {
        void playAdminChatNotificationSound();
        startAlarmLoop();
      }
    };

    window.addEventListener("admin-chat-sound-changed", onSoundPreferenceChanged);
    return () => window.removeEventListener("admin-chat-sound-changed", onSoundPreferenceChanged);
  }, [startAlarmLoop, stopAlarmLoop]);

  useEffect(() => {
    if (location.pathname.startsWith("/admin/chat")) {
      setBadgeSuppressed(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      stopAlarmLoop();
      if (titleFlashTimerRef.current) {
        clearTimeout(titleFlashTimerRef.current);
      }
    };
  }, [stopAlarmLoop]);

  const displayLiveChatBadge =
    !badgeSuppressed && liveChatUnreadCount > 0 ? liveChatUnreadCount : 0;

  return {
    liveChatUnreadCount,
    displayLiveChatBadge,
    pendingReplyCount,
  };
}
