import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardProvider } from "@/context/DashboardContext";
import { CalculationToolsProvider } from "@/context/CalculationToolsContext";
import AdminPage from "@/pages/admin/AdminPage";
import ProfilePage from "@/pages/profile/ProfilePage";
import ControlCenterPage from "@/pages/admin/control-center/ControlCenterPage";
import UsersPage from "@/pages/admin/users/UsersPage";
import CreateUserPage from "@/pages/admin/users/CreateUserPage";
import UserDetailPage from "@/pages/admin/users/UserDetailPage";
import UserEditPage from "@/pages/admin/users/UserEditPage";
import SubscriptionsPage from "@/pages/admin/subscriptions/SubscriptionsPage";
import TicketsPage from "@/pages/admin/tickets/TicketsPage";
import ChatPage from "@/pages/admin/chat/ChatPage";
import AnalyticsPage from "@/pages/admin/analytics/AnalyticsPage";
import DemoConversionPage from "@/pages/admin/demo-conversion/DemoConversionPage";
import DeviceLoginAnalyticsPage from "@/pages/admin/device-login-analytics/DeviceLoginAnalyticsPage";
import DemoUsageFunnelPage from "@/pages/admin/demo-usage-funnel/DemoUsageFunnelPage";
import LogsPage from "@/pages/admin/logs/LogsPage";
import AuditLogsPage from "@/pages/admin/audit-logs/AuditLogsPage";
import LicensesPage from "@/pages/admin/licenses/LicensesPage";
import DevicesPage from "@/pages/admin/devices/DevicesPage";
import EmailNotificationsPage from "@/pages/admin/email/EmailNotificationsPage";
import BarAssociationsPage from "@/pages/admin/bar-associations/BarAssociationsPage";
import BarCampaignPage from "@/pages/admin/bar-campaign/BarCampaignPage";
import FeedbackPage from "@/pages/admin/feedback/FeedbackPage";
import InterestRatesPage from "@/pages/admin/interest-rates/InterestRatesPage";
import BrandingPage from "@/pages/admin/branding/BrandingPage";
import ManualBrutWagePage from "@/pages/araclar/manuel-brut-ucret/ManualBrutWagePage";
import DavaciUcretiPage from "@/pages/hesaplamalar/davaci-ucreti/DavaciUcretiPage";
import KidemSelectionPage from "@/pages/hesaplamalar/kidem-tazminati/KidemSelectionPage";
import IsKanunuKidemPage from "@/pages/hesaplamalar/kidem-tazminati/is-kanunu/IsKanunuKidemPage";
import BorclarKidemPage from "@/pages/hesaplamalar/kidem-tazminati/borclar/BorclarKidemPage";
import GemiKidemPage from "@/pages/hesaplamalar/kidem-tazminati/gemi-adamlari/GemiKidemPage";
import MevsimlikKidemPage from "@/pages/hesaplamalar/kidem-tazminati/mevsimlik-isci/MevsimlikKidemPage";
import BasinKidemPage from "@/pages/hesaplamalar/kidem-tazminati/basin-is/BasinKidemPage";
import KismiKidemPage from "@/pages/hesaplamalar/kidem-tazminati/kismi-sureli/KismiKidemPage";
import BelirliSureliKidemPage from "@/pages/hesaplamalar/kidem-tazminati/belirli-sureli/BelirliSureliKidemPage";
import FazlaMesaiSelectionPage from "@/pages/hesaplamalar/fazla-mesai/FazlaMesaiSelectionPage";
import StandartFmPage from "@/pages/hesaplamalar/fazla-mesai/standart/StandartFmPage";
import TanikliStandartFmPage from "@/pages/hesaplamalar/fazla-mesai/tanikli-standart/TanikliStandartFmPage";
import HaftalikKarmaFmPage from "@/pages/hesaplamalar/fazla-mesai/haftalik-karma/HaftalikKarmaFmPage";
import DonemselFmPage from "@/pages/hesaplamalar/fazla-mesai/donemsel/DonemselFmPage";
import DonemselHaftalikFmPage from "@/pages/hesaplamalar/fazla-mesai/donemsel-haftalik/DonemselHaftalikFmPage";
import YeraltiFmPage from "@/pages/hesaplamalar/fazla-mesai/yeralti-isci/YeraltiFmPage";
import Vardiya24FmPage from "@/pages/hesaplamalar/fazla-mesai/vardiya-24/Vardiya24FmPage";
import Vardiya48FmPage from "@/pages/hesaplamalar/fazla-mesai/vardiya-48/Vardiya48FmPage";
import GemiGunlukFmPage from "@/pages/hesaplamalar/fazla-mesai/gemi-adami-gunluk/GemiGunlukFmPage";
import Gemi724FmPage from "@/pages/hesaplamalar/fazla-mesai/gemi-adami-7-24/Gemi724FmPage";
import EvIsciPage from "@/pages/hesaplamalar/fazla-mesai/ev-isci/EvIsciPage";
import PuantajFmPage from "@/pages/puantaj-fazla-mesai/PuantajFmPage";
import HaksizFesihTazminatiPage from "@/pages/hesaplamalar/haksiz-fesih-tazminati/HaksizFesihTazminatiPage";
import AyrimcilikTazminatiPage from "@/pages/hesaplamalar/ayrimcilik-tazminati/AyrimcilikTazminatiPage";
import IseAlmamaTazminatiPage from "@/pages/hesaplamalar/ise-almama-tazminati/IseAlmamaTazminatiPage";
import UcretAlacagiPage from "@/pages/hesaplamalar/ucret-alacagi/UcretAlacagiPage";
import IsAramaIzniUcretiPage from "@/pages/hesaplamalar/is-arama-izni-ucreti/IsAramaIzniUcretiPage";
import PrimAlacagiPage from "@/pages/hesaplamalar/prim-alacagi/PrimAlacagiPage";
import KotuNiyetTazminatiPage from "@/pages/hesaplamalar/kotu-niyet-tazminati/KotuNiyetTazminatiPage";
import BostaGecenSureUcretiPage from "@/pages/hesaplamalar/bosta-gecen-sure-ucreti/BostaGecenSureUcretiPage";
import UbgtSelectionPage from "@/pages/hesaplamalar/ubgt/UbgtSelectionPage";
import UbgtAlacagiPage from "@/pages/hesaplamalar/ubgt/alacagi/UbgtAlacagiPage";
import UbgtBilirkisiPage from "@/pages/hesaplamalar/ubgt/bilirkisi/UbgtBilirkisiPage";
import BakiyeUcretAlacagiPage from "@/pages/hesaplamalar/bakiye-ucret-alacagi/BakiyeUcretAlacagiPage";
import IcraTakipSelectionPage from "@/pages/hesaplamalar/icra-takip-brutten-nete/IcraTakipSelectionPage";
import DamgaVergisiKesintiliPage from "@/pages/hesaplamalar/icra-takip-brutten-nete/damga-vergisi-kesintili/DamgaVergisiKesintiliPage";
import GelirVeDamgaVergisiKesintiliPage from "@/pages/hesaplamalar/icra-takip-brutten-nete/gelir-ve-damga-vergisi-kesintili/GelirVeDamgaVergisiKesintiliPage";
import IstisnaliFullKesintiliPage from "@/pages/hesaplamalar/icra-takip-brutten-nete/istisnali-full-kesintili/IstisnaliFullKesintiliPage";
import IstisnasizFullKesintiliPage from "@/pages/hesaplamalar/icra-takip-brutten-nete/istisnasiz-full-kesintili/IstisnasizFullKesintiliPage";
import HaftaTatiliSelectionPage from "@/pages/hesaplamalar/hafta-tatili/HaftaTatiliSelectionPage";
import HaftaTatiliStandardPage from "@/pages/hesaplamalar/hafta-tatili/standard/HaftaTatiliStandardPage";
import HaftaTatiliGemiPage from "@/pages/hesaplamalar/hafta-tatili/gemi/HaftaTatiliGemiPage";
import HaftaTatiliBasinPage from "@/pages/hesaplamalar/hafta-tatili/basin/HaftaTatiliBasinPage";
import IhbarSelectionPage from "@/pages/hesaplamalar/ihbar-tazminati/IhbarSelectionPage";
import Ihbar30IsciPage from "@/pages/hesaplamalar/ihbar-tazminati/is-kanunu/Ihbar30IsciPage";
import IhbarBorclarPage from "@/pages/hesaplamalar/ihbar-tazminati/borclar/IhbarBorclarPage";
import IhbarGemiPage from "@/pages/hesaplamalar/ihbar-tazminati/gemi/IhbarGemiPage";
import IhbarMevsimPage from "@/pages/hesaplamalar/ihbar-tazminati/mevsim/IhbarMevsimPage";
import IhbarBasinPage from "@/pages/hesaplamalar/ihbar-tazminati/basin/IhbarBasinPage";
import IhbarKismiPage from "@/pages/hesaplamalar/ihbar-tazminati/kismi/IhbarKismiPage";
import IhbarBelirliPage from "@/pages/hesaplamalar/ihbar-tazminati/belirli/IhbarBelirliPage";
import YillikSelectionPage from "@/pages/hesaplamalar/yillik-izin/YillikSelectionPage";
import YillikStandartPage from "@/pages/hesaplamalar/yillik-izin/standart/YillikStandartPage";
import YillikBorclarPage from "@/pages/hesaplamalar/yillik-izin/borclar/YillikBorclarPage";
import YillikGemiPage from "@/pages/hesaplamalar/yillik-izin/gemi/YillikGemiPage";
import YillikMevsimPage from "@/pages/hesaplamalar/yillik-izin/mevsim/YillikMevsimPage";
import YillikBasinPage from "@/pages/hesaplamalar/yillik-izin/basin/YillikBasinPage";
import YillikBasinGunlukOlmayanPage from "@/pages/hesaplamalar/yillik-izin/basin/gunluk-olmayan/YillikBasinGunlukOlmayanPage";
import YillikKismiPage from "@/pages/hesaplamalar/yillik-izin/kismi/YillikKismiPage";
import YillikBelirliPage from "@/pages/hesaplamalar/yillik-izin/belirli/YillikBelirliPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import LoginPage from "@/pages/login/LoginPage";
import ForgotPasswordPage from "@/pages/forgot-password/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/reset-password/ResetPasswordPage";
import PlaceholderPage from "@/pages/PlaceholderPage";
import { AdminOnly } from "@/routes/AdminOnly";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { SubscriptionGate } from "@/routes/SubscriptionGate";
import { LicenseAccessProvider } from "@/context/LicenseAccessContext";
import { AppShell } from "@/shell/AppShell";
import SubscriptionExpiredPage from "@/pages/subscription-expired/SubscriptionExpiredPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<LicenseAccessProvider />}>
          <Route path="subscription-expired" element={<SubscriptionExpiredPage />} />
          <Route element={<SubscriptionGate />}>
        <Route
          element={
            <DashboardProvider>
              <CalculationToolsProvider>
                <AppShell />
              </CalculationToolsProvider>
            </DashboardProvider>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route
            path="profile/saved-calculations"
            element={<Navigate to="/profile?tab=saved" replace />}
          />
          <Route path="araclar/manuel-brut-ucret" element={<ManualBrutWagePage />} />
          <Route path="davaci-ucreti" element={<DavaciUcretiPage />} />
          <Route path="kidem-tazminati" element={<KidemSelectionPage />} />
          <Route path="kidem-tazminati/30isci" element={<IsKanunuKidemPage />} />
          <Route path="kidem-tazminati/borclar" element={<BorclarKidemPage />} />
          <Route path="kidem-tazminati/gemi" element={<GemiKidemPage />} />
          <Route path="kidem-tazminati/mevsimlik" element={<MevsimlikKidemPage />} />
          <Route path="kidem-tazminati/basin" element={<BasinKidemPage />} />
          <Route path="kidem-tazminati/kismi-sureli" element={<KismiKidemPage />} />
          <Route path="kidem-tazminati/belirli-sureli" element={<BelirliSureliKidemPage />} />
          <Route path="fazla-mesai" element={<FazlaMesaiSelectionPage />} />
          <Route path="fazla-mesai/standart" element={<StandartFmPage />} />
          <Route path="fazla-mesai/tanikli-standart" element={<TanikliStandartFmPage />} />
          <Route path="fazla-mesai/haftalik-karma" element={<HaftalikKarmaFmPage />} />
          <Route path="fazla-mesai/donemsel" element={<DonemselFmPage />} />
          <Route path="fazla-mesai/donemsel-haftalik" element={<DonemselHaftalikFmPage />} />
          <Route path="fazla-mesai/yeralti-isci" element={<YeraltiFmPage />} />
          <Route path="fazla-mesai/vardiya-24" element={<Vardiya24FmPage />} />
          <Route path="fazla-mesai/vardiya-48" element={<Vardiya48FmPage />} />
          <Route path="fazla-mesai/gemi-adami-gunluk" element={<GemiGunlukFmPage />} />
          <Route path="fazla-mesai/gemi-adami-7-24" element={<Gemi724FmPage />} />
          <Route path="fazla-mesai/ev-isci" element={<EvIsciPage />} />
          <Route path="fazla-mesai/puantaj" element={<PuantajFmPage />} />
          <Route path="haksiz-fesih-tazminati" element={<HaksizFesihTazminatiPage />} />
          <Route path="ayrimcilik-tazminati" element={<AyrimcilikTazminatiPage />} />
          <Route path="ise-almama-tazminati" element={<IseAlmamaTazminatiPage />} />
          <Route path="ucret-alacagi" element={<UcretAlacagiPage />} />
          <Route path="is-arama-izni-ucreti" element={<IsAramaIzniUcretiPage />} />
          <Route path="prim-alacagi" element={<PrimAlacagiPage />} />
          <Route path="kotu-niyet-tazminati" element={<KotuNiyetTazminatiPage />} />
          <Route path="bosta-gecen-sure-ucreti" element={<BostaGecenSureUcretiPage />} />
          <Route path="ubgt" element={<UbgtSelectionPage />} />
          <Route path="ubgt/alacagi" element={<UbgtAlacagiPage />} />
          <Route path="ubgt/bilirkisi" element={<UbgtBilirkisiPage />} />
          <Route path="bakiye-ucret-alacagi" element={<BakiyeUcretAlacagiPage />} />
          <Route path="icra-takip-brutten-nete" element={<IcraTakipSelectionPage />} />
          <Route path="icra-takip-brutten-nete/damga-vergisi-kesintili" element={<DamgaVergisiKesintiliPage />} />
          <Route path="icra-takip-brutten-nete/gelir-ve-damga-vergisi-kesintili" element={<GelirVeDamgaVergisiKesintiliPage />} />
          <Route path="icra-takip-brutten-nete/istisnali-full-kesintili" element={<IstisnaliFullKesintiliPage />} />
          <Route path="icra-takip-brutten-nete/istisnasiz-full-kesintili" element={<IstisnasizFullKesintiliPage />} />
          <Route path="hafta-tatili" element={<HaftaTatiliSelectionPage />} />
          <Route path="hafta-tatili/standard" element={<HaftaTatiliStandardPage />} />
          <Route path="hafta-tatili/gemi-adami" element={<HaftaTatiliGemiPage />} />
          <Route path="hafta-tatili/basin-is" element={<HaftaTatiliBasinPage />} />
          <Route path="ihbar-tazminati" element={<IhbarSelectionPage />} />
          <Route path="ihbar-tazminati/30isci" element={<Ihbar30IsciPage />} />
          <Route path="ihbar-tazminati/borclar" element={<IhbarBorclarPage />} />
          <Route path="ihbar-tazminati/gemi" element={<IhbarGemiPage />} />
          <Route path="ihbar-tazminati/mevsim" element={<IhbarMevsimPage />} />
          <Route path="ihbar-tazminati/basin" element={<IhbarBasinPage />} />
          <Route path="ihbar-tazminati/kismi" element={<IhbarKismiPage />} />
          <Route path="ihbar-tazminati/belirli" element={<IhbarBelirliPage />} />

          <Route path="yillik-izin" element={<YillikSelectionPage />} />
          <Route path="yillik-izin/standart" element={<YillikStandartPage />} />
          <Route path="yillik-izin/borclar" element={<YillikBorclarPage />} />
          <Route path="yillik-izin/gemi" element={<YillikGemiPage />} />
          <Route path="yillik-izin/mevsim" element={<YillikMevsimPage />} />
          <Route path="yillik-izin/basin" element={<YillikBasinPage />} />
          <Route path="yillik-izin/basin/gunluk-olmayan" element={<YillikBasinGunlukOlmayanPage />} />
          <Route path="yillik-izin/kismi" element={<YillikKismiPage />} />
          <Route path="yillik-izin/belirli" element={<YillikBelirliPage />} />

          <Route element={<AdminOnly />}>
            <Route path="admin" element={<AdminPage />} />
            <Route path="admin/control-center" element={<ControlCenterPage />} />
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/users/new" element={<CreateUserPage />} />
            <Route path="admin/users/:id/detail" element={<UserDetailPage />} />
            <Route path="admin/users/:id/edit" element={<UserEditPage />} />
            <Route path="admin/subscriptions" element={<SubscriptionsPage />} />
            <Route path="admin/tickets" element={<TicketsPage />} />
            <Route path="admin/chat" element={<ChatPage />} />
            <Route path="admin/analytics" element={<AnalyticsPage />} />
            <Route path="admin/device-login-analytics" element={<DeviceLoginAnalyticsPage />} />
            <Route path="admin/demo-usage-funnel" element={<DemoUsageFunnelPage />} />
            <Route path="admin/demo-conversion" element={<DemoConversionPage />} />
            <Route path="admin/logs" element={<LogsPage />} />
            <Route path="admin/audit-logs" element={<AuditLogsPage />} />
            <Route path="admin/licenses" element={<LicensesPage />} />
            <Route path="admin/device-management" element={<DevicesPage />} />
            <Route path="admin/email-notifications" element={<EmailNotificationsPage />} />
            <Route path="admin/bar-associations" element={<BarAssociationsPage />} />
            <Route path="admin/bar-campaign-performance" element={<BarCampaignPage />} />
            <Route path="admin/feedback" element={<FeedbackPage />} />
            <Route path="admin/interest-rates" element={<InterestRatesPage />} />
            <Route path="admin/branding" element={<BrandingPage />} />
          </Route>

          <Route path="*" element={<PlaceholderPage />} />
        </Route>
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
