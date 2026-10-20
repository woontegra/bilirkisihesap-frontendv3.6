import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Eye, EyeOff, Lock } from "lucide-react";
import { changePassword, fetchAuthMe } from "@/api/profile";
import {
  isMustChangePasswordRequired,
  setMustChangePasswordRequired,
} from "@/auth/session";
import { Button } from "@/components/ui/Button";
import styles from "./ForcePasswordChangeModal.module.css";

/**
 * Demo / geçici şifre ilk girişinde zorunlu şifre değiştirme.
 * Backend User.must_change_password + login.requirePasswordChange ile bağlanır.
 * Kapatılamaz / atlanamaz.
 */
export function ForcePasswordChangeModal() {
  const [open, setOpen] = useState(() => isMustChangePasswordRequired());
  const [checking, setChecking] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await fetchAuthMe();
        if (cancelled) return;
        const required = me.mustChangePassword === true || isMustChangePasswordRequired();
        setMustChangePasswordRequired(required);
        setOpen(required);
      } catch {
        if (!cancelled) setOpen(isMustChangePasswordRequired());
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (checking && !open) return null;
  if (!open || typeof document === "undefined") return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!newPassword || !confirmPassword) {
      setError("Lütfen tüm alanları doldurun.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Yeni şifre en az 8 karakter olmalıdır.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    setLoading(true);
    try {
      // Forced flow: backend eski şifre istemez (mustChangePassword === true)
      await changePassword({ newPassword });
      setMustChangePasswordRequired(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şifre değiştirilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="force-pw-title">
      <div className={styles.card}>
        <div className={styles.iconWrap} aria-hidden>
          <Lock size={28} />
        </div>
        <h2 id="force-pw-title" className={styles.title}>
          Şifre Değiştirme Zorunlu
        </h2>
        <p className={styles.subtitle}>
          Geçici şifrenizle ilk girişiniz. Güvenliğiniz için lütfen kalıcı bir şifre belirleyin. Bu adımı
          tamamlamadan devam edemezsiniz.
        </p>

        {error ? (
          <div className={styles.error} role="alert">
            <AlertCircle size={16} aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
          <label className={styles.label} htmlFor="force-pw-new">
            Yeni şifre
          </label>
          <div className={styles.inputWrap}>
            <input
              id="force-pw-new"
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={styles.input}
              placeholder="En az 8 karakter"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button
              type="button"
              className={styles.eye}
              onClick={() => setShowNew((v) => !v)}
              tabIndex={-1}
              aria-label={showNew ? "Şifreyi gizle" : "Şifreyi göster"}
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <label className={styles.label} htmlFor="force-pw-confirm">
            Yeni şifre (tekrar)
          </label>
          <div className={styles.inputWrap}>
            <input
              id="force-pw-confirm"
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              placeholder="Şifreyi tekrar girin"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button
              type="button"
              className={styles.eye}
              onClick={() => setShowConfirm((v) => !v)}
              tabIndex={-1}
              aria-label={showConfirm ? "Şifreyi gizle" : "Şifreyi göster"}
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <Button type="submit" disabled={loading} className={styles.submit}>
            {loading ? "Kaydediliyor…" : "Şifreyi Değiştir"}
          </Button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
