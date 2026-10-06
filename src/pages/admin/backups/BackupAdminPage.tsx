import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/api/client";
import styles from "./BackupAdminPage.module.css";

type CatalogItem = {
  tenantId: string;
  buroAdi: string;
  kullaniciAdi: string;
  eposta: string;
  backupCount: number;
  oldestBackupDate: string | null;
  lastSuccessfulBackupDate: string | null;
  lastBackupStatus: "YOK" | "BASARILI" | "EKSIK";
};

type CatalogResponse = {
  summary: { eligibleCount: number; successCount: number; failedCount: number; lastRunAt: string | null };
  items: CatalogItem[];
  total: number;
  page: number;
  limit: number;
};

type DayItem = { calendarDate: string; status: "YOK" | "BASARILI" | "EKSIK" };

type DaysResponse = {
  tenantId: string;
  buroAdi: string;
  kullaniciAdi: string;
  eposta: string;
  days: DayItem[];
};

function statusText(status: CatalogItem["lastBackupStatus"]): string {
  if (status === "BASARILI") return "Tamam";
  if (status === "EKSIK") return "Eksik dosya";
  return "Yedek yok";
}

function errorText(error: unknown): string {
  const code = error instanceof ApiError ? error.message : "";
  if (code === "RESTORE_CONFIRMATION_MISMATCH") return "Kullanıcı adı doğrulanamadı.";
  if (code === "RESTORE_SAFETY_BACKUP_FAILED") return "Güvenlik yedeği yazılamadı. Veriler değiştirilmedi.";
  if (code === "RESTORE_FAILED") return "Geri yükleme tamamlanamadı. Değişiklikler geri alındı.";
  if (code === "DECRYPT_FAILED" || code === "RESTORE_MANIFEST_MISMATCH") return "Yedek doğrulanamadı.";
  if (code === "RESTORE_TENANT_MISMATCH" || code === "RESTORE_FOREIGN_TENANT" || code === "RESTORE_OBJECT_KEY") {
    return "Yedek bu müşteriye ait değil.";
  }
  if (code === "BACKUP_ENV_MISSING") return "Sunucuda yedek ayarları eksik.";
  return code || "İşlem tamamlanamadı.";
}

export default function BackupAdminPage() {
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DaysResponse | null>(null);
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(search = q) {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const data = await apiClient<CatalogResponse>(`/api/admin/disaster-backups?${params.toString()}`);
      setCatalog(data);
    } catch (error) {
      setListError(errorText(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  async function openDays(tenantId: string) {
    setActionError(null);
    setDone(null);
    setConfirmDate(null);
    setConfirmName("");
    try {
      const data = await apiClient<DaysResponse>(`/api/admin/disaster-backups/${tenantId}`);
      setSelected(data);
    } catch (error) {
      setActionError(errorText(error));
    }
  }

  async function restore(event: FormEvent) {
    event.preventDefault();
    if (!selected || !confirmDate) return;
    setBusy(true);
    setActionError(null);
    setDone(null);
    try {
      await apiClient(`/api/admin/disaster-backups/${selected.tenantId}/restore`, {
        method: "POST",
        body: { calendarDate: confirmDate, confirmName },
      });
      setDone(`${selected.kullaniciAdi} için ${confirmDate} yedeği geri yüklendi.`);
      setConfirmDate(null);
      setConfirmName("");
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Yedek Yönetimi</h1>
        <p>Gerçek müşteriler büro adı, kullanıcı adı, e-posta ve tenant kimliğiyle eşleşir. Yedek dosya adlarında kişisel veri yoktur.</p>
      </header>

      {catalog?.summary ? (
        <p className={styles.muted}>
          Kapsamdaki müşteri: {catalog.summary.eligibleCount} · Son durumda tam yedek: {catalog.summary.successCount} · Eksik: {catalog.summary.failedCount}
        </p>
      ) : null}

      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault();
          void load(q);
        }}
      >
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Büro, kullanıcı, e-posta veya tenant no" />
        <button type="submit">Ara</button>
      </form>

      {listError ? <p className={styles.error}>{listError}</p> : null}
      {loading ? <p className={styles.muted}>Yükleniyor…</p> : null}

      {catalog && catalog.items.length === 0 && !loading ? <p className={styles.muted}>Bu aramada gerçek müşteri yok.</p> : null}

      {catalog && catalog.items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Büro / kullanıcı</th>
                <th>E-posta</th>
                <th>Tenant</th>
                <th>Son tam yedek</th>
                <th>Yedek sayısı</th>
                <th>En eski</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {catalog.items.map((row) => (
                <tr key={row.tenantId}>
                  <td>
                    <div>{row.buroAdi || "—"}</div>
                    <div className={styles.muted}>{row.kullaniciAdi || "—"}</div>
                  </td>
                  <td>{row.eposta || "—"}</td>
                  <td className={styles.mono}>{row.tenantId}</td>
                  <td>{row.lastSuccessfulBackupDate || "—"}</td>
                  <td>{row.backupCount}</td>
                  <td>{row.oldestBackupDate || "—"}</td>
                  <td>{statusText(row.lastBackupStatus)}</td>
                  <td>
                    <button type="button" className={styles.secondary} onClick={() => void openDays(row.tenantId)}>
                      Yedekleri Gör
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <section className={styles.panel}>
          <h2>
            {selected.buroAdi} · {selected.kullaniciAdi}
          </h2>
          <p className={styles.muted}>
            {selected.eposta} · tenant {selected.tenantId}
          </p>
          <div className={styles.days}>
            {selected.days.length === 0 ? <p className={styles.muted}>Bu müşteri için yedek günü yok.</p> : null}
            {selected.days.map((day) => (
              <div className={styles.day} key={day.calendarDate}>
                <span>
                  {day.calendarDate} · {statusText(day.status)}
                </span>
                {day.status === "BASARILI" ? (
                  <button type="button" className={styles.secondary} onClick={() => setConfirmDate(day.calendarDate)}>
                    Geri yükle
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {confirmDate ? (
            <form className={styles.confirm} onSubmit={(event) => void restore(event)}>
              <p>
                {confirmDate} günü geri yüklenecek. Önce canlı durumun güvenlik yedeği yazılır. Onay için kullanıcı adını yazın: <strong>{selected.kullaniciAdi}</strong>
              </p>
              <input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" />
              <button type="submit" disabled={busy}>
                {busy ? "Geri yükleniyor…" : "Geri yüklemeyi onayla"}
              </button>
            </form>
          ) : null}
          {actionError ? <p className={styles.error}>{actionError}</p> : null}
          {done ? <p className={styles.muted}>{done}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
