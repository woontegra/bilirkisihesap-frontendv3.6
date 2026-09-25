import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Calendar,
  Clock3,
  FileText,
  Key,
  Mail,
  Monitor,
  Plus,
  ShieldCheck,
  Ticket,
  Trash2,
  User,
  Zap,
} from "lucide-react";
import { apiClient, ApiError } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormDrawer } from "@/components/admin/FormDrawer";
import { FormField } from "@/components/admin/FormField";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge, statusToneFromRaw } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatDateTr, getAccountStatusLabel, getStatusLabel, getSubscriptionAccessTone, getSubscriptionTypeLabel } from "@/utils/adminLabels";
import styles from "./UserDetailPage.module.css";

type TabKey = "genel" | "abonelik" | "gecmis" | "cihaz" | "demo" | "islem" | "destek";
type ConfirmKey = "demo3" | "status" | "trial" | "subscription" | "convertPro" | null;

type UserDeletePreview = {
  userId: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  tenantId: number;
  soleTenantUser: boolean;
  canDelete: boolean;
  canWipeTenant: boolean;
  blockReasons: string[];
  ambiguousShared: Array<{ table: string; count: number; reason: string }>;
  counts: {
    professionalLicenses?: number;
    renewalSessions?: number;
    subscriptionGrants?: number;
    subscriptionPendingByEmail?: number;
    passwordResets?: number;
    savedCases?: number;
    reports?: number;
    tickets?: number;
    loginLogs?: number;
    aiSessions?: number;
    aiPayments?: number;
    barCampaignAttributions?: number;
    chatConversations?: number;
    billingProfiles?: number;
    credits?: number;
    tenantCalcTotal?: number;
    tenantCalcCounts?: Record<string, number>;
    [key: string]: number | Record<string, number> | undefined;
  };
  warning: string;
};

type AuditLogItem = {
  id: number;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  admin: { name: string; email: string } | null;
};

type UserDetailData = {
  user: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    role: string;
    status: string;
    createdAt: string;
  };
  subscription: {
    type: string;
    startDate: string | null;
    endDate: string | null;
    remainingDays: number | null;
    status: string;
    access?: {
      allowed?: boolean;
      code?: string;
      label?: string;
      expiresAt?: string | null;
      licenseStatus?: string | null;
    };
  };
  license: {
    licenseId: string | null;
    licenseKey: string;
    status: string;
    baslangic: string | null;
    bitis: string | null;
    sonGorulme: string | null;
    sonIP: string | null;
    supheli: boolean;
    deviceCount: number;
    remainingDays: number | null;
  } | null;
  usageStats: {
    totalCalculations: number;
    last30DaysCalculations: number;
    mostUsedModule: { name: string; type: string } | null;
    lastCalculationDate: string | null;
  };
  loginStats: {
    totalLogins: number;
    lastLoginDate: string | null;
    lastLoginIP: string | null;
  };
  demoOnboarding?: {
    shown: boolean;
    closed: boolean;
    modalSelection: string | null;
    firstCalculationCompleted: boolean;
    firstCalculationType: string | null;
    firstCalculationAt: string | null;
  };
  tickets: Array<{ id: number; subject: string; status: string; priority: string; createdAt: string }>;
  ipLoginHistory: Array<{ ip: string | null; at: string; userAgent?: string | null }>;
};

type LicenseDevice = {
  id: number;
  device_id: string;
  created_at: string;
  last_used: string;
};

const NO_DATA = "Bilgi henüz oluşmadı";

const TABS: Array<{ key: TabKey; label: string; icon: typeof User }> = [
  { key: "genel", label: "Genel", icon: User },
  { key: "abonelik", label: "Abonelik", icon: ShieldCheck },
  { key: "gecmis", label: "Geçmiş", icon: FileText },
  { key: "cihaz", label: "Cihaz", icon: Key },
  { key: "demo", label: "Demo", icon: Zap },
  { key: "islem", label: "İşlem Geçmişi", icon: Clock3 },
  { key: "destek", label: "Destek", icon: Ticket },
];

const ACTION_LABELS: Record<string, string> = {
  user_create: "Kullanıcı oluşturma",
  license_extend: "Lisans uzatma",
  subscription_change: "Abonelik değişikliği",
  manual_intervention: "Manuel müdahale",
  tenant_create: "Şirket oluşturma",
  user_status_change: "Kullanıcı durum değişikliği",
  device_slot_added: "Cihaz hakkı eklendi",
  device_removed: "Cihaz kaldırıldı",
  email_sent_to_user: "Kullanıcıya e-posta gönderildi",
  admin_note: "Admin Notu",
};

const MAIL_TEMPLATES = {
  demo: {
    subject: "Demo süreniz ve hızlı başlangıç önerileri",
    message:
      "Sayın {{adSoyad}},\n\nDemo hesabınızı daha verimli kullanabilmeniz için hızlı başlangıç adımlarını hatırlatmak istedik.\n\nAbonelik: {{abonelik}}\nBitiş: {{bitisTarihi}} (kalan gün: {{kalanGun}})\n\nİyi çalışmalar dileriz.",
  },
  license: {
    subject: "Lisans süreniz yakında sona eriyor",
    message:
      "Sayın {{adSoyad}},\n\nLisans sürenizin yakında sona ereceğini hatırlatmak isteriz ({{bitisTarihi}}, kalan: {{kalanGun}} gün).\n\nİyi çalışmalar dileriz.",
  },
  custom: { subject: "", message: "" },
};

