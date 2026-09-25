import { useEffect, useState } from "react";
import {
  fetchBillingProfile,
  fetchUserProfile,
  updateBillingProfile,
  updateUserProfile,
  type BillingProfile,
} from "@/api/profile";
import { applyAuthMeResponse, readCurrentUser } from "@/auth/session";
import { FormField } from "@/components/admin/FormField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import styles from "./profileTabShared.module.css";

function syncProfileToStorage(profile: {
  id?: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  role?: string;
}) {
  applyAuthMeResponse({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
  });
}

const emptyBilling: BillingProfile = {
  invoiceType: "individual",
  fullName: "",
  email: "",
  phone: "",
  identityNumber: "",
  city: "",
  district: "",
  address: "",
  companyName: "",
  taxOffice: "",
  taxNumber: "",
  complete: false,
};

export default function ProfileInfoTab() {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [billing, setBilling] = useState<BillingProfile>(emptyBilling);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingLoading, setBillingLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const profile = await fetchUserProfile();
        if (!active) return;
        setForm({
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          company: profile.company,
        });
        syncProfileToStorage(profile);
      } catch {
        if (!active) return;
        try {
          const current = readCurrentUser();
          setForm({
            name: current?.name || "",
            email: current?.email || "",
            phone: (current as { phone?: string } | null)?.phone || "",
            company: (current as { company?: string } | null)?.company || "",
          });
        } catch {
          /* ignore */
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const bp = await fetchBillingProfile();
        if (active) setBilling(bp);
      } catch {
        if (active) {
          setBilling((prev) => ({
            ...prev,
            email: form.email || prev.email,
          }));
        }
      } finally {
        if (active) setBillingLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [form.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Ad Soyad alanı zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const profile = await updateUserProfile({
        name: form.name.trim(),
        phone: form.phone.trim(),
      });
      setForm({
        name: profile.name,
        email: profile.email || form.email,
        phone: profile.phone || "",
        company: profile.company || "",
      });
      syncProfileToStorage(profile);
      toast.success("Profil bilgileri başarıyla güncellendi");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Profil güncellenirken bir hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const setBillingField = <K extends keyof BillingProfile>(key: K, value: BillingProfile[K]) => {
    setBilling((prev) => ({ ...prev, [key]: value, complete: false }));
  };

  const handleBillingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBillingSaving(true);
    try {
      const next = await updateBillingProfile(billing);
      setBilling(next);
      toast.success("Fatura bilgileri kaydedildi");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fatura bilgileri kaydedilemedi.");
    } finally {
      setBillingSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>Profil yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <div className={styles.infoBanner}>
        <div>
          <strong>Profil resmi</strong>
          Yukarıdaki profil fotoğrafına tıklayarak görselinizi yükleyebilir veya kaldırabilirsiniz.
        </div>
      </div>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Profil Bilgileri</h3>
        <p className={styles.panelDesc}>Kişisel bilgilerinizi güncelleyin</p>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <FormField label="Ad Soyad">
              <input
                name="name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Adınız ve soyadınız"
                required
              />
            </FormField>
            <FormField label="Email">
              <input name="email" type="email" value={form.email} readOnly />
            </FormField>
            <FormField label="Telefon">
              <input
                name="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+90 555 123 45 67"
              />
            </FormField>
          </div>
          <div className={styles.actions}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Fatura Bilgileri</h3>
        <p className={styles.panelDesc}>
          Satın alma ve abonelik yenilemelerinde kullanılacak bilgileri yönetin.
        </p>
        {billingLoading ? (
          <p className={styles.muted}>Fatura bilgileri yükleniyor...</p>
        ) : (
          <form onSubmit={handleBillingSubmit}>
            <div className={styles.formGrid}>
              <FormField label="Fatura Tipi">
                <select
                  value={billing.invoiceType}
                  onChange={(e) =>
                    setBillingField(
                      "invoiceType",
                      e.target.value === "corporate" ? "corporate" : "individual",
                    )
                  }
                >
                  <option value="individual">Bireysel</option>
                  <option value="corporate">Kurumsal</option>
                </select>
              </FormField>
              <FormField label="Ad Soyad">
                <input
                  value={billing.fullName}
                  onChange={(e) => setBillingField("fullName", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="E-posta">
                <input value={billing.email} readOnly />
              </FormField>
              <FormField label="Telefon">
                <input
                  value={billing.phone}
                  onChange={(e) => setBillingField("phone", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="T.C. Kimlik No (isteğe bağlı)">
                <input
                  value={billing.identityNumber}
                  onChange={(e) =>
                    setBillingField("identityNumber", e.target.value.replace(/\D/g, "").slice(0, 11))
                  }
                />
              </FormField>
              <FormField label="İl">
                <input
                  value={billing.city}
                  onChange={(e) => setBillingField("city", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="İlçe">
                <input
                  value={billing.district}
                  onChange={(e) => setBillingField("district", e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Açık Adres">
                <textarea
                  value={billing.address}
                  onChange={(e) => setBillingField("address", e.target.value)}
                  required
                  rows={3}
                />
              </FormField>
              {billing.invoiceType === "corporate" ? (
                <>
                  <FormField label="Firma Adı">
                    <input
                      value={billing.companyName}
                      onChange={(e) => setBillingField("companyName", e.target.value)}
                      required
                    />
                  </FormField>
                  <FormField label="Vergi Dairesi">
                    <input
                      value={billing.taxOffice}
                      onChange={(e) => setBillingField("taxOffice", e.target.value)}
                      required
                    />
                  </FormField>
                  <FormField label="Vergi No">
                    <input
                      value={billing.taxNumber}
                      onChange={(e) =>
                        setBillingField("taxNumber", e.target.value.replace(/\D/g, "").slice(0, 11))
                      }
                      required
                    />
                  </FormField>
                </>
              ) : null}
            </div>
            {!billing.complete ? (
              <p className={styles.warn} style={{ marginTop: "0.85rem" }}>
                Otomatik ödeme akışı için zorunlu fatura bilgilerini tamamlayın.
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button type="submit" variant="primary" disabled={billingSaving}>
                {billingSaving ? "Kaydediliyor..." : "Fatura Bilgilerini Kaydet"}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
