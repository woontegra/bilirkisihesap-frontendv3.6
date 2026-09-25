import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  changePassword,
  fetchAuthMe,
  updateNotificationPrefs,
} from "@/api/profile";
import { logout } from "@/auth/session";
import { FormField } from "@/components/admin/FormField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { applyTheme, getStoredTheme, type Theme } from "@/theme/theme";
import styles from "./profileTabShared.module.css";

export default function SettingsTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const [passwordData, setPasswordData] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [notifications, setNotifications] = useState({ email: true, login: true });
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onThemeChanged = () => setTheme(getStoredTheme());
    window.addEventListener("theme-changed", onThemeChanged);
    return () => window.removeEventListener("theme-changed", onThemeChanged);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetchAuthMe();
        setNotifications({
          email: me.emailNotifications ?? true,
          login: me.loginAlerts ?? true,
        });
      } catch {
        /* varsayılan */
      }
    })();
  }, []);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("Yeni şifreler eşleşmiyor");
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast.error("Yeni şifre en az 8 karakter olmalıdır");
      return;
    }
    setPasswordLoading(true);
    try {
      await changePassword({
        oldPassword: passwordData.oldPassword,
        newPassword: passwordData.newPassword,
      });
      toast.success("Şifre başarıyla değiştirildi! Yeni şifrenizle giriş yapın.");
      window.setTimeout(() => {
        logout();
        navigate("/login", { replace: true });
      }, 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Şifre değiştirilirken bir hata oluştu");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleNotificationChange = async (type: "email" | "login", value: boolean) => {
    const previous = notifications;
    const next = { ...notifications, [type]: value };
    setNotifications(next);
    setNotifLoading(true);
    try {
      await updateNotificationPrefs({
        emailNotifications: next.email,
        loginAlerts: next.login,
      });
      toast.success("Bildirim ayarları güncellendi");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ayarlar kaydedilirken bir hata oluştu");
      setNotifications(previous);
    } finally {
      setNotifLoading(false);
    }
  };

  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Tema Ayarı</h3>
        <p className={styles.panelDesc}>Görünüm tercihinizi seçin</p>
        <FormField label="Tema">
          <select
            id="theme"
            className={styles.themeSelect}
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
          >
            <option value="light">Açık</option>
            <option value="dark">Koyu</option>
          </select>
        </FormField>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Şifre Değiştir</h3>
        <p className={styles.panelDesc}>Hesap güvenliğiniz için şifrenizi güncelleyin</p>
        <form onSubmit={handlePasswordSubmit}>
          <div className={styles.formGrid}>
            <FormField label="Eski Şifre">
              <input
                type="password"
                name="oldPassword"
                value={passwordData.oldPassword}
                onChange={(e) =>
                  setPasswordData((p) => ({ ...p, oldPassword: e.target.value }))
                }
                required
                autoComplete="current-password"
              />
            </FormField>
            <div />
            <FormField label="Yeni Şifre">
              <input
                type="password"
                name="newPassword"
                value={passwordData.newPassword}
                onChange={(e) =>
                  setPasswordData((p) => ({ ...p, newPassword: e.target.value }))
                }
                required
                minLength={8}
                autoComplete="new-password"
              />
            </FormField>
            <FormField label="Yeni Şifre Tekrar">
              <input
                type="password"
                name="confirmPassword"
                value={passwordData.confirmPassword}
                onChange={(e) =>
                  setPasswordData((p) => ({ ...p, confirmPassword: e.target.value }))
                }
                required
                minLength={8}
                autoComplete="new-password"
              />
            </FormField>
          </div>
          <div className={styles.actions}>
            <Button type="submit" variant="primary" disabled={passwordLoading}>
              {passwordLoading ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Bildirim Tercihleri</h3>
        <p className={styles.panelDesc}>E-posta ve güvenlik bildirimlerini yönetin</p>
        <div className={styles.switchRow}>
          <div className={styles.switchLabel}>
            <strong>E-posta bildirimleri</strong>
            <span>Hesap ve abonelik bildirimleri</span>
          </div>
          <button
            type="button"
            className={`${styles.switch} ${notifications.email ? styles.switchOn : ""}`}
            aria-pressed={notifications.email}
            disabled={notifLoading}
            onClick={() => void handleNotificationChange("email", !notifications.email)}
          >
            <span className={styles.switchKnob} />
          </button>
        </div>
        <div className={styles.switchRow}>
          <div className={styles.switchLabel}>
            <strong>Giriş uyarıları</strong>
            <span>Yeni oturum açıldığında bilgilendir</span>
          </div>
          <button
            type="button"
            className={`${styles.switch} ${notifications.login ? styles.switchOn : ""}`}
            aria-pressed={notifications.login}
            disabled={notifLoading}
            onClick={() => void handleNotificationChange("login", !notifications.login)}
          >
            <span className={styles.switchKnob} />
          </button>
        </div>
      </section>
    </div>
  );
}
