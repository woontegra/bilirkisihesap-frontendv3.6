import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchPublicPanelBranding } from "@/api/panelBranding";
import {
  brandingAssetVersion,
  DEFAULT_PANEL_BRANDING,
  preloadBrandingAssets,
  readCachedPanelBranding,
  resolveBrandingAssetUrl,
  stripFallbackUrlsForCache,
  writeCachedPanelBranding,
  type PanelBrandingSettings,
} from "@/types/panelBranding";

type PanelBrandingContextValue = {
  branding: PanelBrandingSettings;
  loading: boolean;
  ready: boolean;
  refreshBranding: () => Promise<void>;
  applyBranding: (next: PanelBrandingSettings) => void;
  loginLogoSrc: string;
  panelLogoSrc: string;
  faviconSrc: string;
};

const PanelBrandingContext = createContext<PanelBrandingContextValue | null>(null);

function applyFavicon(url: string, cacheBust?: string | number) {
  const href = resolveBrandingAssetUrl(url, cacheBust);
  if (!href) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function PanelBrandingProvider({ children }: { children: ReactNode }) {
  const bootCacheRef = useRef(readCachedPanelBranding());
  const [branding, setBranding] = useState<PanelBrandingSettings>(
    () => bootCacheRef.current ?? DEFAULT_PANEL_BRANDING,
  );
  const [loading, setLoading] = useState(() => !bootCacheRef.current);
  const [ready, setReady] = useState(() => Boolean(bootCacheRef.current));
  const [assetVersion, setAssetVersion] = useState(() =>
    bootCacheRef.current ? brandingAssetVersion(bootCacheRef.current) : "",
  );

  useLayoutEffect(() => {
    const cached = bootCacheRef.current;
    if (cached) {
      applyFavicon(cached.faviconUrl, brandingAssetVersion(cached));
    }
  }, []);

  const refreshBranding = useCallback(async () => {
    const hadCache = Boolean(bootCacheRef.current);
    try {
      const data = await fetchPublicPanelBranding();
      const version = brandingAssetVersion(data);
      await preloadBrandingAssets(data, version);
      bootCacheRef.current = stripFallbackUrlsForCache(data);
      writeCachedPanelBranding(data);
      setBranding(data);
      setAssetVersion(version);
      applyFavicon(data.faviconUrl, version);
    } catch {
      if (!hadCache) {
        setBranding(DEFAULT_PANEL_BRANDING);
      }
    } finally {
      setReady(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBranding();
  }, [refreshBranding]);

  const applyBranding = useCallback((next: PanelBrandingSettings) => {
    const version = brandingAssetVersion(next);
    bootCacheRef.current = stripFallbackUrlsForCache(next);
    writeCachedPanelBranding(next);
    setBranding(next);
    setAssetVersion(version);
    setReady(true);
    setLoading(false);
    applyFavicon(next.faviconUrl, version);
    void preloadBrandingAssets(next, version);
  }, []);

  const versionKey = assetVersion || brandingAssetVersion(branding);

  const value = useMemo(
    (): PanelBrandingContextValue => ({
      branding,
      loading,
      ready,
      refreshBranding,
      applyBranding,
      loginLogoSrc: resolveBrandingAssetUrl(branding.loginLogoUrl, versionKey),
      panelLogoSrc: resolveBrandingAssetUrl(branding.panelLogoUrl, versionKey),
      faviconSrc: resolveBrandingAssetUrl(branding.faviconUrl, versionKey),
    }),
    [applyBranding, branding, loading, ready, refreshBranding, versionKey],
  );

  return <PanelBrandingContext.Provider value={value}>{children}</PanelBrandingContext.Provider>;
}

export function usePanelBranding(): PanelBrandingContextValue {
  const ctx = useContext(PanelBrandingContext);
  if (!ctx) {
    throw new Error("usePanelBranding must be used within PanelBrandingProvider");
  }
  return ctx;
}
