import {
  Image,
  ListX,
  Mail,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { MobileCards, MobileRecordCard } from "@/components/admin/MobileCards";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge, statusToneFromRaw } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatDateTr } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import {
  DEFAULT_FORM,
  EMAIL_TEMPLATES,
  type BarAssociation,
  type BaroTracking,
  type EmailFormData,
  type SmmmTracking,
  type TrackingSummary,
  formatTrackingDate,
  normalizeImageUrl,
  parseCustomEmails,
  postSendBulk,
} from "./emailHelpers";
import styles from "./EmailNotificationsPage.module.css";
import {
  ACTIVE_SMMM_CHAMBERS,
  collectSmmmRecipientEmails,
} from "./smmmChambersData";

type TabId = "compose" | "baro" | "smmm" | "unsubscribes";

type UnsubscribeRow = {
  id: number;
  email: string;
  unsubscribedAt: string;
  source: string | null;
};

const RECIPIENT_TYPES = [
  { value: "all", label: "Tüm Kullanıcılar" },
  { value: "active", label: "Aktif Aboneler" },
  { value: "trial", label: "Deneme Kullanıcıları" },
  { value: "expired", label: "Süresi Dolmuş Kullanıcılar" },
  { value: "custom", label: "Özel Email Listesi" },
  { value: "bar_associations", label: "Barolar" },
  { value: "smmm_chambers", label: "SMMM Odaları" },
];

function trackingStatusLabel(status: string): string {
  if (status === "SENT") return "Gönderildi";
  if (status === "FAILED") return "Hatalı";
  if (status === "PENDING") return "Bekliyor";
  return status;
}