function addDaysToDate(dateStr: string | null | undefined, days: number): Date {
  const base = dateStr ? new Date(dateStr) : new Date();
  const safe = Number.isNaN(base.getTime()) ? new Date() : base;
  const next = new Date(safe);
  next.setDate(next.getDate() + days);
  return next;
}

function addDaysFromToday(days: number): string {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString().split("T")[0];
}

function applyMailVars(text: string, detail: UserDetailData | null): string {
  const u = detail?.user;
  const sub = detail?.subscription;
  const endDate = sub?.endDate ?? detail?.license?.bitis ?? null;
  const remaining = sub?.remainingDays ?? detail?.license?.remainingDays ?? null;
  return text
    .replace(/\{\{adSoyad\}\}/gi, u?.name?.trim() || "Değerli Kullanıcımız")
    .replace(/\{\{email\}\}/gi, u?.email?.trim() || "")
    .replace(/\{\{abonelik\}\}/gi, sub?.type ? getSubscriptionTypeLabel(sub.type) : "—")
    .replace(/\{\{bitisTarihi\}\}/gi, formatDateTr(endDate))
    .replace(/\{\{kalanGun\}\}/gi, remaining != null ? String(remaining) : "—")
    .replace(/\{\{sirket\}\}/gi, u?.company?.trim() || "");
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState<UserDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("genel");
  const [confirmType, setConfirmType] = useState<ConfirmKey>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState("3");
  const [extendDays, setExtendDays] = useState("30");
  const [convertProType, setConvertProType] = useState<"professional_monthly" | "professional_annual">(
    "professional_monthly",
  );
  const [convertProEndDate, setConvertProEndDate] = useState(addDaysFromToday(30));

  const [activityLogs, setActivityLogs] = useState<AuditLogItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityReloadKey, setActivityReloadKey] = useState(0);

  const [deviceDrawerOpen, setDeviceDrawerOpen] = useState(false);
  const [devices, setDevices] = useState<LicenseDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceBusyId, setDeviceBusyId] = useState<number | null>(null);
  const [addingSlot, setAddingSlot] = useState(false);

  const [mailOpen, setMailOpen] = useState(false);
  const [mailTo, setMailTo] = useState("");
  const [mailSubject, setMailSubject] = useState(MAIL_TEMPLATES.demo.subject);
  const [mailMessage, setMailMessage] = useState(MAIL_TEMPLATES.demo.message);
  const [mailSending, setMailSending] = useState(false);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePreview, setDeletePreview] = useState<UserDeletePreview | null>(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selectedUserId = useMemo(() => {
    const parsed = Number(id);
    return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : null;
  }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const json = await apiClient<UserDetailData>(`/api/admin/users/${id}/detail`, { adminRole: true });
      setData(json);
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : "Kullanıcı detayı alınamadı");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    const loadActivity = async () => {
      if (activeTab !== "islem" || !selectedUserId) return;
      setActivityLoading(true);
      setActivityError(null);
      try {
        const params = new URLSearchParams({
          targetType: "user",
          targetId: selectedUserId,
          limit: "50",
        });
        const json = await apiClient<{ items?: AuditLogItem[] }>(
          `/api/admin/audit-logs?${params.toString()}`,
          { adminRole: true },
        );
        const items = Array.isArray(json?.items) ? json.items : [];
        setActivityLogs(
          items.filter(
            (log) =>
              String(log?.targetType || "").toLowerCase() === "user" &&
              String(log?.targetId || "") === selectedUserId,
          ),
        );
      } catch (err) {
        setActivityLogs([]);
        setActivityError(err instanceof ApiError ? err.message : "İşlem geçmişi alınamadı");
      } finally {
        setActivityLoading(false);
      }
    };
    void loadActivity();
  }, [activeTab, selectedUserId, activityReloadKey]);

  const loadDevices = async (licenseId: string) => {
    setDevicesLoading(true);
    try {
      const res = await apiClient<{ success?: boolean; devices?: LicenseDevice[]; error?: string }>(
        `/api/admin/licenses/${licenseId}/devices`,
        { adminRole: true },
      );
      if (res.success) setDevices(Array.isArray(res.devices) ? res.devices : []);
      else {
        setDevices([]);
        toast.error(res.error || "Cihazlar yüklenemedi");
      }
    } catch (err) {
      setDevices([]);
      toast.error(err instanceof ApiError ? err.message : "Cihazlar yüklenemedi");
    } finally {
      setDevicesLoading(false);
    }
  };

  const openDeviceDrawer = () => {
    const licenseId = data?.license?.licenseId;
    if (!licenseId) return;
    setDeviceDrawerOpen(true);
    void loadDevices(licenseId);
  };

  const user = data?.user;
  const sub = data?.subscription ?? {
    type: "standard",
    startDate: null,
    endDate: null,
    remainingDays: null,
    status: "active",
  };
  const license = data?.license;
  const usage = data?.usageStats ?? {
    totalCalculations: 0,
    last30DaysCalculations: 0,
    mostUsedModule: null,
    lastCalculationDate: null,
  };
  const login = data?.loginStats ?? { totalLogins: 0, lastLoginDate: null, lastLoginIP: null };
  const demo = data?.demoOnboarding;
  const tickets = data?.tickets ?? [];
  const ipLoginHistory = data?.ipLoginHistory ?? [];

  const subscriptionType = String(sub.type || "").toLowerCase();
  const isDemoUser = subscriptionType.includes("demo");
  const isProfessionalUser =
    subscriptionType.includes("professional") || subscriptionType.includes("annual");
  const canManageDevices = Boolean(license?.licenseId);

  const interventionReasons = useMemo(() => {
    if (!data) return [];
    const reasons: string[] = [];
    const remainingDays = sub.remainingDays ?? null;
    if (isDemoUser && (login.totalLogins ?? 0) === 0) reasons.push("Demo kullanıcısı giriş yapmadı");
    if (isDemoUser && remainingDays != null && remainingDays > 0 && remainingDays <= 2) {
      reasons.push(`Demo süresi ${remainingDays} gün içinde bitiyor`);
    }
    if (isDemoUser && remainingDays != null && remainingDays <= 0) reasons.push("Demo süresi dolmuş");
    if (license?.supheli) reasons.push("Şüpheli kullanım işareti var");
    return reasons;
  }, [data, isDemoUser, license?.supheli, login.totalLogins, sub.remainingDays]);

  const riskLabel = interventionReasons.length > 0 ? "Müdahale Gerekli" : "Normal";

  const runStatusToggle = async () => {
    if (!id || !user) return;
    const nextStatus = user.status === "suspended" ? "active" : "suspended";
    setActionBusy("status");
    try {
      await apiClient(`/api/admin/users/${id}/status`, {
        method: "POST",
        adminRole: true,
        body: { status: nextStatus },
      });
      toast.success(nextStatus === "suspended" ? "Kullanıcı pasife alındı" : "Kullanıcı aktifleştirildi");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Durum güncellenemedi");
    } finally {
      setActionBusy(null);
      setConfirmType(null);
    }
  };

  const runDemoPlus3 = async () => {
    if (!id) return;
    setActionBusy("demo3");
    try {
      const nextEnd = addDaysToDate(sub.endDate, 3);
      await apiClient(`/api/admin/users/${id}/subscription`, {
        method: "POST",
        adminRole: true,
        body: { subscriptionType: sub.type || "standard", subscriptionEndsAt: nextEnd.toISOString() },
      });
      toast.success("+3 gün uygulandı");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Demo uzatılamadı");
    } finally {
      setActionBusy(null);
      setConfirmType(null);
    }
  };

  const runAddTrial = async () => {
    if (!id) return;
    const days = Number(trialDays);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Trial gün değeri 1 veya daha büyük olmalı");
      return;
    }
    setActionBusy("trial");
    try {
      await apiClient(`/api/admin/users/${id}/trial`, {
        method: "POST",
        adminRole: true,
        body: { days },
      });
      toast.success("Trial süresi eklendi");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Trial eklenemedi");
    } finally {
      setActionBusy(null);
      setConfirmType(null);
    }
  };

  const runExtendSubscription = async () => {
    if (!id) return;
    const days = Number(extendDays);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Geçerli gün sayısı girin");
      return;
    }
    setActionBusy("subscription");
    try {
      const base = sub.endDate ? new Date(sub.endDate) : new Date();
      const nextEnd = base < new Date() ? new Date() : new Date(base);
      nextEnd.setDate(nextEnd.getDate() + days);
      await apiClient(`/api/admin/users/${id}/subscription`, {
        method: "POST",
        adminRole: true,
        body: { subscriptionType: sub.type || "standard", subscriptionEndsAt: nextEnd.toISOString() },
      });
      toast.success("Lisans uzatıldı");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lisans uzatılamadı");
    } finally {
      setActionBusy(null);
      setConfirmType(null);
    }
  };

  const runConvertToProfessional = async () => {
    if (!id) return;
    setActionBusy("convertPro");
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(convertProEndDate);
      end.setHours(23, 59, 59, 999);
      await apiClient(`/api/admin/users/${id}/subscription`, {
        method: "POST",
        adminRole: true,
        body: {
          subscriptionType: convertProType,
          subscriptionStartsAt: start.toISOString(),
          subscriptionEndsAt: end.toISOString(),
        },
      });
      toast.success("Kullanıcı profesyonel pakete geçirildi");
      await load();
      setConfirmType(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Profesyonel dönüşüm başarısız");
    } finally {
      setActionBusy(null);
    }
  };

  const openDeleteModal = async () => {
    if (!id) return;
    setDeleteOpen(true);
    setDeletePreview(null);
    setDeleteConfirmEmail("");
    setDeleteError(null);
    setDeletePreviewLoading(true);
    try {
      const json = await apiClient<{ success?: boolean; data?: UserDeletePreview; error?: string }>(
        `/api/admin/users/${id}/delete-preview`,
        { adminRole: true },
      );
      if (!json?.data) throw new Error(json?.error || "Silme önizlemesi yüklenemedi");
      setDeletePreview(json.data);
    } catch (err) {
      setDeleteOpen(false);
      toast.error(err instanceof ApiError ? err.message : "Silme önizlemesi yüklenemedi");
    } finally {
      setDeletePreviewLoading(false);
    }
  };

  const closeDeleteModal = () => {
    if (actionBusy === "delete") return;
    setDeleteOpen(false);
    setDeletePreview(null);
    setDeleteConfirmEmail("");
    setDeleteError(null);
  };

  const runDeleteUser = async () => {
    if (!id || !deletePreview?.canDelete) return;
    const expected = String(deletePreview.email || "").trim().toLowerCase();
    if (deleteConfirmEmail.trim().toLowerCase() !== expected) {
      setDeleteError("E-posta adresi eşleşmiyor");
      return;
    }
    setActionBusy("delete");
    setDeleteError(null);
    try {
      const res = await apiClient<{
        success?: boolean;
        message?: string;
        error?: string;
        data?: { deleted?: Record<string, number>; tenantDeleted?: boolean };
      }>(`/api/admin/users/${id}`, {
        method: "DELETE",
        adminRole: true,
        body: { confirmEmail: deleteConfirmEmail.trim() },
      });
      if (res && res.success === false) {
        throw new Error(res.error || "Kullanıcı silinemedi");
      }
      const deleted = res?.data?.deleted || {};
      const summaryParts = Object.entries(deleted)
        .filter(([, n]) => typeof n === "number" && n > 0)
        .slice(0, 6)
        .map(([k, n]) => `${k}: ${n}`);
      toast.success(
        summaryParts.length
          ? `${res?.message || "Kullanıcı silindi"} (${summaryParts.join(", ")})`
          : res?.message || "Kullanıcı silindi",
      );
      navigate("/admin/users");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Kullanıcı silinemedi";
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setActionBusy(null);
    }
  };

  const saveAdminNote = async () => {
    if (!selectedUserId || !noteText.trim()) {
      toast.error("Not metni boş bırakılamaz");
      return;
    }
    setNoteSaving(true);
    try {
      await apiClient(`/api/admin/users/${selectedUserId}/notes`, {
        method: "POST",
        adminRole: true,
        body: { note: noteText.trim() },
      });
      toast.success("Admin notu kaydedildi");
      setNoteText("");
      setNoteOpen(false);
      setActivityReloadKey((v) => v + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Admin notu kaydedilemedi");
    } finally {
      setNoteSaving(false);
    }
  };

  const openMailModal = () => {
    setMailTo(user?.email || "");
    setMailSubject(applyMailVars(MAIL_TEMPLATES.demo.subject, data));
    setMailMessage(applyMailVars(MAIL_TEMPLATES.demo.message, data));
    setMailOpen(true);
  };

  const sendMail = async () => {
    const to = mailTo.trim();
    if (!to.includes("@") || !mailSubject.trim() || !mailMessage.trim()) {
      toast.error("Alıcı, konu ve mesaj zorunludur");
      return;
    }
    setMailSending(true);
    try {
      const body = await apiClient<{ success?: boolean; error?: string }>(
        "/api/email-notifications/send-bulk",
        {
          method: "POST",
          adminRole: true,
          body: {
            recipientType: "custom",
            customEmails: [{ email: to, name: user?.name?.trim() || "" }],
            recipientDisplayName: user?.name?.trim() || "",
            subject: mailSubject.trim(),
            message: mailMessage.trim(),
            template: "custom",
          },
        },
      );
      if (!body?.success) throw new Error(body?.error || "Mail gönderimi başarısız");
      toast.success("Mail başarıyla gönderildi");
      setMailOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Mail gönderilemedi");
    } finally {
      setMailSending(false);
    }
  };

  const removeDevice = async (deviceId: number) => {
    const licenseId = license?.licenseId;
    if (!licenseId) return;
    setDeviceBusyId(deviceId);
    try {
      const res = await apiClient<{ success?: boolean; message?: string; error?: string }>(
        `/api/admin/licenses/${licenseId}/devices/${deviceId}`,
        { method: "DELETE", adminRole: true },
      );
      if (!res.success) throw new Error(res.error || "Cihaz silinemedi");
      toast.success(res.message || "Cihaz silindi");
      await loadDevices(licenseId);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Cihaz silinemedi");
    } finally {
      setDeviceBusyId(null);
    }
  };

  const addDeviceSlot = async () => {
    const licenseId = license?.licenseId;
    if (!licenseId) return;
    setAddingSlot(true);
    try {
      const res = await apiClient<{ success?: boolean; message?: string; error?: string }>(
        `/api/admin/licenses/${licenseId}/devices/add-slot`,
        { method: "POST", adminRole: true },
      );
      if (!res.success) throw new Error(res.error || "Eklenemedi");
      toast.success(res.message || "Yeni cihaz hakkı eklendi");
      await loadDevices(licenseId);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Cihaz hakkı eklenemedi");
    } finally {
      setAddingSlot(false);
    }
  };

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <AdminSkeleton rows={8} cards={4} />
      </div>
    );
  }

  if (error || !data || !user) {
    return (
      <div className={styles.page}>
        <Link className={styles.backLink} to="/admin/users">
          <ArrowLeft size={16} />
          Kullanıcı listesi
        </Link>
        <StatePanel
          tone="danger"
          icon={User}
          title="Detay yüklenemedi"
          description={error || "Kullanıcı detayı alınamadı"}
          actionLabel="Tekrar dene"
          onAction={() => void load()}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <Link className={styles.backLink} to="/admin/users">
            <ArrowLeft size={16} />
            Kullanıcı listesi
          </Link>
          <div className={styles.userHead}>
            <h1 className={styles.userTitle}>
              <User size={18} />
              {user.name}
            </h1>
            <p className={styles.userEmail}>{user.email}</p>
            <div className={styles.badges}>
              <StatusBadge tone={statusToneFromRaw(user.status)}>{getAccountStatusLabel(user.status)}</StatusBadge>
              <StatusBadge tone={getSubscriptionAccessTone(sub.access?.code)}>
                {sub.access?.label || getSubscriptionTypeLabel(sub.type)}
              </StatusBadge>
              <StatusBadge tone="neutral">
                {sub.remainingDays != null ? `${Math.max(0, sub.remainingDays)} gün` : NO_DATA}
              </StatusBadge>
              <StatusBadge tone={interventionReasons.length ? "danger" : "success"}>{riskLabel}</StatusBadge>
            </div>
          </div>
        </div>
        <Link to={`/admin/users/${user.id}/edit`}>
          <Button variant="soft" size="sm">
            Düzenle
          </Button>
        </Link>
      </div>

      <div className={styles.stats}>
        <StatCard
          label="Abonelik"
          value={getSubscriptionTypeLabel(sub.type)}
          hint={sub.remainingDays != null ? `${Math.max(0, sub.remainingDays)} gün kaldı` : NO_DATA}
          icon={Calendar}
          index={0}
        />
        <StatCard
          label="Lisans / Cihaz"
          value={license ? (sub.access?.label || getStatusLabel(license.status)) : (sub.access?.label || "Lisans yok")}
          hint={license ? `${license.deviceCount} cihaz kayıtlı` : NO_DATA}
          icon={Key}
          tone="blue"
          index={1}
        />
        <StatCard
          label="Kullanım"
          value={`${usage.totalCalculations} hesaplama`}
          hint={`Son 30 gün: ${usage.last30DaysCalculations}`}
          icon={BarChart3}
          tone="green"
          index={2}
        />
        <StatCard
          label="Giriş"
          value={`${login.totalLogins} giriş`}
          hint={`Son giriş: ${formatDateTr(login.lastLoginDate, true)}`}
          icon={Activity}
          tone="amber"
          index={3}
        />
      </div>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Hızlı İşlemler</h2>
          <p className={styles.cardDesc}>Bu kullanıcı için admin işlemlerini tek yerden yönetin</p>
        </div>
        <div className={`${styles.cardBody} ${styles.actionsWrap}`}>
          {isDemoUser ? (
            <>
              <Button variant="soft" size="sm" disabled={actionBusy != null} onClick={() => setConfirmType("demo3")}>
                +3 Gün Ver
              </Button>
              <Button variant="soft" size="sm" disabled={actionBusy != null} onClick={() => setConfirmType("trial")}>
                Trial Süresi Ekle
              </Button>
              <Button
                variant="soft"
                size="sm"
                disabled={actionBusy != null}
                onClick={() => {
                  setConvertProType("professional_monthly");
                  setConvertProEndDate(addDaysFromToday(30));
                  setConfirmType("convertPro");
                }}
              >
                Profesyonel&apos;e Çevir
              </Button>
            </>
          ) : null}
          {isProfessionalUser ? (
            <Button variant="soft" size="sm" disabled={actionBusy != null} onClick={() => setConfirmType("subscription")}>
              Lisans Uzat
            </Button>
          ) : null}
          {canManageDevices ? (
            <Button variant="soft" size="sm" disabled={actionBusy != null} onClick={openDeviceDrawer}>
              <Monitor size={14} />
              Cihazları Yönet
            </Button>
          ) : null}
          <Button variant="soft" size="sm" disabled={actionBusy != null} onClick={openMailModal}>
            <Mail size={14} />
            Mail Gönder
          </Button>
          <Button variant="soft" size="sm" disabled={actionBusy != null} onClick={() => setNoteOpen(true)}>
            Admin Notu Ekle
          </Button>
          <Button variant="soft" size="sm" disabled={actionBusy != null} onClick={() => setConfirmType("status")}>
            {user.status === "suspended" ? "Aktife Al" : "Pasife Al"}
          </Button>
          <Button variant="danger" size="sm" disabled={actionBusy != null} onClick={() => void openDeleteModal()}>
            <Trash2 size={14} />
            Kullanıcıyı Sil
          </Button>
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Kullanıcı sekmeleri">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section className={`${styles.card} ${styles.tabPanel}`}>
        {activeTab === "genel" ? (
          <>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Genel Özet</h2>
              <p className={styles.cardDesc}>Kullanıcı kimliği ve müdahale durumu</p>
            </div>
            <div className={`${styles.cardBody} ${styles.infoGrid} ${styles.infoGridWide}`}>
              <div className={styles.infoItem}><p className={styles.infoLabel}>Ad Soyad</p><p className={styles.infoValue}>{user.name}</p></div>
              <div className={styles.infoItem}><p className={styles.infoLabel}>E-posta</p><p className={styles.infoValue}>{user.email}</p></div>
              <div className={styles.infoItem}><p className={styles.infoLabel}>Şirket</p><p className={styles.infoValue}>{user.company || NO_DATA}</p></div>
              <div className={styles.infoItem}><p className={styles.infoLabel}>Hesap durumu</p><p className={styles.infoValue}>{getAccountStatusLabel(user.status)}</p></div>
              <div className={styles.infoItem}><p className={styles.infoLabel}>Abonelik</p><p className={styles.infoValue}>{getSubscriptionTypeLabel(sub.type)}</p></div>
              <div className={styles.infoItem}><p className={styles.infoLabel}>Abonelik durumu</p><p className={styles.infoValue}>{sub.access?.label || "—"}</p></div>
              <div className={styles.infoItem}>
                <p className={styles.infoLabel}>Müdahale durumu</p>
                <p className={`${styles.infoValue} ${interventionReasons.length ? styles.riskWarn : ""}`}>{riskLabel}</p>
                {interventionReasons.length ? (
                  <ul className={styles.cardDesc}>
                    {interventionReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {activeTab === "abonelik" ? (
          <div className={`${styles.cardBody} ${styles.splitGrid}`}>
            <div className={styles.infoItem}>
              <p className={styles.infoLabel}>Abonelik Tipi</p>
              <p className={styles.infoValue}>{getSubscriptionTypeLabel(sub.type)}</p>
              <p className={styles.deviceMeta}>Başlangıç: {formatDateTr(sub.startDate)}</p>
              <p className={styles.deviceMeta}>Bitiş: {formatDateTr(sub.endDate)}</p>
              <p className={styles.deviceMeta}>
                Kalan gün: {sub.remainingDays != null ? Math.max(0, sub.remainingDays) : NO_DATA}
              </p>
            </div>
            <div className={styles.infoItem}>
              <p className={styles.infoLabel}>Lisans</p>
              {license ? (
                <>
                  <p className={styles.infoValue}>{license.licenseKey}</p>
                  <p className={styles.deviceMeta}>Durum: {getStatusLabel(license.status)}</p>
                  <p className={styles.deviceMeta}>Bitiş: {formatDateTr(license.bitis)}</p>
                  <p className={styles.deviceMeta}>Cihaz: {license.deviceCount}</p>
                  {license.supheli ? <StatusBadge tone="danger">Şüpheli kullanım</StatusBadge> : null}
                </>
              ) : (
                <p className={styles.infoValue}>{sub.access?.label || "Lisans kaydı yok"}</p>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === "gecmis" ? (
          <div className={`${styles.cardBody} ${styles.infoGrid}`}>
            <div className={styles.infoItem}><p className={styles.infoLabel}>Toplam hesaplama</p><p className={styles.infoValue}>{usage.totalCalculations}</p></div>
            <div className={styles.infoItem}><p className={styles.infoLabel}>Son 30 gün</p><p className={styles.infoValue}>{usage.last30DaysCalculations}</p></div>
            <div className={styles.infoItem}>
              <p className={styles.infoLabel}>En çok kullanılan modül</p>
              <p className={styles.infoValue}>{usage.mostUsedModule?.name || NO_DATA}</p>
            </div>
            <div className={styles.infoItem}>
              <p className={styles.infoLabel}>Son hesaplama</p>
              <p className={styles.infoValue}>{formatDateTr(usage.lastCalculationDate, true)}</p>
            </div>
          </div>
        ) : null}

        {activeTab === "cihaz" ? (
          <div className={styles.cardBody}>
            <div className={`${styles.infoGrid} ${styles.infoGridWide}`}>
              <div className={styles.infoItem}><p className={styles.infoLabel}>Toplam giriş</p><p className={styles.infoValue}>{login.totalLogins}</p></div>
              <div className={styles.infoItem}><p className={styles.infoLabel}>Son giriş</p><p className={styles.infoValue}>{formatDateTr(login.lastLoginDate, true)}</p></div>
              <div className={styles.infoItem}><p className={styles.infoLabel}>Son IP</p><p className={styles.infoValue}>{login.lastLoginIP || NO_DATA}</p></div>
            </div>
            {ipLoginHistory.length === 0 ? (
              <p className={styles.emptyBox}>Bu kullanıcı için IP giriş geçmişi yok.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>IP</th>
                      <th>Tarih</th>
                      <th>User Agent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ipLoginHistory.slice(0, 20).map((row, index) => (
                      <tr key={`${row.at}-${index}`}>
                        <td>{row.ip || NO_DATA}</td>
                        <td>{formatDateTr(row.at, true)}</td>
                        <td>{row.userAgent || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "demo" ? (
          <div className={`${styles.cardBody} ${styles.infoGrid} ${styles.infoGridWide}`}>
            <div className={styles.infoItem}><p className={styles.infoLabel}>Modal gösterildi mi?</p><p className={styles.infoValue}>{demo?.shown ? "Evet" : "Hayır"}</p></div>
            <div className={styles.infoItem}><p className={styles.infoLabel}>Modal kapatıldı mı?</p><p className={styles.infoValue}>{demo?.closed ? "Evet" : "Hayır"}</p></div>
            <div className={styles.infoItem}><p className={styles.infoLabel}>Modal seçimi</p><p className={styles.infoValue}>{demo?.modalSelection || NO_DATA}</p></div>
            <div className={styles.infoItem}><p className={styles.infoLabel}>İlk hesaplama yapıldı mı?</p><p className={styles.infoValue}>{demo?.firstCalculationCompleted ? "Evet" : "Hayır"}</p></div>
            <div className={styles.infoItem}><p className={styles.infoLabel}>İlk hesaplama türü</p><p className={styles.infoValue}>{demo?.firstCalculationType || NO_DATA}</p></div>
            <div className={styles.infoItem}><p className={styles.infoLabel}>İlk hesaplama tarihi</p><p className={styles.infoValue}>{formatDateTr(demo?.firstCalculationAt, true)}</p></div>
          </div>
        ) : null}

        {activeTab === "islem" ? (
          <div className={styles.cardBody}>
            {activityLoading ? (
              <AdminSkeleton rows={4} cards={0} />
            ) : activityError ? (
              <StatePanel tone="danger" icon={Clock3} title="Geçmiş yüklenemedi" description={activityError} />
            ) : activityLogs.length === 0 ? (
              <p className={styles.emptyBox}>Bu kullanıcı için henüz işlem kaydı bulunmuyor.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>İşlem</th>
                      <th>Yönetici</th>
                      <th>Detay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateTr(log.createdAt, true)}</td>
                        <td>{ACTION_LABELS[log.action] || log.action}</td>
                        <td>{log.admin ? `${log.admin.name}` : "—"}</td>
                        <td>
                          {typeof log.details?.note === "string"
                            ? log.details.note
                            : typeof log.details?.description === "string"
                              ? log.details.description
                              : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "destek" ? (
          <div className={styles.cardBody}>
            {tickets.length === 0 ? (
              <p className={styles.emptyBox}>Bu kullanıcıya ait destek talebi bulunmuyor.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Konu</th>
                      <th>Durum</th>
                      <th>Öncelik</th>
                      <th>Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td>{ticket.subject}</td>
                        <td>{getStatusLabel(ticket.status)}</td>
                        <td>{ticket.priority}</td>
                        <td>{formatDateTr(ticket.createdAt, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmType === "demo3"}
        title="Demo +3 Gün"
        description={`Mevcut bitiş: ${formatDateTr(sub.endDate)}. +3 gün uygulanacak.`}
        loading={actionBusy === "demo3"}
        onCancel={() => setConfirmType(null)}
        onConfirm={() => void runDemoPlus3()}
      />

      <ConfirmDialog
        open={confirmType === "status"}
        title={user.status === "suspended" ? "Kullanıcıyı Aktifleştir" : "Kullanıcıyı Pasife Al"}
        description={
          user.status === "suspended"
            ? "Kullanıcı hesabı tekrar aktif edilecek."
            : "Kullanıcı hesabı askıya alınacak."
        }
        loading={actionBusy === "status"}
        onCancel={() => setConfirmType(null)}
        onConfirm={() => void runStatusToggle()}
      />

      {deleteOpen ? (
        <div className={styles.modalOverlay} onClick={closeDeleteModal} role="presentation">
          <div
            className={`${styles.modal} ${styles.deleteModal}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-delete-title"
          >
            <h3 id="user-delete-title" className={styles.modalTitle}>
              Kullanıcıyı Sil
            </h3>
            <p className={styles.deleteWarning}>
              Bu işlem geri alınamaz ve kullanıcının tüm verilerini kalıcı olarak siler.
            </p>

            {deletePreviewLoading ? (
              <p className={styles.cardDesc}>İlişkili kayıtlar sayılıyor…</p>
            ) : null}

            {deletePreview ? (
              <div className={styles.deletePreviewBody}>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <p className={styles.infoLabel}>Kullanıcı</p>
                    <p className={styles.infoValue}>{deletePreview.name}</p>
                  </div>
                  <div className={styles.infoItem}>
                    <p className={styles.infoLabel}>E-posta</p>
                    <p className={styles.infoValue}>{deletePreview.email}</p>
                  </div>
                  <div className={styles.infoItem}>
                    <p className={styles.infoLabel}>Telefon</p>
                    <p className={styles.infoValue}>{deletePreview.phone || "—"}</p>
                  </div>
                  <div className={styles.infoItem}>
                    <p className={styles.infoLabel}>Tenant</p>
                    <p className={styles.infoValue}>
                      #{deletePreview.tenantId}
                      {deletePreview.soleTenantUser ? " (tek kullanıcı — tenant silinecek)" : " (paylaşımlı — tenant korunur)"}
                    </p>
                  </div>
                </div>

                {!deletePreview.canDelete ? (
                  <div className={styles.deleteBlockBox}>
                    Bu kullanıcı silinemez
                    {deletePreview.blockReasons?.length
                      ? `: ${deletePreview.blockReasons.join(", ")}`
                      : "."}
                  </div>
                ) : null}

                {deletePreview.ambiguousShared?.length ? (
                  <div className={styles.deleteWarnBox}>
                    Paylaşımlı tenantta sahipliği ayırt edilemeyen kayıtlar korunacak (silinmeyecek):
                    <ul>
                      {deletePreview.ambiguousShared.map((row) => (
                        <li key={`${row.table}-${row.reason}`}>
                          {row.table}: {row.count}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className={styles.deleteCountGrid}>
                  {(
                    [
                      ["Lisans", deletePreview.counts.professionalLicenses],
                      ["Yenileme oturumu", deletePreview.counts.renewalSessions],
                      ["Abonelik grant", deletePreview.counts.subscriptionGrants],
                      ["Demo/pending ödeme", deletePreview.counts.subscriptionPendingByEmail],
                      ["Password reset", deletePreview.counts.passwordResets],
                      ["Kayıtlı hesaplama", deletePreview.counts.savedCases],
                      ["Rapor", deletePreview.counts.reports],
                      ["Destek talebi", deletePreview.counts.tickets],
                      ["Cihaz/giriş kaydı", deletePreview.counts.loginLogs],
                      ["AI oturum", deletePreview.counts.aiSessions],
                      ["AI ödeme (detach)", deletePreview.counts.aiPayments],
                      ["Baro attribution", deletePreview.counts.barCampaignAttributions],
                      ["Chat", deletePreview.counts.chatConversations],
                      ["Billing profil", deletePreview.counts.billingProfiles],
                      ["Credit (tenant)", deletePreview.counts.credits],
                      ["Tenant hesaplama", deletePreview.counts.tenantCalcTotal],
                    ] as Array<[string, number | undefined]>
                  ).map(([label, value]) => (
                    <div key={label} className={styles.deleteCountItem}>
                      <span>{label}</span>
                      <strong>{typeof value === "number" ? value : 0}</strong>
                    </div>
                  ))}
                </div>

                {deletePreview.canDelete ? (
                  <FormField label={`Onay için e-postayı yazın: ${deletePreview.email}`}>
                    <input
                      type="email"
                      value={deleteConfirmEmail}
                      onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                      placeholder={deletePreview.email}
                      autoComplete="off"
                      disabled={actionBusy === "delete"}
                    />
                  </FormField>
                ) : null}

                {deleteError ? <p className={styles.deleteError}>{deleteError}</p> : null}
              </div>
            ) : null}

            <div className={styles.modalActions}>
              <Button variant="soft" onClick={closeDeleteModal} disabled={actionBusy === "delete"}>
                Vazgeç
              </Button>
              <Button
                variant="danger"
                onClick={() => void runDeleteUser()}
                disabled={
                  actionBusy === "delete" ||
                  deletePreviewLoading ||
                  !deletePreview?.canDelete ||
                  deleteConfirmEmail.trim().toLowerCase() !==
                    String(deletePreview?.email || "").trim().toLowerCase()
                }
              >
                {actionBusy === "delete" ? "Siliniyor…" : "Kalıcı sil"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmType === "convertPro" ? (
        <div className={styles.modalOverlay} onClick={() => setConfirmType(null)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className={styles.modalTitle}>Profesyonel&apos;e Çevir</h3>
            <FormField label="Geçilecek paket">
              <select
                value={convertProType}
                onChange={(e) => {
                  const next = e.target.value as "professional_monthly" | "professional_annual";
                  setConvertProType(next);
                  setConvertProEndDate(addDaysFromToday(next === "professional_monthly" ? 30 : 365));
                }}
              >
                <option value="professional_monthly">Profesyonel Aylık</option>
                <option value="professional_annual">Profesyonel Yıllık</option>
              </select>
            </FormField>
            <FormField label="Bitiş tarihi">
              <input
                type="date"
                value={convertProEndDate}
                onChange={(e) => setConvertProEndDate(e.target.value)}
              />
            </FormField>
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setConfirmType(null)} disabled={actionBusy === "convertPro"}>
                İptal
              </Button>
              <Button variant="primary" onClick={() => void runConvertToProfessional()} disabled={actionBusy === "convertPro"}>
                {actionBusy === "convertPro" ? "İşleniyor…" : "Onayla"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmType === "trial" ? (
        <div className={styles.modalOverlay} onClick={() => setConfirmType(null)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className={styles.modalTitle}>Trial Süresi Ekle</h3>
            <p className={styles.cardDesc}>Gün sayısı mevcut demo/trial bitiş tarihine eklenir.</p>
            <FormField label="Gün">
              <input type="number" min={1} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
            </FormField>
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setConfirmType(null)} disabled={actionBusy === "trial"}>
                İptal
              </Button>
              <Button variant="primary" onClick={() => void runAddTrial()} disabled={actionBusy === "trial"}>
                {actionBusy === "trial" ? "İşleniyor…" : "Onayla"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmType === "subscription" ? (
        <div className={styles.modalOverlay} onClick={() => setConfirmType(null)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className={styles.modalTitle}>Lisans Uzat</h3>
            <p className={styles.cardDesc}>Abonelik bitiş tarihi ileri alınacak.</p>
            <FormField label="Kaç gün?">
              <input type="number" min={1} value={extendDays} onChange={(e) => setExtendDays(e.target.value)} />
            </FormField>
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setConfirmType(null)} disabled={actionBusy === "subscription"}>
                İptal
              </Button>
              <Button variant="primary" onClick={() => void runExtendSubscription()} disabled={actionBusy === "subscription"}>
                {actionBusy === "subscription" ? "İşleniyor…" : "Onayla"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {mailOpen ? (
        <div className={styles.modalOverlay} onClick={() => setMailOpen(false)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className={styles.modalTitle}>Mail Gönder</h3>
            <FormField label="Alıcı">
              <input value={mailTo} onChange={(e) => setMailTo(e.target.value)} />
            </FormField>
            <FormField label="Konu">
              <input value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} />
            </FormField>
            <FormField label="Mesaj">
              <textarea rows={6} value={mailMessage} onChange={(e) => setMailMessage(e.target.value)} />
            </FormField>
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setMailOpen(false)} disabled={mailSending}>
                İptal
              </Button>
              <Button variant="primary" onClick={() => void sendMail()} disabled={mailSending}>
                {mailSending ? "Gönderiliyor…" : "Gönder"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {noteOpen ? (
        <div className={styles.modalOverlay} onClick={() => setNoteOpen(false)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className={styles.modalTitle}>Admin Notu Ekle</h3>
            <FormField label="Not">
              <textarea rows={5} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            </FormField>
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setNoteOpen(false)} disabled={noteSaving}>
                İptal
              </Button>
              <Button variant="primary" onClick={() => void saveAdminNote()} disabled={noteSaving}>
                {noteSaving ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <FormDrawer
        open={deviceDrawerOpen}
        title="Cihaz Yönetimi"
        description={license?.licenseKey ? `Lisans: ${license.licenseKey}` : undefined}
        onClose={() => setDeviceDrawerOpen(false)}
        footer={
          <>
            <Button variant="soft" onClick={() => setDeviceDrawerOpen(false)}>
              Kapat
            </Button>
            <Button variant="primary" disabled={addingSlot} onClick={() => void addDeviceSlot()}>
              <Plus size={14} />
              {addingSlot ? "Ekleniyor…" : "Cihaz Hakkı Ekle"}
            </Button>
          </>
        }
      >
        {devicesLoading ? (
          <AdminSkeleton rows={3} cards={0} />
        ) : devices.length === 0 ? (
          <p className={styles.emptyBox}>Henüz kayıtlı cihaz bulunmuyor.</p>
        ) : (
          <div className={styles.deviceList}>
            {devices.map((device) => (
              <div key={device.id} className={styles.deviceItem}>
                <div>
                  <strong>{device.device_id}</strong>
                  <p className={styles.deviceMeta}>Kayıt: {formatDateTr(device.created_at, true)}</p>
                  <p className={styles.deviceMeta}>Son kullanım: {formatDateTr(device.last_used, true)}</p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={deviceBusyId === device.id}
                  onClick={() => void removeDevice(device.id)}
                >
                  <Trash2 size={13} />
                  Sil
                </Button>
              </div>
            ))}
          </div>
        )}
      </FormDrawer>
    </div>
  );
}
