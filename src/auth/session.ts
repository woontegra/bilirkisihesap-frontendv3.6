import { API_BASE_URL } from "@/config/apiBase";
import { trackAppEnteredOnce } from "@/telemetry/trackUsageEvent";
import {
  LoginSubscriptionError,
  isSubscriptionAccessCode,
  messageForSubscriptionCode,
} from "@/auth/subscriptionLogin";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const TOKEN_EXPIRY_KEY = "token_expiry";

const AUTH_KEYS = [
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  TOKEN_EXPIRY_KEY,
  "tenant_id",
  "user_id",
  "user_role",
  "current_user",
  "email",
  "licenseValid",
  "professionalLicenseKey",
  "professionalLicenseExpiry",
  "professional_device_id",
  "licenseExpiry",
  "user",
  "v3_session",
  "v35_session",
  "must_change_password",
] as const;

export type AuthUser = {
  id: number;
  email: string;
  name?: string;
  role?: string;
  tenantId?: number;
  profilePicture?: string | null;
  profilePictureUrl?: string | null;
  customerCode?: string;
  licenseType?: string | null;
};

export type TokenClaims = {
  userId: number;
  tenantId: number;
  email?: string;
  role?: string;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
          .split("")
          .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
          .join(""),
      ),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** JWT payload — kimlik için tek güvenilir kaynak (header/localStorage anahtarları değil). */
export function decodeAccessTokenClaims(token?: string | null): TokenClaims | null {
  const raw = decodeJwtPayload(token ?? getAccessToken() ?? "");
  if (!raw) return null;
  const userId = Number(raw.userId ?? raw.id);
  const tenantId = Number(raw.tenantId);
  if (!Number.isFinite(userId) || userId < 1 || !Number.isFinite(tenantId) || tenantId < 1) {
    return null;
  }
  return {
    userId,
    tenantId,
    email: typeof raw.email === "string" ? raw.email : undefined,
    role: typeof raw.role === "string" ? raw.role.toLowerCase() : undefined,
  };
}

export function getSessionTenantId(): number | null {
  return decodeAccessTokenClaims()?.tenantId ?? null;
}

export function readCurrentUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem("current_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.email || !parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Platform yöneticisi — backend `requireAdmin` ile aynı kaynak:
 * JWT `role === "admin"`. `tenantId === 1` tek başına admin değildir.
 * JWT rolü yoksa AdminOnly yedeği: `current_user.role === "admin"`.
 */
export function isPlatformAdminFromSources(
  jwtRole: string | null | undefined,
  sessionRole: string | null | undefined,
): boolean {
  if (jwtRole) return jwtRole === "admin";
  return sessionRole === "admin";
}

export function isPlatformAdmin(): boolean {
  try {
    return isPlatformAdminFromSources(decodeAccessTokenClaims()?.role, readCurrentUser()?.role);
  } catch {
    return false;
  }
}

/** /me veya login yanıtından tüm kimlik anahtarlarını atomik günceller. */
export function applyAuthMeResponse(me: Record<string, unknown>): void {
  const claims = decodeAccessTokenClaims();
  const id = Number(me.id ?? claims?.userId);
  const email = typeof me.email === "string" ? me.email.trim() : claims?.email?.trim() ?? "";
  const tenantId = Number(me.tenantId ?? claims?.tenantId);
  if (!email || !Number.isFinite(id) || id < 1 || !Number.isFinite(tenantId) || tenantId < 1) {
    return;
  }

  const name = typeof me.name === "string" ? me.name : undefined;
  const role =
    (typeof me.role === "string" ? me.role.toLowerCase() : undefined) ?? claims?.role;
  const licenseType =
    (typeof me.licenseType === "string" ? me.licenseType : null) ??
    (typeof me.subscriptionType === "string" ? me.subscriptionType : null);

  const userRecord: AuthUser & Record<string, unknown> = {
    ...(readCurrentUser() ?? {}),
    id,
    email,
    name,
    role,
    tenantId,
    customerCode: typeof me.customerCode === "string" ? me.customerCode : undefined,
    licenseType,
    profilePicture:
      typeof me.profilePicture === "string" || me.profilePicture === null
        ? me.profilePicture
        : null,
    profilePictureUrl:
      typeof me.profilePictureUrl === "string" || me.profilePictureUrl === null
        ? me.profilePictureUrl
        : null,
  };

  localStorage.setItem("current_user", JSON.stringify(userRecord));
  localStorage.setItem("tenant_id", String(tenantId));
  localStorage.setItem("email", email);
  localStorage.setItem("user_id", String(id));
  localStorage.setItem("user_role", role ?? "");
  if (typeof me.mustChangePassword === "boolean") {
    setMustChangePasswordRequired(me.mustChangePassword === true);
  } else if (me.requirePasswordChange === true) {
    setMustChangePasswordRequired(true);
  }
  window.dispatchEvent(new Event("auth-changed"));
}

function syncIdentityFromAccessToken(token: string): void {
  const claims = decodeAccessTokenClaims(token);
  if (!claims) return;
  const existing = readCurrentUser();
  applyAuthMeResponse({
    id: claims.userId,
    email: claims.email ?? existing?.email,
    name: existing?.name,
    role: claims.role ?? existing?.role,
    tenantId: claims.tenantId,
  });
}

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  licenseType?: string | null;
  professionalLicenseValid?: boolean;
  professionalLicense?: {
    license_key?: string;
    expires_at?: string;
  };
  /** Backend: User.must_change_password — demo/geçici şifre ilk giriş */
  requirePasswordChange?: boolean;
};

