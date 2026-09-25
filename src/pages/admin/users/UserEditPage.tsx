import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { apiClient, ApiError } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { FormField } from "@/components/admin/FormField";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge, statusToneFromRaw } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatDateTr, getStatusLabel } from "@/utils/adminLabels";
import { formatUserRoleLabel } from "@/utils/userRole";
import styles from "./UserEditPage.module.css";

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  subscriptionType: string | null;
  subscriptionStartsAt?: string | null;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  autoRenew: boolean;
  status: string;
  createdAt: string;
};

type EditForm = {
  subscriptionType: string;
  subscriptionStartsAt: string;
  subscriptionEndsAt: string;
  autoRenew: boolean;
};

function toDateInput(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

export default function UserEditPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const navigate = useNavigate();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trialDays, setTrialDays] = useState("");
  const [suspended, setSuspended] = useState(false);
  const [form, setForm] = useState<EditForm>({
    subscriptionType: "annual",
    subscriptionStartsAt: "",
    subscriptionEndsAt: "",
    autoRenew: false,
  });

  const loadUser = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await apiClient<AdminUser>(`/api/admin/users/${id}`, { adminRole: true });
      setUser(data);
      setSuspended(data.status === "suspended");
      setForm({
        subscriptionType: data.subscriptionType || "annual",
        subscriptionStartsAt: toDateInput(data.subscriptionStartsAt),
        subscriptionEndsAt: toDateInput(data.subscriptionEndsAt),
        autoRenew: Boolean(data.autoRenew),
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Kullanıcı yüklenemedi");
      navigate("/admin/users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUser();
  }, [id]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      await apiClient(`/api/admin/users/${id}/subscription`, {
        method: "POST",
        adminRole: true,
        body: {
          subscriptionType: form.subscriptionType,
          subscriptionStartsAt: form.subscriptionStartsAt || null,
          subscriptionEndsAt: form.subscriptionEndsAt || null,
          autoRenew: form.autoRenew,
        },
      });
      toast.success("Abonelik bilgileri güncellendi");
      await loadUser();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleAddTrial = async () => {
    if (!id) return;
    const days = Number(trialDays);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Geçerli gün sayısı girin");
      return;
    }
    try {
      await apiClient(`/api/admin/users/${id}/trial`, {
        method: "POST",
        adminRole: true,
        body: { days },
      });
      toast.success(`${days} günlük deneme süresi eklendi`);
      setTrialDays("");
      await loadUser();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Deneme süresi eklenemedi");
    }
  };

  const handleSuspend = async () => {
    if (!id) return;
    const nextStatus = suspended ? "active" : "suspended";
    try {
      await apiClient(`/api/admin/users/${id}/status`, {
        method: "POST",
        adminRole: true,
        body: { status: nextStatus },
      });
      toast.success(nextStatus === "suspended" ? "Hesap askıya alındı" : "Hesap aktifleştirildi");
      setSuspended(!suspended);
      await loadUser();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Durum güncellenemedi");
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeader title="Kullanıcı Düzenle" description="Abonelik ve hesap yönetimi" />
        <AdminSkeleton rows={8} cards={0} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.page}>
        <StatePanel
          tone="warning"
          icon={Trash2}
          title="Kullanıcı bulunamadı"
          description="Kayıt silinmiş veya erişim yok."
          actionLabel="Listeye dön"
          onAction={() => navigate("/admin/users")}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} to="/admin/users">
        <ArrowLeft size={16} />
        Geri
      </Link>

      <PageHeader
        title="Kullanıcı Düzenle"
        description={`${user.name} — abonelik yönetimi`}
        actions={
          <StatusBadge tone={statusToneFromRaw(user.status)}>{getStatusLabel(user.status)}</StatusBadge>
        }
      />

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Kullanıcı Bilgileri</h2>
          <p className={styles.cardDesc}>Bu bilgiler salt okunurdur</p>
        </div>
        <div className={`${styles.cardBody} ${styles.readonlyGrid}`}>
          <div className={styles.readonlyItem}>
            <label>Ad Soyad</label>
            <p>{user.name}</p>
          </div>
          <div className={styles.readonlyItem}>
            <label>E-posta</label>
            <p>{user.email}</p>
          </div>
          <div className={styles.readonlyItem}>
            <label>Rol</label>
            <p>{formatUserRoleLabel(user.role) || "Kullanıcı"}</p>
          </div>
          <div className={styles.readonlyItem}>
            <label>Oluşturulma</label>
            <p>{formatDateTr(user.createdAt)}</p>
          </div>
        </div>
      </section>

      <form className={styles.card} onSubmit={(e) => void handleSave(e)}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Abonelik Yönetimi</h2>
          <p className={styles.cardDesc}>Abonelik bilgilerini güncelleyin</p>
        </div>
        <div className={styles.cardBody}>
          <div className={`${styles.formGrid} ${styles.formGridWide}`}>
            <FormField label="Abonelik Tipi *">
              <select
                value={form.subscriptionType}
                onChange={(e) => setForm((prev) => ({ ...prev, subscriptionType: e.target.value }))}
              >
                <option value="annual">Yıllık Abonelik</option>
                <option value="demo_1day">1 Günlük Demo</option>
                <option value="demo_3days">3 Günlük Demo</option>
                <option value="demo_7days">7 Günlük Demo</option>
              </select>
            </FormField>
            <FormField label="Başlangıç Tarihi">
              <input
                type="date"
                max="9999-12-31"
                value={form.subscriptionStartsAt}
                onChange={(e) => setForm((prev) => ({ ...prev, subscriptionStartsAt: e.target.value }))}
              />
            </FormField>
            <FormField label="Bitiş Tarihi">
              <input
                type="date"
                max="9999-12-31"
                value={form.subscriptionEndsAt}
                onChange={(e) => setForm((prev) => ({ ...prev, subscriptionEndsAt: e.target.value }))}
              />
            </FormField>
          </div>

          <div className={styles.switchRow}>
            <div className={styles.switchCopy}>
              <strong>Otomatik Yenileme</strong>
              <p>Abonelik otomatik yenilenecek</p>
            </div>
            <button
              type="button"
              className={`${styles.switch} ${form.autoRenew ? styles.switchOn : ""}`}
              aria-pressed={form.autoRenew}
              onClick={() => setForm((prev) => ({ ...prev, autoRenew: !prev.autoRenew }))}
            >
              <span className={styles.switchKnob} />
            </button>
          </div>

          <div className={styles.formFooter}>
            <Button type="submit" variant="primary" disabled={saving}>
              <Save size={15} />
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </div>
      </form>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Deneme Süresi Ekle</h2>
          <p className={styles.cardDesc}>Kullanıcıya deneme süresi ekleyin</p>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.trialRow}>
            <FormField label="Gün Sayısı" className={styles.trialInput}>
              <input
                type="number"
                min={1}
                max={30}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                placeholder="7"
              />
            </FormField>
            <div className={styles.quickDays}>
              {[1, 3, 7, 14].map((d) => (
                <Button key={d} type="button" variant="soft" size="sm" onClick={() => setTrialDays(String(d))}>
                  {d} Gün
                </Button>
              ))}
            </div>
            <Button type="button" variant="primary" disabled={!trialDays} onClick={() => void handleAddTrial()}>
              Ekle
            </Button>
          </div>
          {user.trialEndsAt ? (
            <p className={styles.cardDesc}>Mevcut deneme bitiş: {formatDateTr(user.trialEndsAt)}</p>
          ) : null}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Hesap Durumu</h2>
          <p className={styles.cardDesc}>Hesabı askıya alın veya aktifleştirin</p>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.actionRow}>
            <div>
              <strong>{suspended ? "Askıya alınmış" : "Aktif"}</strong>
              <p className={styles.cardDesc}>Durum değişikliği anında uygulanır</p>
            </div>
            <Button type="button" variant={suspended ? "primary" : "danger"} onClick={() => void handleSuspend()}>
              {suspended ? "Aktifleştir" : "Askıya Al"}
            </Button>
          </div>
        </div>
      </section>

      <section className={`${styles.card} ${styles.cardDanger}`}>
        <div className={styles.cardHead}>
          <h2 className={`${styles.cardTitle} ${styles.cardTitleDanger}`}>Kullanıcıyı Sil</h2>
          <p className={styles.cardDesc}>
            Kalıcı silme, ilişkili kayıt önizlemesi ve e-posta onayı ile kullanıcı detay sayfasından yapılır.
          </p>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.actionRow}>
            <p className={styles.cardDesc}>Detay sayfasındaki silme önizlemesini açın.</p>
            <Button type="button" variant="danger" onClick={() => id && navigate(`/admin/users/${id}`)}>
              <Trash2 size={15} />
              Detaya git
            </Button>
          </div>
        </div>
      </section>

      {/* Silme: UserDetailPage önizlemeli akış */}
    </div>
  );
}
