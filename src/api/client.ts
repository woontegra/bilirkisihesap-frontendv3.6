import {
  clearSession,
  decodeAccessTokenClaims,
  getAccessToken,
  getSessionTenantId,
  isTokenExpired,
  refreshAccessToken,
} from "@/auth/session";
import { API_BASE_URL } from "@/config/apiBase";
import {
  isLicenseDeniedCode,
  LICENSE_DENIED_EVENT,
} from "@/license/access";

export { API_BASE_URL };

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  skipTenantId?: boolean;
  adminRole?: boolean;
};

function getTenantId(): string | null {
  const tenantId = getSessionTenantId();
  return tenantId != null ? String(tenantId) : null;
}

function getDeviceId(): string {
  try {
    let id = localStorage.getItem("device_uuid");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("device_uuid", id);
    }
    return id;
  } catch {
    return "v35-unknown-device";
  }
}

function getUserId(): string | null {
  const claims = decodeAccessTokenClaims();
  if (claims?.userId) return String(claims.userId);
  try {
    return localStorage.getItem("user_id");
  } catch {
    return null;
  }
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {}),
  };

  if (!options.skipAuth) {
    let token = getAccessToken();
    if (token && isTokenExpired()) {
      token = await refreshAccessToken();
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (localStorage.getItem("v3_session") || localStorage.getItem("v35_session")) {
      headers["X-Client-Session"] = "v3";
    }
  }

  if (options.adminRole) {
    headers["x-user-role"] = "admin";
  }

  if (!options.skipTenantId && !path.startsWith("/api/auth/") && !path.startsWith("/api/health")) {
    const tenantId = getTenantId();
    if (tenantId) {
      headers["X-Tenant-Id"] = tenantId;
    }
  }

  const deviceId = getDeviceId();
  headers["X-Device-Id"] = deviceId;
  headers["X-Device-UUID"] = deviceId;

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (isFormData) {
      body = options.body as FormData;
      delete headers["Content-Type"];
    } else {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }
  }

  const doFetch = () =>
    fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body,
    });

  let response = await doFetch();

  if (!options.skipAuth && response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      response = await doFetch();
    }
    if (response.status === 401) {
      clearSession();
      throw new ApiError("Oturum süresi doldu. Lütfen tekrar giriş yapın.", 401);
    }
  }

  const data = await parseBody(response);

  if (!response.ok && response.status === 403 && !options.skipAuth) {
    const payload = typeof data === "object" && data ? (data as { error?: unknown; code?: unknown; licenseStatus?: unknown }) : null;
    const licenseCode = String(payload?.code ?? payload?.error ?? payload?.licenseStatus ?? "");
    if (isLicenseDeniedCode(licenseCode)) {
      window.dispatchEvent(new CustomEvent(LICENSE_DENIED_EVENT, { detail: { code: licenseCode.toUpperCase() } }));
    } else if (licenseCode === "DEVICE_LIMIT_EXCEEDED") {
      window.dispatchEvent(new CustomEvent("device-limit-exceeded"));
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? String((data as { message: unknown }).message)
        : typeof data === "object" && data && "error" in data
          ? String((data as { error: unknown }).error)
          : `İstek başarısız (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

/** Ticket endpointleri için x-user-id başlığı ekler. */
export async function apiClientAsUser<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const userId = getUserId();
  return apiClient<T>(path, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(userId ? { "x-user-id": userId } : {}),
    },
  });
}
