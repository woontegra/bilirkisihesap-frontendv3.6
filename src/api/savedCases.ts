import { apiClient } from "@/api/client";
import { normalizeSavedCaseType } from "@/telemetry/moduleRegistry";
import { trackUsageEvent } from "@/telemetry/trackUsageEvent";

export type SavedCaseRecord = {
  id: number;
  name?: string | null;
  kayit_adi?: string | null;
  aciklama?: string | null;
  type?: string;
  hesaplama_tipi?: string;
  data?: unknown;
  net_total?: number | null;
  createdAt?: string;
  created_at?: string;
  ise_giris?: string | null;
  isten_cikis?: string | null;
};

export type CreateSavedCasePayload = {
  name: string;
  type: string;
  data: unknown;
};

export type UpdateSavedCasePayload = {
  name: string;
  type: string;
  data: unknown;
};

export async function listSavedCases(): Promise<SavedCaseRecord[]> {
  const data = await apiClient<SavedCaseRecord[] | { data?: SavedCaseRecord[] }>("/api/saved-cases");
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.data) ? data.data : [];
}

export async function getSavedCase(id: number): Promise<SavedCaseRecord> {
  const data = await apiClient<SavedCaseRecord | { data?: SavedCaseRecord }>(`/api/saved-cases/${id}`);
  if (data && typeof data === "object") {
    const direct = data as SavedCaseRecord;
    if (typeof direct.id === "number") return direct;
    const wrapped = data as { data?: SavedCaseRecord };
    if (wrapped.data && typeof wrapped.data === "object" && typeof wrapped.data.id === "number") {
      return wrapped.data;
    }
  }
  throw new Error("Kayıt yüklenemedi");
}

export async function createSavedCase(payload: CreateSavedCasePayload): Promise<SavedCaseRecord> {
  const created = await apiClient<SavedCaseRecord>("/api/saved-cases", {
    method: "POST",
    body: payload,
  });
  try {
    const moduleKey = normalizeSavedCaseType(payload.type);
    if (moduleKey && moduleKey !== "UNKNOWN") {
      trackUsageEvent({
        eventType: "CALCULATION_SAVED",
        moduleKey,
        route: typeof window !== "undefined" ? window.location.pathname : undefined,
      });
    }
  } catch {
    /* telemetry must not affect save */
  }
  return created;
}

export async function updateSavedCase(
  id: number,
  payload: UpdateSavedCasePayload,
): Promise<SavedCaseRecord> {
  return apiClient<SavedCaseRecord>(`/api/saved-cases/${id}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deleteSavedCase(id: number): Promise<void> {
  await apiClient(`/api/saved-cases/${id}`, { method: "DELETE" });
}
