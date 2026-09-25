import {
  getAccessToken,
  isTokenExpired,
  refreshAccessToken,
} from "@/auth/session";
import { API_BASE_URL } from "@/config/apiBase";

export type BarAssociation = {
  id: number;
  name: string;
  city: string | null;
  primaryEmail: string | null;
  secondaryEmail: string | null;
  kepEmail: string | null;
  discountRate: number;
  campaignCode: string | null;
  offerToken: string;
  status: "ACTIVE" | "PASSIVE";
  protocolFiles?: Array<{
    id: number;
    originalFileName: string;
    extension: string;
    sizeBytes: number;
    createdAt: string;
    fileUrl?: string | null;
  }>;
};

export type BaroTracking = {
  id: number;
  recipientEmail: string;
  subject: string;
  status: "PENDING" | "SENT" | "FAILED";
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  contractDownloadedAt: string | null;
  errorMessage: string | null;
  barAssociation: { id: number; name: string; city: string | null } | null;
};

export type SmmmTracking = {
  id: number;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  status: "PENDING" | "SENT" | "FAILED";
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
  openCount: number;
  clickCount: number;
  contractDownloadedAt: string | null;
  errorMessage: string | null;
  segment: string;
};

export type TrackingSummary = {
  sentCount?: number;
  openedCount?: number;
  clickedCount?: number;
  contractDownloadedCount?: number;
  failedCount?: number;
};

export type EmailFormData = {
  recipientType: string;
  customEmails: string;
  subject: string;
  message: string;
  logoUrl: string;
  headerImageUrl: string;
  demoUsername: string;
  demoPassword: string;
  demoLicenseKey: string;
  demoLicenseType: string;
  demoLicenseExpiresAt: string;
  demoLoginUrl: string;
  demoVideoUrl: string;
};

export const DEFAULT_FORM: EmailFormData = {
  recipientType: "all",
  customEmails: "",
  subject: "",
  message: "",
  logoUrl: "",
  headerImageUrl: "",
  demoUsername: "",
  demoPassword: "",
  demoLicenseKey: "",
  demoLicenseType: "1 Aylık Ücretsiz Deneme",
  demoLicenseExpiresAt: "",
  demoLoginUrl: "https://panel.bilirkisihesap.com/login",
  demoVideoUrl: "https://www.youtube.com/@bilirkisihesap",
};

export type MailTemplate = {
  name: string;
  subject: string;
  message: string;
  description?: string;
  templateId?: string;
  recipientType?: string;
};

export const EMAIL_TEMPLATES: MailTemplate[] = [
  {
    name: "Yeni Özellik Duyurusu",
    subject: "Yeni Özellikler Eklendi",
    message: "Sistemimize yeni özellikler ekledik.",
  },
  {
    name: "Sistem Bakımı",
    subject: "Planlı Sistem Bakımı",
    message: "Sistemimiz [TARIH] tarihinde bakıma girecektir.",
  },
  {
    name: "Barolara Özel Teklif",
    templateId: "baro",
    recipientType: "bar_associations",
    subject: "{{baro_adi}} Üyelerine Özel %40 İndirim Protokolü",
    message: `Sayın {{baro_adi}},

Woontegra Teknoloji olarak baro üyelerinize özel indirimli kullanım avantajı sunmak isteriz.

Üyeleriniz aşağıdaki bağlantı üzerinden özel teklif sayfasına ulaşabilir:
{{teklif_linki}}

Sözleşme/protokol önizleme bağlantısı:
{{sozlesme_linki}}

Saygılarımızla,
Bilirkişi Hesaplama Araçları`,
  },
  {
    name: "SMMM Bilgilendirme",
    templateId: "smmm_info",
    recipientType: "smmm_chambers",
    subject: "Bilirkişi Hesaplama Araçları — SMMM Odalarına Bilgilendirme",
    message: `Sayın {{oda_adi}},

Bilirkişi Hesaplama Araçları hakkında bilgilendirme amaçlı iletişime geçiyoruz.

Demo erişim bilgileri e-postada otomatik yer alacaktır.

Saygılarımızla,
Bilirkişi Hesaplama Araçları`,
  },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCustomEmails(text: string) {
  const raw = text
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(raw)];
  const valid: string[] = [];
  const invalid: string[] = [];
  unique.forEach((e) => (EMAIL_REGEX.test(e) ? valid.push(e) : invalid.push(e)));
  return { total: unique.length, valid, invalid };
}

export function normalizeImageUrl(value: string): string {
  if (!value) return "";
  const v = value.trim();
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.startsWith("/")) return v;
  return `/${v}`;
}

export function formatTrackingDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR");
}

export type SendBulkResult =
  | { ok: true; results: { sent?: number; total?: number; failed?: number; errors?: unknown[] } }
  | { ok: false; code?: string; missing?: string[]; error?: string };

/** send-bulk için tam hata gövdesi (MISSING_PROTOCOL_FILES vb.) */
export async function postSendBulk(body: Record<string, unknown>): Promise<SendBulkResult> {
  let token = getAccessToken();
  if (token && isTokenExpired()) {
    token = await refreshAccessToken();
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (localStorage.getItem("v3_session") || localStorage.getItem("v35_session")) {
    headers["X-Client-Session"] = "v3";
  }
  headers["X-Tenant-Id"] = localStorage.getItem("tenant_id") || "1";

  const response = await fetch(`${API_BASE_URL}/api/email-notifications/send-bulk`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  let data: Record<string, unknown> = {};
  try {
    const text = await response.text();
    if (text) data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* ignore */
  }

  if (!response.ok) {
    return {
      ok: false,
      code: String(data.code || ""),
      missing: Array.isArray(data.missingProtocolBarNames)
        ? (data.missingProtocolBarNames as string[])
        : undefined,
      error: String(data.error || data.message || "Email gönderilemedi"),
    };
  }

  return {
    ok: true,
    results: (data.results as SendBulkResult extends { ok: true; results: infer R } ? R : never) ?? {
      sent: 0,
      total: 0,
    },
  };
}
