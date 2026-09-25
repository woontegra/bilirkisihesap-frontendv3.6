import { Building2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FilterBar } from "@/components/admin/FilterBar";
import { FormDrawer } from "@/components/admin/FormDrawer";
import { FormField } from "@/components/admin/FormField";
import { MobileCards, MobileRecordCard } from "@/components/admin/MobileCards";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge, statusToneFromRaw } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatDateTr, getStatusLabel } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./BarAssociationsPage.module.css";

type BarStatus = "ACTIVE" | "PASSIVE";

type BarAssociation = {
  id: number;
  name: string;
  city: string | null;
  primaryEmail: string | null;
  secondaryEmail: string | null;
  kepEmail: string | null;
  discountRate: number;
  campaignCode: string | null;
  status: BarStatus;
  lastEmailSentAt: string | null;
  _count?: { emailCampaignLogs: number };
  emailCampaignLogs?: Array<{ status: string; errorMessage: string | null; createdAt: string }>;
  protocolFiles?: ProtocolFile[];
};

type ProtocolFile = {
  id: number;
  originalFileName: string;
  extension: string;
  sizeBytes: number;
  createdAt: string;
  fileUrl?: string | null;
};

type BarAssociationDetail = BarAssociation & {
  website?: string;
  phone?: string;
  presidentName?: string;
  contactPerson?: string;
  notes?: string;
};

type ListResponse = {
  success: boolean;
  items?: BarAssociation[];
  item?: BarAssociationDetail | ProtocolFile;
  error?: string;
};

const emptyForm = {
  name: "",
  city: "",
  primaryEmail: "",
  secondaryEmail: "",
  kepEmail: "",
  website: "",
  phone: "",
  presidentName: "",
  contactPerson: "",
  discountRate: "40",
  campaignCode: "",
  status: "ACTIVE" as BarStatus,
  notes: "",
};

