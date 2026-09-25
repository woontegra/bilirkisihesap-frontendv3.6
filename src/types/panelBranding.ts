import { API_BASE_URL } from "@/api/client";

export type PanelBrandingSettings = {
  loginLogoUrl: string;
  panelLogoUrl: string;
  faviconUrl: string;
  loginLogoMaxHeight: number;
  loginLogoMaxWidth: number;
  panelLogoMaxHeight: number;
  panelLogoMaxWidth: number;
  panelLogoCollapsedMaxHeight: number;
  panelLogoCollapsedMaxWidth: number;
};

export const PANEL_FALLBACK_LOGO_URL = "https://panel.bilirkisihesap.com/logo.png";
export const PANEL_FALLBACK_FAVICON_URL = "https://panel.bilirkisihesap.com/favicon.svg";

const LEGACY_API_HOSTS = new Set(["api.bilirkisihesap.com"]);

export const DEFAULT_PANEL_BRANDING: PanelBrandingSettings = {
  loginLogoUrl: "",
  panelLogoUrl: "",
  faviconUrl: "",
  loginLogoMaxHeight: 52,
  loginLogoMaxWidth: 208,
  panelLogoMaxHeight: 38,
  panelLogoMaxWidth: 184,
  panelLogoCollapsedMaxHeight: 44,
  panelLogoCollapsedMaxWidth: 44,
};

export function isFallbackBrandingUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return trimmed === PANEL_FALLBACK_LOGO_URL || trimmed === PANEL_FALLBACK_FAVICON_URL;
}

export function isUploadBrandingPath(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.trim().startsWith("/uploads/branding/");
}

/** localStorage'a yalnız gerçek upload path'leri yaz; CDN fallback canonical sayılmasın. */
export function stripFallbackUrlsForCache(branding: PanelBrandingSettings): PanelBrandingSettings {
  const pick = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || isFallbackBrandingUrl(trimmed)) return "";
    if (isUploadBrandingPath(trimmed)) return trimmed;
    return "";
  };
  return {
    ...branding,
    loginLogoUrl: pick(branding.loginLogoUrl),
    panelLogoUrl: pick(branding.panelLogoUrl),
    faviconUrl: pick(branding.faviconUrl),
  };
}

export function resolveBrandingAssetUrl(
  url: string | null | undefined,
  cacheBust?: string | number,
): string {
  if (!url) return "";
  let resolved = url.trim();

  if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
    try {
      const parsed = new URL(resolved);
      if (LEGACY_API_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith("/uploads/")) {
        const base = (API_BASE_URL || "").replace(/\/$/, "");
        if (base) {
          resolved = `${base}${parsed.pathname}${parsed.search}`;
        }
      }
    } catch {
      /* keep original */
    }
  } else if (resolved.startsWith("/uploads/")) {
    const base = (API_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(
      /\/$/,
      "",
    );
    resolved = `${base}${resolved}`;
  } else if (resolved === "/logo.png" || resolved === "/logo_beyaz.png") {
    resolved = PANEL_FALLBACK_LOGO_URL;
  } else if (resolved === "/favicon.svg" || resolved === "/favicon.ico") {
    resolved = PANEL_FALLBACK_FAVICON_URL;
  }

  if (cacheBust === undefined || cacheBust === "") return resolved;
  const sep = resolved.includes("?") ? "&" : "?";
  return `${resolved}${sep}v=${encodeURIComponent(String(cacheBust))}`;
}

const BRANDING_CACHE_KEY = "v35_panel_branding_v4";

