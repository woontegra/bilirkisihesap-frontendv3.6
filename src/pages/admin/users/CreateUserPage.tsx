import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { apiClient, ApiError } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { FormField } from "@/components/admin/FormField";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import styles from "./CreateUserPage.module.css";

type BarAssociation = { id: number; name: string };

type FormState = {
  name: string;
  email: string;
  password: string;
  role: string;
  barAssociationId: string;
  subscriptionType: string;
  subscriptionEndsAt: string;
};

const SUBSCRIPTION_OPTIONS = [
  { value: "starter_monthly", label: "Başlangıç Aylık" },
  { value: "professional_monthly", label: "Profesyonel Aylık" },
  { value: "professional_annual", label: "Profesyonel Yıllık" },
  { value: "demo_1day", label: "1 Günlük Demo" },
  { value: "demo_3days", label: "3 Günlük Demo" },
  { value: "demo_7days", label: "7 Günlük Demo" },
];

function calcEndDate(type: string): string {
  const now = new Date();
  const end = new Date(now);
  if (type === "demo_1day") end.setDate(end.getDate() + 1);
  else if (type === "demo_3days") end.setDate(end.getDate() + 3);
  else if (type === "demo_7days") end.setDate(end.getDate() + 7);
  else if (type === "starter_monthly" || type === "professional_monthly") end.setDate(end.getDate() + 30);
  else if (type === "professional_annual") end.setDate(end.getDate() + 365);
  else return "";
  return end.toISOString().split("T")[0];
}

export default function CreateUserPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [barAssociations, setBarAssociations] = useState<BarAssociation[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    password: "",
    role: "user",
    barAssociationId: "",
    subscriptionType: "professional_annual",
    subscriptionEndsAt: calcEndDate("professional_annual"),
  });

  useEffect(() => {
    const load = async () => {
      setLoadingMeta(true);
      try {
        const barData = await apiClient<{ success?: boolean; items?: Array<{ id?: number; name?: string }> }>(
          "/api/admin/bar-associations?status=ACTIVE",
          { adminRole: true },
        );
        const items = Array.isArray(barData?.items) ? barData.items : [];
        setBarAssociations(
          items
            .map((item) => ({ id: Number(item.id), name: String(item.name ?? "").trim() }))
            .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.name),
        );
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Form verileri yüklenemedi");
      } finally {
        setLoadingMeta(false);
      }
    };
    void load();
  }, [toast]);

  useEffect(() => {
    const nextEnd = calcEndDate(form.subscriptionType);
    if (nextEnd) {
      setForm((prev) => ({ ...prev, subscriptionEndsAt: nextEnd }));
    }
  }, [form.subscriptionType]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = "Ad soyad gereklidir";
    if (!form.email.trim()) next.email = "E-posta gereklidir";
    else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(form.email)) {
      next.email = "Geçerli bir e-posta giriniz";
    }
    if (!form.password || form.password.length < 6) next.password = "En az 6 karakter";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const created = await apiClient<{ id?: number }>("/api/admin/users", {
        method: "POST",
        adminRole: true,
        body: {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          subscriptionType: form.subscriptionType,
          barAssociationId: form.barAssociationId ? Number(form.barAssociationId) : null,
          subscriptionEndsAt: form.subscriptionEndsAt || null,
        },
      });
      toast.success("Kullanıcı başarıyla oluşturuldu");
      if (created?.id) navigate(`/admin/users/${created.id}/detail`);
      else navigate("/admin/users");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Kullanıcı oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingMeta) {
    return (
      <div className={styles.page}>
        <PageHeader title="Yeni Üyelik Aç" description="Yeni bir kullanıcı oluşturun" />
        <AdminSkeleton rows={8} cards={0} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.backRow}>
        <Link className={styles.backLink} to="/admin/users">
          <ArrowLeft size={16} />
          Geri
        </Link>
      </div>

      <PageHeader title="Yeni Üyelik Aç" description="Admin için hızlı kullanıcı ve abonelik oluşturma" />

      <form className={styles.formCard} onSubmit={(e) => void handleSubmit(e)}>
        <div className={styles.formHead}>
          <h2 className={styles.formTitle}>Kullanıcı Formu</h2>
          <p className={styles.formDesc}>Zorunlu alanları doldurup kaydedin</p>
        </div>

        <div className={styles.formBody}>
          <p className={styles.formDesc}>
            Her kullanıcı için ayrı bir çalışma alanı oluşturulur. Mevcut bir şirkete bağlama yapılmaz.
          </p>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Kullanıcı Bilgisi</h3>
            <div className={styles.grid2}>
              <FormField label="Ad Soyad *">
                <input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="Ad Soyad"
                />
                {errors.name ? <p className={styles.errorText}>{errors.name}</p> : null}
              </FormField>
              <FormField label="E-posta *">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="email@example.com"
                />
                {errors.email ? <p className={styles.errorText}>{errors.email}</p> : null}
              </FormField>
              <FormField label="Parola *">
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder="En az 6 karakter"
                />
                {errors.password ? <p className={styles.errorText}>{errors.password}</p> : null}
              </FormField>
              <FormField label="Rol *">
                <select value={form.role} onChange={(e) => updateField("role", e.target.value)}>
                  <option value="user">Kullanıcı</option>
                  <option value="admin">Yönetici</option>
                </select>
              </FormField>
              <FormField
                label="Baro (Opsiyonel)"
                hint="Baro seçilirse müşteri kodu baro prefix'i ile oluşturulur."
              >
                <select
                  value={form.barAssociationId}
                  onChange={(e) => updateField("barAssociationId", e.target.value)}
                >
                  <option value="">Baro yok</option>
                  {barAssociations.map((bar) => (
                    <option key={bar.id} value={String(bar.id)}>
                      {bar.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Abonelik Bilgisi</h3>
            <div className={styles.grid2}>
              <FormField label="Abonelik Tipi *">
                <select
                  value={form.subscriptionType}
                  onChange={(e) => updateField("subscriptionType", e.target.value)}
                >
                  {SUBSCRIPTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Abonelik Bitiş Tarihi">
                <input
                  type="date"
                  max="9999-12-31"
                  value={form.subscriptionEndsAt}
                  onChange={(e) => updateField("subscriptionEndsAt", e.target.value)}
                />
              </FormField>
            </div>
          </section>

          <div className={styles.formFooter}>
            <Link to="/admin/users">
              <Button type="button" variant="soft">
                İptal
              </Button>
            </Link>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Oluşturuluyor…" : "Kullanıcı Oluştur"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
