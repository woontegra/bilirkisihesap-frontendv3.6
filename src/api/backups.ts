import { ApiError, apiClient } from "@/api/client";
import {
  clearSession,
  getAccessToken,
  isTokenExpired,
  refreshAccessToken,
} from "@/auth/session";

import { API_BASE_URL } from "@/config/apiBase";

function getTenantId(): string {
  try {
    return localStorage.getItem("tenant_id") || "1";
  } catch {
    return "1";
  }
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

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Tenant-Id": getTenantId(),
    "X-Device-Id": getDeviceId(),
    "X-Device-UUID": getDeviceId(),
  };

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
  return headers;
}

/**
 * Yedek export blob döner (JSON değil). Auth, apiClient ile aynı kalıbı kullanır.
 */
export async function exportBackup(): Promise<{ blob: Blob; filename: string }> {
  const headers = await authHeaders();

  const doFetch = () =>
    fetch(`${API_BASE_URL}/api/backups/export`, {
      method: "POST",
      headers,
    });

  let response = await doFetch();

  if (response.status === 401) {
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

  if (!response.ok) {
    let message = `Yedek oluşturulamadı (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string; error?: string };
      message = data.message || data.error || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, response.status);
  }

  const blob = await response.blob();
  const cd = response.headers.get("content-disposition");
  let filename = `bilirkisi-${new Date().toISOString().split("T")[0]}.bhbackup`;
  if (cd) {
    const match = cd.match(/filename="?(.+?)"?$/i);
    if (match?.[1]) filename = match[1];
  }
  return { blob, filename };
}

export type ImportBackupResult = {
  message?: string;
};

export async function importBackup(file: File): Promise<ImportBackupResult> {
  const form = new FormData();
  form.append("backup", file);
  return apiClient<ImportBackupResult>("/api/backups/import", {
    method: "POST",
    body: form,
  });
}
