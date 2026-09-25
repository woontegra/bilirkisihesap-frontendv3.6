import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Outlet, useLocation } from "react-router-dom";
import { fetchAuthMe } from "@/api/profile";
import { decodeAccessTokenClaims, isAuthenticated, isPlatformAdmin } from "@/auth/session";
import { ForcePasswordChangeModal } from "@/components/auth/ForcePasswordChangeModal";
import {
  clearLicenseAccessSnapshot,
  isLicenseDeniedCode,
  isPaymentOrRenewalReturn,
  LICENSE_DENIED_EVENT,
  licenseDecisionFromMe,
  readLicenseAccessSnapshot,
  writeLicenseAccessSnapshot,
  type LicenseAccessSnapshot,
  type LicenseDeniedCode,
} from "@/license/access";

export type LicenseAccessState = {
  loading: boolean;
  hydrated: boolean;
  allowed: boolean;
  isAdmin: boolean;
  code: string | null;
  licenseType: string | null;
  subscriptionType: string | null;
  expiresAt: string | null;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
  markDenied: (code?: string | null) => void;
};

const LicenseAccessContext = createContext<LicenseAccessState | null>(null);

export function useLicenseAccess(): LicenseAccessState {
  const ctx = useContext(LicenseAccessContext);
  if (!ctx) {
    throw new Error("useLicenseAccess must be used within LicenseAccessProvider");
  }
  return ctx;
}

export function useLicenseAccessOptional(): LicenseAccessState | null {
  return useContext(LicenseAccessContext);
}

type DecisionFields = {
  allowed: boolean;
  isAdmin: boolean;
  code: string | null;
  licenseType: string | null;
  subscriptionType: string | null;
  expiresAt: string | null;
};

function clearDecision(): DecisionFields {
  return {
    allowed: false,
    isAdmin: false,
    code: null,
    licenseType: null,
    subscriptionType: null,
    expiresAt: null,
  };
}

function fromSnapshot(snap: LicenseAccessSnapshot): DecisionFields {
  return {
    allowed: snap.allowed,
    isAdmin: snap.isAdmin,
    code: snap.code,
    licenseType: snap.licenseType,
    subscriptionType: snap.subscriptionType,
    expiresAt: snap.expiresAt,
  };
}

function readBootState(): { hydrated: boolean; loading: boolean; decision: DecisionFields; userId: number | null } {
  if (!isAuthenticated()) {
    return { hydrated: true, loading: false, decision: clearDecision(), userId: null };
  }
  const userId = decodeAccessTokenClaims()?.userId ?? null;
  const snap = readLicenseAccessSnapshot(userId);
  if (snap) {
    return { hydrated: true, loading: false, decision: fromSnapshot(snap), userId: snap.userId };
  }
  // Önbellek yok/bozuk: tam ekran kontrol yok; hesaplama backend onayı olmadan açılmaz.
  return {
    hydrated: true,
    loading: false,
    decision: {
      ...clearDecision(),
      isAdmin: isPlatformAdmin(),
      allowed: isPlatformAdmin(),
    },
    userId,
  };
}

