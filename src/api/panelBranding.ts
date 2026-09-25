import { apiClient, ApiError } from "@/api/client";
import type { PanelBrandingSettings } from "@/types/panelBranding";

type BrandingResponse = {
  success: boolean;
  data?: PanelBrandingSettings;
  message?: string;
  url?: string;
  error?: string;
};

function unwrapBranding(res: BrandingResponse): PanelBrandingSettings {
  if (!res?.success || !res.data) {
    throw new ApiError(res?.error || res?.message || "Marka ayarları alınamadı", 500);
  }
  return res.data;
}

export async function fetchPublicPanelBranding(): Promise<PanelBrandingSettings> {
  const res = await apiClient<BrandingResponse>("/api/public/panel-branding", { skipAuth: true });
  return unwrapBranding(res);
}

export async function fetchAdminPanelBranding(): Promise<PanelBrandingSettings> {
  const res = await apiClient<BrandingResponse>("/api/admin/panel-branding", { adminRole: true });
  return unwrapBranding(res);
}

export async function saveAdminPanelBranding(
  settings: PanelBrandingSettings,
): Promise<PanelBrandingSettings> {
  const res = await apiClient<BrandingResponse>("/api/admin/panel-branding", {
    method: "PUT",
    adminRole: true,
    body: settings,
  });
  return unwrapBranding(res);
}

export type BrandingUploadType = "login-logo" | "panel-logo" | "favicon";

export async function uploadPanelBrandingAsset(
  type: BrandingUploadType,
  file: File,
): Promise<PanelBrandingSettings> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiClient<BrandingResponse>(`/api/admin/panel-branding/upload?type=${type}`, {
    method: "POST",
    adminRole: true,
    body: fd,
  });
  return unwrapBranding(res);
}
