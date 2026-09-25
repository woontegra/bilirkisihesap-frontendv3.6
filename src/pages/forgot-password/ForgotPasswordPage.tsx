import { useId, useState, type FormEvent } from "react";
import { ArrowLeft, Mail, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useToast } from "@/context/ToastContext";
import styles from "./ForgotPasswordPage.module.css";

export default function ForgotPasswordPage() {
  const toast = useToast();
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiClient("/api/auth/forgot-password", {
        method: "POST",
        body: { email: email.trim() },
        skipAuth: true,
      });
      setSent(true);
      toast.success("Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.card}>
          {sent ? (
            <>
              <h1 className={styles.title}>E-posta gönderildi</h1>
              <p className={styles.sub}>
                Şifre sıfırlama bağlantısı gönderildi:
                <strong className={styles.email}>{email.trim()}</strong>
              </p>
              <p className={styles.hint}>Lütfen e-posta kutunuzu kontrol edin ve bağlantıya tıklayın.</p>
              <Link to="/login" className={styles.backLink}>
                <ArrowLeft size={16} aria-hidden />
                Giriş sayfasına dön
              </Link>
            </>
          ) : (
            <>
              <h1 className={styles.title}>Şifre sıfırlama</h1>
              <p className={styles.sub}>
                <Shield size={15} className={styles.subIcon} aria-hidden />
                E-posta adresinize şifre sıfırlama bağlantısı göndereceğiz
              </p>
              <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor={emailId}>
                    <Mail size={14} aria-hidden />
                    E-posta
                  </label>
                  <input
                    id={emailId}
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ornek@firma.com"
                    className={styles.input}
                  />
                </div>
                {error ? (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                ) : null}
                <button type="submit" className={styles.submit} disabled={loading}>
                  {loading ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
                </button>
              </form>
              <Link to="/login" className={styles.backLink}>
                <ArrowLeft size={16} aria-hidden />
                Giriş sayfasına dön
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
