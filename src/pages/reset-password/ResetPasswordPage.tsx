import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, Lock } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useToast } from "@/context/ToastContext";
import styles from "./ResetPasswordPage.module.css";

export default function ResetPasswordPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const passwordId = useId();
  const confirmId = useId();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decodedEmail = (() => {
    try {
      return decodeURIComponent(email);
    } catch {
      return email;
    }
  })();

  const linkValid = Boolean(token && decodedEmail);

  useEffect(() => {
    if (!linkValid) {
      toast.error("Geçersiz şifre sıfırlama bağlantısı");
      const timer = window.setTimeout(() => navigate("/login", { replace: true }), 2000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [linkValid, navigate, toast]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalıdır");
      return;
    }
    if (password !== confirmPassword) {
      setError("Şifreler eşleşmiyor");
      return;
    }
    setLoading(true);
    try {
      await apiClient("/api/auth/reset-password", {
        method: "POST",
        body: { token, email: decodedEmail, newPassword: password },
        skipAuth: true,
      });
      setDone(true);
      toast.success("Şifreniz başarıyla güncellendi.");
      window.setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şifre güncellenemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  if (!linkValid) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <div className={styles.card}>
            <h1 className={styles.title}>Geçersiz bağlantı</h1>
            <p className={styles.sub}>Giriş sayfasına yönlendiriliyorsunuz…</p>
            <Link to="/login" className={styles.backLink}>
              <ArrowLeft size={16} aria-hidden />
              Giriş sayfasına dön
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.card}>
          {done ? (
            <>
              <h1 className={styles.title}>Şifre güncellendi</h1>
              <p className={styles.sub}>Giriş sayfasına yönlendiriliyorsunuz…</p>
              <Link to="/login" className={styles.backLink}>
                <ArrowLeft size={16} aria-hidden />
                Giriş sayfasına dön
              </Link>
            </>
          ) : (
            <>
              <h1 className={styles.title}>Yeni şifre oluştur</h1>
              <p className={styles.sub}>
                <Lock size={15} className={styles.subIcon} aria-hidden />
                Hesabınız için yeni bir şifre belirleyin.
              </p>
              <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>E-posta</label>
                  <input type="email" value={decodedEmail} disabled className={styles.input} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor={passwordId}>
                    Yeni şifre
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      id={passwordId}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="En az 6 karakter"
                      className={styles.input}
                    />
                    <button
                      type="button"
                      className={styles.toggle}
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor={confirmId}>
                    Yeni şifre (tekrar)
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      id={confirmId}
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Şifrenizi tekrar girin"
                      className={styles.input}
                    />
                    <button
                      type="button"
                      className={styles.toggle}
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={showConfirm ? "Şifreyi gizle" : "Şifreyi göster"}
                    >
                      {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {error ? (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  className={styles.submit}
                  disabled={loading || (Boolean(confirmPassword) && password !== confirmPassword)}
                >
                  {loading ? "Güncelleniyor…" : "Şifreyi güncelle"}
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
