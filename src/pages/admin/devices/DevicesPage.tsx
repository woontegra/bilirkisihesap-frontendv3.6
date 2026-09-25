import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Copy,
  Key,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge, statusToneFromRaw } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatDateTr, getStatusLabel } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./DevicesPage.module.css";

type License = {
  id?: string;
  license_id?: string;
  license_key: string;
  type?: string;
  expires_at: string;
  status: string;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  device_id?: string | null;
  activated_at?: string | null;
  last_seen_at?: string | null;
  created_at: string;
  is_expired?: boolean;
  max_devices?: number;
  used_devices?: number;
  last_login_ip?: string | null;
  distinct_ip_count?: number;
  suspicious_usage?: boolean;
};

type Device = {
  id: number;
  device_id: string;
  created_at: string;
  last_used: string;
};

function licenseId(license: License): string | null {
  return license.id ?? license.license_id ?? null;
}

export default function DevicesPage() {
  const { success, error: toastError } = useToast();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [maxDevices, setMaxDevices] = useState(1);
  const [expiresAt, setExpiresAt] = useState("");

  const [deviceModal, setDeviceModal] = useState<{ licenseId: string; licenseKey: string } | null>(
    null,
  );
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [addingSlot, setAddingSlot] = useState(false);
  const [confirmDeleteDevice, setConfirmDeleteDevice] = useState<Device | null>(null);

  const loadLicenses = async () => {
    setLoading(true);
    setErrMsg("");
    try {
      const data = await apiClient<License[] | { licenses?: License[] }>("/api/admin/licenses", {
        adminRole: true,
      });
      setLicenses(Array.isArray(data) ? data : data.licenses || []);
      setCurrentPage(1);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Lisanslar yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLicenses();
  }, []);

  const loadDevices = async (licenseIdValue: string) => {
    setDevicesLoading(true);
    setDevicesError("");
    try {
      const data = await apiClient<{ success?: boolean; devices?: Device[]; error?: string }>(
        `/api/admin/licenses/${licenseIdValue}/devices`,
        { adminRole: true },
      );
      if (data.success) setDevices(data.devices || []);
      else setDevicesError(data.error || "Cihazlar yüklenemedi");
    } catch {
      setDevicesError("Cihazlar yüklenirken hata oluştu");
    } finally {
      setDevicesLoading(false);
    }
  };

  useEffect(() => {
    if (deviceModal) loadDevices(deviceModal.licenseId);
  }, [deviceModal?.licenseId]);

  const createLicense = async () => {
    if (!expiresAt) {
      toastError("Lütfen son kullanma tarihi seçin");
      return;
    }
    setCreating(true);
    try {
      const data = await apiClient<{ success?: boolean; message?: string; error?: string }>(
        "/api/admin/licenses/create",
        {
          method: "POST",
          body: { max_devices: Number(maxDevices), expires_at: expiresAt },
          adminRole: true,
        },
      );
      if (data.success) {
        success(data.message || "Lisans oluşturuldu!");
        setMaxDevices(1);
        setExpiresAt("");
        loadLicenses();
      } else {
        setErrMsg(data.error || "Lisans oluşturulamadı");
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Lisans oluşturma sırasında hata oluştu");
    } finally {
      setCreating(false);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    success("Lisans anahtarı kopyalandı");
  };

  const handleRemoveDevice = async () => {
    if (!confirmDeleteDevice || !deviceModal) return;
    setProcessingId(confirmDeleteDevice.id);
    try {
      const data = await apiClient<{ success?: boolean; message?: string; error?: string }>(
        `/api/admin/licenses/${deviceModal.licenseId}/devices/${confirmDeleteDevice.id}`,
        { method: "DELETE", adminRole: true },
      );
      if (data.success) {
        success(data.message || "Cihaz silindi");
        loadDevices(deviceModal.licenseId);
        loadLicenses();
      } else {
        toastError(data.error || "Cihaz silinemedi");
      }
    } catch {
      toastError("Hata oluştu");
    } finally {
      setProcessingId(null);
      setConfirmDeleteDevice(null);
    }
  };

  const handleAddSlot = async () => {
    if (!deviceModal) return;
    setAddingSlot(true);
    try {
      const data = await apiClient<{ success?: boolean; message?: string; error?: string }>(
        `/api/admin/licenses/${deviceModal.licenseId}/devices/add-slot`,
        { method: "POST", adminRole: true },
      );
      if (data.success) {
        success(data.message || "Yeni cihaz hakkı eklendi");
        await loadDevices(deviceModal.licenseId);
        loadLicenses();
      } else {
        toastError(data.error || "Eklenemedi");
      }
    } catch {
      toastError("Hata oluştu");
    } finally {
      setAddingSlot(false);
    }
  };

  const filteredLicenses = useMemo(() => {
    if (!searchQuery) return licenses;
    const q = searchQuery.toLowerCase();
    return licenses.filter(
      (l) =>
        l.license_key.toLowerCase().includes(q) ||
        (l.user_email?.toLowerCase().includes(q) ?? false) ||
        (l.user_name?.toLowerCase().includes(q) ?? false),
    );
  }, [licenses, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredLicenses.length / pageSize));
  const pagedLicenses = filteredLicenses.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  if (loading && licenses.length === 0) {
    return <AdminSkeleton cards={0} rows={8} />;
  }

  return (
    <div className={shared.page}>
      <PageHeader
        title="Cihaz Yönetimi"
        description="Bağlı cihazları izleyin, lisans oluşturun ve cihaz slotlarını yönetin"
        actions={
          <Button variant="soft" size="sm" onClick={loadLicenses}>
            <RefreshCw size={15} />
            Yenile
          </Button>
        }
      />

      <section className={shared.panel}>
        <h2 className={shared.panelTitle}>Yeni Profesyonel Lisans Oluştur</h2>
        <p className={shared.muted}>Format: A12B-128J-14KM-GFR3</p>
        <div className={styles.createGrid}>
          <FormField label="Maksimum Cihaz Sayısı">
            <select
              value={maxDevices}
              onChange={(e) => setMaxDevices(Number(e.target.value))}
              disabled={creating}
            >
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} cihaz
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Son Kullanma Tarihi">
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={creating}
              min={new Date().toISOString().split("T")[0]}
            />
          </FormField>
        </div>
        <Button variant="primary" size="sm" onClick={createLicense} disabled={creating || !expiresAt}>
          {creating ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
          {creating ? "Oluşturuluyor…" : "Lisans Oluştur"}
        </Button>
      </section>

      <section className={shared.panel}>
        <div className={shared.rowBetween}>
          <div>
            <h2 className={shared.panelTitle}>Lisanslar ve Aktif Cihazlar</h2>
            <p className={shared.muted}>Toplam {licenses.length} lisans</p>
          </div>
          <FormField label="Ara">
            <input
              placeholder="Email veya lisans anahtarı…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </FormField>
        </div>

        {errMsg ? (
          <StatePanel icon={AlertCircle} title="Hata" description={errMsg} tone="danger" />
        ) : null}

        {loading ? (
          <AdminSkeleton rows={5} cards={0} />
        ) : filteredLicenses.length === 0 ? (
          <StatePanel
            icon={Key}
            title={searchQuery ? "Arama sonucu bulunamadı" : "Henüz lisans bulunmuyor"}
            description={searchQuery ? "Farklı bir arama deneyin." : "Yeni lisans oluşturabilirsiniz."}
          />
        ) : (
          <AdminTable
            rows={pagedLicenses}
            rowKey={(l) => licenseId(l) ?? l.license_key}
            columns={[
              {
                key: "email",
                header: "Kullanıcı Email",
                render: (l) => l.user_email || "Atanmamış",
              },
              {
                key: "key",
                header: "Lisans Anahtarı",
                render: (l) => (
                  <span className={styles.keyCell}>
                    <code className={styles.keyCode}>{l.license_key}</code>
                    <Button variant="ghost" size="icon" aria-label="Kopyala" onClick={() => copyKey(l.license_key)}>
                      <Copy size={13} />
                    </Button>
                  </span>
                ),
              },
              {
                key: "type",
                header: "Tip",
                hideOnMobile: true,
                render: (l) => (
                  <StatusBadge tone={statusToneFromRaw(l.type)}>{l.type || "Profesyonel"}</StatusBadge>
                ),
              },
              {
                key: "devices",
                header: "Aktif Cihaz",
                render: (l) =>
                  l.used_devices != null && l.max_devices != null
                    ? `${l.used_devices}/${l.max_devices}`
                    : "—",
              },
              {
                key: "expires",
                header: "Bitiş",
                hideOnMobile: true,
                render: (l) => formatDateTr(l.expires_at, true),
              },
              {
                key: "status",
                header: "Durum",
                render: (l) => {
                  const expired =
                    l.is_expired ?? (l.expires_at ? new Date(l.expires_at) < new Date() : false);
                  return (
                    <StatusBadge tone={expired ? "danger" : statusToneFromRaw(l.status)}>
                      {expired ? "Süresi Dolmuş" : getStatusLabel(l.status)}
                    </StatusBadge>
                  );
                },
              },
              {
                key: "action",
                header: "İşlem",
                render: (l) => {
                  const lid = licenseId(l);
                  if (!lid) return "—";
                  return (
                    <Button
                      variant="soft"
                      size="sm"
                      onClick={() => setDeviceModal({ licenseId: String(lid), licenseKey: l.license_key })}
                    >
                      <Monitor size={14} />
                      Cihazlar
                    </Button>
                  );
                },
              },
            ]}
          />
        )}

        {!loading && filteredLicenses.length > 0 ? (
          <div className={shared.pagination}>
            <span className={shared.muted}>
              Sayfa başına{" "}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>{" "}
              · Toplam {filteredLicenses.length} lisans · Sayfa {currentPage}/{totalPages}
            </span>
            <div style={{ display: "flex", gap: "0.35rem" }}>
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
          </div>
        ) : null}
      </section>

      {deviceModal ? (
        <div
          className={styles.deviceOverlay}
          role="presentation"
          onClick={() => setDeviceModal(null)}
        >
          <div
            className={styles.deviceModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="device-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.deviceHead}>
              <div>
                <h2 id="device-modal-title" className={shared.panelTitle}>
                  Cihaz Yönetimi
                </h2>
                <code className={styles.keyCode}>{deviceModal.licenseKey}</code>
              </div>
              <Button variant="ghost" size="icon" aria-label="Kapat" onClick={() => setDeviceModal(null)}>
                <X size={18} />
              </Button>
            </header>

            <div className={styles.deviceBody}>
              {devicesError ? (
                <StatePanel icon={AlertCircle} title="Hata" description={devicesError} tone="danger" />
              ) : null}

              {devicesLoading ? (
                <AdminSkeleton rows={4} cards={0} />
              ) : devices.length === 0 ? (
                <StatePanel
                  icon={Monitor}
                  title="Kayıtlı cihaz yok"
                  description="Bu lisans için henüz cihaz kaydı bulunmuyor."
                />
              ) : (
                <AdminTable
                  rows={devices.map((d, i) => ({ ...d, label: `Cihaz ${i + 1}` }))}
                  rowKey={(d) => d.id}
                  columns={[
                    {
                      key: "name",
                      header: "Cihaz",
                      render: (d) => d.label,
                    },
                    {
                      key: "uuid",
                      header: "UUID",
                      render: (d) =>
                        d.device_id.length > 12 ? `${d.device_id.slice(0, 12)}…` : d.device_id,
                    },
                    {
                      key: "created",
                      header: "Kayıt",
                      hideOnMobile: true,
                      render: (d) => formatDateTr(d.created_at, true),
                    },
                    {
                      key: "last",
                      header: "Son Kullanım",
                      hideOnMobile: true,
                      render: (d) => formatDateTr(d.last_used, true),
                    },
                    {
                      key: "del",
                      header: "İşlem",
                      render: (d) => (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Cihazı sil"
                          disabled={processingId === d.id}
                          onClick={() => setConfirmDeleteDevice(d)}
                        >
                          {processingId === d.id ? (
                            <Loader2 size={15} />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </Button>
                      ),
                    },
                  ]}
                />
              )}
            </div>

            <footer className={styles.deviceFoot}>
              <span className={shared.muted}>Toplam {devices.length} cihaz kayıtlı</span>
              <Button variant="primary" size="sm" onClick={handleAddSlot} disabled={addingSlot}>
                {addingSlot ? <Loader2 size={15} /> : <Plus size={15} />}
                Yeni Cihaz Hakkı Ekle
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!confirmDeleteDevice}
        title="Cihazı sil"
        description="Bu cihazı silmek istediğinize emin misiniz?"
        confirmLabel="Sil"
        danger
        loading={processingId !== null}
        onConfirm={handleRemoveDevice}
        onCancel={() => setConfirmDeleteDevice(null)}
      />
    </div>
  );
}
