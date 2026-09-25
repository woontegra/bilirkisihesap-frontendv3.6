import { useEffect, useState, type ReactNode } from "react";
import { ImageIcon, Loader2, RotateCcw, Save, Upload } from "lucide-react";
import { ApiError, apiClient } from "@/api/client";
import {
  fetchAdminPanelBranding,
  uploadPanelBrandingAsset,
  type BrandingUploadType,
} from "@/api/panelBranding";
import { FormField } from "@/components/admin/FormField";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/Button";
import { usePanelBranding } from "@/context/PanelBrandingContext";
import { useToast } from "@/context/ToastContext";
import {
  DEFAULT_PANEL_BRANDING,
  resolveBrandingAssetUrl,
  type PanelBrandingSettings,
} from "@/types/panelBranding";
import shared from "../adminShared.module.css";
import styles from "./BrandingPage.module.css";

type UploadKey = BrandingUploadType;

type BrandingSizePayload = Pick<
  PanelBrandingSettings,
  | "loginLogoMaxHeight"
  | "loginLogoMaxWidth"
  | "panelLogoMaxHeight"
  | "panelLogoMaxWidth"
  | "panelLogoCollapsedMaxHeight"
  | "panelLogoCollapsedMaxWidth"
>;

type BrandingApiResponse = {
  success: boolean;
  data?: PanelBrandingSettings;
  error?: string;
  message?: string;
};

async function saveBrandingSizes(sizes: BrandingSizePayload): Promise<PanelBrandingSettings> {
  const res = await apiClient<BrandingApiResponse>("/api/admin/panel-branding", {
    method: "PUT",
    adminRole: true,
    body: sizes,
  });
  if (!res?.success || !res.data) {
    throw new ApiError(res?.error || res?.message || "Marka ayarları kaydedilemedi", 500);
  }
  return res.data;
}

function num(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function AssetCard({
  title,
  description,
  previewUrl,
  savedPath,
  uploadType,
  uploading,
  onUpload,
  children,
}: {
  title: string;
  description: string;
  previewUrl: string;
  savedPath: string;
  uploadType: UploadKey;
  uploading: boolean;
  onUpload: (type: UploadKey, file: File) => void;
  children?: ReactNode;
}) {
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    setPreviewError(false);
  }, [previewUrl]);

  return (
    <section className={styles.assetCard}>
      <div className={styles.assetHeader}>
        <div>
          <h3 className={styles.assetTitle}>{title}</h3>
          <p className={styles.assetDesc}>{description}</p>
        </div>
        <label className={styles.uploadBtn}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico"
            className={styles.fileInput}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(uploadType, file);
              e.target.value = "";
            }}
          />
          {uploading ? <Loader2 size={16} className={styles.spin} /> : <Upload size={16} />}
          Yükle
        </label>
      </div>

      <div className={styles.previewBox}>
        {previewUrl && !previewError ? (
          <img
            src={previewUrl}
            alt=""
            className={styles.previewImage}
            onError={() => setPreviewError(true)}
          />
        ) : (
          <div className={styles.previewFallback}>
            <ImageIcon size={28} />
            {previewError ? <p className={styles.previewError}>Önizleme yüklenemedi</p> : null}
          </div>
        )}
      </div>

      <p className={styles.savedPath}>
        Kayıtlı dosya: <code>{savedPath || "—"}</code>
      </p>

      {children}
    </section>
  );
}

