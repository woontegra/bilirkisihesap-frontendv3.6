import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  Calculator,
  Eye,
  EyeOff,
  Lock,
  Scale,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { fetchAuthMe } from "@/api/profile";
import {
  decodeAccessTokenClaims,
  isAuthenticated,
  loginWithPassword,
  logout,
} from "@/auth/session";
import {
  licenseDecisionFromMe,
  postLoginPath,
  readLicenseAccessSnapshot,
  writeLicenseAccessSnapshot,
} from "@/license/access";
import { LicenseLoadingScreen } from "@/license/LicenseLoadingScreen";
import { usePanelBranding } from "@/context/PanelBrandingContext";
import { PANEL_FALLBACK_LOGO_URL } from "@/types/panelBranding";
import styles from "./LoginPage.module.css";

const HERO_WORDS = ["Fazla Mesai", "Kıdem Tazminatı", "İhbar Tazminatı", "Yıllık İzin", "UBGT"];
const FLOAT_ICONS = [Calculator, Scale, TrendingUp, Sparkles] as const;
const SUCCESS_REDIRECT_MS = 2200;

type SuccessTransition = {
  userName: string;
  role?: string | null;
  licenseActive?: boolean | null;
  licenseAccessCode?: string | null;
  licenseStatus?: string | null;
};

function resolveWelcomeName(name?: string | null, email?: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const mail = email?.trim();
  if (!mail) return "Kullanıcı";
  const local = mail.split("@")[0]?.trim();
  return local || mail;
}

