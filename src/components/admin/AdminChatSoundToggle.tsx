import { useCallback, useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  disableAdminChatSound,
  enableAdminChatSoundWithTest,
  isAdminChatSoundEnabled,
  preloadAdminChatNotificationSound,
} from "@/utils/adminChatNotificationSound";
import styles from "./AdminChatSoundToggle.module.css";

export default function AdminChatSoundToggle() {
  const [enabled, setEnabled] = useState(() => isAdminChatSoundEnabled());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = isAdminChatSoundEnabled();
    setEnabled(on);
    if (on) {
      preloadAdminChatNotificationSound();
    }
  }, []);

  const handleEnable = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await enableAdminChatSoundWithTest();
      if (ok) {
        setEnabled(true);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDisable = useCallback(() => {
    disableAdminChatSound();
    setEnabled(false);
  }, []);

  if (enabled) {
    return (
      <button
        type="button"
        className={styles.toggle}
        onClick={handleDisable}
        title="Sesli bildirimleri kapat"
        aria-label="Sesli bildirimleri kapat"
      >
        <Volume2 className={styles.iconOn} aria-hidden />
        <span className={styles.label}>Ses açık</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={() => void handleEnable()}
      disabled={busy}
      title="Sesli bildirimleri aç"
      aria-label="Sesli bildirimleri aç"
    >
      <VolumeX className={styles.iconOff} aria-hidden />
      <span className={styles.label}>{busy ? "..." : "Sesli bildirim"}</span>
    </button>
  );
}
