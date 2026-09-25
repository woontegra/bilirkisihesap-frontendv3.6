import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import AdminChatSoundToggle from "@/components/admin/AdminChatSoundToggle";
import { useAdminChatMessageNotifications } from "@/hooks/useAdminChatMessageNotifications";
import styles from "./AdminHeaderChatActions.module.css";

export default function AdminHeaderChatActions() {
  const { displayLiveChatBadge, pendingReplyCount } = useAdminChatMessageNotifications();

  const chatTitle =
    pendingReplyCount > 0
      ? `${pendingReplyCount} cevap bekleyen sohbet`
      : "Canlı sohbet";

  return (
    <>
      <Link to="/admin/chat" className={styles.chatLink} aria-label={chatTitle} title={chatTitle}>
        <MessageCircle className={styles.chatIcon} aria-hidden />
        {displayLiveChatBadge > 0 ? (
          <span className={styles.chatBadge}>
            {displayLiveChatBadge > 9 ? "9+" : displayLiveChatBadge}
          </span>
        ) : null}
      </Link>
      <AdminChatSoundToggle />
    </>
  );
}