function normalizeCachedBranding(raw: Partial<PanelBrandingSettings>): PanelBrandingSettings {
  const num = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    loginLogoUrl:
      typeof raw.loginLogoUrl === "string" &&
      raw.loginLogoUrl.trim() &&
      !isFallbackBrandingUrl(raw.loginLogoUrl) &&
      isUploadBrandingPath(raw.loginLogoUrl)
        ? raw.loginLogoUrl.trim()
        : "",
    panelLogoUrl:
      typeof raw.panelLogoUrl === "string" &&
      raw.panelLogoUrl.trim() &&
      !isFallbackBrandingUrl(raw.panelLogoUrl) &&
      isUploadBrandingPath(raw.panelLogoUrl)
        ? raw.panelLogoUrl.trim()
        : "",
    faviconUrl:
      typeof raw.faviconUrl === "string" &&
      raw.faviconUrl.trim() &&
      !isFallbackBrandingUrl(raw.faviconUrl) &&
      isUploadBrandingPath(raw.faviconUrl)
        ? raw.faviconUrl.trim()
        : "",
    loginLogoMaxHeight: num(raw.loginLogoMaxHeight, DEFAULT_PANEL_BRANDING.loginLogoMaxHeight),
    loginLogoMaxWidth: num(raw.loginLogoMaxWidth, DEFAULT_PANEL_BRANDING.loginLogoMaxWidth),
    panelLogoMaxHeight: num(raw.panelLogoMaxHeight, DEFAULT_PANEL_BRANDING.panelLogoMaxHeight),
    panelLogoMaxWidth: num(raw.panelLogoMaxWidth, DEFAULT_PANEL_BRANDING.panelLogoMaxWidth),
    panelLogoCollapsedMaxHeight: num(
      raw.panelLogoCollapsedMaxHeight,
      DEFAULT_PANEL_BRANDING.panelLogoCollapsedMaxHeight,
    ),
    panelLogoCollapsedMaxWidth: num(
      raw.panelLogoCollapsedMaxWidth,
      DEFAULT_PANEL_BRANDING.panelLogoCollapsedMaxWidth,
    ),
  };
}

export function brandingAssetVersion(branding: PanelBrandingSettings): string {
  return `${branding.loginLogoUrl}|${branding.panelLogoUrl}|${branding.faviconUrl}`;
}

export function readCachedPanelBranding(): PanelBrandingSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BRANDING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelBrandingSettings>;
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeCachedBranding(parsed);
  } catch {
    return null;
  }
}

export function writeCachedPanelBranding(data: PanelBrandingSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      BRANDING_CACHE_KEY,
      JSON.stringify(normalizeCachedBranding(stripFallbackUrlsForCache(data))),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function preloadBrandingAssets(
  branding: PanelBrandingSettings,
  cacheBust?: string | number,
): Promise<void> {
  const urls = [
    resolveBrandingAssetUrl(branding.loginLogoUrl, cacheBust),
    resolveBrandingAssetUrl(branding.panelLogoUrl, cacheBust),
    resolveBrandingAssetUrl(branding.faviconUrl, cacheBust),
  ].filter(Boolean);

  if (urls.length === 0) return Promise.resolve();

  return Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        }),
    ),
  ).then(() => undefined);
}

function probeImageUrl(src: string): Promise<boolean> {
  if (!src) return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

/** Public görüntüleme: upload path erişilemiyorsa fallback döner; upload path korunur. */
export async function ensureAccessibleBrandingSettings(
  branding: PanelBrandingSettings,
): Promise<PanelBrandingSettings> {
  async function resolveField(url: string, fallback: string): Promise<string> {
    const trimmed = url?.trim() ?? "";
    if (!trimmed) return fallback;
    if (isFallbackBrandingUrl(trimmed)) return fallback;
    if (!isUploadBrandingPath(trimmed)) return fallback;
    const ok = await probeImageUrl(resolveBrandingAssetUrl(trimmed));
    return ok ? trimmed : fallback;
  }

  const [loginLogoUrl, panelLogoUrl, faviconUrl] = await Promise.all([
    resolveField(branding.loginLogoUrl, PANEL_FALLBACK_LOGO_URL),
    resolveField(branding.panelLogoUrl, PANEL_FALLBACK_LOGO_URL),
    resolveField(branding.faviconUrl, PANEL_FALLBACK_FAVICON_URL),
  ]);

  return { ...branding, loginLogoUrl, panelLogoUrl, faviconUrl };
}
