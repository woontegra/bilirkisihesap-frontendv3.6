import type { LucideIcon } from "lucide-react";
import {
  Award,
  Banknote,
  Bell,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  CalendarDays,
  Clock,
  Flag,
  Gavel,
  Hourglass,
  LayoutDashboard,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  StickyNote,
  Tag,
  UserX,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

export type ToolAction = "add-note" | "add-tag" | "open-interest";

export type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  path?: string;
  action?: ToolAction;
  badge?: string;
  disabled?: boolean;
};

export type NavGroup = {
  id: string;
  label?: string;
  items: NavItem[];
  adminOnly?: boolean;
};

/**
 * Menü grupları V3 işlevlerini korur.
 * Hesaplama sayfaları bu aşamada placeholder route'lara gider.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "main",
    items: [
      {
        id: "dashboard",
        label: "Yönetim Paneli",
        path: "/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: "admin",
    label: "Admin Paneli",
    adminOnly: true,
    items: [
      {
        id: "admin-panel",
        label: "Admin Paneli",
        path: "/admin",
        icon: Shield,
      },
    ],
  },
  {
    id: "calculations",
    label: "Hesaplamalar",
    items: [
      { id: "kidem", label: "Kıdem Tazminatı", path: "/kidem-tazminati", icon: Briefcase },
      { id: "ihbar", label: "İhbar Tazminatı", path: "/ihbar-tazminati", icon: Bell },
      { id: "fazla-mesai", label: "Fazla Mesai Alacağı", path: "/fazla-mesai", icon: Clock },
      { id: "yillik-izin", label: "Yıllık Ücretli İzin Alacağı", path: "/yillik-izin", icon: Calendar },
      { id: "ubgt", label: "UBGT Alacağı", path: "/ubgt", icon: Flag },
      { id: "hafta-tatili", label: "Hafta Tatili Alacağı", path: "/hafta-tatili", icon: CalendarDays },
      { id: "ucret", label: "Ücret Alacağı", path: "/ucret-alacagi", icon: Banknote },
      { id: "is-arama", label: "İş Arama İzni Ücreti", path: "/is-arama-izni-ucreti", icon: Search },
      { id: "bakiye", label: "Bakiye Ücret Alacağı", path: "/bakiye-ucret-alacagi", icon: Wallet },
      { id: "prim", label: "Prim Alacağı", path: "/prim-alacagi", icon: Award },
      { id: "kotu-niyet", label: "Kötü Niyet Tazminatı", path: "/kotu-niyet-tazminati", icon: ShieldAlert },
      { id: "bosta", label: "Boşta Geçen Süre Ücreti", path: "/bosta-gecen-sure-ucreti", icon: Hourglass },
      { id: "ise-baslatmama", label: "İşe Başlatmama Tazminatı", path: "/ise-almama-tazminati", icon: UserX },
      { id: "ayrimcilik", label: "Ayrımcılık Tazminatı", path: "/ayrimcilik-tazminati", icon: Users },
      { id: "haksiz-fesih", label: "Haksız Fesih Tazminatı", path: "/haksiz-fesih-tazminati", icon: Gavel },
      {
        id: "icra",
        label: "İcra Takip Brütten Nete",
        path: "/icra-takip-brutten-nete",
        icon: Building2,
        badge: "YENİ",
      },
    ],
  },
  {
    id: "tools",
    label: "Araçlar",
    items: [
      { id: "davaci", label: "Davacı Ücreti", path: "/davaci-ucreti", icon: Scale },
      {
        id: "manuel-brut",
        label: "Manuel Brüt Ücret",
        path: "/araclar/manuel-brut-ucret",
        icon: Wrench,
      },
      {
        id: "hesaplama-notu",
        label: "Hesaplama Notu",
        action: "add-note",
        icon: StickyNote,
      },
      {
        id: "kategori-etiketi",
        label: "Kategori Etiketi",
        action: "add-tag",
        icon: Tag,
      },
      {
        id: "faiz-hesaplayici",
        label: "Faiz Hesaplayıcı",
        action: "open-interest",
        icon: Calculator,
      },
    ],
  },
];

export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Yönetim Paneli",
  "/profile": "Profilim",
  "/araclar/manuel-brut-ucret": "Manuel Brüt Ücret Şablonları",
  "/davaci-ucreti": "Davacı Ücreti",
  "/kidem-tazminati": "Kıdem Tazminatı",
  "/kidem-tazminati/30isci": "Kıdem Tazminatı — İş Kanununa Göre",
  "/kidem-tazminati/borclar": "Kıdem Tazminatı — Borçlar Kanunu",
  "/kidem-tazminati/gemi": "Kıdem Tazminatı — Gemi Adamları",
  "/kidem-tazminati/mevsimlik": "Kıdem Tazminatı — Mevsimlik İşçi",
  "/kidem-tazminati/basin": "Kıdem Tazminatı — Basın İş",
  "/kidem-tazminati/kismi-sureli": "Kıdem Tazminatı — Kısmi Süreli / Part Time",
  "/kidem-tazminati/belirli-sureli": "Kıdem Tazminatı — Belirli Süreli",
  "/fazla-mesai": "Fazla Mesai Alacağı",
  "/fazla-mesai/standart": "Fazla Mesai — Standart",
  "/fazla-mesai/tanikli-standart": "Fazla Mesai — Tanıklı Standart",
  "/fazla-mesai/haftalik-karma": "Fazla Mesai — Haftalık Karma",
  "/fazla-mesai/donemsel": "Fazla Mesai — Dönemsel",
  "/fazla-mesai/donemsel-haftalik": "Fazla Mesai — Dönemsel Haftalık",
  "/fazla-mesai/yeralti-isci": "Fazla Mesai — Yeraltı İşçileri",
  "/fazla-mesai/vardiya-24": "Fazla Mesai — 24 Saat Vardiya",
  "/fazla-mesai/vardiya-48": "Fazla Mesai — 48 Saat Vardiya",
  "/fazla-mesai/gemi-adami-gunluk": "Fazla Mesai — Gemi Adamı Günlük",
  "/fazla-mesai/gemi-adami-7-24": "Fazla Mesai — Gemi Adamı 7/24",
  "/fazla-mesai/ev-isci": "Fazla Mesai — Ev İşçileri",
  "/fazla-mesai/puantaj": "Fazla Mesai — Puantaj Kayıtlarına Göre",
  "/ihbar-tazminati": "İhbar Tazminatı",
  "/ihbar-tazminati/30isci": "İhbar Tazminatı — İş Kanununa Göre",
  "/ihbar-tazminati/borclar": "İhbar Tazminatı — Borçlar Kanunu",
  "/ihbar-tazminati/gemi": "İhbar Tazminatı — Gemi Adamları",
  "/ihbar-tazminati/mevsim": "İhbar Tazminatı — Mevsimlik İşçi",
  "/ihbar-tazminati/basin": "İhbar Tazminatı — Basın İş Kanunu",
  "/ihbar-tazminati/kismi": "İhbar Tazminatı — Kısmi Süreli",
  "/ihbar-tazminati/belirli": "İhbar Tazminatı — Belirli Süreli",
  "/yillik-izin": "Yıllık Ücretli İzin Alacağı",
  "/yillik-izin/standart": "Yıllık İzin — İş Kanununa Göre",
  "/yillik-izin/borclar": "Yıllık İzin — Borçlar Kanunu",
  "/yillik-izin/gemi": "Yıllık İzin — Gemi Adamları",
  "/yillik-izin/mevsim": "Yıllık İzin — Mevsimlik İşçi",
  "/yillik-izin/basin": "Yıllık İzin — Basın (Günlük Gazete)",
  "/yillik-izin/basin/gunluk-olmayan": "Yıllık İzin — Basın (Günlük Olmayan)",
  "/yillik-izin/kismi": "Yıllık İzin — Kısmi Süreli",
  "/yillik-izin/belirli": "Yıllık İzin — Belirli Süreli",
  "/haksiz-fesih-tazminati": "Haksız Fesih Tazminatı",
  "/ayrimcilik-tazminati": "Ayrımcılık Tazminatı",
  "/ise-almama-tazminati": "İşe Başlatmama Tazminatı",
  "/ucret-alacagi": "Ücret Alacağı",
  "/is-arama-izni-ucreti": "İş Arama İzni Ücreti",
  "/prim-alacagi": "Prim Alacağı",
  "/kotu-niyet-tazminati": "Kötü Niyet Tazminatı",
  "/bosta-gecen-sure-ucreti": "Boşta Geçen Süre Ücreti",
  "/hafta-tatili": "Hafta Tatili Alacağı",
  "/hafta-tatili/standard": "Hafta Tatili — Standart",
  "/hafta-tatili/gemi-adami": "Hafta Tatili — Gemi Adamları",
  "/hafta-tatili/basin-is": "Hafta Tatili — Basın İş",
  "/ubgt": "UBGT Alacağı",
  "/ubgt/alacagi": "Standart UBGT Alacağı",
  "/ubgt/bilirkisi": "Bilirkişi UBGT Alacağı",
  "/bakiye-ucret-alacagi": "Bakiye Ücret Alacağı",
  "/icra-takip-brutten-nete": "İcra Takip Brütten Nete",
  "/icra-takip-brutten-nete/damga-vergisi-kesintili": "İcra — Damga Vergisi Kesintili",
  "/icra-takip-brutten-nete/gelir-ve-damga-vergisi-kesintili": "İcra — Gelir ve Damga Kesintili",
  "/icra-takip-brutten-nete/istisnali-full-kesintili": "İcra — İstisnalı Full Kesintili",
  "/icra-takip-brutten-nete/istisnasiz-full-kesintili": "İcra — İstisnasız Full Kesintili",
  "/admin": "Admin Paneli",
  "/admin/control-center": "Kontrol Merkezi",
  "/admin/users": "Kullanıcı Yönetimi",
  "/admin/users/new": "Yeni Kullanıcı",
  "/admin/subscriptions": "Abonelik Yönetimi",
  "/admin/tickets": "Destek Talepleri",
  "/admin/chat": "Canlı Sohbet",
  "/admin/analytics": "Tenant İstatistikleri",
  "/admin/device-login-analytics": "Cihaz ve Giriş Analizi",
  "/admin/demo-usage-funnel": "Demo Kullanım Hunisi",
  "/admin/demo-conversion": "Demo → Satış Dönüşümü",
  "/admin/logs": "Sistem Logları",
  "/admin/audit-logs": "Admin Denetim Kayıtları",
  "/admin/licenses": "Lisans Yönetimi",
  "/admin/device-management": "Cihaz Yönetimi",
  "/admin/email-notifications": "E-posta Bildirimleri",
  "/admin/bar-associations": "Baro Yönetimi",
  "/admin/bar-campaign-performance": "Baro Kampanya Performansı",
  "/admin/feedback": "Kullanıcı Geri Bildirimleri",
  "/admin/branding": "Marka & Logo Ayarları",
  "/admin/interest-rates": "Mevduat Faiz Oranları",
};
