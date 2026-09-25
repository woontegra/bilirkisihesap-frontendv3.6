import { Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createSubUser,
  deleteSubUser,
  listSubUsers,
  type SubUser,
} from "@/api/profile";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/admin/FormField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import styles from "./profileTabShared.module.css";

const roleLabels: Record<SubUser["role"], string> = {
  admin: "Yönetici",
  user: "Kullanıcı",
  viewer: "İzleyici",
};

export default function SubUsersTab() {
  const toast = useToast();
  const tenantId = Number(localStorage.getItem("tenant_id") || "1");
  const [users, setUsers] = useState<SubUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "user" as SubUser["role"],
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await listSubUsers(tenantId);
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId !== 1) return;
    void loadUsers();
  }, [tenantId]);

  if (tenantId !== 1) {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>Alt kullanıcı yönetimi yalnızca ana tenant için kullanılabilir.</p>
      </div>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error("Ad ve email zorunludur");
      return;
    }
    setSubmitting(true);
    try {
      await createSubUser(tenantId, formData);
      toast.success("Kullanıcı eklendi");
      setFormData({ name: "", email: "", role: "user" });
      setShowForm(false);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kullanıcı eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await deleteSubUser(tenantId, deleteId);
      toast.success("Kullanıcı silindi");
      setDeleteId(null);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kullanıcı silinemedi");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={styles.stack}>
      <div className={styles.rowBetween}>
        <div>
          <h3 className={styles.panelTitle}>Alt Kullanıcılar</h3>
          <p className={styles.panelDesc} style={{ marginBottom: 0 }}>
            Ekibinizin üyelerini yönetin
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus size={14} aria-hidden /> Kullanıcı Ekle
        </Button>
      </div>

      {showForm ? (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Yeni Kullanıcı Ekle</h3>
          <form onSubmit={handleAdd}>
            <div className={styles.formGrid}>
              <FormField label="Ad Soyad">
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="Email">
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="Rol">
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value as SubUser["role"] })
                  }
                >
                  <option value="admin">Yönetici</option>
                  <option value="user">Kullanıcı</option>
                  <option value="viewer">İzleyici</option>
                </select>
              </FormField>
            </div>
            <div className={styles.actions}>
              <Button type="button" variant="soft" onClick={() => setShowForm(false)}>
                İptal
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? "Ekleniyor..." : "Ekle"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className={styles.panel}>
        {loading ? (
          <p className={styles.muted}>Yükleniyor...</p>
        ) : users.length === 0 ? (
          <div className={styles.empty}>
            <Users size={28} aria-hidden />
            <strong>Henüz alt kullanıcı yok</strong>
            <span>Kullanıcı eklemek için butona tıklayın</span>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Kullanıcı</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{roleLabels[u.role] ?? u.role}</td>
                    <td>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Sil"
                        onClick={() => setDeleteId(u.id)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={deleteId != null}
        title="Kullanıcıyı sil"
        description="Bu kullanıcıyı silmek istediğinize emin misiniz?"
        confirmLabel="Sil"
        danger
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
