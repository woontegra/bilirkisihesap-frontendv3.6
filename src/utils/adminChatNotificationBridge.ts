export const ADMIN_CHAT_REPLY_SENT_EVENT = "admin-chat-reply-sent";

export type AdminChatReplySentDetail = {
  conversationId: string;
  lastMessageAt?: string;
};

export function emitAdminChatReplySent(detail: AdminChatReplySentDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADMIN_CHAT_REPLY_SENT_EVENT, { detail }));
}
