import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { apiClient, ApiError } from "@/api/client";
import { FilterBar } from "@/components/admin/FilterBar";
import { FormField } from "@/components/admin/FormField";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { formatNumberTr } from "@/utils/adminLabels";
import { formatIsoDateRangeTR } from "@/utils/dateDisplay";
import shared from "../adminShared.module.css";
import styles from "./InterestRatesPage.module.css";

type SyncResult = {
  success: boolean;
  seriesCode?: string;
  fetchedCount?: number;
  insertedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  firstPeriod?: string | null;
  lastPeriod?: string | null;
  message?: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function InterestRatesPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [startDate, setStartDate] = useState("2011-12-01");
  const [endDate, setEndDate] = useState(todayIso);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    if (!startDate || !endDate) {
      toastError("Başlangıç ve bitiş tarihi zorunludur.");
      return;
    }
    if (startDate > endDate) {
      toastError("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
      return;
    }

    setSyncing(true);
    setError(null);
    setResult(null);

    try {
      const data = await apiClient<SyncResult>("/api/admin/interest-rates/deposit/sync", {
        method: "POST",
        adminRole: true,
        body: { startDate, endDate },
      });

      if (!data.success) {
        throw new Error(data.message || "Senkronizasyon başarısız.");
      }

      setResult(data);
      toastSuccess(
        `Mevduat faiz oranları güncellendi: ${data.insertedCount ?? 0} yeni, ${data.updatedCount ?? 0} güncellendi.`,
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Senkronizasyon sırasında hata oluştu.";
      setError(msg);
      toastError(msg);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={shared.page}>
      <PageHeader
        title="Mevduat Faiz Oranları"
        description="TCMB EVDS üzerinden bankalarca mevduatlara uygulanan en yüksek faiz oranlarını veritabanına çeker. Hesaplama sırasında eksik aylar otomatik olarak EVDS'ten tamamlanmaya çalışılır."
      />

      <section className={shared.panel}>
        <p className={styles.info}>
          <Database size={16} aria-hidden />
          Veriler <strong>TP.TRY.MT04.S</strong> serisinden (TL, 1 yıl ve daha kısa vadeli) alınır.
          TCMB henüz yayınlamadığı aylar için veri gelmeyebilir; bu durumda hesaplama o aylar için
          yapılamaz.
        </p>

        <FilterBar
          actions={
            <Button variant="primary" size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? <RefreshCw size={15} className={styles.spin} /> : <Download size={15} />}
              {syncing ? "Çekiliyor…" : "EVDS'ten Güncelle"}
            </Button>
          }
        >
          <FormField label="Başlangıç tarihi" hint="EVDS sorgu başlangıcı">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={syncing}
            />
          </FormField>
          <FormField label="Bitiş tarihi" hint="EVDS sorgu bitişi (genelde bugün)">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={syncing}
            />
          </FormField>
        </FilterBar>
      </section>

      {error ? (
        <section className={`${shared.panel} ${styles.errorPanel}`}>
          <div className={styles.resultHeader}>
            <AlertCircle size={18} aria-hidden />
            <h2 className={shared.panelTitle}>Senkronizasyon hatası</h2>
          </div>
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : null}

      {result?.success ? (
        <section className={shared.panel}>
          <div className={styles.resultHeader}>
            <CheckCircle2 size={18} aria-hidden />
            <h2 className={shared.panelTitle}>Son senkronizasyon sonucu</h2>
          </div>

          <div className={shared.stats}>
            <StatCard
              label="EVDS kayıt"
              value={formatNumberTr(result.fetchedCount ?? 0)}
              icon={Download}
              tone="blue"
              index={0}
            />
            <StatCard
              label="Yeni eklenen"
              value={formatNumberTr(result.insertedCount ?? 0)}
              icon={TrendingUp}
              tone="green"
              index={1}
            />
            <StatCard
              label="Güncellenen"
              value={formatNumberTr(result.updatedCount ?? 0)}
              icon={RefreshCw}
              tone="teal"
              index={2}
            />
            <StatCard
              label="Atlanan"
              value={formatNumberTr(result.skippedCount ?? 0)}
              hint="Değişiklik yok"
              tone="amber"
              index={3}
            />
          </div>

          <dl className={styles.metaList}>
            <div>
              <dt>Seri kodu</dt>
              <dd>{result.seriesCode || "—"}</dd>
            </div>
            <div>
              <dt>İlk dönem</dt>
              <dd>{result.firstPeriod || "—"}</dd>
            </div>
            <div>
              <dt>Son dönem</dt>
              <dd>{result.lastPeriod || "—"}</dd>
            </div>
            <div>
              <dt>Sorgu aralığı</dt>
              <dd>
                {formatIsoDateRangeTR(startDate, endDate, " — ")}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
