import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAuthMe } from "@/api/profile";
import { readCurrentUser } from "@/auth/session";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { formatUserRoleLabel } from "@/utils/userRole";
import { resolveUserDisplayName } from "@/utils/userDisplay";
import UploadAvatarDialog from "./UploadAvatarDialog";
import styles from "./ProfileHeader.module.css";

function formatSubscriptionDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return "-";
  }
}

function getSubscriptionTypeLabel(type: string | null | undefined): string {
  if (!type) return "Abonelik Yok";
  const labels: Record<string, string> = {
    annual: "Yıllık Standart Abonelik",
    monthly: "Aylık Standart Abonelik",
    trial: "Deneme Aboneliği",
    starter: "Başlangıç",
    professional: "Profesyonel",
    demo: "Demo",
  };
  return labels[type] || type;
}

export default function ProfileHeader() {
  const stored = readCurrentUser();
  const [name, setName] = useState(resolveUserDisplayName(stored?.name));
  const [email, setEmail] = useState(stored?.email || "");
  const [role, setRole] = useState(stored?.role || "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string | null>(null);
  const [subscriptionType, setSubscriptionType] = useState<string | null>(
    stored?.licenseType ?? null,
  );

  const { userId, avatarUrl, setAvatar, handleAvatarError, handleAvatarLoad } = useUserAvatar();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const me = await fetchAuthMe();
        if (!active) return;
        if (typeof me.name === "string" && me.name.trim()) setName(resolveUserDisplayName(me.name));
        if (typeof me.email === "string" && me.email.trim()) setEmail(me.email);
        if (typeof me.role === "string" && me.role.trim()) setRole(me.role);
        setSubscriptionEndsAt(
          typeof me.subscriptionEndsAt === "string" ? me.subscriptionEndsAt : null,
        );
        setSubscriptionType(
          (typeof me.subscriptionType === "string" ? me.subscriptionType : null) ||
            (typeof me.licenseType === "string" ? me.licenseType : null),
        );
      } catch {
        /* ignore */
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const roleLabel = formatUserRoleLabel(role);

  const initials = (name || email || "U")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.avatarButton}
          onClick={() => setDialogOpen(true)}
          aria-label="Profil resmini değiştir"
        >
          <span className={styles.avatar}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className={styles.avatarImg}
                onError={handleAvatarError}
                onLoad={handleAvatarLoad}
              />
            ) : (
              <span className={styles.avatarFallback}>{initials}</span>
            )}
          </span>
          <span className={styles.avatarOverlay} aria-hidden>
            <Camera size={18} />
            <span>Değiştir</span>
          </span>
        </button>
        <div className={styles.meta}>
          <h2 className={styles.name}>{resolveUserDisplayName(name)}</h2>
          {email ? <p className={styles.email}>{email}</p> : null}
          <div className={styles.badges}>
            {roleLabel ? <span className={styles.role}>{roleLabel}</span> : null}
            <span className={styles.subStatus}>
              <span className={styles.dot} aria-hidden />
              {getSubscriptionTypeLabel(subscriptionType)}
            </span>
            <span className={styles.renewal}>
              Yenileme: {formatSubscriptionDate(subscriptionEndsAt)}
            </span>
          </div>
        </div>
      </header>

      <UploadAvatarDialog
        open={dialogOpen}
        userId={userId}
        userName={name}
        currentAvatarUrl={avatarUrl}
        onOpenChange={setDialogOpen}
        onAvatarChange={setAvatar}
      />
    </>
  );
}