export default function EmailNotificationsPage() {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [tab, setTab] = useState<TabId>("compose");

  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [formData, setFormData] = useState<EmailFormData>(DEFAULT_FORM);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{
    sent?: number;
    total?: number;
    failed?: number;
    errors?: unknown[];
  } | null>(null);

  const [bars, setBars] = useState<BarAssociation[]>([]);
  const [barSearch, setBarSearch] = useState("");
  const [barSelectionMode, setBarSelectionMode] = useState<"all" | "selected">("all");
  const [selectedBarIds, setSelectedBarIds] = useState<number[]>([]);
  const [includeSecondaryEmail, setIncludeSecondaryEmail] = useState(false);

  const [smmmChamberSearch, setSmmmChamberSearch] = useState("");
  const [smmmSelectionMode, setSmmmSelectionMode] = useState<"all" | "selected">("all");
  const [selectedSmmmIds, setSelectedSmmmIds] = useState<string[]>([]);
  const [includeSmmmSecondaryEmail, setIncludeSmmmSecondaryEmail] = useState(false);

  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [logoPreviewError, setLogoPreviewError] = useState<string | null>(null);
  const [headerPreviewError, setHeaderPreviewError] = useState<string | null>(null);

  const [protocolUploadFile, setProtocolUploadFile] = useState<File | null>(null);
  const [protocolUploading, setProtocolUploading] = useState(false);
  const [applySameProtocolToAll, setApplySameProtocolToAll] = useState(false);
  const [protocolWarning, setProtocolWarning] = useState<{ open: boolean; missing: string[] }>({
    open: false,
    missing: [],
  });

  const [blacklistedEmails, setBlacklistedEmails] = useState<string[]>([]);

  const [trackingSummary, setTrackingSummary] = useState<TrackingSummary | null>(null);
  const [trackingRows, setTrackingRows] = useState<BaroTracking[]>([]);
  const [selectedTrackingIds, setSelectedTrackingIds] = useState<number[]>([]);
  const [trackingPage, setTrackingPage] = useState(1);
  const [trackingPageSize] = useState(10);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingSearch, setTrackingSearch] = useState("");
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [deleteTrackingRow, setDeleteTrackingRow] = useState<BaroTracking | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const [smmmSummary, setSmmmSummary] = useState<TrackingSummary | null>(null);
  const [smmmRows, setSmmmRows] = useState<SmmmTracking[]>([]);
  const [smmmLoading, setSmmmLoading] = useState(false);
  const [smmmTrackingSearch, setSmmmTrackingSearch] = useState("");
  const [smmmPage, setSmmmPage] = useState(1);
  const [smmmPageSize] = useState(10);

  const [eventsOpen, setEventsOpen] = useState(false);
  const [eventsTitle, setEventsTitle] = useState("");
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);

  const [unsubscribes, setUnsubscribes] = useState<UnsubscribeRow[]>([]);
  const [unsubscribesLoading, setUnsubscribesLoading] = useState(false);
  const [reactivateId, setReactivateId] = useState<number | null>(null);

  useEffect(() => {
    const emailFromQuery = searchParams.get("email")?.trim();
    if (!emailFromQuery) return;
    setFormData((prev) => ({
      ...prev,
      recipientType: "custom",
      customEmails: emailFromQuery,
    }));
    setTestEmail(emailFromQuery);
    setTab("compose");
  }, [searchParams]);

  const customParsed = useMemo(() => {
    if (formData.recipientType !== "custom" || !formData.customEmails.trim()) return null;
    return parseCustomEmails(formData.customEmails);
  }, [formData.recipientType, formData.customEmails]);

  const loadBars = useCallback(async () => {
    try {
      const data = await apiClient<{ success: boolean; items?: BarAssociation[] }>(
        "/api/admin/bar-associations?status=ACTIVE",
      );
      if (data.success) setBars(data.items || []);
    } catch {
      setBars([]);
    }
  }, []);

  const loadTracking = useCallback(async () => {
    setTrackingLoading(true);
    try {
      const searchQ = trackingSearch ? `?search=${encodeURIComponent(trackingSearch)}` : "";
      const [summaryData, listData] = await Promise.all([
        apiClient<{ success: boolean; summary?: TrackingSummary }>(
          "/api/admin/baro-email-trackings/summary",
        ),
        apiClient<{ success: boolean; items?: BaroTracking[] }>(
          `/api/admin/baro-email-trackings${searchQ}`,
        ),
      ]);
      if (summaryData.success) setTrackingSummary(summaryData.summary ?? null);
      if (listData.success) {
        const items = listData.items || [];
        setTrackingRows(items);
        setSelectedTrackingIds((prev) => prev.filter((id) => items.some((x) => x.id === id)));
        setTrackingPage(1);
      }
    } catch {
      setTrackingRows([]);
      setSelectedTrackingIds([]);
    } finally {
      setTrackingLoading(false);
    }
  }, [trackingSearch]);

  const loadSmmmTracking = useCallback(async () => {
    setSmmmLoading(true);
    try {
      const searchQ = smmmTrackingSearch ? `?search=${encodeURIComponent(smmmTrackingSearch)}` : "";
      const [summaryData, listData] = await Promise.all([
        apiClient<{ success: boolean; summary?: TrackingSummary }>(
          "/api/admin/smmm-email-trackings/summary",
        ),
        apiClient<{ success: boolean; items?: SmmmTracking[] }>(
          `/api/admin/smmm-email-trackings${searchQ}`,
        ),
      ]);
      if (summaryData.success) setSmmmSummary(summaryData.summary ?? null);
      if (listData.success) {
        setSmmmRows(listData.items || []);
        setSmmmPage(1);
      }
    } catch {
      setSmmmRows([]);
    } finally {
      setSmmmLoading(false);
    }
  }, [smmmTrackingSearch]);

  const loadUnsubscribes = useCallback(async () => {
    setUnsubscribesLoading(true);
    try {
      const data = await apiClient<{
        success: boolean;
        list?: UnsubscribeRow[];
        data?: UnsubscribeRow[];
        unsubscribes?: UnsubscribeRow[];
        error?: string;
      }>("/api/email-notifications/unsubscribes");
      const rawList = data.list ?? data.data ?? data.unsubscribes;
      const arr = Array.isArray(rawList) ? rawList : [];
      const list = arr.map((u) => ({
        id: u.id,
        email: u.email,
        unsubscribedAt:
          (u as { unsubscribedAt?: string; unsubscribed_at?: string }).unsubscribedAt ??
          (u as { unsubscribed_at?: string }).unsubscribed_at ??
          "",
        source: u.source ?? null,
      }));
      if (data.success) setUnsubscribes(list);
      else if (data.error) toast.error(data.error);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kara liste yüklenemedi");
    } finally {
      setUnsubscribesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadBars();
  }, [loadBars]);

  useEffect(() => {
    if (tab === "baro") void loadTracking();
  }, [tab, loadTracking]);

  useEffect(() => {
    if (tab === "smmm") void loadSmmmTracking();
  }, [tab, loadSmmmTracking]);

  useEffect(() => {
    if (tab === "unsubscribes") void loadUnsubscribes();
  }, [tab, loadUnsubscribes]);

  useEffect(() => {
    if (formData.recipientType !== "custom" || !customParsed || customParsed.valid.length === 0) {
      setBlacklistedEmails([]);
      return;
    }
    apiClient<{ success: boolean; blacklisted?: string[] }>(
      "/api/email-notifications/check-blacklist",
      { method: "POST", body: { emails: customParsed.valid } },
    )
      .then((data) => {
        if (data.success && Array.isArray(data.blacklisted)) setBlacklistedEmails(data.blacklisted);
        else setBlacklistedEmails([]);
      })
      .catch(() => setBlacklistedEmails([]));
  }, [formData.recipientType, customParsed?.valid.join(",") ?? ""]);

  const filteredBars = useMemo(
    () =>
      bars.filter(
        (b) =>
          b.name.toLowerCase().includes(barSearch.toLowerCase()) ||
          (b.city || "").toLowerCase().includes(barSearch.toLowerCase()),
      ),
    [bars, barSearch],
  );
  const selectedBars = useMemo(
    () => bars.filter((b) => selectedBarIds.includes(b.id)),
    [bars, selectedBarIds],
  );
  const barsForSend =
    formData.recipientType !== "bar_associations"
      ? []
      : barSelectionMode === "all"
        ? bars
        : selectedBars;

  const filteredSmmm = useMemo(
    () => ACTIVE_SMMM_CHAMBERS.filter((c) => c.name.toLowerCase().includes(smmmChamberSearch.toLowerCase())),
    [smmmChamberSearch],
  );
  const selectedSmmm = useMemo(
    () => ACTIVE_SMMM_CHAMBERS.filter((c) => selectedSmmmIds.includes(c.id)),
    [selectedSmmmIds],
  );
  const smmmForSend =
    formData.recipientType !== "smmm_chambers"
      ? []
      : smmmSelectionMode === "all"
        ? ACTIVE_SMMM_CHAMBERS
        : selectedSmmm;

  const smmmRecipientCount = useMemo(
    () =>
      smmmForSend.reduce(
        (acc, c) => acc + collectSmmmRecipientEmails(c, includeSmmmSecondaryEmail).length,
        0,
      ),
    [smmmForSend, includeSmmmSecondaryEmail],
  );

  const barRecipientCount = useMemo(
    () =>
      barsForSend.reduce((acc, b) => {
        const emails = new Set<string>();
        if (b.primaryEmail) emails.add(b.primaryEmail.toLowerCase());
        if (includeSecondaryEmail && b.secondaryEmail) emails.add(b.secondaryEmail.toLowerCase());
        return acc + emails.size;
      }, 0),
    [barsForSend, includeSecondaryEmail],
  );

  const applyTemplate = (template: (typeof EMAIL_TEMPLATES)[0]) => {
    setAppliedTemplateId(template.templateId ?? null);
    const useBranded =
      template.templateId === "baro" || template.templateId === "smmm_info";
    const defaultHeader =
      template.templateId === "smmm_info"
        ? "https://panel.bilirkisihesap.com/smmmmailsablon.png"
        : "https://panel.bilirkisihesap.com/baromailsablon.png";
    setFormData((prev) => ({
      ...prev,
      ...(template.recipientType != null && { recipientType: template.recipientType }),
      subject: template.subject,
      message: template.message,
      ...(useBranded && {
        logoUrl: prev.logoUrl || "https://panel.bilirkisihesap.com/logo.png",
        headerImageUrl: prev.headerImageUrl || defaultHeader,
      }),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.subject || !formData.message) {
      toast.error("Konu ve mesaj alanlarını doldurun");
      return;
    }
    if (formData.recipientType === "custom" && !formData.customEmails) {
      toast.error("Özel email listesi için en az bir email adresi girin");
      return;
    }
    setPreviewOpen(true);
  };

  const submitConfirmed = async (options?: { allowWithoutProtocol?: boolean }) => {
    setLoading(true);
    setSendResult(null);
    try {
      const requestBody: Record<string, unknown> = {
        recipientType: formData.recipientType,
        subject: formData.subject,
        message: formData.message,
        logoUrl: formData.logoUrl,
        headerImageUrl: formData.headerImageUrl,
        includeSecondaryEmail,
        barSelectionMode,
        barAssociationIds: selectedBarIds,
        smmmSelectionMode,
        smmmChamberIds: selectedSmmmIds,
        includeSmmmSecondaryEmail,
        ...(appliedTemplateId && { template: appliedTemplateId }),
        allowWithoutProtocol: Boolean(options?.allowWithoutProtocol),
      };

      if (
        formData.recipientType === "bar_associations" ||
        formData.recipientType === "smmm_chambers"
      ) {
        requestBody.demoAccess = {
          username: formData.demoUsername,
          password: formData.demoPassword,
          license_key: formData.demoLicenseKey,
          license_type: formData.demoLicenseType,
          license_expires_at: formData.demoLicenseExpiresAt,
          login_url: formData.demoLoginUrl,
          video_url: formData.demoVideoUrl,
        };
      }

      if (formData.recipientType === "custom") {
        const parsed = parseCustomEmails(formData.customEmails);
        if (parsed.valid.length === 0) {
          toast.error("Geçerli email adresi bulunamadı");
          setLoading(false);
          return;
        }
        requestBody.customEmails = parsed.valid;
      }

      const result = await postSendBulk(requestBody);
      if (!result.ok) {
        if (result.code === "MISSING_PROTOCOL_FILES") {
          setProtocolWarning({ open: true, missing: result.missing || [] });
          setPreviewOpen(false);
          return;
        }
        throw new Error(result.error || "Email gönderilemedi");
      }

      setSendResult(result.results);
      setPreviewOpen(false);
      toast.success(
        result.results.total != null && result.results.sent != null
          ? `Email başarıyla gönderildi: ${result.results.sent}/${result.results.total}`
          : "Email başarıyla gönderildi.",
      );
      setAppliedTemplateId(null);
      void loadSmmmTracking();
      setFormData((prev) => ({
        ...prev,
        recipientType: "all",
        customEmails: "",
        subject: "",
        message: "",
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Email gönderilirken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const sendTestMail = async () => {
    if (!testEmail) {
      toast.error("Test email adresi girin");
      return;
    }
    setSendingTest(true);
    try {
      const data = await apiClient<{ success: boolean; error?: string }>(
        "/api/email-notifications/send-test",
        {
          method: "POST",
          body: {
            testEmail,
            barAssociationId: selectedBars[0]?.id || null,
            subject: formData.subject,
            message: formData.message,
            template: appliedTemplateId || undefined,
            logoUrl: formData.logoUrl,
            headerImageUrl: formData.headerImageUrl,
            demoAccess:
              formData.recipientType === "bar_associations" ||
              formData.recipientType === "smmm_chambers"
                ? {
                    username: formData.demoUsername,
                    password: formData.demoPassword,
                    license_key: formData.demoLicenseKey,
                    license_type: formData.demoLicenseType,
                    license_expires_at: formData.demoLicenseExpiresAt,
                    login_url: formData.demoLoginUrl,
                    video_url: formData.demoVideoUrl,
                  }
                : undefined,
          },
        },
      );
      if (!data.success) throw new Error(data.error || "Test email gönderilemedi");
      toast.success("Test email gönderildi");
      void loadTracking();
      void loadSmmmTracking();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test email gönderilemedi");
    } finally {
      setSendingTest(false);
    }
  };

  const uploadProtocolForBars = async () => {
    if (!protocolUploadFile) {
      toast.error("Lütfen protokol dosyası seçin");
      return;
    }
    const ext = `.${(protocolUploadFile.name.split(".").pop() || "").toLowerCase()}`;
    if (![".pdf", ".docx", ".udf"].includes(ext)) {
      toast.error("Sadece .pdf, .docx, .udf dosyaları yüklenebilir");
      return;
    }
    const targetBars = barSelectionMode === "selected" ? selectedBars : bars;
    if (targetBars.length === 0) {
      toast.error("Önce baro seçin");
      return;
    }
    if (targetBars.length > 1 && !applySameProtocolToAll) {
      toast.error("Birden fazla baro seçildi. Aynı dosyayı göndermek için onay kutusunu işaretleyin.");
      return;
    }
    setProtocolUploading(true);
    try {
      const ids = targetBars.length > 1 ? targetBars.map((b) => b.id) : [targetBars[0].id];
      for (const id of ids) {
        const fd = new FormData();
        fd.append("file", protocolUploadFile);
        const data = await apiClient<{ success: boolean; error?: string }>(
          `/api/admin/bar-associations/${id}/protocol-file`,
          { method: "POST", body: fd },
        );
        if (!data.success) throw new Error(data.error || `Baro #${id} için yükleme başarısız`);
      }
      toast.success(ids.length > 1 ? "Dosya seçili barolara yüklendi" : "Dosya baro için yüklendi");
      setProtocolUploadFile(null);
      void loadBars();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Protokol dosyası yüklenemedi");
    } finally {
      setProtocolUploading(false);
    }
  };

  const openBaroEvents = async (row: BaroTracking) => {
    try {
      const data = await apiClient<{ success: boolean; events?: Array<Record<string, unknown>>; error?: string }>(
        `/api/admin/baro-email-trackings/${row.id}/events`,
      );
      if (!data.success) throw new Error(data.error || "Event listesi alınamadı");
      setEvents(data.events || []);
      setEventsTitle(`${row.barAssociation?.name || "Baro"} — ${row.recipientEmail}`);
      setEventsOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Event listesi alınamadı");
    }
  };

  const openSmmmEvents = async (row: SmmmTracking) => {
    try {
      const data = await apiClient<{ success: boolean; events?: Array<Record<string, unknown>>; error?: string }>(
        `/api/admin/smmm-email-trackings/${row.id}/events`,
      );
      if (!data.success) throw new Error(data.error || "Event listesi alınamadı");
      setEvents(data.events || []);
      setEventsTitle(`${row.recipientName || "SMMM Odası"} — ${row.recipientEmail}`);
      setEventsOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Event listesi alınamadı");
    }
  };

  const confirmDeleteTracking = async () => {
    if (!deleteTrackingRow) return;
    try {
      const data = await apiClient<{ success: boolean; error?: string }>(
        `/api/admin/baro-email-trackings/${deleteTrackingRow.id}`,
        { method: "DELETE" },
      );
      if (!data.success) throw new Error(data.error || "Takip kaydı silinemedi");
      toast.success("Takip kaydı silindi");
      setDeleteTrackingRow(null);
      await loadTracking();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Takip kaydı silinemedi");
    }
  };

  const resendTrackingRow = async (row: BaroTracking) => {
    if (resendingId === row.id) return;
    setResendingId(row.id);
    try {
      const data = await apiClient<{ success: boolean; error?: string }>(
        `/api/admin/baro-email-trackings/${row.id}/resend`,
        { method: "POST" },
      );
      if (!data.success) throw new Error(data.error || "Mail tekrar gönderilemedi");
      toast.success("Mail tekrar gönderildi.");
      await loadTracking();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mail tekrar gönderilemedi");
    } finally {
      setResendingId(null);
    }
  };

  const confirmBulkDelete = async () => {
    try {
      const data = await apiClient<{ success: boolean; deletedCount?: number; error?: string }>(
        "/api/admin/baro-email-trackings/bulk-delete",
        { method: "POST", body: { ids: selectedTrackingIds } },
      );
      if (!data.success) throw new Error(data.error || "Takip kayıtları silinemedi");
      toast.success(`${data.deletedCount ?? selectedTrackingIds.length} kayıt silindi`);
      setSelectedTrackingIds([]);
      setBulkDeleteOpen(false);
      await loadTracking();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Takip kayıtları silinemedi");
    }
  };

  const confirmReactivate = async () => {
    if (!reactivateId) return;
    try {
      const data = await apiClient<{ success: boolean; error?: string }>(
        `/api/email-notifications/unsubscribes/${reactivateId}`,
        { method: "DELETE" },
      );
      if (!data.success) throw new Error(data.error || "İşlem yapılamadı");
      setUnsubscribes((prev) => prev.filter((u) => u.id !== reactivateId));
      toast.success("Email yeniden aktif edildi");
      setReactivateId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "İşlem yapılamadı");
    }
  };

  const trackingTotalPages = Math.max(1, Math.ceil(trackingRows.length / trackingPageSize));
  const pagedTracking = useMemo(() => {
    const start = (trackingPage - 1) * trackingPageSize;
    return trackingRows.slice(start, start + trackingPageSize);
  }, [trackingRows, trackingPage, trackingPageSize]);

  const smmmTotalPages = Math.max(1, Math.ceil(smmmRows.length / smmmPageSize));
  const pagedSmmm = useMemo(() => {
    const start = (smmmPage - 1) * smmmPageSize;
    return smmmRows.slice(start, start + smmmPageSize);
  }, [smmmRows, smmmPage, smmmPageSize]);

  const allSelectedOnPage =
    pagedTracking.length > 0 && pagedTracking.every((r) => selectedTrackingIds.includes(r.id));

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedTrackingIds(
      checked
        ? [...new Set([...selectedTrackingIds, ...pagedTracking.map((r) => r.id)])]
        : selectedTrackingIds.filter((id) => !pagedTracking.some((r) => r.id === id)),
    );
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "compose", label: "Compose" },
    { id: "baro", label: "Baro Tracking" },
    { id: "smmm", label: "SMMM Tracking" },
    { id: "unsubscribes", label: "Unsubscribes" },
  ];

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <PageHeader
        title="E-posta Bildirimleri"
        description="Toplu e-posta gönderimi, baro/SMMM takibi ve abonelikten çıkan adresler."
      />

      <nav className={shared.tabs} aria-label="E-posta sekmeleri">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? shared.tabActive : shared.tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "compose" ? (
        <div className={styles.composeLayout}>
          <section className={`${shared.panel} ${styles.composeMain}`}>
            <h2 className={shared.panelTitle}>E-posta Oluştur</h2>
            <form onSubmit={handleSubmit} className={styles.form}>
              <FormField label="Alıcı Grubu">
                <select
                  value={formData.recipientType}
                  onChange={(e) => setFormData({ ...formData, recipientType: e.target.value })}
                >
                  {RECIPIENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </FormField>

              {formData.recipientType === "custom" ? (
                <FormField label="Email Adresleri" hint="Virgül veya satır sonu ile ayırın">
                  <textarea
                    rows={5}
                    placeholder="ornek1@email.com, ornek2@email.com"
                    value={formData.customEmails}
                    onChange={(e) => setFormData({ ...formData, customEmails: e.target.value })}
                  />
                  {customParsed && customParsed.invalid.length > 0 ? (
                    <p className={styles.warn}>
                      Geçersiz format ({customParsed.invalid.length})
                    </p>
                  ) : null}
                  {customParsed && customParsed.valid.length > 0 ? (
                    <p className={styles.hint}>
                      Geçerli: {customParsed.valid.length} · Kara listede: {blacklistedEmails.length}
                    </p>
                  ) : null}
                </FormField>
              ) : null}

              {formData.recipientType === "bar_associations" ? (
                <div className={styles.segmentBox}>
                  <p className={styles.segmentTitle}>Baro seçimi</p>
                  <div className={styles.radioRow}>
                    <label>
                      <input
                        type="radio"
                        checked={barSelectionMode === "all"}
                        onChange={() => setBarSelectionMode("all")}
                      />
                      Tüm aktif barolar
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={barSelectionMode === "selected"}
                        onChange={() => setBarSelectionMode("selected")}
                      />
                      Seçili barolar
                    </label>
                  </div>
                  <label className={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={includeSecondaryEmail}
                      onChange={(e) => setIncludeSecondaryEmail(e.target.checked)}
                    />
                    İkinci mail adreslerini dahil et
                  </label>
                  {barSelectionMode === "selected" ? (
                    <>
                      <input
                        className={styles.inlineInput}
                        placeholder="Baro ara..."
                        value={barSearch}
                        onChange={(e) => setBarSearch(e.target.value)}
                      />
                      <div className={styles.checkList}>
                        {filteredBars.map((b) => (
                          <label key={b.id}>
                            <input
                              type="checkbox"
                              checked={selectedBarIds.includes(b.id)}
                              onChange={(e) =>
                                setSelectedBarIds((prev) =>
                                  e.target.checked
                                    ? [...prev, b.id]
                                    : prev.filter((id) => id !== b.id),
                                )
                              }
                            />
                            {b.name}
                          </label>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <p className={styles.hint}>
                    Baro: {barsForSend.length} · Geçerli e-posta: {barRecipientCount}
                  </p>
                </div>
              ) : null}

              {formData.recipientType === "smmm_chambers" ? (
                <div className={styles.segmentBox}>
                  <p className={styles.segmentTitle}>SMMM seçimi</p>
                  <div className={styles.radioRow}>
                    <label>
                      <input
                        type="radio"
                        checked={smmmSelectionMode === "all"}
                        onChange={() => setSmmmSelectionMode("all")}
                      />
                      Tüm aktif odalar
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={smmmSelectionMode === "selected"}
                        onChange={() => setSmmmSelectionMode("selected")}
                      />
                      Seçili odalar
                    </label>
                  </div>
                  <label className={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={includeSmmmSecondaryEmail}
                      onChange={(e) => setIncludeSmmmSecondaryEmail(e.target.checked)}
                    />
                    İkinci mail adreslerini dahil et
                  </label>
                  {smmmSelectionMode === "selected" ? (
                    <>
                      <input
                        className={styles.inlineInput}
                        placeholder="SMMM odası ara..."
                        value={smmmChamberSearch}
                        onChange={(e) => setSmmmChamberSearch(e.target.value)}
                      />
                      <div className={styles.checkList}>
                        {filteredSmmm.map((c) => (
                          <label key={c.id}>
                            <input
                              type="checkbox"
                              checked={selectedSmmmIds.includes(c.id)}
                              onChange={(e) =>
                                setSelectedSmmmIds((prev) =>
                                  e.target.checked
                                    ? [...prev, c.id]
                                    : prev.filter((id) => id !== c.id),
                                )
                              }
                            />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <p className={styles.hint}>
                    Oda: {smmmForSend.length} · Geçerli e-posta: {smmmRecipientCount}
                  </p>
                </div>
              ) : null}

              {(formData.recipientType === "bar_associations" ||
                formData.recipientType === "smmm_chambers") && (
                <>
                  <div className={styles.segmentBox}>
                    <p className={styles.segmentTitle}>Demo Erişim Bilgileri</p>
                    <div className={styles.demoGrid}>
                      <FormField label="Kullanıcı Adı">
                        <input
                          value={formData.demoUsername}
                          onChange={(e) =>
                            setFormData({ ...formData, demoUsername: e.target.value })
                          }
                        />
                      </FormField>
                      <FormField label="Geçici Şifre">
                        <input
                          value={formData.demoPassword}
                          onChange={(e) =>
                            setFormData({ ...formData, demoPassword: e.target.value })
                          }
                        />
                      </FormField>
                      <FormField label="Lisans Kodu">
                        <input
                          value={formData.demoLicenseKey}
                          onChange={(e) =>
                            setFormData({ ...formData, demoLicenseKey: e.target.value })
                          }
                        />
                      </FormField>
                      <FormField label="Lisans Türü">
                        <input
                          value={formData.demoLicenseType}
                          onChange={(e) =>
                            setFormData({ ...formData, demoLicenseType: e.target.value })
                          }
                        />
                      </FormField>
                      <FormField label="Geçerlilik Bitişi">
                        <input
                          value={formData.demoLicenseExpiresAt}
                          onChange={(e) =>
                            setFormData({ ...formData, demoLicenseExpiresAt: e.target.value })
                          }
                          placeholder="31.12.2026"
                        />
                      </FormField>
                      <FormField label="Giriş Linki">
                        <input
                          value={formData.demoLoginUrl}
                          onChange={(e) =>
                            setFormData({ ...formData, demoLoginUrl: e.target.value })
                          }
                        />
                      </FormField>
                      <FormField label="Eğitim Videoları" className={styles.span2}>
                        <input
                          value={formData.demoVideoUrl}
                          onChange={(e) =>
                            setFormData({ ...formData, demoVideoUrl: e.target.value })
                          }
                        />
                      </FormField>
                    </div>
                  </div>

                  {formData.recipientType === "bar_associations" ? (
                    <div className={styles.segmentBox}>
                      <p className={styles.segmentTitle}>Protokol Dosyası</p>
                      <input
                        type="file"
                        accept=".pdf,.docx,.udf"
                        onChange={(e) => setProtocolUploadFile(e.target.files?.[0] || null)}
                      />
                      {barsForSend.length > 1 ? (
                        <label className={styles.checkRow}>
                          <input
                            type="checkbox"
                            checked={applySameProtocolToAll}
                            onChange={(e) => setApplySameProtocolToAll(e.target.checked)}
                          />
                          Aynı dosyayı seçili tüm barolara yükle
                        </label>
                      ) : null}
                      <div className={styles.actions}>
                        <Button
                          type="button"
                          variant="soft"
                          size="sm"
                          onClick={() => void uploadProtocolForBars()}
                          disabled={protocolUploading || !protocolUploadFile}
                        >
                          {protocolUploading ? "Yükleniyor…" : "Dosya Yükle"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              <FormField label="Konu">
                <input
                  required
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                />
              </FormField>

              <FormField label="Mesaj">
                <textarea
                  required
                  rows={8}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                />
              </FormField>

              <div className={styles.designSection}>
                <p className={styles.segmentTitle}>
                  <Image size={14} /> E-posta Tasarımı (Opsiyonel)
                </p>
                <FormField label="Logo URL">
                  <input
                    value={formData.logoUrl}
                    onChange={(e) => {
                      setFormData({ ...formData, logoUrl: e.target.value });
                      setLogoPreviewError(null);
                    }}
                  />
                </FormField>
                <FormField label="Header Görsel URL">
                  <input
                    value={formData.headerImageUrl}
                    onChange={(e) => {
                      setFormData({ ...formData, headerImageUrl: e.target.value });
                      setHeaderPreviewError(null);
                    }}
                  />
                </FormField>
                {(formData.logoUrl.trim() || formData.headerImageUrl.trim()) && (
                  <div className={styles.previewBox}>
                    {formData.logoUrl.trim() ? (
                      logoPreviewError === normalizeImageUrl(formData.logoUrl) ? (
                        <p className={styles.warn}>Logo yüklenemedi</p>
                      ) : (
                        <img
                          src={normalizeImageUrl(formData.logoUrl)}
                          alt="Logo"
                          className={styles.previewLogo}
                          onError={() => setLogoPreviewError(normalizeImageUrl(formData.logoUrl))}
                        />
                      )
                    ) : null}
                    {formData.headerImageUrl.trim() ? (
                      headerPreviewError === normalizeImageUrl(formData.headerImageUrl) ? (
                        <p className={styles.warn}>Header yüklenemedi</p>
                      ) : (
                        <img
                          src={normalizeImageUrl(formData.headerImageUrl)}
                          alt="Header"
                          className={styles.previewHeader}
                          onError={() =>
                            setHeaderPreviewError(normalizeImageUrl(formData.headerImageUrl))
                          }
                        />
                      )
                    ) : null}
                  </div>
                )}
              </div>

              <Button type="submit" variant="primary" disabled={loading}>
                <Send size={15} />
                {loading ? "Gönderiliyor…" : "Önizleme ve Onay"}
              </Button>

              {sendResult ? (
                <div className={styles.resultBox}>
                  <strong>Gönderim tamamlandı</strong>
                  <p>
                    Başarılı: {sendResult.sent}/{sendResult.total}
                  </p>
                </div>
              ) : null}
            </form>

            <div className={styles.testRow}>
              <FormField label="Test e-posta">
                <input
                  placeholder="test@ornek.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </FormField>
              <Button
                variant="soft"
                onClick={() => void sendTestMail()}
                disabled={sendingTest || !formData.subject || !formData.message}
              >
                {sendingTest ? "Gönderiliyor…" : "Test Maili Gönder"}
              </Button>
            </div>
          </section>

          <aside className={`${shared.panel} ${styles.templates}`}>
            <h2 className={shared.panelTitle}>Hazır Şablonlar</h2>
            <div className={styles.templateList}>
              {EMAIL_TEMPLATES.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  className={styles.templateBtn}
                  onClick={() => applyTemplate(template)}
                >
                  <strong>{template.name}</strong>
                  <span>{template.description ?? template.subject}</span>
                </button>
              ))}
            </div>
            <div className={styles.tips}>
              <p>• E-postalar 10'ar 10'ar gönderilir</p>
              <p>• Kara listedeki adreslere otomatik gönderilmez</p>
              <p>• Baro/SMMM şablonlarında demo alanları kullanılır</p>
            </div>
          </aside>
        </div>
      ) : null}

      {tab === "baro" ? (
        <section className={shared.panel}>
          <div className={shared.rowBetween}>
            <h2 className={shared.panelTitle}>Baro Mail Takipleri</h2>
            <Button variant="soft" size="sm" onClick={() => void loadTracking()}>
              <RefreshCw size={14} className={trackingLoading ? styles.spin : undefined} />
              Yenile
            </Button>
          </div>

          <div className={shared.stats}>
            {[
              ["Gönderilen", trackingSummary?.sentCount ?? 0],
              ["Açılan", trackingSummary?.openedCount ?? 0],
              ["Programa Giriş", trackingSummary?.clickedCount ?? 0],
              ["Sözleşme İndirilen", trackingSummary?.contractDownloadedCount ?? 0],
              ["Hatalı", trackingSummary?.failedCount ?? 0],
            ].map(([label, value], index) => (
              <StatCard key={String(label)} label={String(label)} value={Number(value)} index={index} />
            ))}
          </div>

          <div className={styles.toolbar}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={allSelectedOnPage}
                onChange={(e) => toggleAllOnPage(e.target.checked)}
              />
              Sayfadaki tümünü seç
            </label>
            <input
              className={styles.inlineInput}
              placeholder="Baro / mail / konu ara..."
              value={trackingSearch}
              onChange={(e) => setTrackingSearch(e.target.value)}
            />
            <Button variant="soft" size="sm" onClick={() => void loadTracking()}>
              Ara
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={selectedTrackingIds.length === 0}
              onClick={() => setBulkDeleteOpen(true)}
            >
              Seçilenleri Sil ({selectedTrackingIds.length})
            </Button>
          </div>

          {trackingLoading ? (
            <AdminSkeleton rows={6} cards={0} />
          ) : (
            <AdminTable
              rows={pagedTracking}
              rowKey={(r) => r.id}
              empty={
                <StatePanel icon={Mail} title="Kayıt yok" description="Baro mail takibi bulunamadı." />
              }
              columns={[
                {
                  key: "sel",
                  header: "Seç",
                  render: (r) => (
                    <input
                      type="checkbox"
                      checked={selectedTrackingIds.includes(r.id)}
                      onChange={(e) =>
                        setSelectedTrackingIds((prev) =>
                          e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id),
                        )
                      }
                    />
                  ),
                },
                {
                  key: "baro",
                  header: "Baro",
                  render: (r) => r.barAssociation?.name || "—",
                },
                { key: "email", header: "Alıcı", hideOnMobile: true, render: (r) => r.recipientEmail },
                {
                  key: "subject",
                  header: "Konu",
                  hideBelowMd: true,
                  render: (r) => (
                    <span className={styles.subjectCell} title={r.subject}>
                      {r.subject}
                    </span>
                  ),
                },
                {
                  key: "sent",
                  header: "Gönderildi",
                  hideOnMobile: true,
                  render: (r) => (r.sentAt ? "Evet" : "-"),
                },
                {
                  key: "opened",
                  header: "Açıldı",
                  hideOnMobile: true,
                  render: (r) => (r.openedAt ? "Evet" : "-"),
                },
                {
                  key: "clicked",
                  header: "Programa Giriş",
                  hideBelowMd: true,
                  render: (r) => (r.clickedAt ? "Evet" : "-"),
                },
                {
                  key: "contract",
                  header: "Sözleşme İndirildi",
                  hideBelowMd: true,
                  render: (r) => (r.contractDownloadedAt ? "Evet" : "-"),
                },
                {
                  key: "status",
                  header: "Durum",
                  render: (r) => (
                    <StatusBadge tone={statusToneFromRaw(r.status)}>
                      {trackingStatusLabel(r.status)}
                    </StatusBadge>
                  ),
                },
                {
                  key: "actions",
                  header: "İşlemler",
                  render: (r) => (
                    <div className={styles.rowActions}>
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() => void resendTrackingRow(r)}
                        disabled={resendingId === r.id}
                      >
                        <RotateCcw size={13} />
                      </Button>
                      <Button variant="soft" size="sm" onClick={() => void openBaroEvents(r)}>
                        Event
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTrackingRow(r)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          )}

          {trackingRows.length > 0 ? (
            <div className={shared.pagination}>
              <span className={shared.muted}>
                Sayfa {trackingPage}/{trackingTotalPages}
              </span>
              <Button
                variant="soft"
                size="sm"
                disabled={trackingPage <= 1}
                onClick={() => setTrackingPage((p) => Math.max(1, p - 1))}
              >
                Önceki
              </Button>
              <Button
                variant="soft"
                size="sm"
                disabled={trackingPage >= trackingTotalPages}
                onClick={() => setTrackingPage((p) => Math.min(trackingTotalPages, p + 1))}
              >
                Sonraki
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "smmm" ? (
        <section className={shared.panel}>
          <div className={shared.rowBetween}>
            <h2 className={shared.panelTitle}>SMMM Mail Takipleri</h2>
            <Button variant="soft" size="sm" onClick={() => void loadSmmmTracking()}>
              <RefreshCw size={14} className={smmmLoading ? styles.spin : undefined} />
              Yenile
            </Button>
          </div>

          <div className={shared.stats}>
            {[
              ["Gönderilen", smmmSummary?.sentCount ?? 0],
              ["Açılan", smmmSummary?.openedCount ?? 0],
              ["Tıklanan", smmmSummary?.clickedCount ?? 0],
              ["Protokol İndirilen", smmmSummary?.contractDownloadedCount ?? 0],
              ["Hatalı", smmmSummary?.failedCount ?? 0],
            ].map(([label, value], index) => (
              <StatCard key={String(label)} label={String(label)} value={Number(value)} index={index} />
            ))}
          </div>

          <div className={styles.toolbar}>
            <input
              className={styles.inlineInput}
              placeholder="Oda / mail / konu ara..."
              value={smmmTrackingSearch}
              onChange={(e) => setSmmmTrackingSearch(e.target.value)}
            />
            <Button variant="soft" size="sm" onClick={() => void loadSmmmTracking()}>
              Ara
            </Button>
          </div>

          {smmmLoading ? (
            <AdminSkeleton rows={6} cards={0} />
          ) : (
            <AdminTable
              rows={pagedSmmm}
              rowKey={(r) => r.id}
              empty={
                <StatePanel icon={Mail} title="Kayıt yok" description="SMMM mail takibi bulunamadı." />
              }
              columns={[
                {
                  key: "name",
                  header: "Oda",
                  render: (r) => r.recipientName || "—",
                },
                { key: "email", header: "Alıcı", hideOnMobile: true, render: (r) => r.recipientEmail },
                {
                  key: "subject",
                  header: "Konu",
                  hideBelowMd: true,
                  render: (r) => r.subject,
                },
                {
                  key: "opens",
                  header: "Açılma",
                  hideOnMobile: true,
                  render: (r) => r.openCount ?? 0,
                },
                {
                  key: "clicks",
                  header: "Tıklama",
                  hideBelowMd: true,
                  render: (r) => r.clickCount ?? 0,
                },
                {
                  key: "status",
                  header: "Durum",
                  render: (r) => (
                    <StatusBadge tone={statusToneFromRaw(r.status)}>
                      {trackingStatusLabel(r.status)}
                    </StatusBadge>
                  ),
                },
                {
                  key: "actions",
                  header: "İşlemler",
                  render: (r) => (
                    <Button variant="soft" size="sm" onClick={() => void openSmmmEvents(r)}>
                      Event
                    </Button>
                  ),
                },
              ]}
            />
          )}

          {smmmRows.length > 0 ? (
            <div className={shared.pagination}>
              <span className={shared.muted}>
                Sayfa {smmmPage}/{smmmTotalPages}
              </span>
              <Button
                variant="soft"
                size="sm"
                disabled={smmmPage <= 1}
                onClick={() => setSmmmPage((p) => Math.max(1, p - 1))}
              >
                Önceki
              </Button>
              <Button
                variant="soft"
                size="sm"
                disabled={smmmPage >= smmmTotalPages}
                onClick={() => setSmmmPage((p) => Math.min(smmmTotalPages, p + 1))}
              >
                Sonraki
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "unsubscribes" ? (
        <section className={shared.panel}>
          <div className={shared.rowBetween}>
            <h2 className={shared.panelTitle}>Abonelikten Çıkanlar</h2>
            <Button variant="soft" size="sm" onClick={() => void loadUnsubscribes()}>
              <RefreshCw size={14} className={unsubscribesLoading ? styles.spin : undefined} />
              Yenile
            </Button>
          </div>

          {unsubscribesLoading ? (
            <AdminSkeleton rows={6} cards={0} />
          ) : unsubscribes.length === 0 ? (
            <StatePanel
              icon={ListX}
              title="Kayıt yok"
              description="Abonelikten çıkan e-posta adresi bulunmuyor."
            />
          ) : (
            <>
              <AdminTable
                rows={unsubscribes}
                rowKey={(u) => u.id}
                columns={[
                  { key: "email", header: "E-posta", render: (u) => u.email },
                  {
                    key: "date",
                    header: "Tarih",
                    hideOnMobile: true,
                    render: (u) => formatDateTr(u.unsubscribedAt, true),
                  },
                  {
                    key: "source",
                    header: "Kaynak",
                    hideBelowMd: true,
                    render: (u) => u.source || "—",
                  },
                  {
                    key: "actions",
                    header: "İşlem",
                    render: (u) => (
                      <Button variant="soft" size="sm" onClick={() => setReactivateId(u.id)}>
                        Yeniden Aktif Et
                      </Button>
                    ),
                  },
                ]}
              />
              <MobileCards>
                {unsubscribes.map((u, index) => (
                  <MobileRecordCard key={u.id} index={index}>
                    <p className={styles.cardEmail}>{u.email}</p>
                    <p className={styles.cardMeta}>{formatDateTr(u.unsubscribedAt, true)}</p>
                    <Button variant="soft" size="sm" onClick={() => setReactivateId(u.id)}>
                      Yeniden Aktif Et
                    </Button>
                  </MobileRecordCard>
                ))}
              </MobileCards>
            </>
          )}
        </section>
      ) : null}

      <ConfirmDialog
        open={previewOpen}
        title="Gönderimi onayla"
        description={`"${formData.subject}" konusuyla e-posta gönderilecek. Devam edilsin mi?`}
        confirmLabel="Gönder"
        loading={loading}
        onCancel={() => setPreviewOpen(false)}
        onConfirm={() => void submitConfirmed()}
      />

      <ConfirmDialog
        open={protocolWarning.open}
        title="Protokol dosyası eksik"
        description={
          protocolWarning.missing.length > 0
            ? `Eksik protokol: ${protocolWarning.missing.slice(0, 5).join(", ")}${protocolWarning.missing.length > 5 ? "…" : ""}. Yine de gönderilsin mi?`
            : "Bazı barolarda protokol dosyası yok. Yine de gönderilsin mi?"
        }
        confirmLabel="Protokolsüz Gönder"
        onCancel={() => setProtocolWarning({ open: false, missing: [] })}
        onConfirm={() => {
          setProtocolWarning({ open: false, missing: [] });
          void submitConfirmed({ allowWithoutProtocol: true });
        }}
      />

      <ConfirmDialog
        open={deleteTrackingRow != null}
        title="Takip kaydını sil"
        description={`${deleteTrackingRow?.recipientEmail ?? ""} için takip kaydı silinsin mi?`}
        confirmLabel="Sil"
        danger
        onCancel={() => setDeleteTrackingRow(null)}
        onConfirm={() => void confirmDeleteTracking()}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Toplu silme"
        description={`${selectedTrackingIds.length} takip kaydı silinsin mi?`}
        confirmLabel="Sil"
        danger
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={() => void confirmBulkDelete()}
      />

      <ConfirmDialog
        open={reactivateId != null}
        title="E-postayı yeniden aktif et"
        description="Bu adres tekrar bildirim alabilir hale getirilecek."
        confirmLabel="Aktif Et"
        onCancel={() => setReactivateId(null)}
        onConfirm={() => void confirmReactivate()}
      />

      {eventsOpen ? (
        <div className={styles.eventsOverlay} role="presentation" onClick={() => setEventsOpen(false)}>
          <div
            className={styles.eventsDialog}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={shared.rowBetween}>
              <h3 className={styles.eventsTitle}>{eventsTitle}</h3>
              <Button variant="ghost" size="icon" onClick={() => setEventsOpen(false)}>
                <XCircle size={18} />
              </Button>
            </div>
            {events.length === 0 ? (
              <p className={shared.muted}>Event kaydı yok.</p>
            ) : (
              <ul className={styles.eventsList}>
                {events.map((ev, i) => (
                  <li key={i}>
                    {String(ev.type || ev.eventType || "event")} —{" "}
                    {formatTrackingDate(String(ev.createdAt || ev.timestamp || ""))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