const MUST_CHANGE_PASSWORD_KEY = "must_change_password";

export function setMustChangePasswordRequired(required: boolean): void {
  try {
    if (required) localStorage.setItem(MUST_CHANGE_PASSWORD_KEY, "1");
    else localStorage.removeItem(MUST_CHANGE_PASSWORD_KEY);
  } catch {
    /* ignore */
  }
}

export function isMustChangePasswordRequired(): boolean {
  try {
    return localStorage.getItem(MUST_CHANGE_PASSWORD_KEY) === "1";
  } catch {
    return false;
  }
}

function decodeTokenExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export function saveSession(accessToken: string, refreshToken: string, user: AuthUser): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);

  const expiry = decodeTokenExpiry(accessToken);
  localStorage.setItem(
    TOKEN_EXPIRY_KEY,
    String(expiry ?? Date.now() + 2 * 60 * 60 * 1000),
  );

  applyAuthMeResponse({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    profilePicture: user.profilePicture,
    profilePictureUrl: user.profilePictureUrl,
  });
  localStorage.setItem("v3_session", JSON.stringify({ email: user.email }));
  localStorage.setItem("v35_session", "1");
  localStorage.setItem("last_login_date", new Date().toISOString());
}

export function clearSession(): void {
  for (const key of AUTH_KEYS) {
    localStorage.removeItem(key);
  }
}

export function isTokenExpired(): boolean {
  const raw = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!raw) return true;
  const expiry = Number.parseInt(raw, 10);
  return Date.now() >= expiry - 5 * 60 * 1000;
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearSession();
      return null;
    }

    const data = (await response.json()) as {
      accessToken?: string;
      refreshToken?: string;
      user?: AuthUser;
    };

    if (!data.accessToken || !data.refreshToken) {
      clearSession();
      return null;
    }

    if (data.user) {
      saveSession(data.accessToken, data.refreshToken, data.user);
    } else {
      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      const expiry = decodeTokenExpiry(data.accessToken);
      localStorage.setItem(
        TOKEN_EXPIRY_KEY,
        String(expiry ?? Date.now() + 2 * 60 * 60 * 1000),
      );
      syncIdentityFromAccessToken(data.accessToken);
    }

    return data.accessToken;
  } catch {
    clearSession();
    return null;
  }
}

/** Mevcut backend: POST /api/auth/login */
export async function loginWithPassword(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = (await response.json().catch(() => ({}))) as LoginResponse & {
    error?: string;
    code?: string;
    message?: string;
  };

  if (!response.ok) {
    const code = String(payload.code ?? payload.error ?? "");
    if (isSubscriptionAccessCode(code)) {
      throw new LoginSubscriptionError(code, messageForSubscriptionCode(code));
    }
    throw new Error(payload.error || payload.message || "Giriş başarısız");
  }

  if (!payload.accessToken || !payload.refreshToken || !payload.user) {
    throw new Error("Geçersiz giriş yanıtı");
  }

  const userWithMeta = {
    ...payload.user,
  };

  saveSession(payload.accessToken, payload.refreshToken, userWithMeta);

  setMustChangePasswordRequired(payload.requirePasswordChange === true);

  try {
    trackAppEnteredOnce();
  } catch {
    /* telemetry must not block login */
  }

  patchCurrentUserProfile({
    licenseType: payload.licenseType ?? null,
    hasValidLicense: payload.professionalLicenseValid ?? false,
  });

  if (payload.professionalLicenseValid) {
    localStorage.setItem("licenseValid", "true");
    localStorage.setItem(
      "professionalLicenseKey",
      payload.professionalLicense?.license_key || "",
    );
    localStorage.setItem(
      "professionalLicenseExpiry",
      payload.professionalLicense?.expires_at || "",
    );
  } else {
    localStorage.setItem("licenseValid", "false");
  }

  return payload;
}

export function logout(): void {
  clearSession();
}

export function patchCurrentUserProfile(updates: Record<string, unknown>): void {
  try {
    const current = readCurrentUser();
    if (!current) return;
    applyAuthMeResponse({ ...current, ...updates });
  } catch {
    /* ignore */
  }
}
