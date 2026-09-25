export const LICENSE_DENIED_CODES = [
  "LICENSE_EXPIRED",
  "DEMO_EXPIRED",
  "LICENSE_INACTIVE",
  "ACTIVE_PAID_LICENSE_REQUIRED",
] as const;

export type LicenseDeniedCode = (typeof LICENSE_DENIED_CODES)[number];

export const LICENSE_DENIED_EVENT = "license-denied";

export const SUBSCRIPTION_EXPIRED_PATH = "/subscription-expired";

const LICENSE_FREE_PREFIXES = ["/subscription-expired", "/profile"] as const;

export function normalizePathname(pathname: string): string {
  const raw = String(pathname || "").split("?")[0];
  if (!raw || raw === "/") return "/";
  return raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function isLicenseDeniedCode(code: unknown): code is LicenseDeniedCode {
  const value = String(code || "").trim().toUpperCase();
  return (LICENSE_DENIED_CODES as readonly string[]).includes(value);
}

export function isLicenseFreePath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return LICENSE_FREE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function postLoginPath(input: {
  role?: string | null;
  licenseActive?: boolean | null;
  licenseAccessCode?: string | null;
  licenseStatus?: string | null;
}): string {
  if (String(input.role || "").toLowerCase() === "admin") {
    return "/dashboard";
  }
  if (input.licenseActive === true) return "/dashboard";
  const code = String(input.licenseAccessCode || input.licenseStatus || "").toUpperCase();
  if (isLicenseDeniedCode(code) || input.licenseActive === false) {
    return SUBSCRIPTION_EXPIRED_PATH;
  }
  return "/dashboard";
}

export function paidAccessAllowedFromMe(me: {
  role?: string | null;
  licenseActive?: boolean | null;
  licenseAccessCode?: string | null;
  licenseStatus?: string | null;
}): boolean {
  if (String(me.role || "").toLowerCase() === "admin") return true;
  if (me.licenseActive === true) return true;
  const code = String(me.licenseAccessCode || me.licenseStatus || "").toUpperCase();
  if (isLicenseDeniedCode(code) || me.licenseActive === false) return false;
  return false;
}

/** Oturuma bağlı lisans kararı — F5’te tam ekran kontrolünü önler; yetki kaynağı değildir. */
export const LICENSE_ACCESS_CACHE_KEY = "v35_license_access_v1";
export const LICENSE_ACCESS_CACHE_VERSION = 1;

export type LicenseAccessSnapshot = {
  v: number;
  userId: number;
  allowed: boolean;
  isAdmin: boolean;
  code: string | null;
  licenseType: string | null;
  subscriptionType: string | null;
  expiresAt: string | null;
  updatedAt: number;
};

export type LicenseDecisionInput = {
  id?: number | null;
  role?: string | null;
  licenseActive?: boolean | null;
  licenseAccessCode?: string | null;
  licenseStatus?: string | null;
  licenseType?: string | null;
  subscriptionType?: string | null;
  subscriptionEndsAt?: string | null;
};

export function licenseDecisionFromMe(me: LicenseDecisionInput, fallbackUserId?: number | null) {
  const userId = Number(me.id ?? fallbackUserId);
  const isAdmin = String(me.role || "").toLowerCase() === "admin";
  return {
    userId: Number.isFinite(userId) && userId > 0 ? userId : null,
    allowed: paidAccessAllowedFromMe(me),
    isAdmin,
    code: me.licenseAccessCode
      ? String(me.licenseAccessCode)
      : me.licenseStatus
        ? String(me.licenseStatus)
        : null,
    licenseType: me.licenseType ?? null,
    subscriptionType: me.subscriptionType ?? null,
    expiresAt: me.subscriptionEndsAt ?? null,
  };
}

function isValidSnapshot(raw: unknown): raw is LicenseAccessSnapshot {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as LicenseAccessSnapshot;
  return (
    s.v === LICENSE_ACCESS_CACHE_VERSION &&
    typeof s.userId === "number" &&
    Number.isFinite(s.userId) &&
    s.userId > 0 &&
    typeof s.allowed === "boolean" &&
    typeof s.isAdmin === "boolean" &&
    (s.code === null || typeof s.code === "string") &&
    (s.licenseType === null || typeof s.licenseType === "string") &&
    (s.subscriptionType === null || typeof s.subscriptionType === "string") &&
    (s.expiresAt === null || typeof s.expiresAt === "string") &&
    typeof s.updatedAt === "number"
  );
}

export function readLicenseAccessSnapshot(userId: number | null | undefined): LicenseAccessSnapshot | null {
  if (!userId || !Number.isFinite(userId) || userId < 1) return null;
  try {
    const raw = localStorage.getItem(LICENSE_ACCESS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSnapshot(parsed) || parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLicenseAccessSnapshot(
  decision: Omit<LicenseAccessSnapshot, "v" | "updatedAt"> & { userId: number },
): void {
  if (!decision.userId || decision.userId < 1) return;
  const snapshot: LicenseAccessSnapshot = {
    v: LICENSE_ACCESS_CACHE_VERSION,
    userId: decision.userId,
    allowed: decision.allowed,
    isAdmin: decision.isAdmin,
    code: decision.code,
    licenseType: decision.licenseType,
    subscriptionType: decision.subscriptionType,
    expiresAt: decision.expiresAt,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(LICENSE_ACCESS_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore quota */
  }
}

export function clearLicenseAccessSnapshot(): void {
  try {
    localStorage.removeItem(LICENSE_ACCESS_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Ödeme/yenileme dönüşünde sessiz yeniden sorgu (tam ekran yok). */
export function isPaymentOrRenewalReturn(search: string): boolean {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
    const keys = ["payment", "renewal", "renewed", "checkout", "license"];
    for (const key of keys) {
      const value = String(params.get(key) || "").toLowerCase();
      if (!value) continue;
      if (["1", "true", "success", "ok", "completed", "paid"].includes(value)) return true;
    }
    return params.get("paytr_status") === "success" || params.has("merchant_oid");
  } catch {
    return false;
  }
}
