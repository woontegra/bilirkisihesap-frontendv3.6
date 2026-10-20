/** Login / ücretli API abonelik hata kodları — karar backend’de verilir. */

export const SUBSCRIPTION_EXPIRED = "SUBSCRIPTION_EXPIRED";
export const ACTIVE_SUBSCRIPTION_REQUIRED = "ACTIVE_SUBSCRIPTION_REQUIRED";

export const SUBSCRIPTION_RENEW_URL =
  "https://www.woontegra.com/yazilimlar/bilirkisi-hesap/satin-al";
export const SUBSCRIPTION_SUPPORT_URL = "https://www.woontegra.com/iletisim";

export const SUBSCRIPTION_LOGIN_FLAG_KEY = "bh_subscription_login_code";

export class LoginSubscriptionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LoginSubscriptionError";
    this.code = code;
  }
}

export function isSubscriptionAccessCode(code: string | null | undefined): boolean {
  return code === SUBSCRIPTION_EXPIRED || code === ACTIVE_SUBSCRIPTION_REQUIRED;
}

export function messageForSubscriptionCode(code: string): string {
  if (code === SUBSCRIPTION_EXPIRED) {
    return "Aboneliğiniz sona ermiştir. Hesabınıza erişmek için aboneliğinizi yenileyin.";
  }
  if (code === ACTIVE_SUBSCRIPTION_REQUIRED) {
    return "Aktif aboneliğiniz bulunmamaktadır.";
  }
  return "Giriş başarısız";
}

/** URL’ye e-posta / userId / tenantId eklemez. */
export function buildSubscriptionRenewUrl(): string {
  return SUBSCRIPTION_RENEW_URL;
}

export function buildSubscriptionSupportUrl(): string {
  return SUBSCRIPTION_SUPPORT_URL;
}

export function stashSubscriptionLoginCode(code: string): void {
  try {
    sessionStorage.setItem(SUBSCRIPTION_LOGIN_FLAG_KEY, code);
  } catch {
    /* ignore */
  }
}

export function consumeSubscriptionLoginCode(): string | null {
  try {
    const code = sessionStorage.getItem(SUBSCRIPTION_LOGIN_FLAG_KEY);
    if (code) sessionStorage.removeItem(SUBSCRIPTION_LOGIN_FLAG_KEY);
    return code && isSubscriptionAccessCode(code) ? code : null;
  } catch {
    return null;
  }
}

export function parseSubscriptionDeniedPayload(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { error?: unknown; code?: unknown };
  const code = String(row.code ?? row.error ?? "");
  return isSubscriptionAccessCode(code) ? code : null;
}