function useRotatingWord(words: string[], intervalMs = 2800) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 960px)");
    let id: number | undefined;

    const sync = () => {
      if (id !== undefined) window.clearInterval(id);
      id = undefined;
      if (!desktop.matches) return;
      id = window.setInterval(() => {
        setIndex((prev) => (prev + 1) % words.length);
      }, intervalMs);
    };

    sync();
    desktop.addEventListener("change", sync);
    return () => {
      if (id !== undefined) window.clearInterval(id);
      desktop.removeEventListener("change", sync);
    };
  }, [words.length, intervalMs]);

  return words[index];
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { branding, loginLogoSrc, ready } = usePanelBranding();
  const pageRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoVisible, setLogoVisible] = useState(true);
  const [loginLogoAttempt, setLoginLogoAttempt] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [successTransition, setSuccessTransition] = useState<SuccessTransition | null>(null);
  const [checkingLicense, setCheckingLicense] = useState(false);

  const rotatingWord = useRotatingWord(HERO_WORDS);
  const emailId = useId();
  const passwordId = useId();
  const resolvedLoginLogoSrc =
    loginLogoAttempt === 0 ? loginLogoSrc : PANEL_FALLBACK_LOGO_URL;

  useEffect(() => {
    setLoginLogoAttempt(0);
    setLogoVisible(true);
  }, [loginLogoSrc]);
  const bokeh = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: `${(i * 19 + 5) % 100}%`,
        top: `${(i * 27 + 9) % 100}%`,
        size: 80 + (i % 5) * 48,
        delay: `${(i % 9) * 0.6}s`,
        duration: `${14 + (i % 6) * 3}s`,
        tone: i % 3,
      })),
    [],
  );

  useEffect(() => {
    const remembered = localStorage.getItem("remember_email");
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    if (window.matchMedia("(pointer: coarse)").matches) return undefined;

    const onMove = (event: MouseEvent) => {
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      page.style.setProperty("--mx", x.toFixed(4));
      page.style.setProperty("--my", y.toFixed(4));
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (!successTransition) return;
    const timer = window.setTimeout(() => {
      const target = postLoginPath({
        role: successTransition.role,
        licenseActive: successTransition.licenseActive,
        licenseAccessCode: successTransition.licenseAccessCode,
        licenseStatus: successTransition.licenseStatus,
      });
      navigate(target, { replace: true });
    }, SUCCESS_REDIRECT_MS);
    return () => window.clearTimeout(timer);
  }, [navigate, successTransition]);

  if (isAuthenticated() && !successTransition && !checkingLicense) {
    const userId = decodeAccessTokenClaims()?.userId ?? null;
    const snap = readLicenseAccessSnapshot(userId);
    if (snap) {
      const target = postLoginPath({
        role: snap.isAdmin ? "admin" : "user",
        licenseActive: snap.allowed,
        licenseAccessCode: snap.code,
        licenseStatus: snap.code,
      });
      return <Navigate to={target} replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = await loginWithPassword(email.trim(), password);
      if (rememberMe) {
        localStorage.setItem("remember_email", email.trim());
      } else {
        localStorage.removeItem("remember_email");
      }

      setLoading(false);
      setCheckingLicense(true);

      let role = payload.user.role;
      let licenseActive = payload.licenseActive ?? null;
      let licenseAccessCode = payload.licenseAccessCode ?? null;
      let licenseStatus = payload.licenseStatus ?? null;
      let licenseType = payload.licenseType ?? null;
      let subscriptionEndsAt = payload.subscriptionEndsAt ?? null;
      let userId = Number(payload.user.id);

      try {
        const me = await fetchAuthMe({ force: true });
        role = me.role ?? role;
        licenseActive = me.licenseActive ?? licenseActive;
        licenseAccessCode = me.licenseAccessCode ?? licenseAccessCode;
        licenseStatus = me.licenseStatus ?? licenseStatus;
        licenseType = me.licenseType ?? licenseType;
        subscriptionEndsAt = me.subscriptionEndsAt ?? subscriptionEndsAt;
        userId = Number(me.id ?? userId);
      } catch {
        // Giriş yanıtındaki lisans alanları yeterli değilse oturumu kapat.
        if (licenseActive == null && !licenseAccessCode && !licenseStatus && String(role || "").toLowerCase() !== "admin") {
          logout();
          setCheckingLicense(false);
          setError("Abonelik durumu doğrulanamadı. Lütfen tekrar giriş yapın.");
          return;
        }
      }

      const decision = licenseDecisionFromMe(
        {
          id: userId,
          role,
          licenseActive,
          licenseAccessCode,
          licenseStatus,
          licenseType,
          subscriptionEndsAt,
        },
        userId,
      );
      if (decision.userId) {
        writeLicenseAccessSnapshot({
          userId: decision.userId,
          allowed: decision.allowed,
          isAdmin: decision.isAdmin,
          code: decision.code,
          licenseType: decision.licenseType,
          subscriptionType: decision.subscriptionType,
          expiresAt: decision.expiresAt,
        });
      }

      setCheckingLicense(false);
      setSuccessTransition({
        userName: resolveWelcomeName(payload.user.name, payload.user.email),
        role,
        licenseActive,
        licenseAccessCode,
        licenseStatus,
      });
    } catch (err) {
      setCheckingLicense(false);
      setError(err instanceof Error ? err.message : "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  }

  if (checkingLicense) {
    return <LicenseLoadingScreen />;
  }

  return (
    <div
      ref={pageRef}
      className={`${styles.page} ${mounted ? styles.pageMounted : ""}`}
      style={{ "--mx": 0, "--my": 0 } as CSSProperties}
    >
      <div className={styles.bg} aria-hidden>
        <div className={styles.bgBase} />
        <div className={styles.bgNoise} />
        <div className={styles.lightBeams}>
          <div className={styles.beam} data-beam="1" />
          <div className={styles.beam} data-beam="2" />
          <div className={styles.beam} data-beam="3" />
        </div>
        <div className={styles.aurora} />
        <svg className={styles.network} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="netGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(94, 200, 216, 0.35)" />
              <stop offset="100%" stopColor="rgba(26, 111, 124, 0.08)" />
            </linearGradient>
          </defs>
          <g className={styles.networkLines} stroke="url(#netGrad)" strokeWidth="0.75" fill="none">
            <path d="M0 420 Q 300 280 520 380 T 1200 320" />
            <path d="M0 580 Q 400 440 680 520 T 1200 480" />
            <path d="M120 0 Q 360 200 600 120 T 1200 80" />
            <path d="M80 800 Q 420 620 760 700 T 1200 760" />
            <circle cx="520" cy="380" r="3" fill="rgba(126, 232, 248, 0.5)" />
            <circle cx="680" cy="520" r="2.5" fill="rgba(126, 232, 248, 0.4)" />
            <circle cx="360" cy="200" r="2" fill="rgba(200, 170, 90, 0.45)" />
            <circle cx="900" cy="320" r="2.5" fill="rgba(126, 232, 248, 0.35)" />
          </g>
        </svg>
        {bokeh.map((b) => (
          <span
            key={b.id}
            className={styles.bokeh}
            data-tone={b.tone}
            style={{
              left: b.left,
              top: b.top,
              width: b.size,
              height: b.size,
              animationDelay: b.delay,
              animationDuration: b.duration,
            }}
          />
        ))}
        <div className={`${styles.orb} ${styles.orbA}`} />
        <div className={`${styles.orb} ${styles.orbB}`} />
        <div className={`${styles.orb} ${styles.orbC}`} />
        <div className={styles.spotlight} />
        <div className={styles.vignette} />
      </div>

      <div className={styles.layout}>
        <aside className={styles.hero} aria-label="Tanıtım">
          <div className={styles.heroInner}>
            <span className={styles.heroBadge}>
              <Zap size={14} aria-hidden />
              Yeni nesil hesaplama motoru
            </span>

            <h1 className={styles.heroTitle}>
              Bilirkişi hesaplamalarında
              <span className={styles.heroTitleAccent}>
                <span key={rotatingWord} className={styles.heroWordSwap}>
                  {rotatingWord}
                </span>
              </span>
            </h1>

            <p className={styles.heroSub}>
              Hızlı, güvenilir ve profesyonel. Tüm iş hukuku hesaplamalarınız tek panelde —
              saniyeler içinde sonuç.
            </p>

            <ul className={styles.heroStats}>
              <li>
                <strong>50+</strong>
                <span>hesaplama türü</span>
              </li>
              <li>
                <strong>v3.5</strong>
                <span>güncel motor</span>
              </li>
              <li>
                <strong>7/24</strong>
                <span>erişim</span>
              </li>
            </ul>

            <div className={styles.floatingIcons} aria-hidden>
              {FLOAT_ICONS.map((Icon, i) => (
                <div key={Icon.name} className={styles.floatingIcon} data-index={i}>
                  <Icon size={22} strokeWidth={1.75} />
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className={styles.main}>
          <div className={styles.cardShell}>
            <div className={styles.cardBorder} aria-hidden />
            <div className={styles.cardGlow} aria-hidden />

            <div className={styles.card}>
              <span className={styles.versionBadge}>v3.5</span>

              <header className={styles.brand}>
                <div className={styles.logoSlot} aria-hidden={!ready}>
                  {ready && logoVisible ? (
                    <img
                      src={resolvedLoginLogoSrc}
                      alt=""
                      className={styles.logo}
                      style={{
                        maxHeight: branding.loginLogoMaxHeight,
                        maxWidth: branding.loginLogoMaxWidth,
                      }}
                      onError={() => {
                        if (loginLogoAttempt === 0 && loginLogoSrc !== PANEL_FALLBACK_LOGO_URL) {
                          setLoginLogoAttempt(1);
                          return;
                        }
                        setLogoVisible(false);
                      }}
                    />
                  ) : ready ? (
                    <div className={styles.logoFallback}>
                      <Calculator size={28} />
                    </div>
                  ) : null}
                </div>
                <h2 className={styles.title}>Hoş geldiniz</h2>
                <p className={styles.sub}>
                  <Shield size={15} className={styles.subIcon} aria-hidden />
                  Hesabınıza güvenli giriş yapın
                </p>
              </header>

              <form className={styles.form} onSubmit={(e) => void onSubmit(e)}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor={emailId}>
                    <Sparkles size={14} className={styles.iconAmber} aria-hidden />
                    E-posta
                  </label>
                  <div className={styles.inputWrap}>
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
                    <span className={styles.inputGlow} aria-hidden />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor={passwordId}>
                    <Lock size={14} className={styles.iconTeal} aria-hidden />
                    Şifre
                  </label>
                  <div className={styles.inputWrap}>
                    <input
                      id={passwordId}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={styles.input}
                    />
                    <button
                      type="button"
                      className={styles.togglePassword}
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <span className={styles.inputGlow} aria-hidden />
                  </div>
                </div>

                <label className={styles.remember}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className={styles.checkbox}
                  />
                  <span>Beni hatırla</span>
                </label>

                {error ? (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                ) : null}

                <button type="submit" className={styles.submit} disabled={loading}>
                  <span className={styles.submitShine} aria-hidden />
                  <span className={styles.submitRing} aria-hidden />
                  <span className={styles.submitInner}>
                    {loading ? (
                      <>
                        <span className={styles.spinner} aria-hidden />
                        Giriş yapılıyor…
                      </>
                    ) : (
                      <>
                        <Shield size={17} aria-hidden />
                        Giriş Yap
                      </>
                    )}
                  </span>
                </button>

                <Link to="/forgot-password" className={styles.forgotLink}>
                  Şifremi unuttum
                </Link>
              </form>

              <footer className={styles.footer}>
                <span className={styles.statusDot} aria-hidden />
                Sistem aktif · Bilirkişi Hesap v3.5
              </footer>
            </div>
          </div>
        </main>
      </div>

      {successTransition ? (
        <div className={styles.successOverlay} role="status" aria-live="polite" aria-busy="true">
          <div className={styles.successCard}>
            <div className={styles.successRingWrap} aria-hidden>
              <svg className={styles.successRing} viewBox="0 0 48 48">
                <circle className={styles.successRingTrack} cx="24" cy="24" r="20" />
                <circle className={styles.successRingProgress} cx="24" cy="24" r="20" />
              </svg>
            </div>
            <h2 className={styles.successTitle}>Giriş başarılı</h2>
            <p className={styles.successStatus}>Hesap paneliniz hazırlanıyor…</p>
            <p className={styles.successWelcome}>Hoş geldiniz, {successTransition.userName}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
