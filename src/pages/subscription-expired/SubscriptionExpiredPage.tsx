import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, CreditCard, LifeBuoy, LogOut, UserRound } from "lucide-react";
import {
  fetchRenewalOptions,
  startDemoUpgrade,
  startRenewal,
} from "@/api/profile";
import { logout } from "@/auth/session";
import { Button } from "@/components/ui/Button";
import { useLicenseAccess } from "@/context/LicenseAccessContext";
import {
  RENEWAL_FAILURE_MESSAGE,
  RENEWAL_SUPPORT_PATH,
  startExpiredSubscriptionCheckout,
} from "@/license/renewalSafety";
import { formatDateTr, getSubscriptionTypeLabel } from "@/utils/adminLabels";
import styles from "./SubscriptionExpiredPage.module.css";

export default function SubscriptionExpiredPage() {
  const navigate = useNavigate();
  const license = useLicenseAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeLabel = useMemo(
    () => getSubscriptionTypeLabel(license.licenseType || license.subscriptionType),
    [license.licenseType, license.subscriptionType],
  );
  const endLabel = license.expiresAt ? formatDateTr(license.expiresAt) : null;

  useEffect(() => {
    if (license.allowed || license.isAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [license.allowed, license.isAdmin, navigate]);

  const onRenew = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const type = String(license.licenseType || license.subscriptionType || "").toLowerCase();
      const url = await startExpiredSubscriptionCheckout({
        isDemo: type.includes("demo") || type.includes("trial"),
        fetchOptions: fetchRenewalOptions,
        startRenewal,
        startDemoUpgrade,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError(RENEWAL_FAILURE_MESSAGE);
    } finally {
      setBusy(false);
    }
  }, [license.licenseType, license.subscriptionType]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.iconWrap} aria-hidden>
          <AlertTriangle size={28} strokeWidth={1.75} />
        </div>
        <h1 className={styles.title}>Aboneliğiniz sona erdi</h1>
        <p className={styles.desc}>
          Bilirkişi Hesap’ı kullanmaya devam etmek için aboneliğinizi yenileyebilirsiniz.
        </p>
        <dl className={styles.meta}>
          {typeLabel && typeLabel !== "—" ? (
            <div>
              <dt>Abonelik türü</dt>
              <dd>{typeLabel}</dd>
            </div>
          ) : null}
          {endLabel ? (
            <div>
              <dt>Bitiş tarihi</dt>
              <dd>{endLabel}</dd>
            </div>
          ) : null}
        </dl>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => void onRenew()} disabled={busy}>
            <CreditCard size={16} />
            {busy ? "Hazırlanıyor…" : "Aboneliği Yenile"}
          </Button>
          <Link to="/profile" className={styles.secondary}>
            <UserRound size={16} />
            Profilim
          </Link>
          <Link to={RENEWAL_SUPPORT_PATH} className={styles.secondary}>
            <LifeBuoy size={16} />
            Destek Talebi Aç
          </Link>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut size={16} />
            Çıkış Yap
          </button>
          <button
            type="button"
            className={styles.ghost}
            disabled={license.loading}
            onClick={() => void license.refresh({ silent: true })}
          >
            {license.loading ? "Kontrol ediliyor…" : "Aboneliğimi kontrol et"}
          </button>
        </div>
      </div>
    </div>
  );
}
