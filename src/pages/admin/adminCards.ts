import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  Filter,
  History,
  Image,
  KeyRound,
  LayoutDashboard,
  Mail,
  MessageCircle,
  MessageSquare,
  MonitorSmartphone,
  Smartphone,
  Star,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";

export type AdminCardCategory =
  | "operations"
  | "support"
  | "analytics"
  | "system";

export type AdminCardStatus = "ready" | "coming_soon";

export type AdminToolCardConfig = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  route: string;
  category: AdminCardCategory;
  status: AdminCardStatus;
  adminOnly: true;
  /** Optional live stats endpoint loaded by AdminPage */
  previewEndpoint?: string;
};

/**
 * Route’lar FrontendV3 App.tsx ile doğrulanmıştır.
 * Tüm alt sayfalar V3.5’te gerçek route’lara bağlıdır.
 */
export const ADMIN_TOOL_CARDS: AdminToolCardConfig[] = [
  {
    id: "control-center",
    title: "Kontrol Merkezi",
    description: "Sistem durumu ve kritik yönetim özeti",
    icon: LayoutDashboard,
    route: "/admin/control-center",
    category: "operations",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "users",
    title: "Kullanıcı Yönetimi",
    description: "Hesapları görüntüle, filtrele ve yönet",
    icon: Users,
    route: "/admin/users",
    category: "operations",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "users-new",
    title: "Yeni Kullanıcı",
    description: "Yeni kullanıcı hesabı oluştur",
    icon: UserPlus,
    route: "/admin/users/new",
    category: "operations",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "subscriptions",
    title: "Abonelik Yönetimi",
    description: "Planlar, süreler ve abonelik işlemleri",
    icon: CreditCard,
    route: "/admin/subscriptions",
    category: "operations",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "tickets",
    title: "Destek Talepleri",
    description: "Destek taleplerini incele ve yanıtla",
    icon: MessageSquare,
    route: "/admin/tickets",
    category: "support",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "chat",
    title: "Canlı Sohbet",
    description: "Anlık destek konuşmalarını yönet",
    icon: MessageCircle,
    route: "/admin/chat",
    category: "support",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "analytics",
    title: "Tenant İstatistikleri",
    description: "Kullanım ve tenant bazlı metrikler",
    icon: BarChart3,
    route: "/admin/analytics",
    category: "analytics",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "device-login-analytics",
    title: "Cihaz ve Giriş Analizi",
    description: "Demo kullanıcılarının giriş yaptığı cihazları ve kullanım dağılımını inceleyin.",
    icon: MonitorSmartphone,
    route: "/admin/device-login-analytics",
    category: "analytics",
    status: "ready",
    adminOnly: true,
    previewEndpoint:
      "/api/admin/device-login-analytics/summary?userType=demo&loginStatus=all&from=2026-02-01",
  },
  {
    id: "demo-usage-funnel",
    title: "Demo Kullanım Hunisi",
    description: "Demo kullanıcılarının girişten hesaplama ve önizlemeye kadar hangi aşamada kaldığını inceleyin.",
    icon: Filter,
    route: "/admin/demo-usage-funnel",
    category: "analytics",
    status: "ready",
    adminOnly: true,
    previewEndpoint: "/api/admin/demo-usage-funnel/summary?userType=demo&from=2026-02-01",
  },
  {
    id: "demo-conversion",
    title: "Demo → Satış Dönüşümü",
    description: "Demo kullanıcıların satışa dönüşümü",
    icon: ArrowRightLeft,
    route: "/admin/demo-conversion",
    category: "analytics",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "logs",
    title: "Sistem Logları",
    description: "Uygulama ve sistem olay kayıtları",
    icon: FileText,
    route: "/admin/logs",
    category: "system",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "audit-logs",
    title: "Admin Denetim Kayıtları",
    description: "Yönetici işlemlerinin denetim izi",
    icon: History,
    route: "/admin/audit-logs",
    category: "system",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "licenses",
    title: "Lisans Yönetimi",
    description: "Lisans anahtarları ve geçerlilik",
    icon: KeyRound,
    route: "/admin/licenses",
    category: "system",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "devices",
    title: "Cihaz Yönetimi",
    description: "Bağlı cihazları izle ve yönet",
    icon: Smartphone,
    route: "/admin/device-management",
    category: "system",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "email",
    title: "E-posta Bildirimleri",
    description: "Bildirim şablonları ve gönderimler",
    icon: Mail,
    route: "/admin/email-notifications",
    category: "system",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "bar-associations",
    title: "Baro Yönetimi",
    description: "Baro kayıtları ve ilişkili ayarlar",
    icon: Building2,
    route: "/admin/bar-associations",
    category: "operations",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "bar-campaign",
    title: "Baro Kampanya Performansı",
    description: "Kampanya sonuçları ve dönüşümler",
    icon: BarChart3,
    route: "/admin/bar-campaign-performance",
    category: "analytics",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "feedback",
    title: "Kullanıcı Geri Bildirimleri",
    description: "Gelen geri bildirimleri incele",
    icon: Star,
    route: "/admin/feedback",
    category: "support",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "branding",
    title: "Marka & Logo",
    description: "Giriş logosu, panel logosu ve favicon yönetimi",
    icon: Image,
    route: "/admin/branding",
    category: "system",
    status: "ready",
    adminOnly: true,
  },
  {
    id: "interest-rates",
    title: "Mevduat Faiz Oranları",
    description: "TCMB EVDS'ten mevduat faiz verilerini güncelle",
    icon: TrendingUp,
    route: "/admin/interest-rates",
    category: "system",
    status: "ready",
    adminOnly: true,
  },
];