export default function BarAssociationsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<BarAssociation[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [hasEmail, setHasEmail] = useState("all");
  const [hasKep, setHasKep] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [protocolFile, setProtocolFile] = useState<File | null>(null);
  const [protocolUploading, setProtocolUploading] = useState(false);
  const [protocolInfo, setProtocolInfo] = useState<ProtocolFile | null>(null);
  const [deactivateId, setDeactivateId] = useState<number | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (search.trim()) p.set("search", search.trim());
      if (status !== "all") p.set("status", status);
      if (hasEmail !== "all") p.set("hasEmail", hasEmail);
      if (hasKep !== "all") p.set("hasKep", hasKep);
      const data = await apiClient<ListResponse>(`/api/admin/bar-associations?${p.toString()}`);
      if (!data.success) throw new Error(data.error || "Barolar yüklenemedi");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Barolar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [search, status, hasEmail, hasKep, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setProtocolFile(null);
    setProtocolInfo(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: BarAssociation) => {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      city: row.city || "",
      primaryEmail: row.primaryEmail || "",
      secondaryEmail: row.secondaryEmail || "",
      kepEmail: row.kepEmail || "",
      website: "",
      phone: "",
      presidentName: "",
      contactPerson: "",
      discountRate: String(row.discountRate || 40),
      campaignCode: row.campaignCode || "",
      status: row.status || "ACTIVE",
      notes: "",
    });
    setProtocolFile(null);
    setProtocolInfo(row.protocolFiles?.[0] || null);
    setDrawerOpen(true);

    apiClient<ListResponse>(`/api/admin/bar-associations/${row.id}`)
      .then((data) => {
        if (data?.success && data.item) {
          const item = data.item as BarAssociationDetail;
          setForm({
            name: item.name || "",
            city: item.city || "",
            primaryEmail: item.primaryEmail || "",
            secondaryEmail: item.secondaryEmail || "",
            kepEmail: item.kepEmail || "",
            website: item.website || "",
            phone: item.phone || "",
            presidentName: item.presidentName || "",
            contactPerson: item.contactPerson || "",
            discountRate: String(item.discountRate || 40),
            campaignCode: item.campaignCode || "",
            status: item.status || "ACTIVE",
            notes: item.notes || "",
          });
          setProtocolInfo(item.protocolFiles?.[0] || null);
        }
      })
      .catch(() => undefined);
  };

  const uploadProtocol = async () => {
    try {
      if (!editingId) {
        toast.error("Protokol dosyası yüklemek için önce baroyu kaydedin.");
        return;
      }
      if (!protocolFile) {
        toast.error("Lütfen dosya seçin");
        return;
      }
      const ext = `.${(protocolFile.name.split(".").pop() || "").toLowerCase()}`;
      if (![".pdf", ".docx", ".udf"].includes(ext)) {
        toast.error("Sadece .pdf, .docx, .udf dosyaları yüklenebilir");
        return;
      }
      setProtocolUploading(true);
      const fd = new FormData();
      fd.append("file", protocolFile);
      const data = await apiClient<ListResponse>(
        `/api/admin/bar-associations/${editingId}/protocol-file`,
        { method: "POST", body: fd },
      );
      if (!data.success) throw new Error(data.error || "Yükleme başarısız");
      toast.success("Protokol dosyası yüklendi");
      const uploaded = data.item as ProtocolFile | undefined;
      setProtocolInfo(uploaded || null);
      setProtocolFile(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Yükleme başarısız");
    } finally {
      setProtocolUploading(false);
    }
  };

  const removeProtocol = async () => {
    try {
      if (!editingId) return;
      const data = await apiClient<ListResponse>(
        `/api/admin/bar-associations/${editingId}/protocol-file`,
        { method: "DELETE" },
      );
      if (!data.success) throw new Error(data.error || "Dosya silinemedi");
      toast.success("Protokol dosyası kaldırıldı");
      setProtocolInfo(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dosya silinemedi");
    }
  };

  const submit = async () => {
    try {
      if (!form.name.trim()) {
        toast.error("Baro adı zorunludur");
        return;
      }
      const payload = { ...form, discountRate: Number(form.discountRate) || 40 };
      const url = editingId
        ? `/api/admin/bar-associations/${editingId}`
        : "/api/admin/bar-associations";
      const method = editingId ? "PUT" : "POST";
      const data = await apiClient<ListResponse>(url, { method, body: payload });
      if (!data.success) throw new Error(data.error || "Kayıt başarısız");
      toast.success(editingId ? "Baro güncellendi" : "Baro eklendi");
      setDrawerOpen(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kayıt başarısız");
    }
  };

  const deactivate = async () => {
    if (!deactivateId) return;
    setDeactivating(true);
    try {
      const data = await apiClient<ListResponse>(`/api/admin/bar-associations/${deactivateId}`, {
        method: "DELETE",
      });
      if (!data.success) throw new Error(data.error || "İşlem başarısız");
      toast.success("Baro pasife alındı");
      setDeactivateId(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "İşlem başarısız");
    } finally {
      setDeactivating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, status, hasEmail, hasKep]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <PageHeader
        title="Baro Yönetimi"
        description="Baro listesi, e-posta ve kampanya kodu yönetimi."
        actions={
          <Button variant="primary" size="sm" onClick={openCreate}>
            <Plus size={15} />
            Yeni Baro
          </Button>
        }
      />

      <FilterBar
        actions={
          <Button variant="soft" size="sm" onClick={() => void load()} disabled={loading}>
            Yenile
          </Button>
        }
      >
        <FormField label="Arama">
          <input
            placeholder="Baro / şehir / e-posta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </FormField>
        <FormField label="Durum">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tüm Durumlar</option>
            <option value="ACTIVE">Aktif</option>
            <option value="PASSIVE">Pasif</option>
          </select>
        </FormField>
        <FormField label="E-posta">
          <select value={hasEmail} onChange={(e) => setHasEmail(e.target.value)}>
            <option value="all">Mail filtresi yok</option>
            <option value="true">Maili olanlar</option>
            <option value="false">Maili olmayanlar</option>
          </select>
        </FormField>
        <FormField label="KEP">
          <select value={hasKep} onChange={(e) => setHasKep(e.target.value)}>
            <option value="all">KEP filtresi yok</option>
            <option value="true">KEP olanlar</option>
            <option value="false">KEP olmayanlar</option>
          </select>
        </FormField>
      </FilterBar>

      <section className={`${shared.panel} ${styles.tablePanel}`}>
        <div className={shared.rowBetween}>
          <h2 className={shared.panelTitle}>Baro Listesi</h2>
          <span className={shared.muted}>Toplam {items.length} kayıt</span>
        </div>

        {loading ? (
          <AdminSkeleton rows={8} cards={0} />
        ) : items.length === 0 ? (
          <StatePanel
            icon={Building2}
            title="Kayıt bulunamadı"
            description="Filtreleri değiştirin veya yeni baro ekleyin."
            actionLabel="Yeni Baro"
            onAction={openCreate}
          />
        ) : (
          <>
            <div className={styles.desktopOnly}>
              <AdminTable
                rows={pagedRows}
                rowKey={(r) => r.id}
                columns={[
                  { key: "name", header: "Baro", render: (r) => <strong>{r.name}</strong> },
                  {
                    key: "city",
                    header: "Şehir",
                    hideOnMobile: true,
                    render: (r) => r.city || "—",
                  },
                  { key: "mail", header: "Mail", render: (r) => r.primaryEmail || "—" },
                  {
                    key: "mail2",
                    header: "2. Mail",
                    hideBelowMd: true,
                    render: (r) => r.secondaryEmail || "—",
                  },
                  {
                    key: "kep",
                    header: "KEP",
                    hideBelowMd: true,
                    render: (r) => r.kepEmail || "—",
                  },
                  {
                    key: "discount",
                    header: "İndirim",
                    hideOnMobile: true,
                    render: (r) => `%${r.discountRate}`,
                  },
                  {
                    key: "protocol",
                    header: "Protokol",
                    render: (r) =>
                      r.protocolFiles?.length ? (
                        <StatusBadge tone="success">Hazır</StatusBadge>
                      ) : (
                        <StatusBadge tone="danger">Yok</StatusBadge>
                      ),
                  },
                  {
                    key: "status",
                    header: "Durum",
                    render: (r) => (
                      <StatusBadge tone={statusToneFromRaw(r.status)}>
                        {getStatusLabel(r.status)}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "last",
                    header: "Son Mail",
                    hideOnMobile: true,
                    render: (r) => formatDateTr(r.lastEmailSentAt, true),
                  },
                  {
                    key: "actions",
                    header: "İşlemler",
                    render: (r) => (
                      <div className={styles.actions}>
                        <Button variant="soft" size="sm" onClick={() => openEdit(r)}>
                          Düzenle
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setDeactivateId(r.id)}>
                          Pasife Al
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>

            <MobileCards>
              {pagedRows.map((r, index) => (
                <MobileRecordCard key={r.id} index={index}>
                  <div className={styles.cardHead}>
                    <strong>{r.name}</strong>
                    <StatusBadge tone={statusToneFromRaw(r.status)}>
                      {getStatusLabel(r.status)}
                    </StatusBadge>
                  </div>
                  <p className={styles.cardMeta}>{r.city || "—"} · {r.primaryEmail || "Mail yok"}</p>
                  <div className={styles.actions}>
                    <Button variant="soft" size="sm" onClick={() => openEdit(r)}>
                      Düzenle
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setDeactivateId(r.id)}>
                      Pasife Al
                    </Button>
                  </div>
                </MobileRecordCard>
              ))}
            </MobileCards>

            <div className={shared.pagination}>
              <span className={shared.muted}>
                Sayfa {currentPage}/{totalPages}
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className={styles.pageSelect}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <Button
                variant="soft"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Önceki
              </Button>
              <Button
                variant="soft"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Sonraki
              </Button>
            </div>
          </>
        )}
      </section>

      <FormDrawer
        open={drawerOpen}
        title={editingId ? "Baro Düzenle" : "Yeni Baro"}
        description="Baro iletişim ve kampanya bilgilerini düzenleyin."
        onClose={() => setDrawerOpen(false)}
        footer={
          <>
            <Button variant="soft" onClick={() => setDrawerOpen(false)}>
              İptal
            </Button>
            <Button variant="primary" onClick={() => void submit()}>
              Kaydet
            </Button>
          </>
        }
      >
        <div className={styles.formGrid}>
          {(
            [
              ["name", "Baro Adı"],
              ["city", "Şehir"],
              ["primaryEmail", "Mail"],
              ["secondaryEmail", "2. Mail"],
              ["kepEmail", "KEP"],
              ["discountRate", "İndirim Oranı (%)"],
              ["campaignCode", "Kampanya Kodu"],
            ] as const
          ).map(([key, label]) => (
            <FormField key={key} label={label}>
              <input
                value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
              />
            </FormField>
          ))}
          <FormField label="Durum">
            <select
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as BarStatus }))}
            >
              <option value="ACTIVE">Aktif</option>
              <option value="PASSIVE">Pasif</option>
            </select>
          </FormField>
        </div>

        {editingId ? (
          <div className={styles.protocolBox}>
            <h3 className={styles.protocolTitle}>Protokol Dosyası</h3>
            <p className={shared.muted}>Desteklenen formatlar: .pdf, .docx, .udf</p>
            <FormField label="Dosya seç">
              <input
                type="file"
                accept=".pdf,.docx,.udf"
                onChange={(e) => setProtocolFile(e.target.files?.[0] || null)}
              />
            </FormField>
            {protocolFile ? (
              <p className={shared.muted}>
                Seçilen: {protocolFile.name} · {(protocolFile.size / 1024).toFixed(1)} KB
              </p>
            ) : null}
            {protocolInfo ? (
              <div className={styles.protocolInfo}>
                <p>
                  <strong>Mevcut:</strong> {protocolInfo.originalFileName}
                </p>
                <p>
                  <strong>Boyut:</strong> {(Number(protocolInfo.sizeBytes || 0) / 1024).toFixed(1)}{" "}
                  KB
                </p>
                <p>
                  <strong>Yüklenme:</strong> {formatDateTr(protocolInfo.createdAt, true)}
                </p>
              </div>
            ) : (
              <p className={styles.protocolMissing}>Durum: Yüklenmedi</p>
            )}
            <div className={styles.actions}>
              <Button
                variant="soft"
                size="sm"
                onClick={() => void uploadProtocol()}
                disabled={protocolUploading || !protocolFile}
              >
                {protocolUploading ? "Yükleniyor…" : "Dosya Yükle"}
              </Button>
              {protocolInfo?.fileUrl ? (
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => window.open(protocolInfo.fileUrl || "", "_blank")}
                >
                  İndir
                </Button>
              ) : null}
              {protocolInfo ? (
                <Button variant="danger" size="sm" onClick={() => void removeProtocol()}>
                  <Trash2 size={14} />
                  Kaldır
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </FormDrawer>

      <ConfirmDialog
        open={deactivateId != null}
        title="Baroyu pasife al"
        description="Bu baro pasif duruma getirilecek. Devam edilsin mi?"
        confirmLabel="Pasife Al"
        danger
        loading={deactivating}
        onCancel={() => setDeactivateId(null)}
        onConfirm={() => void deactivate()}
      />
    </div>
  );
}