export default function BrandingPage() {
  const { success, error: toastError } = useToast();
  const { applyBranding } = usePanelBranding();
  const [form, setForm] = useState<PanelBrandingSettings>(DEFAULT_PANEL_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<UploadKey | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAdminPanelBranding();
        if (!cancelled) setForm(data);
      } catch (err) {
        if (!cancelled) {
          toastError(err instanceof ApiError ? err.message : "Ayarlar yüklenemedi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toastError]);

  const handleUpload = async (type: UploadKey, file: File) => {
    setUploading(type);
    try {
      const data = await uploadPanelBrandingAsset(type, file);
      setForm(data);
      setPreviewVersion(Date.now());
      applyBranding(data);
      success("Dosya yüklendi ve kaydedildi.");
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Dosya yüklenemedi.");
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await saveBrandingSizes({
        loginLogoMaxHeight: form.loginLogoMaxHeight,
        loginLogoMaxWidth: form.loginLogoMaxWidth,
        panelLogoMaxHeight: form.panelLogoMaxHeight,
        panelLogoMaxWidth: form.panelLogoMaxWidth,
        panelLogoCollapsedMaxHeight: form.panelLogoCollapsedMaxHeight,
        panelLogoCollapsedMaxWidth: form.panelLogoCollapsedMaxWidth,
      });
      setForm((prev) => ({
        ...prev,
        loginLogoMaxHeight: data.loginLogoMaxHeight,
        loginLogoMaxWidth: data.loginLogoMaxWidth,
        panelLogoMaxHeight: data.panelLogoMaxHeight,
        panelLogoMaxWidth: data.panelLogoMaxWidth,
        panelLogoCollapsedMaxHeight: data.panelLogoCollapsedMaxHeight,
        panelLogoCollapsedMaxWidth: data.panelLogoCollapsedMaxWidth,
      }));
      success("Boyut ayarları kaydedildi.");
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : "Kayıt başarısız.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setForm(DEFAULT_PANEL_BRANDING);
  };

  if (loading) {
    return (
      <div className={shared.page}>
        <PageHeader title="Marka & Logo Ayarları" description="Yükleniyor…" />
      </div>
    );
  }

  return (
    <div className={shared.page}>
      <PageHeader
        title="Marka & Logo Ayarları"
        description="Giriş sayfası logosu, panel logosu ve favicon'u yükleyin; boyutlarını piksel cinsinden ayarlayın."
      />

      <div className={styles.grid}>
        <AssetCard
          title="Giriş Sayfası Logosu"
          description="Login ekranında görünen logo. PNG, SVG veya WEBP — her boyut kabul edilir (maks. 8 MB)."
          previewUrl={resolveBrandingAssetUrl(form.loginLogoUrl, previewVersion || form.loginLogoUrl)}
          savedPath={form.loginLogoUrl}
          uploadType="login-logo"
          uploading={uploading === "login-logo"}
          onUpload={handleUpload}
        >
          <div className={styles.sizeFields}>
            <FormField label="Maks. yükseklik (px)">
              <input
                type="number"
                min={16}
                max={240}
                value={form.loginLogoMaxHeight}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, loginLogoMaxHeight: num(e.target.value, prev.loginLogoMaxHeight) }))
                }
              />
            </FormField>
            <FormField label="Maks. genişlik (px)">
              <input
                type="number"
                min={32}
                max={480}
                value={form.loginLogoMaxWidth}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, loginLogoMaxWidth: num(e.target.value, prev.loginLogoMaxWidth) }))
                }
              />
            </FormField>
          </div>
        </AssetCard>

        <AssetCard
          title="Panel Logosu"
          description="Kenar çubuğunda görünen logo. Daraltılmış menü için ayrı boyutlar ayarlanır (maks. 8 MB)."
          previewUrl={resolveBrandingAssetUrl(form.panelLogoUrl, previewVersion || form.panelLogoUrl)}
          savedPath={form.panelLogoUrl}
          uploadType="panel-logo"
          uploading={uploading === "panel-logo"}
          onUpload={handleUpload}
        >
          <div className={styles.sizeFields}>
            <FormField label="Maks. yükseklik (px)">
              <input
                type="number"
                min={16}
                max={160}
                value={form.panelLogoMaxHeight}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, panelLogoMaxHeight: num(e.target.value, prev.panelLogoMaxHeight) }))
                }
              />
            </FormField>
            <FormField label="Maks. genişlik (px)">
              <input
                type="number"
                min={32}
                max={360}
                value={form.panelLogoMaxWidth}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, panelLogoMaxWidth: num(e.target.value, prev.panelLogoMaxWidth) }))
                }
              />
            </FormField>
            <FormField label="Dar menü — yükseklik (px)">
              <input
                type="number"
                min={16}
                max={120}
                value={form.panelLogoCollapsedMaxHeight}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    panelLogoCollapsedMaxHeight: num(e.target.value, prev.panelLogoCollapsedMaxHeight),
                  }))
                }
              />
            </FormField>
            <FormField label="Dar menü — genişlik (px)">
              <input
                type="number"
                min={16}
                max={120}
                value={form.panelLogoCollapsedMaxWidth}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    panelLogoCollapsedMaxWidth: num(e.target.value, prev.panelLogoCollapsedMaxWidth),
                  }))
                }
              />
            </FormField>
          </div>
        </AssetCard>

        <AssetCard
          title="Favicon"
          description="Tarayıcı sekmesi simgesi. 32×32 önerilir; 512×512 PNG dahil her boyut kabul edilir (maks. 8 MB). Yükleme sonrası otomatik kaydedilir."
          previewUrl={resolveBrandingAssetUrl(form.faviconUrl, previewVersion || form.faviconUrl)}
          savedPath={form.faviconUrl}
          uploadType="favicon"
          uploading={uploading === "favicon"}
          onUpload={handleUpload}
        />
      </div>

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={handleResetDefaults}>
          <RotateCcw size={16} />
          Varsayılan boyutlar
        </Button>
        <Button type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}
          Boyutları kaydet
        </Button>
      </div>
    </div>
  );
}