export function LicenseAccessProvider({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const boot = useRef(readBootState()).current;
  const [hydrated] = useState(boot.hydrated);
  const [loading, setLoading] = useState(boot.loading);
  const [allowed, setAllowed] = useState(boot.decision.allowed);
  const [isAdmin, setIsAdmin] = useState(boot.decision.isAdmin);
  const [code, setCode] = useState<string | null>(boot.decision.code);
  const [licenseType, setLicenseType] = useState<string | null>(boot.decision.licenseType);
  const [subscriptionType, setSubscriptionType] = useState<string | null>(boot.decision.subscriptionType);
  const [expiresAt, setExpiresAt] = useState<string | null>(boot.decision.expiresAt);
  const sessionUserIdRef = useRef<number | null>(boot.userId);
  const inflightRef = useRef<Promise<void> | null>(null);
  const paymentReturnHandledRef = useRef(false);

  const applyDecision = useCallback((next: DecisionFields, userId?: number | null) => {
    setAllowed(next.allowed);
    setIsAdmin(next.isAdmin);
    setCode(next.code);
    setLicenseType(next.licenseType);
    setSubscriptionType(next.subscriptionType);
    setExpiresAt(next.expiresAt);
    const id = userId ?? sessionUserIdRef.current;
    if (id != null && id > 0 && isAuthenticated()) {
      sessionUserIdRef.current = id;
      writeLicenseAccessSnapshot({ userId: id, ...next });
    }
  }, []);

  const refresh = useCallback(
    async (_options?: { silent?: boolean }) => {
      // silent seçeneği API uyumu içindir; Outlet asla tam ekran ile bloklanmaz.

      if (!isAuthenticated()) {
        sessionUserIdRef.current = null;
        clearLicenseAccessSnapshot();
        applyDecision(clearDecision(), null);
        setLoading(false);
        return;
      }

      const userId = decodeAccessTokenClaims()?.userId ?? null;
      const userChanged =
        sessionUserIdRef.current != null && userId != null && sessionUserIdRef.current !== userId;
      if (userChanged) {
        clearLicenseAccessSnapshot();
        applyDecision(clearDecision(), null);
        sessionUserIdRef.current = userId;
      }

      // Tam ekran / Outlet blokajı yok; loading yalnızca buton göstergesi.
      setLoading(true);

      if (inflightRef.current) {
        await inflightRef.current;
        return;
      }

      const run = (async () => {
        try {
          const me = await fetchAuthMe({ force: true });
          const next = licenseDecisionFromMe(me, userId);
          const resolvedId = next.userId ?? userId;
          sessionUserIdRef.current = resolvedId;
          applyDecision(
            {
              allowed: next.allowed,
              isAdmin: next.isAdmin || isPlatformAdmin(),
              code: next.code,
              licenseType: next.licenseType,
              subscriptionType: next.subscriptionType,
              expiresAt: next.expiresAt,
            },
            resolvedId,
          );
        } catch {
          // Ağ/me hatasında mevcut önbelleği koru; yoksa erişimi kapat (tam ekran yok).
          if (!readLicenseAccessSnapshot(userId)) {
            applyDecision(
              {
                ...clearDecision(),
                isAdmin: isPlatformAdmin(),
                allowed: isPlatformAdmin(),
                code: "ACTIVE_PAID_LICENSE_REQUIRED",
              },
              userId,
            );
          }
        } finally {
          setLoading(false);
          inflightRef.current = null;
        }
      })();

      inflightRef.current = run;
      await run;
    },
    [applyDecision],
  );

  const markDenied = useCallback(
    (deniedCode?: string | null) => {
      if (isPlatformAdmin()) return;
      const nextCode = isLicenseDeniedCode(deniedCode)
        ? (deniedCode as LicenseDeniedCode)
        : "LICENSE_EXPIRED";
      applyDecision(
        {
          allowed: false,
          isAdmin: false,
          code: nextCode,
          licenseType,
          subscriptionType,
          expiresAt,
        },
        sessionUserIdRef.current ?? decodeAccessTokenClaims()?.userId ?? null,
      );
    },
    [applyDecision, expiresAt, licenseType, subscriptionType],
  );

  // Mount / F5 / focus: otomatik /api/auth/me YOK.
  // Yalnızca ödeme/yenileme dönüşünde sessiz zorunlu yenileme.
  useEffect(() => {
    if (paymentReturnHandledRef.current) return;
    if (!isAuthenticated()) return;
    if (!isPaymentOrRenewalReturn(location.search)) return;
    paymentReturnHandledRef.current = true;
    void refresh({ silent: true });
  }, [location.search, refresh]);

  useEffect(() => {
    const onDenied = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string }>).detail;
      markDenied(detail?.code);
    };
    const onAuth = () => {
      if (!isAuthenticated()) {
        sessionUserIdRef.current = null;
        clearLicenseAccessSnapshot();
        applyDecision(clearDecision(), null);
        setLoading(false);
        return;
      }
      const userId = decodeAccessTokenClaims()?.userId ?? null;
      if (userId != null && sessionUserIdRef.current != null && userId !== sessionUserIdRef.current) {
        clearLicenseAccessSnapshot();
        sessionUserIdRef.current = userId;
        const snap = readLicenseAccessSnapshot(userId);
        if (snap) applyDecision(fromSnapshot(snap), userId);
        else applyDecision({ ...clearDecision(), isAdmin: isPlatformAdmin(), allowed: isPlatformAdmin() }, userId);
      }
    };
    window.addEventListener(LICENSE_DENIED_EVENT, onDenied);
    window.addEventListener("auth-changed", onAuth);
    return () => {
      window.removeEventListener(LICENSE_DENIED_EVENT, onDenied);
      window.removeEventListener("auth-changed", onAuth);
    };
  }, [applyDecision, markDenied]);

  const value = useMemo(
    () => ({
      loading,
      hydrated,
      allowed,
      isAdmin,
      code,
      licenseType,
      subscriptionType,
      expiresAt,
      refresh,
      markDenied,
    }),
    [loading, hydrated, allowed, isAdmin, code, licenseType, subscriptionType, expiresAt, refresh, markDenied],
  );

  // Tam ekran “Abonelik durumu kontrol ediliyor” burada ASLA gösterilmez.
  return (
    <LicenseAccessContext.Provider value={value}>
      {children ?? <Outlet />}
      {hydrated ? <ForcePasswordChangeModal /> : null}
    </LicenseAccessContext.Provider>
  );
}
